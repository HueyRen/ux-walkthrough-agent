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
const { getPersonaDoc } = require('./config-writer');

// Timeout constants (milliseconds)
const STATION_TIMEOUT_MS = 180_000;   // 3 min per station (LLM + browser ops)
const BROWSER_LAUNCH_TIMEOUT_MS = 30_000; // 30s to launch Chromium
const JOB_TIMEOUT_MS = 15 * 60_000;  // 15 min total per job
const SYNTH_TIMEOUT_MS = 60_000;      // 60s per synthesis LLM call

function createWorker(projectRoot) {
  let queue;
  const abortControllers = new Map();

  async function getQueue() {
    if (!queue) {
      const { default: PQueue } = await import('p-queue');
      queue = new PQueue({ concurrency: 1 });
    }
    return queue;
  }

  function enqueue(jobId) {
    getQueue().then((q) => {
      q.add(() => runJob(jobId, projectRoot, abortControllers));
    });
  }

  function abort(jobId) {
    const ac = abortControllers.get(jobId);
    if (ac) {
      ac.abort();
      return true;
    }
    return false;
  }

  return { enqueue, abort };
}

async function runPersonaStations({
  personaName, jobId, browser, stations,
  fullSystemPrompt, personaDoc, job, userGoal, signal, model,
}) {
  const { tools, newContext, closeContext } = createPlaywrightTools(
    browser,
    jobId,
    supabaseAdmin,
    jobEmitter,
    personaName
  );

  const checker = new WalkthroughChecker(stations);

  for (const station of stations) {
    if (checker.shouldHalt()) break;
    if (signal.aborted) throw new Error('手动中断');

    checker.setCurrent(station.id);

    jobEmitter.emit(`job:${jobId}`, {
      type: 'station-change',
      personaId: personaName,
      stationId: station.id,
      stationName: station.name,
    });

    await newContext();

    let retryCount = 0;
    let stationDone = false;

    while (retryCount <= 2 && !stationDone) {
      // Per-station timeout: abort this station after STATION_TIMEOUT_MS
      const stationAc = new AbortController();
      const stationTimer = setTimeout(() => stationAc.abort(), STATION_TIMEOUT_MS);
      // Chain: if job-level signal aborts, also abort this station
      const onJobAbort = () => stationAc.abort();
      signal.addEventListener('abort', onJobAbort, { once: true });

      try {
        const stationPrompt = buildStationPrompt(station, personaDoc, job, userGoal);

        const result = streamText({
          model,
          messages: [
            {
              role: 'system',
              content: fullSystemPrompt,
              providerOptions: {
                anthropic: { cacheControl: { type: 'ephemeral' } },
              },
            },
            {
              role: 'user',
              content: stationPrompt,
            },
          ],
          tools,
          stopWhen: stepCountIs(50),
          maxTokens: 4096,
          abortSignal: stationAc.signal,
          experimental_allowSystemInMessages: true,
        });

        // Consume the stream and emit events
        for await (const chunk of result.fullStream) {
          if (chunk.type === 'text-delta' && chunk.textDelta) {
            jobEmitter.emit(`job:${jobId}`, { type: 'cot', personaId: personaName, delta: chunk.textDelta });
          } else if (chunk.type === 'tool-call') {
            jobEmitter.emit(`job:${jobId}`, {
              type: 'tool-call',
              personaId: personaName,
              toolName: chunk.toolName,
              args: chunk.args,
            });
            // Track per-station issue count when recordIssue is called
            if (chunk.toolName === 'recordIssue') {
              checker.recordIssue(station.id);
            }
          }
        }

        // Token usage + cache metrics
        const usage = await result.usage;
        const providerMeta = await result.providerMetadata;
        const cacheMeta = providerMeta?.anthropic;
        console.log(`[${jobId}][${personaName}] Station ${station.id} tokens:`, {
          input: usage?.promptTokens,
          output: usage?.completionTokens,
          cacheCreation: cacheMeta?.cacheCreationInputTokens || 0,
          cacheRead: cacheMeta?.cacheReadInputTokens || 0,
        });

        checker.recordComplete(station.id);
        stationDone = true;
      } catch (err) {
        // Distinguish station timeout from other errors
        const isTimeout = stationAc.signal.aborted && !signal.aborted;
        const errorMsg = isTimeout
          ? `Station ${station.id} timeout (${STATION_TIMEOUT_MS / 1000}s)`
          : err.message;
        console.error(`[${personaName}] Station ${station.id} error (attempt ${retryCount + 1}):`, errorMsg);

        const classification = checker.recordError(station.id, isTimeout ? new Error(errorMsg) : err);
        if (classification.shouldRetry && !isTimeout) {
          retryCount++;
          await closeContext();
          await newContext();
        } else {
          break; // Timeouts skip retries -- move to next station
        }
      } finally {
        clearTimeout(stationTimer);
        signal.removeEventListener('abort', onJobAbort);
      }
    }

    await closeContext();

    // Update per-persona progress after each station
    const currentJob = await getJob(jobId);
    const progress = currentJob.progress || {};
    if (!progress.personas) progress.personas = {};
    progress.personas[personaName] = checker.toProgress();
    await updateJob(jobId, { progress });
  }

  return checker;
}

