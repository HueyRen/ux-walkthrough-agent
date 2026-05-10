'use strict';

const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');
const crypto = require('crypto');

const { initDb, createJob, getJob, updateJob, listJobs } = require('./db');
const { writeConfigs } = require('./config-writer');

const PORT = process.env.PORT || 3000;
const projectRoot = path.resolve(__dirname, '..');

// jobId → Set<WebSocket>
const subscribers = new Map();

function broadcast(jobId, event) {
  const clients = subscribers.get(jobId);
  if (!clients) return;
  const msg = JSON.stringify(event);
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

async function main() {
  initDb();

  const { createWorker } = require('./worker');
  const worker = createWorker(projectRoot, broadcast);

  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));
  app.use('/outputs', express.static(path.join(projectRoot, 'outputs')));

  // GET / → index.html (handled by express.static above, but explicit fallback)
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  // POST /jobs — submit a new walkthrough job
  app.post('/jobs', async (req, res) => {
    try {
      const { submitter, url, personas, rules } = req.body;
      if (!submitter || !url || !personas) {
        return res.status(400).json({ error: '缺少必填字段: submitter, url, personas' });
      }

      const jobId = crypto.randomBytes(3).toString('hex');

      await writeConfigs(projectRoot, jobId, req.body);
      createJob({ id: jobId, submitter, url, personas, rules });
      worker.enqueue(jobId);

      res.json({ jobId, statusUrl: `/jobs/${jobId}` });
    } catch (err) {
      console.error('POST /jobs error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /jobs/:id → status page
  app.get('/jobs/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'status.html'));
  });

  // GET /jobs — history page or JSON
  app.get('/jobs', (req, res) => {
    try {
      const hasQueryParams = Object.keys(req.query).length > 0;
      const wantsJson = req.accepts(['html', 'json']) === 'json' || hasQueryParams;

      if (!wantsJson) {
        return res.sendFile(path.join(__dirname, 'public', 'history.html'));
      }

      const { submitter, limit = 50, offset = 0 } = req.query;
      const jobs = listJobs({ submitter, limit: Number(limit), offset: Number(offset) });
      res.json(jobs);
    } catch (err) {
      console.error('GET /jobs error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /reports/:id → serve raw_report.html
  app.get('/reports/:id', (req, res) => {
    const reportPath = path.join(projectRoot, 'outputs', req.params.id, 'raw_report.html');
    res.sendFile(reportPath, (err) => {
      if (err) res.status(404).json({ error: '报告不存在' });
    });
  });

  // GET /api/jobs — JSON job listing
  app.get('/api/jobs', (req, res) => {
    try {
      const { submitter, limit = 50, offset = 0 } = req.query;
      const jobs = listJobs({ submitter, limit: Number(limit), offset: Number(offset) });
      res.json(jobs);
    } catch (err) {
      console.error('GET /api/jobs error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/jobs/:id — JSON single job
  app.get('/api/jobs/:id', (req, res) => {
    try {
      const job = getJob(req.params.id);
      if (!job) return res.status(404).json({ error: '任务不存在' });
      res.json(job);
    } catch (err) {
      console.error('GET /api/jobs/:id error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // HTTP server + WebSocket on same port
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const params = new URLSearchParams(req.url.replace('/ws?', ''));
    const jobId = params.get('jobId');

    if (!jobId) {
      ws.close(1008, 'Missing jobId');
      return;
    }

    // Register subscriber
    if (!subscribers.has(jobId)) subscribers.set(jobId, new Set());
    subscribers.get(jobId).add(ws);

    // Send current job state immediately
    try {
      const job = getJob(jobId);
      if (job) ws.send(JSON.stringify({ type: 'state', payload: job }));
    } catch (_) {}

    ws.on('close', () => {
      const clients = subscribers.get(jobId);
      if (clients) {
        clients.delete(ws);
        if (clients.size === 0) subscribers.delete(jobId);
      }
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`UX Walkthrough server running at http://0.0.0.0:${PORT}`);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
