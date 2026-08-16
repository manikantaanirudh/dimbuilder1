-- Project Query validation snapshots, typed rows, playbook runs, and pinned templates
CREATE TABLE IF NOT EXISTS validation_snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_updated_at TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  issue_count INTEGER NOT NULL DEFAULT 0,
  blocking_count INTEGER NOT NULL DEFAULT 0,
  result_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_validation_snapshots_project ON validation_snapshots(project_id, captured_at);

CREATE TABLE IF NOT EXISTS project_query_entry_rows (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES project_query_entries(id) ON DELETE CASCADE,
  row_order INTEGER NOT NULL,
  row_json TEXT NOT NULL DEFAULT '{}',
  search_text TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_project_query_entry_rows_entry ON project_query_entry_rows(entry_id, row_order);

CREATE TABLE IF NOT EXISTS project_query_playbook_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  session_id TEXT REFERENCES project_query_sessions(id) ON DELETE SET NULL,
  playbook_id TEXT NOT NULL,
  definition_version INTEGER NOT NULL,
  status TEXT NOT NULL,
  scope_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_project_query_playbook_runs_owner ON project_query_playbook_runs(project_id, user_id, updated_at);

CREATE TABLE IF NOT EXISTS project_query_playbook_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES project_query_playbook_runs(id) ON DELETE CASCADE,
  step_id TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL,
  result_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(run_id, step_id)
);
CREATE INDEX IF NOT EXISTS idx_project_query_playbook_steps_run ON project_query_playbook_steps(run_id, step_order);

CREATE TABLE IF NOT EXISTS project_query_templates (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'General',
  question TEXT NOT NULL,
  parameters_json TEXT NOT NULL DEFAULT '[]',
  scope_json TEXT NOT NULL DEFAULT '[]',
  last_run_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_project_query_templates_owner ON project_query_templates(project_id, user_id, updated_at);
