-- Add validation_waivers table for auditable issue waivers.
CREATE TABLE IF NOT EXISTS validation_waivers (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  issue_id TEXT NOT NULL,
  rule_code TEXT NOT NULL,
  dimension_id TEXT NOT NULL DEFAULT '',
  member_key TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL,
  user_id TEXT NOT NULL DEFAULT 'local-admin',
  created_at TEXT NOT NULL,
  revoked_at TEXT
);