async function runJob(jobId, projectRoot, abortControllers) {
  const ac = new AbortController();
  abortControllers.set(jobId, ac);
  const signal = ac.signal;

  // Job-level timeout: abort everything after JOB_TIMEOUT_MS
  const jobTimer = setTimeout(() => {
    console.error(`[${jobId}] Job timeout (${JOB_TIMEOUT_MS / 60_000} min) -- aborting`);
    ac.abort();
  }, JOB_TIMEOUT_MS);

  try {
    await updateJob(jobId, { status: 'running', started_at: new Date().toISOString() });

    // Read instance config files
    const instanceDir = path.join(projectRoot, 'instances', jobId);
    const systemPrompt = fs.readFileSync(
      path.join(instanceDir, 'system_instructions.md'),
      'utf8'
    );
    const taskCardDoc = fs.readFileSync(path.join(instanceDir, 'task_card.md'), 'utf8');
    const configDoc = fs.readFileSync(path.join(instanceDir, 'config.md'), 'utf8');
    const stations = parseTaskCard(taskCardDoc);
    const job = await getJob(jobId);
    const model = getModel(job.model || 'claude-sonnet');

    // Extract user goal from config
    const userGoalMatch = configDoc.match(/## 用户任务目标（最高优先级）\n(.+)/);
    const userGoal = userGoalMatch ? userGoalMatch[1].trim() : '';

    // System prompt: static across all stations for KV cache reuse
    let fullSystemPrompt = systemPrompt;

    // Append issue schema if it exists (optional)
    const issueSchemaPath = path.join(projectRoot, 'schema', 'issue_schema.md');
    if (fs.existsSync(issueSchemaPath)) {
      const issueSchema = fs.readFileSync(issueSchemaPath, 'utf8');
      fullSystemPrompt += '\n\n' + issueSchema;
    }
    if (job.plan?.user_prompt) {
      fullSystemPrompt += `\n\n## 用户补充指令\n${job.plan.user_prompt}`;
    }

    // Launch browser with anti-detection measures
    const proxyUrl = process.env.PROXY_URL; // e.g. http://user:pass@proxy.example.com:8080
    const launchOpts = {
      headless: false,
      channel: 'chrome',
      args: [
        '--disable-sync',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-extensions',
        '--no-first-run',
        '--disable-blink-features=AutomationControlled',
      ],
    };
    if (proxyUrl) {
      try {
        const parsed = new URL(proxyUrl);
        launchOpts.proxy = {
          server: `${parsed.protocol}//${parsed.host}`,
          username: decodeURIComponent(parsed.username),
          password: decodeURIComponent(parsed.password),
        };
      } catch (_) {
        launchOpts.proxy = { server: proxyUrl };
      }
    }
    const browser = await Promise.race([
      chromium.launch(launchOpts),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Browser launch timeout (${BROWSER_LAUNCH_TIMEOUT_MS / 1000}s)`)), BROWSER_LAUNCH_TIMEOUT_MS)
      ),
    ]);

    const personas = job.personas;

    // Launch personas with staggered start to avoid burst traffic detection
    const personaPromises = personas.map((personaName, idx) => {
      const personaDoc = getPersonaDoc(projectRoot, jobId, personaName);
      const delay = idx * (2000 + Math.random() * 3000); // 2-5s stagger between personas
      return new Promise((resolve) => setTimeout(resolve, delay)).then(() =>
        runPersonaStations({
          personaName, jobId, browser, stations,
          fullSystemPrompt, personaDoc, job, userGoal, signal, model,
        })
      );
    });

    const results = await Promise.allSettled(personaPromises);

    // Emit synthesis start
    jobEmitter.emit(`job:${jobId}`, { type: 'synthesis-start' });

    // Run synthesis pipeline
    const { synthesizeFindings } = require('./synthesizer');
    await synthesizeFindings(jobId, job);

    // Generate report
    await generateReport(jobId, projectRoot);

    // Aggregate final status across all persona checkers
    const allCheckers = results
      .filter((r) => r.status === 'fulfilled')
      .map((r) => r.value);

    // Log rejected personas for debugging
    const rejected = results.filter((r) => r.status === 'rejected');
    for (const r of rejected) {
      console.error(`[${jobId}] Persona promise rejected:`, r.reason?.message || r.reason);
    }

    const totalCompleted = allCheckers.reduce((sum, c) => sum + c.completed.size, 0);
    const totalStations = stations.length * personas.length;

    // Check issue count from DB as fallback — even if checker shows 0,
    // issues may have been recorded before the promise rejected
    const latestJob = await getJob(jobId);
    const dbIssueCount = latestJob?.issue_count || 0;

    let finalStatus;
    if (totalCompleted === totalStations) finalStatus = 'done';
    else if (totalCompleted > 0 || dbIssueCount > 0) finalStatus = 'done';
    else finalStatus = 'failed';

    const errorSummary = rejected.length > 0
      ? `${rejected.length} persona(s) had errors: ${rejected.map(r => r.reason?.message || 'unknown').join('; ')}`
      : null;

    const reportUrl = `/reports/${jobId}`;
    await updateJob(jobId, {
      status: finalStatus,
      completed_at: new Date().toISOString(),
      report_url: reportUrl,
      error_msg: errorSummary,
    });

    jobEmitter.emit(`job:${jobId}`, { type: 'done', status: finalStatus, reportUrl });

    await browser.close();
  } catch (err) {
    const isJobTimeout = signal.aborted && err.message?.includes('abort');
    const errorMsg = isJobTimeout
      ? `Job timeout (${JOB_TIMEOUT_MS / 60_000} min)`
      : err.message;
    console.error(`Job ${jobId} fatal error:`, errorMsg);
    await updateJob(jobId, {
      status: isJobTimeout ? 'timeout' : 'failed',
      error_msg: errorMsg,
      completed_at: new Date().toISOString(),
    }).catch(() => {});
    jobEmitter.emit(`job:${jobId}`, { type: 'failed', error: errorMsg });
  } finally {
    clearTimeout(jobTimer);
    abortControllers.delete(jobId);
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
      personas: [],
    });
  }

  // Extract persona names from the overview table (| ... | S1 | ... | primary | auxiliary |)
  const personaMap = parsePersonaTable(markdown);
  for (const station of stations) {
    station.personas = personaMap[station.id] || [];
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

// Extract station→persona mapping from the overview table
function parsePersonaTable(markdown) {
  const map = {};
  // Match table rows: | ... | S1 | ... | Lisa Chen (小白) | Carlos Mendez (老买家) |
  const tableRows = markdown.match(/^\|[^|]+\|\s*S\d+\s*\|.+$/gm);
  if (!tableRows) return map;

  for (const row of tableRows) {
    const cells = row.split('|').map((c) => c.trim()).filter(Boolean);
    // cells: [name, S#, category, primary persona(s), auxiliary persona(s)]
    const stationMatch = cells.find((c) => /^S\d+$/.test(c));
    if (!stationMatch) continue;

    const names = new Set();
    // Primary + auxiliary columns (last two cells typically)
    const personaCells = cells.slice(-2);
    for (const cell of personaCells) {
      // Extract first names: "Lisa Chen (小白)" → "Lisa", "Carlos Mendez, Anna Kowalski" → ["Carlos", "Anna"]
      const personaNames = cell.split(',').map((p) => p.trim());
      for (const pn of personaNames) {
        const firstName = pn.replace(/\s*\(.*?\)\s*/g, '').split(/\s+/)[0];
        if (firstName && firstName !== '—' && firstName !== '-') {
          names.add(firstName);
        }
      }
    }
    map[stationMatch] = [...names];
  }
  return map;
}

// Station-type evaluation guidance (progressive disclosure in user prompt)
function getStationTypeGuidance(station) {
  const id = parseInt(station.id.replace('S', ''), 10);
  const total = 9; // approximate max stations
  const position = id / total;

  if (position <= 0.15) return '## Evaluation Focus: Landing Page\nFocus on: value proposition clarity, navigation discoverability, first impression, load performance';
  if (position <= 0.35) return '## Evaluation Focus: Discovery & Search\nFocus on: search accuracy, filter logic, result relevance, content discoverability';
  if (position <= 0.55) return '## Evaluation Focus: Content & Detail\nFocus on: information hierarchy, content completeness, trust signals, readability';
  if (position <= 0.75) return '## Evaluation Focus: Evaluation & Comparison\nFocus on: decision support, comparison tools, pricing clarity, social proof';
  return '## Evaluation Focus: Conversion & Action\nFocus on: form usability, action clarity, feedback quality, error recovery';
}

// Build per-station prompt (personasDoc now contains only a single persona's doc)
function buildStationPrompt(station, personasDoc, job, userGoal) {
  const goalSection = userGoal && userGoal !== '(未填写)'
    ? `\n## 用户任务目标（最高优先级）\n${userGoal}\n\n所有站点的操作和评估都应围绕此目标展开。评估每个界面是否帮助用户高效达成此目标。\n`
    : '';

  const typeGuidance = getStationTypeGuidance(station);

  return `You are now executing Station ${station.id}: ${station.name}
${goalSection}
${typeGuidance}

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
- Evaluate from the persona's perspective
- Be thorough: check visual hierarchy, information architecture, interaction patterns, and accessibility
- Write issue descriptions in first person from the affected persona's perspective`;
}

// Generate HTML report from merged findings + raw findings
async function generateReport(jobId, projectRoot) {
  // Fetch merged findings (post-synthesis) and raw findings (per-persona evidence)
  const [mergedResult, rawResult] = await Promise.all([
    supabaseAdmin.from('merged_findings').select('*').eq('job_id', jobId).order('created_at', { ascending: true }),
    supabaseAdmin.from('findings').select('*').eq('job_id', jobId).order('created_at', { ascending: true }),
  ]);

  const merged = mergedResult.data || [];
  const raw = rawResult.data || [];

  if (merged.length === 0 && raw.length === 0) return;

  const job = await getJob(jobId);
  const plan = job.plan || {};
  const summary = plan.summary || '';
  const journeyInsights = plan.journey_insights || [];
  const synthesisWarnings = plan.synthesis_warnings || [];

  // Use merged if available, fall back to raw
  const hasMerged = merged.length > 0;
  const primaryFindings = hasMerged ? merged : raw;

  // Build raw findings lookup by ID for per-persona drill-down
  const rawById = {};
  for (const f of raw) rawById[f.id] = f;

  // Sort merged by severity priority
  const sevOrder = { P0: 0, P1: 1, P2: 2, P3: 3 };
  const sorted = [...primaryFindings].sort((a, b) => (sevOrder[a.severity] || 9) - (sevOrder[b.severity] || 9));

  const severityColor = { P0: '#dc2626', P1: '#ea580c', P2: '#ca8a04', P3: '#65a30d' };
  const sevCounts = { P0: 0, P1: 0, P2: 0, P3: 0 };
  for (const f of sorted) sevCounts[f.severity] = (sevCounts[f.severity] || 0) + 1;

  const escHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>UX Walkthrough Report — ${escHtml(job.url)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 960px; margin: 0 auto; padding: 2rem; background: #fafafa; }
    h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
    .meta { color: #666; margin-bottom: 1.5rem; font-size: 0.875rem; }
    .exec-summary { background: #fff; border: 1px solid #e5e5e5; border-radius: 8px; padding: 1.25rem; margin-bottom: 1.5rem; }
    .exec-summary h2 { font-size: 1rem; margin-bottom: 0.5rem; color: #333; }
    .exec-summary p { font-size: 0.9rem; color: #444; }
    .journey-insights { background: #f0f7ff; border: 1px solid #bdd7f1; border-radius: 8px; padding: 1.25rem; margin-bottom: 1.5rem; }
    .journey-insights h2 { font-size: 1rem; margin-bottom: 0.5rem; color: #1a5276; }
    .journey-insights ul { margin: 0; padding-left: 1.25rem; }
    .journey-insights li { font-size: 0.875rem; color: #2c3e50; margin-bottom: 0.25rem; }
    .stats { display: flex; gap: 0.75rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
    .stat { background: #fff; border: 1px solid #e5e5e5; padding: 0.75rem 1rem; border-radius: 8px; min-width: 100px; text-align: center; }
    .stat .num { font-size: 1.5rem; font-weight: 700; }
    .stat .label { font-size: 0.7rem; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
    .view-toggle { display: flex; gap: 0; margin-bottom: 1.5rem; }
    .view-btn { padding: 0.5rem 1rem; border: 1px solid #d1d5db; background: #fff; cursor: pointer; font-size: 0.8rem; font-weight: 500; color: #555; transition: all 0.15s; }
    .view-btn:first-child { border-radius: 6px 0 0 6px; }
    .view-btn:last-child { border-radius: 0 6px 6px 0; border-left: none; }
    .view-btn.active { background: #1a1a1a; color: #fff; border-color: #1a1a1a; }
    .issue { background: #fff; border: 1px solid #e5e5e5; border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem; }
    .issue-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; flex-wrap: wrap; }
    .severity { padding: 2px 8px; border-radius: 4px; color: white; font-size: 0.75rem; font-weight: 600; }
    .calibrated { font-size: 0.7rem; color: #ea580c; margin-left: 0.25rem; }
    .issue h3 { font-size: 0.95rem; }
    .issue p { font-size: 0.875rem; color: #444; margin-top: 0.25rem; }
    .issue-meta { font-size: 0.75rem; color: #888; margin-top: 0.5rem; display: flex; gap: 1rem; flex-wrap: wrap; }
    .issue-meta .consensus { font-weight: 600; }
    .suggestion { font-size: 0.825rem; color: #2563eb; margin-top: 0.5rem; padding: 0.5rem; background: #eff6ff; border-radius: 4px; }
    .raw-evidence { margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px dashed #e5e5e5; display: none; }
    .raw-evidence.visible { display: block; }
    .raw-item { font-size: 0.8rem; color: #555; padding: 0.375rem 0; border-bottom: 1px solid #f3f3f3; }
    .raw-item:last-child { border-bottom: none; }
    .raw-item .persona-name { font-weight: 600; color: #333; }
    .toggle-evidence { font-size: 0.75rem; color: #6366f1; cursor: pointer; background: none; border: none; text-decoration: underline; margin-top: 0.5rem; }
    .warnings { background: #fffbeb; border: 1px solid #fbbf24; border-radius: 8px; padding: 1rem; margin-top: 2rem; }
    .warnings h3 { font-size: 0.875rem; color: #92400e; margin-bottom: 0.5rem; }
    .warnings li { font-size: 0.8rem; color: #78350f; }
    .per-persona-view { display: none; }
    .per-persona-view.active { display: block; }
    .merged-view { display: block; }
    .merged-view.hidden { display: none; }
    .persona-section { margin-bottom: 1.5rem; }
    .persona-section h2 { font-size: 1.1rem; border-bottom: 2px solid #e5e5e5; padding-bottom: 0.5rem; margin-bottom: 0.75rem; }
    .station-group { margin-bottom: 1rem; }
    .station-group h3 { font-size: 0.9rem; color: #555; margin-bottom: 0.5rem; }
  </style>
</head>
<body>
  <h1>UX Walkthrough Report</h1>
  <div class="meta">${escHtml(job.url)} &mdash; ${new Date().toLocaleDateString()} &mdash; ${Array.isArray(job.personas) ? job.personas.join(', ') : ''}</div>`;

  // Fallback warning banner (if plan was a fallback)
  if (plan.fallback) {
    html += `
  <div style="background:#fff8e1;border:1px solid #f9a825;border-radius:8px;padding:12px 16px;margin-bottom:1.5rem;font-size:0.875rem;color:#6d4c00;line-height:1.5;">
    <strong>Note:</strong> This walkthrough used a default template plan. Dynamic plan generation failed${plan.fallback_reason ? ': ' + escHtml(plan.fallback_reason) : ''}. Results may not be optimally tailored to the target site.
  </div>`;
  }

  // Executive summary
  if (summary) {
    html += `
  <div class="exec-summary">
    <h2>Executive Summary</h2>
    <p>${escHtml(summary)}</p>
  </div>`;
  }

  // Journey insights
  if (journeyInsights.length > 0) {
    html += `
  <div class="journey-insights">
    <h2>Journey-Level Patterns</h2>
    <ul>`;
    for (const insight of journeyInsights) {
      html += `\n      <li>${escHtml(insight)}</li>`;
    }
    html += `
    </ul>
  </div>`;
  }

  // Stats bar
  html += `
  <div class="stats">
    <div class="stat"><div class="num">${sorted.length}</div><div class="label">${hasMerged ? 'Merged Issues' : 'Issues'}</div></div>
    <div class="stat"><div class="num" style="color:${severityColor.P0}">${sevCounts.P0}</div><div class="label">P0 Blockers</div></div>
    <div class="stat"><div class="num" style="color:${severityColor.P1}">${sevCounts.P1}</div><div class="label">P1 Severe</div></div>
    <div class="stat"><div class="num">${raw.length}</div><div class="label">Raw Findings</div></div>
    <div class="stat"><div class="num">${Array.isArray(job.personas) ? job.personas.length : 1}</div><div class="label">Personas</div></div>
  </div>`;

  // View toggle (only show if we have merged findings)
  if (hasMerged) {
    html += `
  <div class="view-toggle">
    <button class="view-btn active" onclick="switchView('merged')">Merged View</button>
    <button class="view-btn" onclick="switchView('persona')">Per-Persona View</button>
  </div>`;
  }

  // ── Merged View ──
  html += `\n  <div id="merged-view" class="merged-view">`;

  for (let i = 0; i < sorted.length; i++) {
    const f = sorted[i];
    const color = severityColor[f.severity] || '#888';
    const wasCalibratedUp = hasMerged && f.original_severity && f.severity !== f.original_severity;
    const personasAffected = Array.isArray(f.personas_affected) ? f.personas_affected.join(', ') : (f.persona || '');
    const consensus = f.consensus || '';
    const title = f.title || f.description?.slice(0, 60) || '';

    html += `
    <div class="issue">
      <div class="issue-header">
        <span class="severity" style="background:${color}">${escHtml(f.severity)}</span>`;
    if (wasCalibratedUp) {
      html += `<span class="calibrated">&#8593; from ${escHtml(f.original_severity)}</span>`;
    }
    html += `
        <h3>${escHtml(f.id)}: ${escHtml(title)}</h3>
      </div>
      <p>${escHtml(f.description || '')}</p>`;

    if (f.suggestion) {
      html += `\n      <div class="suggestion">${escHtml(f.suggestion)}</div>`;
    }

    html += `
      <div class="issue-meta">
        <span class="consensus">${escHtml(consensus)}</span>
        <span>${escHtml(personasAffected)}</span>
        <span>${escHtml(f.classification || '')}</span>`;
    if (f.merge_reason) {
      html += `\n        <span>Merge: ${escHtml(f.merge_reason)}</span>`;
    }
    html += `
      </div>`;

    // Per-persona raw evidence (collapsed)
    if (hasMerged && Array.isArray(f.original_finding_ids) && f.original_finding_ids.length > 0) {
      html += `\n      <button class="toggle-evidence" onclick="toggleEvidence(this)">Show per-persona evidence (${f.original_finding_ids.length})</button>`;
      html += `\n      <div class="raw-evidence">`;
      for (const rawId of f.original_finding_ids) {
        const rf = rawById[rawId];
        if (rf) {
          const rawTitle = rf.raw_data?.title || rf.description?.slice(0, 60) || '';
          html += `\n        <div class="raw-item"><span class="persona-name">${escHtml(rf.persona)}</span> [${escHtml(rf.severity)}] ${escHtml(rawTitle)}</div>`;
        }
      }
      html += `\n      </div>`;
    }

    html += `\n    </div>`;
  }

  html += `\n  </div>`;

  // ── Per-Persona View ──
  if (hasMerged) {
    html += `\n  <div id="persona-view" class="per-persona-view">`;

    // Group raw findings by persona
    const byPersona = {};
    for (const f of raw) {
      const persona = f.persona?.split(',')[0]?.trim() || 'Unknown';
      if (!byPersona[persona]) byPersona[persona] = {};
      if (!byPersona[persona][f.station]) byPersona[persona][f.station] = [];
      byPersona[persona][f.station].push(f);
    }

    for (const [persona, stations] of Object.entries(byPersona)) {
      html += `\n    <div class="persona-section">
      <h2>${escHtml(persona)}</h2>`;

      for (const [station, issues] of Object.entries(stations)) {
        html += `\n      <div class="station-group">
        <h3>${escHtml(station)}</h3>`;
        for (const issue of issues) {
          const rawData = issue.raw_data || {};
          const color = severityColor[issue.severity] || '#888';
          html += `
        <div class="issue">
          <div class="issue-header">
            <span class="severity" style="background:${color}">${escHtml(issue.severity)}</span>
            <h3>${escHtml(issue.id)}: ${escHtml(rawData.title || issue.description?.slice(0, 60) || '')}</h3>
          </div>
          <p>${escHtml(issue.description || '')}</p>
          <div class="issue-meta">
            <span>${escHtml(rawData.classification || '')}</span>
          </div>
        </div>`;
        }
        html += `\n      </div>`;
      }

      html += `\n    </div>`;
    }

    html += `\n  </div>`;
  }

  // Synthesis warnings
  if (synthesisWarnings.length > 0) {
    html += `
  <div class="warnings">
    <h3>Synthesis Warnings</h3>
    <ul>`;
    for (const w of synthesisWarnings) {
      html += `\n      <li>${escHtml(w)}</li>`;
    }
    html += `
    </ul>
  </div>`;
  }

  // JS for view toggle + evidence toggle
  html += `
  <script>
    function switchView(view) {
      var btns = document.querySelectorAll('.view-btn');
      btns.forEach(function(b) { b.classList.remove('active'); });
      if (view === 'merged') {
        document.getElementById('merged-view').classList.remove('hidden');
        document.getElementById('persona-view').classList.remove('active');
        btns[0].classList.add('active');
      } else {
        document.getElementById('merged-view').classList.add('hidden');
        document.getElementById('persona-view').classList.add('active');
        btns[1].classList.add('active');
      }
    }
    function toggleEvidence(btn) {
      var ev = btn.nextElementSibling;
      if (ev.classList.contains('visible')) {
        ev.classList.remove('visible');
        btn.textContent = btn.textContent.replace('Hide', 'Show');
      } else {
        ev.classList.add('visible');
        btn.textContent = btn.textContent.replace('Show', 'Hide');
      }
    }
  </script>`;

  html += `\n</body>\n</html>\n`;

  // Save report to filesystem
  const outputDir = path.join(projectRoot, 'outputs', jobId);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'raw_report.html'), html, 'utf8');

  // Persist report HTML to Supabase (survives ephemeral container restarts)
  await updateJob(jobId, { report_html: html });

  // Write manifest
  const manifest = {
    job_id: jobId,
    url: job.url,
    merged_issues: sorted.length,
    raw_issues: raw.length,
    by_severity: sevCounts,
    personas: job.personas,
    has_synthesis: hasMerged,
    journey_insights: journeyInsights.length,
    synthesis_warnings: synthesisWarnings.length,
    generated_at: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

module.exports = { createWorker };
