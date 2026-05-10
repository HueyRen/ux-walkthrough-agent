'use strict';

const { streamText, stepCountIs } = require('ai');
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { getModel } = require('./models');
const { getJob, updateJob } = require('./db');
const { WalkthroughChecker } = require('./checker');
const { createPlaywrightTools } = require('./tools');
const { supabaseAdmin } = require('./supabase');
const { jobEmitter } = require('./emitter');

function createWorker(projectRoot) {
  let queue;

  async function getQueue() {
    if (!queue) {
      const { default: PQueue } = await import('p-queue');
      queue = new PQueue({ concurrency: 1 });
    }
    return queue;
  }

  function enqueue(jobId) {
    getQueue().then((q) => {
      q.add(() => runJob(jobId, projectRoot));
    });
  }

  return { enqueue };
}

async function runJob(jobId, projectRoot) {
  try {
    await updateJob(jobId, { status: 'running', started_at: new Date().toISOString() });

    // Read instance config files
    const instanceDir = path.join(projectRoot, 'instances', jobId);
    const systemPrompt = fs.readFileSync(
      path.join(instanceDir, 'system_instructions.md'),
      'utf8'
    );
    const personasDoc = fs.readFileSync(path.join(instanceDir, 'personas.md'), 'utf8');
    const taskCardDoc = fs.readFileSync(path.join(instanceDir, 'task_card.md'), 'utf8');
    const configDoc = fs.readFileSync(path.join(instanceDir, 'config.md'), 'utf8');
    const issueSchema = fs.readFileSync(
      path.join(projectRoot, 'schema', 'issue_schema.md'),
      'utf8'
    );

    const stations = parseTaskCard(taskCardDoc);
    const job = await getJob(jobId);
    const model = getModel(job.model || 'claude-sonnet');

    // Extract user goal from config
    const userGoalMatch = configDoc.match(/## 用户任务目标（最高优先级）\n(.+)/);
    const userGoal = userGoalMatch ? userGoalMatch[1].trim() : '';

    // Inject user supplemental prompt if provided
    let fullSystemPrompt = systemPrompt + '\n\n' + issueSchema;
    if (job.plan?.user_prompt) {
      fullSystemPrompt += `\n\n## 用户补充指令\n${job.plan.user_prompt}`;
    }

    // Launch browser
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });

    const { tools, newContext, closeContext } = createPlaywrightTools(
      browser,
      jobId,
      supabaseAdmin,
      jobEmitter
    );

    const checker = new WalkthroughChecker(stations);

    // Per-station execution loop
    for (const station of stations) {
      if (checker.shouldHalt()) break;

      checker.setCurrent(station.id);
      await updateJob(jobId, { progress: checker.toProgress() });

      jobEmitter.emit(`job:${jobId}`, {
        type: 'station-change',
        stationId: station.id,
        stationName: station.name,
      });

      await newContext();

      let retryCount = 0;
      let stationDone = false;

      while (retryCount <= 2 && !stationDone) {
        try {
          const stationPrompt = buildStationPrompt(station, personasDoc, job, userGoal);

          const result = streamText({
            model,
            system: fullSystemPrompt,
            prompt: stationPrompt,
            tools,
            stopWhen: stepCountIs(50),
            maxTokens: 4096,
          });

          // Consume the stream and emit events
          for await (const chunk of result.fullStream) {
            if (chunk.type === 'text-delta' && chunk.textDelta) {
              jobEmitter.emit(`job:${jobId}`, { type: 'cot', delta: chunk.textDelta });
            } else if (chunk.type === 'tool-call') {
              jobEmitter.emit(`job:${jobId}`, {
                type: 'tool-call',
                toolName: chunk.toolName,
                args: chunk.args,
              });
            }
          }

          checker.recordComplete(station.id);
          stationDone = true;
        } catch (err) {
          console.error(`Station ${station.id} error (attempt ${retryCount + 1}):`, err.message);
          const classification = checker.recordError(station.id, err);
          if (classification.shouldRetry) {
            retryCount++;
            await closeContext();
            await newContext();
          } else {
            break;
          }
        }
      }

      await closeContext();
      await updateJob(jobId, { progress: checker.toProgress() });
    }

    // Generate report
    await generateReport(jobId, projectRoot);

    // Final status
    const finalStatus = checker.finalStatus();
    const reportUrl = `/reports/${jobId}`;
    await updateJob(jobId, {
      status: finalStatus,
      completed_at: new Date().toISOString(),
      report_url: reportUrl,
    });

    jobEmitter.emit(`job:${jobId}`, { type: 'done', status: finalStatus, reportUrl });

    await browser.close();
  } catch (err) {
    console.error(`Job ${jobId} fatal error:`, err);
    await updateJob(jobId, {
      status: 'failed',
      error_msg: err.message,
    }).catch(() => {});
    jobEmitter.emit(`job:${jobId}`, { type: 'failed', error: err.message });
  }
}

// Parse task card markdown into structured stations
function parseTaskCard(markdown) {
  const stations = [];
  const stationRegex = /^## 站点\s*(\d+):\s*(.+?)(?:\s*\(.*?\))?\s*$/gm;
  let match;

  while ((match = stationRegex.exec(markdown)) !== null) {
    const num = parseInt(match[1], 10);
    const name = match[2].trim();
    stations.push({
      id: `S${num}`,
      name,
    });
  }

  // Extract the content for each station (everything between two ## 站点 headers)
  for (let i = 0; i < stations.length; i++) {
    const startPattern = `## 站点 ${stations[i].id.replace('S', '')}:`;
    const startIdx = markdown.indexOf(startPattern);
    let endIdx;
    if (i + 1 < stations.length) {
      const nextPattern = `## 站点 ${stations[i + 1].id.replace('S', '')}:`;
      endIdx = markdown.indexOf(nextPattern);
    } else {
      endIdx = markdown.length;
    }
    stations[i].content = markdown.slice(startIdx, endIdx).trim();
  }

  return stations;
}

