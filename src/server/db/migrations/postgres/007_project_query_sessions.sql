CREATE TABLE IF NOT EXISTS project_query_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  legacy_id TEXT,
  title TEXT NOT NULL DEFAULT 'New Query Session',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_query_entries (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES project_query_sessions(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  result_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_query_session_legacy ON project_query_sessions(project_id, user_id, legacy_id);
CREATE INDEX IF NOT EXISTS idx_project_query_sessions_owner ON project_query_sessions(project_id, user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_project_query_sessions_expiry ON project_query_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_project_query_entries_session ON project_query_entries(session_id, created_at);
