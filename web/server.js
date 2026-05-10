'use strict';

require('dotenv').config();

const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');

const { initDb, createJob, getJob, updateJob, listJobs } = require('./db');
const { writeConfigs } = require('./config-writer');
const { supabaseAdmin, supabaseUrl, supabaseAnonKey } = require('./supabase');
const { jobEmitter } = require('./emitter');

const PORT = process.env.PORT || 3000;
const projectRoot = path.resolve(__dirname, '..');

// Auth middleware — verifies Supabase JWT
async function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (!error && user) {
      req.userId = user.id;
      req.userEmail = user.email;
    }
  }
  // Allow unauthenticated access — auth verification disabled for now
  req.userId = req.userId || '00000000-0000-0000-0000-000000000000';
  req.userEmail = req.userEmail || 'anonymous@local';
  next();
}

async function main() {
  await initDb();

  const { createWorker } = require('./worker');
  const worker = createWorker(projectRoot);

  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));
  app.use('/outputs', express.static(path.join(projectRoot, 'outputs')));

  // GET / → index.html
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  // GET /study → architecture overview
  app.get('/study', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'study.html'));
  });

  // GET /health — Railway health check
  app.get('/health', (req, res) => res.json({ ok: true }));

  // GET /api/config — frontend Supabase config
  app.get('/api/config', (req, res) => {
    res.json({ supabaseUrl, supabaseAnonKey });
  });

  // POST /jobs — submit a new walkthrough job (auth required)
  app.post('/jobs', authMiddleware, async (req, res) => {
    try {
      const { url, personas, rules, model } = req.body;
      if (!url || !personas) {
        return res.status(400).json({ error: '缺少必填字段: url, personas' });
      }

      const jobId = crypto.randomBytes(3).toString('hex');

      await writeConfigs(projectRoot, jobId, {
        ...req.body,
        submitter: req.userEmail,
      });
      await createJob({
        id: jobId,
        user_id: req.userId,
        url,
        personas,
        rules,
        model,
        plan: { stations: [], generating: true, user_prompt: '' },
      });

      // Generate plan asynchronously (does not block response)
      const { generatePlan } = require('./planner');
      generatePlan(projectRoot, jobId, req.body).catch(async (err) => {
        console.error(`Plan generation fatal error for ${jobId}:`, err);
        // Ensure job doesn't stay stuck in 'generating' state
        try {
          await updateJob(jobId, {
            status: 'failed',
            error_msg: `Plan generation crashed: ${err.message}`,
            completed_at: new Date().toISOString(),
            plan: { generating: false, generated: false, fallback: false, plan_source: 'none', fallback_reason: err.message },
          });
          jobEmitter.emit(`job:${jobId}`, { type: 'failed', error: err.message });
        } catch (_) {}
      });

      res.json({ jobId, statusUrl: `/jobs/${jobId}` });
    } catch (err) {
      console.error('POST /jobs error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /jobs/:id/confirm — confirm plan and start execution
  app.post('/jobs/:id/confirm', authMiddleware, async (req, res) => {
    try {
      const job = await getJob(req.params.id);
      if (!job) return res.status(404).json({ error: '任务不存在' });
      if (job.status !== 'planning') {
        return res.status(400).json({ error: '任务不在计划确认阶段' });
      }

      const userPrompt = (req.body.user_prompt || '').trim();

      // Update plan with user prompt
      const updatedPlan = { ...job.plan, user_prompt: userPrompt };
      await updateJob(req.params.id, { status: 'queued', plan: updatedPlan });

      // Append user prompt to config.md if provided
      if (userPrompt) {
        const configPath = path.join(projectRoot, 'instances', req.params.id, 'config.md');
        const fs = require('fs');
        fs.appendFileSync(configPath, `\n\n## 用户补充指令\n${userPrompt}\n`, 'utf8');
      }

      worker.enqueue(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      console.error('POST /jobs/:id/confirm error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /jobs/:id/abort — abort a running job
  app.post('/jobs/:id/abort', authMiddleware, async (req, res) => {
    try {
      const job = await getJob(req.params.id);
      if (!job) return res.status(404).json({ error: '任务不存在' });
      if (job.status !== 'running' && job.status !== 'queued') {
        return res.status(400).json({ error: '任务不在可中断状态' });
      }

      const aborted = worker.abort(req.params.id);
      if (!aborted) {
        await updateJob(req.params.id, {
          status: 'failed',
          error_msg: '手动中断',
          completed_at: new Date().toISOString(),
        });
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('POST /jobs/:id/abort error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /jobs/:id → status page
  app.get('/jobs/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'status.html'));
  });

  // GET /jobs — history page or JSON
  app.get('/jobs', async (req, res) => {
    try {
      const hasQueryParams = Object.keys(req.query).length > 0;
      const wantsJson = req.accepts(['html', 'json']) === 'json' || hasQueryParams;

      if (!wantsJson) {
        return res.sendFile(path.join(__dirname, 'public', 'history.html'));
      }

      const { limit = 50, offset = 0 } = req.query;
      const jobs = await listJobs({ limit: Number(limit), offset: Number(offset) });
      res.json(jobs);
    } catch (err) {
      console.error('GET /jobs error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /reports/:id → serve raw_report.html (disk first, Supabase fallback)
  app.get('/reports/:id', async (req, res) => {
    const reportPath = path.join(projectRoot, 'outputs', req.params.id, 'raw_report.html');
    res.sendFile(reportPath, async (err) => {
      if (!err) return;
      try {
        const job = await getJob(req.params.id);
        if (job?.report_html) {
          res.type('html').send(job.report_html);
        } else {
          res.status(404).json({ error: '报告不存在' });
        }
      } catch (_) {
        res.status(404).json({ error: '报告不存在' });
      }
    });
  });

  // GET /api/jobs — JSON job listing
  app.get('/api/jobs', async (req, res) => {
    try {
      const { limit = 50, offset = 0 } = req.query;
      const jobs = await listJobs({ limit: Number(limit), offset: Number(offset) });
      res.json(jobs);
    } catch (err) {
      console.error('GET /api/jobs error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // --- SSE streaming ---
  const screenshotBuffers = new Map(); // jobId -> [{ url, filename }]

  // Buffer screenshots globally for replay on SSE connect
  jobEmitter.on('newListener', () => {}); // no-op, just to avoid warnings
  const globalScreenshotListener = (jobId) => {
    // This is set up per-job below via the route
  };

  // Fallback cleanup: scan every 60s for stale buffers
  setInterval(async () => {
    for (const [jid] of screenshotBuffers) {
      try {
        const job = await getJob(jid);
        if (!job || ['done', 'failed', 'timeout'].includes(job.status)) {
          screenshotBuffers.delete(jid);
        }
      } catch (_) {
        screenshotBuffers.delete(jid);
      }
    }
  }, 60_000);

  // GET /api/jobs/:id/stream — SSE endpoint
  app.get('/api/jobs/:id/stream', async (req, res) => {
    const jid = req.params.id;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // Check if job is already terminal
    try {
      const job = await getJob(jid);
      if (job && ['done', 'failed', 'timeout'].includes(job.status)) {
        const termEvent = job.status === 'done'
          ? { type: 'done', status: job.status, reportUrl: job.report_url || `/reports/${jid}` }
          : { type: 'failed', error: job.error_msg || 'Unknown error' };
        res.write(`data: ${JSON.stringify(termEvent)}\n\n`);
        res.end();
        return;
      }
    } catch (_) {}

    // Flush buffered screenshots
    const buffered = screenshotBuffers.get(jid) || [];
    for (const ss of buffered) {
      res.write(`data: ${JSON.stringify(ss)}\n\n`);
    }

    // Subscribe to live events (buffering handled by global emit override)
    const listener = (ev) => {
      try {
        res.write(`data: ${JSON.stringify(ev)}\n\n`);
      } catch (_) {}
    };

    jobEmitter.on(`job:${jid}`, listener);

    // Keepalive ping every 15s
    const pingInterval = setInterval(() => {
      try {
        res.write(`data: ${JSON.stringify({ type: 'ping' })}\n\n`);
      } catch (_) {
        clearInterval(pingInterval);
      }
    }, 15_000);

    // Cleanup on disconnect
    req.on('close', () => {
      jobEmitter.removeListener(`job:${jid}`, listener);
      clearInterval(pingInterval);
    });
  });

  // Also buffer screenshots from the global emitter (for clients connecting later)
  // We need to capture screenshots even before any SSE client connects
  const globalBuffer = (jid, ev) => {
    if (!screenshotBuffers.has(jid)) screenshotBuffers.set(jid, []);
    const buf = screenshotBuffers.get(jid);
    if (ev.type === 'screenshot' || ev.type === 'station-change' || ev.type === 'issue') {
      buf.push(ev);
    }
    if (ev.type === 'done' || ev.type === 'failed') {
      // Keep buffer for 30s after completion for late connectors, then clean
      setTimeout(() => screenshotBuffers.delete(jid), 30_000);
    }
  };
  // Use a wildcard-style approach: listen for any event that starts with 'job:'
  const origEmit = jobEmitter.emit.bind(jobEmitter);
  jobEmitter.emit = function (event, ...args) {
    if (typeof event === 'string' && event.startsWith('job:') && args[0]?.type) {
      const jid = event.replace('job:', '');
      globalBuffer(jid, args[0]);
    }
    return origEmit(event, ...args);
  };

  // GET /api/jobs/:id — JSON single job
  app.get('/api/jobs/:id', async (req, res) => {
    try {
      const job = await getJob(req.params.id);
      if (!job) return res.status(404).json({ error: '任务不存在' });
      res.json(job);
    } catch (err) {
      console.error('GET /api/jobs/:id error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // HTTP server (no WebSocket)
  const server = http.createServer(app);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`UX Walkthrough server running at http://0.0.0.0:${PORT}`);
  });

  // Graceful shutdown for Railway deploys
  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down...`);
    server.close();
    setTimeout(() => process.exit(1), 30_000);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