// Build per-station prompt
function buildStationPrompt(station, personasDoc, job, userGoal) {
  const goalSection = userGoal && userGoal !== '(未填写)'
    ? `\n## 用户任务目标（最高优先级）\n${userGoal}\n\n所有站点的操作和评估都应围绕此目标展开。评估每个界面是否帮助用户高效达成此目标。\n`
    : '';

  return `You are now executing Station ${station.id}: ${station.name}
${goalSection}
## Target URL
${job.url}

## Your Task
Follow the operation steps below for this station. For each step:
1. Execute the action using the browser tools (navigate, click, type, scroll, evaluate)
2. Take a screenshot using the screenshot tool after each significant action
3. Evaluate the UX from each persona's perspective
4. Record any issues found using the recordIssue tool

## Station Instructions
${station.content}

## Personas for This Walkthrough
${personasDoc}

## Important Rules
- Take screenshots at every step documented in the station instructions
- Use the recordIssue tool for EVERY issue you discover — do not just describe issues in text
- Issue IDs must follow the format P-${station.id}-XX (e.g., P-${station.id}-01)
- Evaluate from ALL personas listed in the station instructions
- Be thorough: check visual hierarchy, information architecture, interaction patterns, and accessibility
- Write issue descriptions in first person from the affected persona's perspective`;
}

// Generate HTML report from findings
async function generateReport(jobId, projectRoot) {
  const { data: findings } = await supabaseAdmin
    .from('findings')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true });

  if (!findings || findings.length === 0) return;

  const job = await getJob(jobId);

  // Group findings by station
  const byStation = {};
  for (const f of findings) {
    if (!byStation[f.station]) byStation[f.station] = [];
    byStation[f.station].push(f);
  }

  const severityColor = { P0: '#dc2626', P1: '#ea580c', P2: '#ca8a04', P3: '#65a30d' };

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>UX Walkthrough Report — ${job.url}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 960px; margin: 0 auto; padding: 2rem; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    .meta { color: #666; margin-bottom: 2rem; font-size: 0.875rem; }
    .summary { display: flex; gap: 1rem; margin-bottom: 2rem; flex-wrap: wrap; }
    .stat { background: #f5f5f5; padding: 1rem; border-radius: 8px; min-width: 120px; text-align: center; }
    .stat .num { font-size: 1.5rem; font-weight: 700; }
    .stat .label { font-size: 0.75rem; color: #666; text-transform: uppercase; }
    .station { margin-bottom: 2rem; }
    .station h2 { font-size: 1.125rem; border-bottom: 2px solid #e5e5e5; padding-bottom: 0.5rem; margin-bottom: 1rem; }
    .issue { border: 1px solid #e5e5e5; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
    .issue-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
    .severity { padding: 2px 8px; border-radius: 4px; color: white; font-size: 0.75rem; font-weight: 600; }
    .issue h3 { font-size: 0.95rem; }
    .issue p { font-size: 0.875rem; color: #444; margin-top: 0.25rem; }
    .issue .personas { font-size: 0.75rem; color: #888; margin-top: 0.5rem; }
  </style>
</head>
<body>
  <h1>UX Walkthrough Report</h1>
  <div class="meta">${job.url} &mdash; ${new Date().toLocaleDateString()}</div>
  <div class="summary">
    <div class="stat"><div class="num">${findings.length}</div><div class="label">Issues</div></div>
    <div class="stat"><div class="num">${findings.filter(f => f.severity === 'P0').length}</div><div class="label">P0 Blockers</div></div>
    <div class="stat"><div class="num">${findings.filter(f => f.severity === 'P1').length}</div><div class="label">P1 Severe</div></div>
    <div class="stat"><div class="num">${Object.keys(byStation).length}</div><div class="label">Stations</div></div>
  </div>`;

  for (const [station, issues] of Object.entries(byStation)) {
    html += `\n  <div class="station">
    <h2>${station}</h2>`;
    for (const issue of issues) {
      const raw = issue.raw_data || {};
      const color = severityColor[issue.severity] || '#888';
      html += `
    <div class="issue">
      <div class="issue-header">
        <span class="severity" style="background:${color}">${issue.severity}</span>
        <h3>${issue.id}: ${raw.title || issue.description?.slice(0, 60) || ''}</h3>
      </div>
      <p>${issue.description || ''}</p>
      <div class="personas">${issue.persona || ''} · ${raw.classification || ''}</div>
    </div>`;
    }
    html += '\n  </div>';
  }

  html += '\n</body>\n</html>\n';

  // Save report to filesystem
  const outputDir = path.join(projectRoot, 'outputs', jobId);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'raw_report.html'), html, 'utf8');

  // Also write manifest
  const manifest = {
    job_id: jobId,
    url: job.url,
    total_issues: findings.length,
    by_severity: {
      P0: findings.filter((f) => f.severity === 'P0').length,
      P1: findings.filter((f) => f.severity === 'P1').length,
      P2: findings.filter((f) => f.severity === 'P2').length,
      P3: findings.filter((f) => f.severity === 'P3').length,
    },
    stations_covered: Object.keys(byStation).length,
    generated_at: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

module.exports = { createWorker };
