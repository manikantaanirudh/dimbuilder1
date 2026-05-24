export const schemaSql = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  source_file_name TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dimensions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sheet_name TEXT NOT NULL,
  dimension_type TEXT NOT NULL,
  dimension_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  access_group TEXT NOT NULL DEFAULT '',
  maintenance_group TEXT NOT NULL DEFAULT '',
  inherited_dimension TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dimension_members (
  id TEXT PRIMARY KEY,
  dimension_id TEXT NOT NULL REFERENCES dimensions(id) ON DELETE CASCADE,
  member_key TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  properties_json TEXT NOT NULL DEFAULT '{}',
  row_order INTEGER NOT NULL,
  source_row_number INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dimension_relationships (
  id TEXT PRIMARY KEY,
  dimension_id TEXT NOT NULL REFERENCES dimensions(id) ON DELETE CASCADE,
  parent_key TEXT NOT NULL DEFAULT '',
  child_key TEXT NOT NULL DEFAULT '',
  aggregation_weight REAL,
  percent_consol REAL,
  percent_ownership REAL,
  ownership_type TEXT NOT NULL DEFAULT '',
  properties_json TEXT NOT NULL DEFAULT '{}',
  operation TEXT,
  operation_source TEXT,
  operation_notes TEXT,
  row_order INTEGER NOT NULL,
  source_row_number INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS varying_property_values (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  dimension_id TEXT NOT NULL REFERENCES dimensions(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('dimension', 'member', 'relationship')),
  target_id TEXT NOT NULL,
  property_name TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  cube_type TEXT NOT NULL DEFAULT '',
  scenario_type TEXT NOT NULL DEFAULT '',
  time_member TEXT NOT NULL DEFAULT '',
  is_default INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS validation_issues (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  dimension_id TEXT NOT NULL REFERENCES dimensions(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  severity TEXT NOT NULL,
  code TEXT NOT NULL,
  message TEXT NOT NULL,
  field_name TEXT NOT NULL DEFAULT '',
  row_number INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS export_jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  export_type TEXT NOT NULL,
  status TEXT NOT NULL,
  file_url TEXT NOT NULL DEFAULT '',
  validation_summary_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json TEXT NOT NULL DEFAULT '{}',
  after_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  snapshot_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_baselines (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('xml', 'snapshot', 'json', 'manual')),
  source_file_name TEXT NOT NULL DEFAULT '',
  baseline_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS metadata_diff_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  baseline_id TEXT NOT NULL REFERENCES project_baselines(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  summary_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS metadata_diff_items (
  id TEXT PRIMARY KEY,
  diff_run_id TEXT NOT NULL REFERENCES metadata_diff_runs(id) ON DELETE CASCADE,
  dimension_type TEXT NOT NULL,
  dimension_name TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('dimension', 'member', 'relationship', 'property')),
  change_type TEXT NOT NULL CHECK (change_type IN ('add', 'update', 'delete', 'move', 'copy', 'unchanged', 'warning')),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error')),
  object_key TEXT NOT NULL,
  parent_key TEXT,
  child_key TEXT,
  property_name TEXT,
  old_value TEXT,
  new_value TEXT,
  details_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS change_sets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  baseline_id TEXT REFERENCES project_baselines(id) ON DELETE SET NULL,
  diff_run_id TEXT REFERENCES metadata_diff_runs(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('draft', 'validated', 'approved', 'exported', 'rejected')),
  target_environment TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS change_set_items (
  id TEXT PRIMARY KEY,
  change_set_id TEXT NOT NULL REFERENCES change_sets(id) ON DELETE CASCADE,
  diff_item_id TEXT REFERENCES metadata_diff_items(id) ON DELETE SET NULL,
  item_type TEXT NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IN ('add', 'update', 'delete', 'move', 'copy', 'unchanged', 'warning')),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error')),
  dimension_type TEXT NOT NULL,
  object_key TEXT NOT NULL,
  property_name TEXT,
  old_value TEXT,
  new_value TEXT,
  details_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS change_set_approvals (
  id TEXT PRIMARY KEY,
  change_set_id TEXT NOT NULL REFERENCES change_sets(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('approve', 'reject', 'comment')),
  comment TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS release_packages (
  id TEXT PRIMARY KEY,
  change_set_id TEXT NOT NULL REFERENCES change_sets(id) ON DELETE CASCADE,
  package_name TEXT NOT NULL,
  package_path TEXT NOT NULL,
  manifest_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bulk_update_jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('member', 'relationship')),
  operation TEXT NOT NULL,
  request_json TEXT NOT NULL DEFAULT '{}',
  summary_json TEXT NOT NULL DEFAULT '{}',
  rollback_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bulk_update_items (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES bulk_update_jobs(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL,
  target_key TEXT NOT NULL,
  property_name TEXT NOT NULL,
  old_value TEXT NOT NULL DEFAULT '',
  new_value TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT,
  auth_provider TEXT NOT NULL DEFAULT 'local',
  auth_provider_id TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'viewer',
  is_active INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_permissions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer',
  granted_by TEXT REFERENCES users(id),
  granted_at TEXT NOT NULL,
  UNIQUE(project_id, user_id)
);

CREATE TABLE IF NOT EXISTS project_validation_overrides (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rule_code TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'off',
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, rule_code)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_project_permissions_project ON project_permissions(project_id);
CREATE INDEX IF NOT EXISTS idx_project_permissions_user ON project_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_provider ON users(auth_provider, auth_provider_id);
CREATE INDEX IF NOT EXISTS idx_dimensions_project ON dimensions(project_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_members_dimension ON dimension_members(dimension_id, row_order);
CREATE INDEX IF NOT EXISTS idx_members_key ON dimension_members(dimension_id, member_key);
CREATE INDEX IF NOT EXISTS idx_relationships_dimension ON dimension_relationships(dimension_id, row_order);
CREATE INDEX IF NOT EXISTS idx_relationships_parent_child ON dimension_relationships(dimension_id, parent_key, child_key);
CREATE INDEX IF NOT EXISTS idx_varying_properties_project ON varying_property_values(project_id);
CREATE INDEX IF NOT EXISTS idx_varying_properties_dimension ON varying_property_values(dimension_id);
CREATE INDEX IF NOT EXISTS idx_varying_properties_target ON varying_property_values(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_varying_properties_property_name ON varying_property_values(property_name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_varying_properties_unique_context
  ON varying_property_values(project_id, target_type, target_id, property_name, cube_type, scenario_type, time_member);
CREATE INDEX IF NOT EXISTS idx_issues_project ON validation_issues(project_id, severity);
CREATE INDEX IF NOT EXISTS idx_project_baselines_project ON project_baselines(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_metadata_diff_runs_project ON metadata_diff_runs(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_metadata_diff_runs_baseline ON metadata_diff_runs(baseline_id);
CREATE INDEX IF NOT EXISTS idx_metadata_diff_items_run ON metadata_diff_items(diff_run_id);
CREATE INDEX IF NOT EXISTS idx_metadata_diff_items_change ON metadata_diff_items(diff_run_id, change_type, target_type);
CREATE INDEX IF NOT EXISTS idx_change_sets_project ON change_sets(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_change_sets_diff_run ON change_sets(diff_run_id);
CREATE INDEX IF NOT EXISTS idx_change_set_items_change_set ON change_set_items(change_set_id);
CREATE INDEX IF NOT EXISTS idx_change_set_approvals_change_set ON change_set_approvals(change_set_id, created_at);
CREATE INDEX IF NOT EXISTS idx_release_packages_change_set ON release_packages(change_set_id, created_at);
CREATE INDEX IF NOT EXISTS idx_bulk_update_jobs_project ON bulk_update_jobs(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_bulk_update_jobs_target ON bulk_update_jobs(project_id, target_type, operation);
CREATE INDEX IF NOT EXISTS idx_bulk_update_items_job ON bulk_update_items(job_id);
CREATE INDEX IF NOT EXISTS idx_bulk_update_items_target ON bulk_update_items(target_id, property_name);

CREATE TABLE IF NOT EXISTS workflow_definitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  dimension_types TEXT NOT NULL DEFAULT '*',
  steps_json TEXT NOT NULL,
  auto_advance_rules_json TEXT NOT NULL DEFAULT '{}',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_instances (
  id TEXT PRIMARY KEY,
  definition_id TEXT NOT NULL REFERENCES workflow_definitions(id),
  change_set_id TEXT NOT NULL REFERENCES change_sets(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  current_step_index INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'in_progress',
  submitted_by TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_step_actions (
  id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL,
  action TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_notifications (
  id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'in_app',
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workflow_instances_project ON workflow_instances(project_id, status);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_change_set ON workflow_instances(change_set_id);
CREATE INDEX IF NOT EXISTS idx_workflow_step_actions_instance ON workflow_step_actions(instance_id, step_index);
CREATE INDEX IF NOT EXISTS idx_workflow_notifications_recipient ON workflow_notifications(recipient_id, is_read);

CREATE TABLE IF NOT EXISTS environments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'onestream',
  base_url TEXT NOT NULL DEFAULT '',
  client_id TEXT NOT NULL DEFAULT '',
  client_secret TEXT NOT NULL DEFAULT '',
  tenant_id TEXT NOT NULL DEFAULT '',
  app_name TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deployment_history (
  id TEXT PRIMARY KEY,
  environment_id TEXT NOT NULL REFERENCES environments(id),
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  change_set_id TEXT REFERENCES change_sets(id) ON DELETE SET NULL,
  status TEXT NOT NULL,
  xml_payload TEXT NOT NULL DEFAULT '',
  comment TEXT NOT NULL DEFAULT '',
  initiated_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS deployment_dimension_results (
  id TEXT PRIMARY KEY,
  deployment_id TEXT NOT NULL REFERENCES deployment_history(id) ON DELETE CASCADE,
  dimension_type TEXT NOT NULL,
  dimension_name TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_environments_active ON environments(is_active);
CREATE INDEX IF NOT EXISTS idx_deployment_history_env ON deployment_history(environment_id, created_at);
CREATE INDEX IF NOT EXISTS idx_deployment_history_project ON deployment_history(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_deployment_dim_results ON deployment_dimension_results(deployment_id);

CREATE TABLE IF NOT EXISTS connector_definitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  connector_type TEXT NOT NULL,
  connection_config_json TEXT NOT NULL DEFAULT '{}',
  extraction_config_json TEXT NOT NULL DEFAULT '{}',
  is_active INTEGER NOT NULL DEFAULT 1,
  last_tested_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mapping_rules (
  id TEXT PRIMARY KEY,
  connector_id TEXT NOT NULL REFERENCES connector_definitions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_entity TEXT NOT NULL,
  target_dimension_type TEXT NOT NULL,
  field_mappings_json TEXT NOT NULL DEFAULT '[]',
  hierarchy_rules_json TEXT,
  filter_rules_json TEXT NOT NULL DEFAULT '[]',
  conflict_resolution TEXT NOT NULL DEFAULT 'source_wins',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_jobs (
  id TEXT PRIMARY KEY,
  connector_id TEXT NOT NULL REFERENCES connector_definitions(id) ON DELETE CASCADE,
  mapping_rule_id TEXT NOT NULL REFERENCES mapping_rules(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  schedule_cron TEXT,
  auto_approve INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  next_run_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES sync_jobs(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running',
  source_records_read INTEGER NOT NULL DEFAULT 0,
  members_created INTEGER NOT NULL DEFAULT 0,
  members_updated INTEGER NOT NULL DEFAULT 0,
  members_deleted INTEGER NOT NULL DEFAULT 0,
  relationships_created INTEGER NOT NULL DEFAULT 0,
  relationships_updated INTEGER NOT NULL DEFAULT 0,
  conflicts_detected INTEGER NOT NULL DEFAULT 0,
  conflicts_resolved INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS member_source_registry (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  dimension_type TEXT NOT NULL,
  member_key TEXT NOT NULL,
  source_system TEXT NOT NULL,
  source_id TEXT,
  last_synced_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, dimension_type, member_key)
);

CREATE INDEX IF NOT EXISTS idx_connector_definitions_active ON connector_definitions(is_active);
CREATE INDEX IF NOT EXISTS idx_mapping_rules_connector ON mapping_rules(connector_id);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_connector ON sync_jobs(connector_id);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_project ON sync_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_sync_runs_job ON sync_runs(job_id, created_at);
CREATE INDEX IF NOT EXISTS idx_member_source_project ON member_source_registry(project_id, dimension_type);
`;
