'use strict';

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'jobs.json');

let jobs = [];

function load() {
  try {
    if (fs.existsSync(DB_PATH)) {
      jobs = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    }
  } catch (_) {
    jobs = [];
  }
}

function save() {
  fs.writeFileSync(DB_PATH, JSON.stringify(jobs, null, 2), 'utf8');
}

function initDb() {
  load();
  // Startup reconciliation: mark orphaned running jobs as failed
  let changed = false;
  for (const job of jobs) {
    if (job.status === 'running') {
      job.status = 'failed';
      job.error_msg = '服务器重启，任务中断';
      changed = true;
    }
  }
  if (changed) save();
}

function createJob({ id, submitter, url, personas, rules }) {
  const job = {
    id,
    submitter,
    url,
    personas: Array.isArray(personas) ? personas : JSON.parse(personas),
    rules: rules || 'b2b_ecommerce',
    status: 'queued',
    created_at: new Date().toISOString(),
    started_at: null,
    completed_at: null,
    output_path: null,
    issue_count: 0,
    error_msg: null,
    retry_of: null,
  };
  jobs.unshift(job);
  save();
}

function getJob(id) {
  return jobs.find(j => j.id === id) || null;
}

function updateJob(id, updates) {
  const job = jobs.find(j => j.id === id);
  if (!job) return;
  Object.assign(job, updates);
  save();
}

function incrementIssueCount(id) {
  const job = jobs.find(j => j.id === id);
  if (!job) return;
  job.issue_count = (job.issue_count || 0) + 1;
  save();
}

function listJobs({ submitter, limit = 50, offset = 0 } = {}) {
  let filtered = jobs;
  if (submitter) {
    filtered = jobs.filter(j => j.submitter === submitter);
  }
  return filtered.slice(offset, offset + limit);
}

module.exports = { initDb, createJob, getJob, updateJob, incrementIssueCount, listJobs };
