-- UX Walkthrough Webapp — Supabase Schema
-- Run this in the Supabase SQL Editor

-- Jobs table
create table jobs (
  id text primary key,
  user_id uuid references auth.users(id),
  url text not null,
  personas jsonb not null,
  rules text default 'b2b_ecommerce',
  model text default 'claude-sonnet',
  status text default 'planning' check (status in ('planning','queued','running','done','failed','timeout','partial')),
  plan jsonb default '{}',
  progress jsonb default '{}',
  created_at timestamptz default now(),
  started_at timestamptz,
  completed_at timestamptz,
  report_url text,
  issue_count int default 0,
  error_msg text
);

-- Findings table
create table findings (
  id text primary key,
  job_id text references jobs(id),
  station text not null,
  persona text not null,
  severity text check (severity in ('P0','P1','P2','P3')),
  classification text,
  description text,
  screenshot_url text,
  raw_data jsonb,
  created_at timestamptz default now()
);

-- Enable Realtime on jobs table so frontend gets live updates
alter publication supabase_realtime add table jobs;

-- Atomic increment for issue count
create or replace function increment_issue_count(job_id text)
returns void as $$
  update jobs set issue_count = issue_count + 1 where id = job_id;
$$ language sql;

-- RLS policies (service role key bypasses these; anon key uses them)
alter table jobs enable row level security;
alter table findings enable row level security;

-- Users can read their own jobs
create policy "Users read own jobs"
  on jobs for select
  using (auth.uid() = user_id);

-- Users can insert jobs (server validates via auth middleware)
create policy "Users insert own jobs"
  on jobs for insert
  with check (auth.uid() = user_id);

-- Service role handles all updates (worker writes progress)
-- No update policy needed for anon key — worker uses service role

-- Users can read findings for their own jobs
create policy "Users read own findings"
  on findings for select
  using (
    exists (
      select 1 from jobs where jobs.id = findings.job_id and jobs.user_id = auth.uid()
    )
  );

-- Create storage bucket for screenshots (run via Supabase dashboard or API)
-- insert into storage.buckets (id, name, public) values ('screenshots', 'screenshots', true);
