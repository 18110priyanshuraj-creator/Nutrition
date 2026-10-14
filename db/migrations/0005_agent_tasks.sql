CREATE TABLE IF NOT EXISTS agent_tasks (
  id TEXT PRIMARY KEY,
  request TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'interrupted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  worker_id TEXT,
  worker_pid INTEGER,
  exit_code INTEGER,
  summary TEXT,
  progress TEXT NOT NULL DEFAULT 'Queued',
  logs TEXT NOT NULL DEFAULT '',
  changed_files_json TEXT NOT NULL DEFAULT '[]',
  checks_json TEXT NOT NULL DEFAULT '{}',
  branch TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  baseline_files_json TEXT NOT NULL DEFAULT '[]',
  retry_count INTEGER NOT NULL DEFAULT 0,
  resume_of TEXT,
  cancellation_requested INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
CREATE INDEX IF NOT EXISTS agent_tasks_created_at_idx ON agent_tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS agent_tasks_status_idx ON agent_tasks(status);
