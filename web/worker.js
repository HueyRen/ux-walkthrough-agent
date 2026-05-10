'use strict';

const { spawn } = require('child_process');
const { createParser } = require('./stdout-parser');
const { updateJob, incrementIssueCount } = require('./db');

const TOTAL_STATIONS = 9;
const JOB_TIMEOUT_MS = 2700000; // 45 minutes

function createWorker(projectRoot, emitter) {
  let queue;

  async function getQueue() {
    if (!queue) {
      const { default: PQueue } = await import('p-queue');
      queue = new PQueue({ concurrency: 1 });
    }
    return queue;
  }

  function enqueue(jobId) {
    getQueue().then(q => {
      q.add(() => runJob(jobId, projectRoot, emitter));
    });
  }

  return { enqueue };
}

async function runJob(jobId, projectRoot, emitter) {
  // Mark job as running
  updateJob(jobId, { status: 'running', started_at: new Date().toISOString() });

  const prompt = `You are executing a UX walkthrough. The config files are at instances/${jobId}/.
Read these files:
- instances/${jobId}/system_instructions.md (your role and evaluation rules)
- instances/${jobId}/personas.md (the user personas to evaluate as)
- instances/${jobId}/task_card.md (the station route to follow)
- instances/${jobId}/config.md (project metadata)

Execute Phase B of the walkthrough: visit each station in the task card, evaluate using the personas, take screenshots, record issues per the schema in schema/issue_schema.md, and write all outputs to outputs/${jobId}/.

IMPORTANT - Progress reporting: You MUST print these markers to stdout so the web dashboard can track progress:
- When entering a new station, print: ## S{number} {station name}
  Example: ## S1 首页着陆
- When saving a screenshot, print the filename on its own line
  Example: r1_s1_step01_homepage_landing.png
- When recording an issue, print the issue ID on its own line
  Example: P-S1-01
- When finished, print: Writing manifest.json

At the end, generate outputs/${jobId}/raw_report.html and outputs/${jobId}/manifest.json.`;

  const child = spawn('claude', ['-p', '--allowedTools', '*', '--dangerously-skip-permissions'], {
    cwd: projectRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: true,
  });

  // Write prompt to stdin and close it
  child.stdin.write(prompt);
  child.stdin.end();

  let stationCount = 0;
  let currentStation = null;
  let completedReceived = false;
  let finished = false;
  let lineBuffer = '';
  let issueCount = 0;

  const processLine = createParser((event) => {
    if (event.type === 'issue') {
      issueCount++;
      incrementIssueCount(jobId);
      emitter(jobId, { type: 'issue', payload: { id: event.payload.id, stationId: currentStation } });
      return;
    }

    if (event.type === 'station') {
      // Mark previous station as done
      if (currentStation) {
        emitter(jobId, { type: 'station', payload: { stationId: currentStation, status: 'done' } });
      }
      stationCount++;
      currentStation = event.payload.station;
      // Mark new station as current
      emitter(jobId, { type: 'station', payload: { stationId: currentStation, status: 'current' } });
      emitter(jobId, {
        type: 'progress',
        payload: { completed: stationCount - 1, total: TOTAL_STATIONS, issues: issueCount },
      });
      return;
    }

    if (event.type === 'complete') {
      completedReceived = true;
      // Mark last station as done
      if (currentStation) {
        emitter(jobId, { type: 'station', payload: { stationId: currentStation, status: 'done' } });
      }
    }

    if (event.type === 'screenshot') {
      emitter(jobId, { type: 'screenshot', payload: { file: event.payload.file, stationId: currentStation } });
      return;
    }

    emitter(jobId, event);
  });

  child.stdout.on('data', (chunk) => {
    lineBuffer += chunk.toString();
    const lines = lineBuffer.split('\n');
    lineBuffer = lines.pop(); // keep the incomplete last chunk
    for (const line of lines) {
      processLine(line);
    }
  });

  // Drain stderr (prevent pipe buffer blocking)
  child.stderr.on('data', () => {});

  // Set timeout
  const timer = setTimeout(() => {
    if (finished) return;
    finished = true;
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch (_) {}
    updateJob(jobId, { status: 'timeout', error_msg: '执行超时（30分钟）' });
    emitter(jobId, { type: 'timeout', payload: { error: '执行超时（30分钟）' } });
  }, JOB_TIMEOUT_MS);

  await new Promise((resolve) => {
    child.on('exit', (code) => {
      if (finished) return resolve();
      finished = true;
      clearTimeout(timer);

      // Flush any remaining buffer
      if (lineBuffer.trim()) processLine(lineBuffer);

      if (code === 0 && completedReceived) {
        updateJob(jobId, {
          status: 'done',
          completed_at: new Date().toISOString(),
          output_path: `outputs/${jobId}/raw_report.html`,
        });
        emitter(jobId, { type: 'done', payload: { reportUrl: `/reports/${jobId}` } });
      } else {
        const errorMsg = code === 0 ? '未收到完成信号' : `进程退出，代码 ${code}`;
        updateJob(jobId, {
          status: 'failed',
          error_msg: errorMsg,
        });
        emitter(jobId, { type: 'failed', payload: { error: errorMsg } });
      }

      resolve();
    });
  });
}

module.exports = { createWorker };
