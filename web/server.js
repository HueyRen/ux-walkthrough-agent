'use strict';

require('dotenv').config();

const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');

const { initDb, createJob, getJob, listJobs } = require('./db');
const { writeConfigs } = require('./config-writer');
const { supabaseAdmin, supabaseUrl, supabaseAnonKey } = require('./supabase');

const PORT = process.env.PORT || 3000;
const projectRoot = path.resolve(__dirname, '..');

// Auth middleware — verifies Supabase JWT
async function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: '未提供认证令牌' });

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: '认证无效' });

  req.userId = user.id;
  req.userEmail = user.email;
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
      });
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

  // GET /reports/:id → serve raw_report.html
  app.get('/reports/:id', (req, res) => {
    const reportPath = path.join(projectRoot, 'outputs', req.params.id, 'raw_report.html');
    res.sendFile(reportPath, (err) => {
      if (err) res.status(404).json({ error: '报告不存在' });
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
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
