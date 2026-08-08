export const schemaSql = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  source_file_name TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version_number INTEGER NOT NULL DEFAULT 1,
  version_label TEXT NOT NULL DEFAULT 'v1',
  seeded_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS project_versions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  version_label TEXT NOT NULL,
  source_file_name TEXT NOT NULL DEFAULT '',
  seeded_at TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT 'local-admin',
  summary_json TEXT NOT NULL DEFAULT '{}',
  snapshot_json TEXT NOT NULL DEFAULT '{}'
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

CREATE TABLE IF NOT EXISTS impact_analyses (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  change_set_id TEXT,
  analysis_type TEXT NOT NULL,
  scope_json TEXT NOT NULL,
  environment_id TEXT,
  results_json TEXT NOT NULL,
  severity TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_impact_analyses_project ON impact_analyses(project_id, created_at);

CREATE TABLE IF NOT EXISTS promotion_pipelines (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  stages_json TEXT NOT NULL DEFAULT '[]',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS environment_sync_status (
  id TEXT PRIMARY KEY,
  environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  dimension_type TEXT NOT NULL,
  last_deployed_at TEXT,
  local_version_hash TEXT NOT NULL DEFAULT '',
  sync_status TEXT NOT NULL DEFAULT 'unknown',
  checked_at TEXT NOT NULL,
  UNIQUE(environment_id, project_id, dimension_type)
);

CREATE TABLE IF NOT EXISTS environment_overrides (
  id TEXT PRIMARY KEY,
  environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  dimension_type TEXT NOT NULL,
  member_key TEXT NOT NULL,
  property_name TEXT NOT NULL,
  override_value TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS promotion_history (
  id TEXT PRIMARY KEY,
  pipeline_id TEXT NOT NULL REFERENCES promotion_pipelines(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_environment_id TEXT NOT NULL REFERENCES environments(id),
  to_environment_id TEXT NOT NULL REFERENCES environments(id),
  deployment_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  promoted_by TEXT NOT NULL,
  promoted_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_promotion_pipelines_active ON promotion_pipelines(is_active);
CREATE INDEX IF NOT EXISTS idx_env_sync_status_env ON environment_sync_status(environment_id, project_id);
CREATE INDEX IF NOT EXISTS idx_env_sync_status_project ON environment_sync_status(project_id, dimension_type);
CREATE INDEX IF NOT EXISTS idx_env_overrides_env ON environment_overrides(environment_id, project_id);
CREATE INDEX IF NOT EXISTS idx_env_overrides_project ON environment_overrides(project_id, dimension_type);
CREATE INDEX IF NOT EXISTS idx_promotion_history_pipeline ON promotion_history(pipeline_id, promoted_at);
CREATE INDEX IF NOT EXISTS idx_promotion_history_project ON promotion_history(project_id, promoted_at);

CREATE TABLE IF NOT EXISTS ai_suggestions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  dimension_id TEXT,
  suggestion_type TEXT NOT NULL,
  target_member_key TEXT,
  suggestion_json TEXT NOT NULL DEFAULT '{}',
  confidence REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  acted_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_conversations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  messages_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_suggestions_project ON ai_suggestions(project_id, suggestion_type);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_status ON ai_suggestions(project_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_project ON ai_conversations(project_id, user_id);

CREATE TABLE IF NOT EXISTS cross_dimension_rules (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_dimension_type TEXT NOT NULL,
  target_dimension_type TEXT NOT NULL,
  rule_type TEXT NOT NULL,
  rule_config_json TEXT NOT NULL DEFAULT '{}',
  severity TEXT NOT NULL DEFAULT 'warning',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cross_dimension_mappings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_dimension_type TEXT NOT NULL,
  source_member_key TEXT NOT NULL,
  target_dimension_type TEXT NOT NULL,
  target_member_key TEXT NOT NULL,
  mapping_type TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cross_dim_rules_project ON cross_dimension_rules(project_id);
CREATE INDEX IF NOT EXISTS idx_cross_dim_mappings_project ON cross_dimension_mappings(project_id, source_dimension_type);
CREATE INDEX IF NOT EXISTS idx_cross_dim_mappings_target ON cross_dimension_mappings(project_id, target_member_key);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'custom',
  industry TEXT,
  dimension_types_json TEXT NOT NULL DEFAULT '[]',
  template_data_json TEXT NOT NULL DEFAULT '{}',
  tags_json TEXT NOT NULL DEFAULT '[]',
  version TEXT NOT NULL DEFAULT '1.0.0',
  is_public INTEGER NOT NULL DEFAULT 0,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS template_applications (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  applied_by TEXT NOT NULL,
  rename_mapping_json TEXT,
  applied_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category, industry);
CREATE INDEX IF NOT EXISTS idx_template_applications_project ON template_applications(project_id);
CREATE INDEX IF NOT EXISTS idx_template_applications_template ON template_applications(template_id);

CREATE TABLE IF NOT EXISTS report_definitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  report_type TEXT NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  schedule_cron TEXT,
  format TEXT NOT NULL DEFAULT 'json',
  recipients_json TEXT NOT NULL DEFAULT '[]',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS report_runs (
  id TEXT PRIMARY KEY,
  definition_id TEXT NOT NULL REFERENCES report_definitions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  output_data_json TEXT,
  generated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS metadata_health_snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  dimension_type TEXT NOT NULL,
  quality_score REAL NOT NULL DEFAULT 0,
  completeness_score REAL NOT NULL DEFAULT 0,
  naming_score REAL NOT NULL DEFAULT 0,
  validation_error_count INTEGER NOT NULL DEFAULT 0,
  validation_warning_count INTEGER NOT NULL DEFAULT 0,
  member_count INTEGER NOT NULL DEFAULT 0,
  orphan_count INTEGER NOT NULL DEFAULT 0,
  captured_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_report_definitions_type ON report_definitions(report_type);
CREATE INDEX IF NOT EXISTS idx_report_runs_def ON report_runs(definition_id, generated_at);
CREATE INDEX IF NOT EXISTS idx_health_snapshots_project ON metadata_health_snapshots(project_id, dimension_type, captured_at);

CREATE TABLE IF NOT EXISTS vcs_branches (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  head_commit_id TEXT,
  base_branch_id TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vcs_commits (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES vcs_branches(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  snapshot_data_json TEXT NOT NULL DEFAULT '{}',
  parent_commit_id TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vcs_tags (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  commit_id TEXT NOT NULL REFERENCES vcs_commits(id) ON DELETE CASCADE,
  description TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vcs_branches_project ON vcs_branches(project_id, status);
CREATE INDEX IF NOT EXISTS idx_vcs_commits_branch ON vcs_commits(branch_id, created_at);
CREATE INDEX IF NOT EXISTS idx_vcs_commits_project ON vcs_commits(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_vcs_tags_project ON vcs_tags(project_id);

CREATE TABLE IF NOT EXISTS edit_locks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  dimension_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  acquired_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  trigger_config_json TEXT NOT NULL DEFAULT '{}',
  action_type TEXT NOT NULL,
  action_config_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  last_run_at TEXT,
  next_run_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS job_executions (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES scheduled_jobs(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TEXT NOT NULL,
  completed_at TEXT,
  result_json TEXT,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS quality_rules (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0,
  config_json TEXT NOT NULL DEFAULT '{}',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quality_gates (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  threshold REAL NOT NULL DEFAULT 70,
  scope TEXT NOT NULL DEFAULT 'project',
  action TEXT NOT NULL DEFAULT 'warn',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS migration_projects (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  source_config_json TEXT NOT NULL DEFAULT '{}',
  progress_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  events_json TEXT NOT NULL DEFAULT '[]',
  secret TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  failure_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  operation_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  synced_at TEXT
);

CREATE TABLE IF NOT EXISTS generated_documents (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'markdown',
  content TEXT NOT NULL DEFAULT '',
  snapshot_id TEXT,
  generated_by TEXT NOT NULL,
  generated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_edit_locks_project ON edit_locks(project_id, dimension_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_project ON scheduled_jobs(project_id, status);
CREATE INDEX IF NOT EXISTS idx_job_executions_job ON job_executions(job_id, started_at);
CREATE INDEX IF NOT EXISTS idx_quality_rules_project ON quality_rules(project_id, category);
CREATE INDEX IF NOT EXISTS idx_quality_gates_project ON quality_gates(project_id);
CREATE INDEX IF NOT EXISTS idx_migration_projects ON migration_projects(project_id);
CREATE INDEX IF NOT EXISTS idx_webhook_subs_project ON webhook_subscriptions(project_id);
CREATE INDEX IF NOT EXISTS idx_sync_queue_project ON sync_queue(project_id, status);
CREATE INDEX IF NOT EXISTS idx_generated_docs_project ON generated_documents(project_id);

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  config_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collaboration_comments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  dimension_id TEXT NOT NULL,
  member_key TEXT,
  content TEXT NOT NULL,
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL DEFAULT '',
  mentions_json TEXT NOT NULL DEFAULT '[]',
  parent_comment_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  project_id TEXT,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  changes_json TEXT NOT NULL DEFAULT '{}',
  ip_address TEXT,
  timestamp TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS retention_policies (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  entity_type TEXT NOT NULL,
  retention_days INTEGER NOT NULL DEFAULT 365,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_comments_project ON collaboration_comments(project_id, dimension_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_project ON audit_log(project_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_retention_policies ON retention_policies(tenant_id, entity_type);

-- Project-level access control
CREATE TABLE IF NOT EXISTS project_members (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  granted_by TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  UNIQUE(project_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id);

CREATE TABLE IF NOT EXISTS property_default_profiles (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_file_name TEXT NOT NULL DEFAULT '',
  source_xml_hash TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL DEFAULT 'local-admin',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS property_default_values (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES property_default_profiles(id) ON DELETE CASCADE,
  dimension_type TEXT NOT NULL,
  target_level TEXT NOT NULL CHECK (target_level IN ('dimension', 'member', 'relationship')),
  property_name TEXT NOT NULL,
  xml_name TEXT NOT NULL,
  default_value TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  confidence REAL NOT NULL DEFAULT 0,
  sample_count INTEGER NOT NULL DEFAULT 0,
  non_blank_count INTEGER NOT NULL DEFAULT 0,
  distinct_count INTEGER NOT NULL DEFAULT 0,
  source_dimension_names_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL,
  UNIQUE(profile_id, dimension_type, target_level, property_name)
);

CREATE INDEX IF NOT EXISTS idx_property_default_profiles_project ON property_default_profiles(project_id, is_active);
CREATE INDEX IF NOT EXISTS idx_property_default_values_profile ON property_default_values(profile_id, dimension_type);

CREATE TABLE IF NOT EXISTS property_default_overrides (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  dimension_type TEXT NOT NULL,
  target_level TEXT NOT NULL CHECK (target_level IN ('dimension', 'member', 'relationship')),
  property_name TEXT NOT NULL,
  xml_name TEXT NOT NULL,
  default_value TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, dimension_type, target_level, property_name)
);

CREATE INDEX IF NOT EXISTS idx_property_default_overrides_project ON property_default_overrides(project_id, dimension_type);

CREATE TABLE IF NOT EXISTS property_default_catalog (
  id TEXT PRIMARY KEY,
  dimension_type TEXT NOT NULL,
  target_level TEXT NOT NULL CHECK (target_level IN ('dimension', 'member', 'relationship')),
  property_name TEXT NOT NULL,
  xml_name TEXT NOT NULL,
  default_value TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  UNIQUE(dimension_type, target_level, property_name)
);

CREATE INDEX IF NOT EXISTS idx_property_default_catalog_type ON property_default_catalog(dimension_type, target_level);
`;
