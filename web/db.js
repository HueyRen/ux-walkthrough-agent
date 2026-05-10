'use strict';

const { supabaseAdmin } = require('./supabase');

async function initDb() {
  // Mark any interrupted jobs as failed on startup
  await supabaseAdmin
    .from('jobs')
    .update({ status: 'failed', error_msg: '服务器重启，任务中断' })
    .eq('status', 'running');
}

async function createJob({ id, user_id, url, personas, rules, model }) {
  const { error } = await supabaseAdmin.from('jobs').insert({
    id,
    user_id,
    url,
    personas: Array.isArray(personas) ? personas : JSON.parse(personas),
    rules: rules || 'b2b_ecommerce',
    model: model || 'claude-sonnet',
    status: 'queued',
    created_at: new Date().toISOString(),
  });
  if (error) throw new Error(`createJob failed: ${error.message}`);
}

async function getJob(id) {
  const { data, error } = await supabaseAdmin
    .from('jobs')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return data;
}

async function updateJob(id, updates) {
  const { error } = await supabaseAdmin
    .from('jobs')
    .update(updates)
    .eq('id', id);
  if (error) throw new Error(`updateJob failed: ${error.message}`);
}

async function incrementIssueCount(id) {
  const { error } = await supabaseAdmin.rpc('increment_issue_count', { job_id: id });
  if (error) throw new Error(`incrementIssueCount failed: ${error.message}`);
}

async function listJobs({ limit = 50, offset = 0 } = {}) {
  const { data, error } = await supabaseAdmin
    .from('jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(`listJobs failed: ${error.message}`);
  return data;
}

module.exports = { initDb, createJob, getJob, updateJob, incrementIssueCount, listJobs };
