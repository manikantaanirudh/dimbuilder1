# Enterprise Platform v2 — Complete Feature Specification

**Document Version:** 1.0
**Date:** 2026-05-23
**Author:** Spaulding Ridge Engineering
**Branch:** feature/v2-platform
**Status:** Draft — Pending Review

---

## Executive Summary

This specification defines 24 features across 4 tiers that transform SR OneStream Dim Builder from a local metadata workbench into a full enterprise platform for OneStream dimension lifecycle management. The features are designed to serve both implementation consultants and client admin teams, with a flexible deployment model (local → shared → cloud).

---

## Table of Contents

- [Tier 1: Enterprise Foundation](#tier-1-enterprise-foundation)
  - [Feature 1: Multi-User Authentication & RBAC](#feature-1-multi-user-authentication--rbac)
  - [Feature 2: Approval Workflow Engine](#feature-2-approval-workflow-engine)
  - [Feature 3: OneStream Direct Integration](#feature-3-onestream-direct-integration)
  - [Feature 4: ERP Source System Connectors](#feature-4-erp-source-system-connectors)
  - [Feature 5: Impact Analysis Engine](#feature-5-impact-analysis-engine)
  - [Feature 6: Multi-Environment Management](#feature-6-multi-environment-management)
- [Tier 2: Competitive Differentiators](#tier-2-competitive-differentiators)
  - [Feature 7: AI-Powered Metadata Intelligence](#feature-7-ai-powered-metadata-intelligence)
  - [Feature 8: Cross-Dimension Relationship Mapping](#feature-8-cross-dimension-relationship-mapping)
  - [Feature 9: Template Library & Reusable Patterns](#feature-9-template-library--reusable-patterns)
  - [Feature 10: Advanced Reporting & Analytics](#feature-10-advanced-reporting--analytics)
  - [Feature 11: Version Control & Git Integration](#feature-11-version-control--git-integration)
  - [Feature 12: Extensible Dimensionality Modeler](#feature-12-extensible-dimensionality-modeler)
- [Tier 3: Power Features](#tier-3-power-features)
  - [Feature 13: Excel Add-In](#feature-13-excel-add-in)
  - [Feature 14: Conflict Resolution & Merge](#feature-14-conflict-resolution--merge)
  - [Feature 15: Scheduled Jobs & Automation](#feature-15-scheduled-jobs--automation)
  - [Feature 16: Data Quality Scoring](#feature-16-data-quality-scoring)
  - [Feature 17: Migration Assistant](#feature-17-migration-assistant)
  - [Feature 18: API & Extensibility Platform](#feature-18-api--extensibility-platform)
  - [Feature 19: Offline Mode & Local-First Sync](#feature-19-offline-mode--local-first-sync)
  - [Feature 20: Documentation Auto-Generation](#feature-20-documentation-auto-generation)
- [Tier 4: Platform & Scale](#tier-4-platform--scale)
  - [Feature 21: Multi-Tenant Architecture](#feature-21-multi-tenant-architecture)
  - [Feature 22: Real-Time Collaboration](#feature-22-real-time-collaboration)
  - [Feature 23: Audit & Compliance Module](#feature-23-audit--compliance-module)
  - [Feature 24: Performance & Scale](#feature-24-performance--scale)

---

## Tier 1: Enterprise Foundation

---

### Feature 1: Multi-User Authentication & RBAC

#### Purpose & Business Value

Enterprise customers require identity management and access control before adopting any tool that touches financial metadata. Without real authentication, the tool cannot be deployed on shared infrastructure or pass security audits. This is the single highest-priority blocker for enterprise adoption.

#### User Stories

1. As an admin, I want to configure SSO so users log in with their corporate credentials.
2. As an admin, I want to assign roles (Admin, Author, Reviewer, Viewer) to control what actions users can perform.
3. As a project owner, I want to restrict who can edit my project's dimensions.
4. As an auditor, I want every action attributed to a real user identity (not "local-admin").
5. As a user, I want my session to persist across browser refreshes without re-authenticating.

#### Technical Architecture

```
┌─────────────────────────────────────────────────┐
│ Client (React)                                  │
│  ├── AuthProvider (context)                     │
│  ├── LoginPage (local auth fallback)            │
│  ├── ProtectedRoute (role-gated)                │
│  └── UserMenu (profile, logout)                 │
├─────────────────────────────────────────────────┤
│ Server (Express)                                │
│  ├── middleware/auth.ts (strategy dispatcher)   │
│  ├── auth/local.ts (username/password + bcrypt) │
│  ├── auth/oidc.ts (OpenID Connect / OAuth 2.0) │
│  ├── auth/saml.ts (SAML 2.0 via passport-saml) │
│  ├── auth/session.ts (JWT access + refresh)     │
│  └── middleware/authorize.ts (RBAC enforcer)    │
├─────────────────────────────────────────────────┤
│ Database                                        │
│  ├── users (id, email, name, auth_provider)     │
│  ├── roles (id, name, permissions[])            │
│  ├── user_roles (user_id, role_id)              │
│  ├── project_permissions (project_id, user_id,  │
│  │    role_id)                                  │
│  └── sessions (id, user_id, token, expires_at)  │
└─────────────────────────────────────────────────┘
```

#### Data Model Changes

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT,          -- NULL for SSO-only users
  auth_provider TEXT NOT NULL DEFAULT 'local', -- 'local' | 'oidc' | 'saml'
  auth_provider_id TEXT,       -- external IdP subject ID
  avatar_url TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE roles (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,   -- 'admin' | 'author' | 'reviewer' | 'viewer'
  description TEXT,
  permissions TEXT NOT NULL,    -- JSON array of permission strings
  is_system INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE user_roles (
  user_id TEXT NOT NULL REFERENCES users(id),
  role_id TEXT NOT NULL REFERENCES roles(id),
  assigned_by TEXT REFERENCES users(id),
  assigned_at TEXT NOT NULL,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE project_permissions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL,           -- 'owner' | 'editor' | 'reviewer' | 'viewer'
  granted_by TEXT REFERENCES users(id),
  granted_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

#### Permission Matrix

| Action | Admin | Author | Reviewer | Viewer |
|--------|-------|--------|----------|--------|
| Create project | Yes | Yes | No | No |
| Edit members/relationships | Yes | Yes (own projects) | No | No |
| Run validation | Yes | Yes | Yes | Yes |
| Approve change sets | Yes | No | Yes | No |
| Export XML | Yes | Yes | Yes | No |
| Manage users/roles | Yes | No | No | No |
| View projects | Yes | Yes | Yes | Yes |
| Delete project | Yes | Yes (own) | No | No |
| Configure validation rules | Yes | No | No | No |
| Deploy to OneStream | Yes | Yes (with approval) | No | No |

#### API Contracts

```
POST   /api/auth/login          { email, password } → { accessToken, refreshToken, user }
POST   /api/auth/refresh        { refreshToken } → { accessToken }
POST   /api/auth/logout         {} → 204
GET    /api/auth/me             → { user, roles, permissions }
GET    /api/auth/oidc/callback  (OAuth redirect handler)
POST   /api/auth/saml/callback  (SAML assertion handler)

GET    /api/users               → User[]
POST   /api/users               { email, name, role } → User
PATCH  /api/users/:id           { name?, role?, is_active? } → User
DELETE /api/users/:id           → 204

GET    /api/projects/:id/permissions → ProjectPermission[]
POST   /api/projects/:id/permissions { user_id, role } → ProjectPermission
DELETE /api/projects/:id/permissions/:permId → 204
```

#### Configuration

```yaml
auth:
  enabled: true
  strategy: 'local'            # 'local' | 'oidc' | 'saml'
  jwt:
    secret: '${JWT_SECRET}'
    accessTokenExpiry: '15m'
    refreshTokenExpiry: '7d'
  oidc:
    issuerUrl: 'https://login.microsoftonline.com/{tenant}/v2.0'
    clientId: '${OIDC_CLIENT_ID}'
    clientSecret: '${OIDC_CLIENT_SECRET}'
    callbackUrl: '/api/auth/oidc/callback'
    scopes: ['openid', 'profile', 'email']
  saml:
    entryPoint: 'https://idp.example.com/sso/saml'
    issuer: 'sr-dimbuilder'
    cert: '${SAML_CERT}'
    callbackUrl: '/api/auth/saml/callback'
  defaultRole: 'viewer'
  allowSelfRegistration: false
```

#### Edge Cases & Validation

- Token expiry during active editing: client intercepts 401, attempts refresh, shows login modal if refresh fails
- SSO user first login: auto-create user record with default role
- Admin cannot remove their own admin role (prevents lockout)
- Project owner cannot be removed from project permissions
- Rate limit login attempts (5 per minute per IP)
- Password requirements: min 12 chars, 1 upper, 1 lower, 1 number, 1 special

#### Testing Strategy

- Unit tests: JWT generation/validation, password hashing, permission checks
- Integration tests: full login flow, token refresh, role-gated endpoint access
- E2E tests: SSO callback simulation, session persistence across refresh
- Security tests: SQL injection in email, XSS in display name, token reuse after logout

#### Acceptance Criteria

- [ ] Users can log in with email/password (local strategy)
- [ ] Users can log in via OIDC (Azure AD tested)
- [ ] JWT access tokens expire and refresh tokens work
- [ ] Role-based access control enforces permission matrix
- [ ] Project-level permissions restrict editing access
- [ ] All audit log entries show real user identity
- [ ] Admin panel shows user management UI
- [ ] Existing API endpoints return 401 without valid token
- [ ] Backward-compatible: auth.enabled=false preserves current behavior

---

### Feature 2: Approval Workflow Engine

#### Purpose & Business Value

Financial metadata changes in OneStream directly affect consolidation results, regulatory reporting, and data integrity. Changes must be governed with audit-trailed approval workflows. This replaces OneStream ACM's approval routing with a more flexible, user-friendly system.

#### User Stories

1. As a dimension author, I want to submit my changes for review before they can be deployed.
2. As a reviewer, I want to see exactly what changed and approve or reject with comments.
3. As an admin, I want to configure multi-step approval chains (e.g., Finance → IT → Deploy).
4. As a reviewer, I want email/notification when a change set needs my attention.
5. As a manager, I want to delegate my approval authority when I'm unavailable.
6. As an auditor, I want a complete trail of who approved what and when.

#### Technical Architecture

```
┌──────────────────────────────────────────────────────┐
│ Workflow Definition (YAML)                           │
│  ├── Workflow templates (per dimension type)         │
│  ├── Steps: [Submit, Review, Approve, Deploy]        │
│  ├── Conditions: role requirements per step          │
│  └── Actions: notifications, auto-advance rules     │
├──────────────────────────────────────────────────────┤
│ Workflow Engine (src/server/workflow/)               │
│  ├── workflowEngine.ts (state machine)              │
│  ├── workflowDefinitions.ts (template parser)       │
│  ├── workflowActions.ts (notification dispatcher)   │
│  ├── workflowDelegation.ts (delegation logic)       │
│  └── workflowSLA.ts (deadline tracking)             │
├──────────────────────────────────────────────────────┤
│ Database                                            │
│  ├── workflow_definitions (templates)               │
│  ├── workflow_instances (active workflows)           │
│  ├── workflow_steps (step states)                   │
│  ├── workflow_actions (approval/rejection records)   │
│  ├── workflow_delegations (delegation mappings)      │
│  └── workflow_notifications (sent notifications)    │
└──────────────────────────────────────────────────────┘
```

#### Data Model Changes

```sql
CREATE TABLE workflow_definitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  dimension_types TEXT,        -- JSON array of applicable dimension types, or '*'
  steps TEXT NOT NULL,         -- JSON: [{name, required_role, min_approvals, sla_hours}]
  auto_advance_rules TEXT,     -- JSON: conditions for auto-approval
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE workflow_instances (
  id TEXT PRIMARY KEY,
  definition_id TEXT NOT NULL REFERENCES workflow_definitions(id),
  change_set_id TEXT NOT NULL REFERENCES change_sets(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  current_step_index INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'in_progress', -- 'in_progress'|'approved'|'rejected'|'cancelled'
  submitted_by TEXT NOT NULL REFERENCES users(id),
  submitted_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE workflow_step_actions (
  id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL REFERENCES workflow_instances(id),
  step_index INTEGER NOT NULL,
  action TEXT NOT NULL,         -- 'approve' | 'reject' | 'comment' | 'delegate' | 'escalate'
  actor_id TEXT NOT NULL REFERENCES users(id),
  comment TEXT,
  delegated_to TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE workflow_delegations (
  id TEXT PRIMARY KEY,
  delegator_id TEXT NOT NULL REFERENCES users(id),
  delegate_id TEXT NOT NULL REFERENCES users(id),
  workflow_definition_id TEXT REFERENCES workflow_definitions(id), -- NULL = all workflows
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE workflow_notifications (
  id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL REFERENCES workflow_instances(id),
  recipient_id TEXT NOT NULL REFERENCES users(id),
  channel TEXT NOT NULL,        -- 'email' | 'in_app' | 'teams' | 'slack'
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  sent_at TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL
);
```

#### Workflow State Machine

```
[Draft] → Submit → [Pending Review]
                         │
            ┌────────────┼────────────┐
            ▼            ▼            ▼
       [Approved]   [Rejected]   [Escalated]
            │            │            │
            ▼            │            ▼
    [Ready to Deploy]    │     [Pending Senior Review]
            │            │            │
            ▼            │            ▼
       [Deployed]        │      [Approved/Rejected]
                         │
                    [Revised & Resubmitted]
```

#### API Contracts

```
GET    /api/workflows/definitions                → WorkflowDefinition[]
POST   /api/workflows/definitions                { name, steps[], ... } → WorkflowDefinition
PATCH  /api/workflows/definitions/:id            { ... } → WorkflowDefinition

POST   /api/workflows/submit                     { changeSetId, definitionId? } → WorkflowInstance
GET    /api/workflows/instances                  ?status=&projectId= → WorkflowInstance[]
GET    /api/workflows/instances/:id              → WorkflowInstanceDetail
POST   /api/workflows/instances/:id/approve      { comment? } → WorkflowInstance
POST   /api/workflows/instances/:id/reject       { comment } → WorkflowInstance
POST   /api/workflows/instances/:id/delegate     { delegateId } → WorkflowInstance
POST   /api/workflows/instances/:id/cancel       → WorkflowInstance

GET    /api/workflows/my-pending                 → WorkflowInstance[] (items awaiting current user)
GET    /api/workflows/delegations                → WorkflowDelegation[]
POST   /api/workflows/delegations                { delegateId, startsAt, endsAt } → WorkflowDelegation
DELETE /api/workflows/delegations/:id            → 204

GET    /api/notifications                        ?unread= → Notification[]
PATCH  /api/notifications/:id/read               → 204
```

#### Configuration

```yaml
workflows:
  enabled: true
  requireApprovalForDeploy: true
  defaultDefinition: 'standard-review'
  sla:
    defaultHours: 48
    escalationAfterHours: 72
  notifications:
    email:
      enabled: true
      smtpHost: '${SMTP_HOST}'
      smtpPort: 587
      fromAddress: 'dimbuilder@spauldinridge.com'
    teams:
      enabled: false
      webhookUrl: '${TEAMS_WEBHOOK_URL}'
    slack:
      enabled: false
      webhookUrl: '${SLACK_WEBHOOK_URL}'
  autoApprove:
    lowRiskChanges: true        # Auto-approve if change set has only property updates
    maxAutoApproveMembers: 5    # Only auto-approve if fewer than N members affected
```

#### Edge Cases & Validation

- Reviewer cannot approve their own submission
- If all designated reviewers are unavailable and SLA expires, escalate to admin
- Delegation chains: delegated reviewer's approval counts as original reviewer's
- Change set modified after submission: invalidate workflow, require re-submission
- Concurrent approvals: handle race condition where two reviewers approve simultaneously
- Workflow cancelled mid-flight: notify all participants
- Rejected workflow: author must revise and re-submit (new workflow instance)

#### Testing Strategy

- Unit tests: state machine transitions, permission checks, SLA calculation
- Integration tests: full submit → approve → deploy flow, rejection and resubmission
- Edge case tests: self-approval prevention, delegation chains, concurrent approval race
- Notification tests: email template rendering, webhook payload format

#### Acceptance Criteria

- [ ] Admins can define multi-step approval workflows via UI
- [ ] Authors submit change sets into a workflow
- [ ] Reviewers see pending items on their dashboard
- [ ] Approve/reject actions advance the workflow with comments
- [ ] Delegation allows temporary authority transfer
- [ ] SLA tracking shows overdue items
- [ ] Notifications sent via configured channels
- [ ] Complete audit trail of all workflow actions
- [ ] Auto-approval works for low-risk changes when configured
- [ ] Workflow state survives server restart

---

### Feature 3: OneStream Direct Integration

#### Purpose & Business Value

Currently the tool is disconnected from OneStream — users must manually export XML and import it into OneStream. Direct integration eliminates this manual step, enables "compare with live" workflows, and provides one-click deployment from approved change sets.

#### User Stories

1. As a consultant, I want to pull current dimension metadata from a OneStream environment into a project.
2. As an admin, I want to compare my local project against the live OneStream state.
3. As an admin, I want to deploy approved changes directly to OneStream without manual XML upload.
4. As an admin, I want to see deployment history and roll back if needed.
5. As a consultant, I want to connect to multiple OneStream environments (Dev, UAT, Prod).

#### Technical Architecture

```
┌──────────────────────────────────────────────────────┐
│ OneStream Connector (src/server/connectors/onestream/)│
│  ├── client.ts (REST API wrapper)                    │
│  ├── auth.ts (OAuth token management)                │
│  ├── pull.ts (metadata extraction)                   │
│  ├── push.ts (metadata deployment)                   │
│  ├── compare.ts (live vs local diff)                 │
│  └── rollback.ts (deployment reversal)               │
├──────────────────────────────────────────────────────┤
│ Environment Registry                                 │
│  ├── environments table (connection profiles)        │
│  ├── encrypted credentials (vault or env vars)       │
│  └── deployment_history table                        │
├──────────────────────────────────────────────────────┤
│ OneStream XF REST API                                │
│  ├── /api/metadata/dimensions (GET dimensions)       │
│  ├── /api/metadata/members (GET/POST members)        │
│  ├── /api/metadata/load (POST XML payload)           │
│  └── /api/auth/token (OAuth2 client credentials)     │
└──────────────────────────────────────────────────────┘
```

#### Data Model Changes

```sql
CREATE TABLE environments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,            -- 'Development', 'UAT', 'Production'
  label TEXT NOT NULL,           -- Display label
  base_url TEXT NOT NULL,        -- 'https://customer.onestream.com'
  auth_type TEXT NOT NULL,       -- 'oauth2' | 'basic' | 'windows'
  credentials TEXT NOT NULL,     -- Encrypted JSON: {clientId, clientSecret} or {username, password}
  onestream_version TEXT,
  application_name TEXT,         -- OneStream application name
  is_active INTEGER NOT NULL DEFAULT 1,
  last_connected_at TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE deployment_history (
  id TEXT PRIMARY KEY,
  environment_id TEXT NOT NULL REFERENCES environments(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  change_set_id TEXT REFERENCES change_sets(id),
  workflow_instance_id TEXT REFERENCES workflow_instances(id),
  deployment_type TEXT NOT NULL,  -- 'full' | 'incremental' | 'rollback'
  status TEXT NOT NULL,           -- 'pending' | 'in_progress' | 'success' | 'failed' | 'rolled_back'
  dimensions_deployed TEXT,       -- JSON array of dimension types deployed
  xml_payload_hash TEXT,          -- SHA-256 of deployed XML for verification
  pre_deployment_snapshot_id TEXT REFERENCES project_snapshots(id),
  error_message TEXT,
  deployed_by TEXT NOT NULL REFERENCES users(id),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE deployment_dimension_results (
  id TEXT PRIMARY KEY,
  deployment_id TEXT NOT NULL REFERENCES deployment_history(id),
  dimension_type TEXT NOT NULL,
  dimension_name TEXT NOT NULL,
  status TEXT NOT NULL,           -- 'success' | 'failed' | 'skipped'
  members_added INTEGER DEFAULT 0,
  members_updated INTEGER DEFAULT 0,
  relationships_added INTEGER DEFAULT 0,
  relationships_updated INTEGER DEFAULT 0,
  error_message TEXT,
  duration_ms INTEGER,
  created_at TEXT NOT NULL
);
```

#### API Contracts

```
-- Environment Management
GET    /api/environments                       → Environment[] (credentials redacted)
POST   /api/environments                       { name, baseUrl, authType, credentials } → Environment
PATCH  /api/environments/:id                   { ... } → Environment
DELETE /api/environments/:id                   → 204
POST   /api/environments/:id/test-connection   → { success, version, applicationName }

-- Pull from OneStream
POST   /api/environments/:id/pull              { dimensionTypes?, projectId? } → PullResult
GET    /api/environments/:id/dimensions        → RemoteDimensionSummary[]

-- Compare
POST   /api/environments/:id/compare           { projectId } → CompareResult (uses existing diff engine)

-- Deploy
POST   /api/environments/:id/deploy            { projectId, changeSetId?, dimensionTypes? } → DeploymentRecord
GET    /api/deployments                        ?projectId=&environmentId= → DeploymentRecord[]
GET    /api/deployments/:id                    → DeploymentDetailRecord
POST   /api/deployments/:id/rollback           → DeploymentRecord (creates reversal deployment)
```

#### Edge Cases & Validation

- Connection timeout: retry with exponential backoff (3 attempts)
- OneStream API rate limiting: respect 429 responses, queue requests
- Partial deployment failure: report per-dimension success/failure, do not auto-rollback
- Credential rotation: environments support credential update without losing history
- Version mismatch: warn if OneStream version differs from configured fallback
- Large dimension deployment: stream XML in chunks if > 10MB
- Concurrent deployments to same environment: queue and serialize

#### Testing Strategy

- Unit tests: API client request/response serialization, error handling
- Integration tests: mock OneStream API, full pull/compare/deploy cycle
- Connection test: actual OneStream sandbox (if available, otherwise mock)
- Rollback tests: deploy, verify, rollback, verify restoration

#### Acceptance Criteria

- [ ] Admins can register OneStream environments with credentials
- [ ] Connection test validates connectivity and returns version info
- [ ] Pull extracts dimension metadata into a local project
- [ ] Compare shows diff between local project and live OneStream state
- [ ] Deploy pushes approved XML to OneStream environment
- [ ] Deployment history shows all past deployments with status
- [ ] Rollback restores previous state (deploys pre-deployment snapshot)
- [ ] Per-dimension deployment results show granular success/failure
- [ ] Credentials encrypted at rest

---

### Feature 4: ERP Source System Connectors

#### Purpose & Business Value

The #1 community request for OneStream metadata automation is sync from ERP systems. Organizations maintain master data in SAP, Oracle, or Workday and need automatic propagation to OneStream dimensions. This eliminates manual dual-maintenance and reduces reconciliation errors.

#### User Stories

1. As an admin, I want to connect to SAP and pull Cost Centers, GL Accounts, and Company Codes.
2. As an admin, I want to define mapping rules that transform ERP members into OneStream format.
3. As an admin, I want to schedule automatic sync from ERP on a regular cadence.
4. As an admin, I want to see what changed in the ERP since last sync (delta detection).
5. As an admin, I want to review and approve ERP-sourced changes before they reach OneStream.
6. As an admin, I want to designate which system is "source of truth" for each member.

#### Technical Architecture

```
┌──────────────────────────────────────────────────────┐
│ Connector Framework (src/server/connectors/)         │
│  ├── ConnectorInterface.ts (abstract connector)      │
│  ├── sap/                                            │
│  │   ├── sapClient.ts (RFC/BAPI calls via node-rfc) │
│  │   ├── sapCostCenters.ts                           │
│  │   ├── sapGLAccounts.ts                            │
│  │   ├── sapCompanyCodes.ts                          │
│  │   └── sapProfitCenters.ts                         │
│  ├── oracle/                                         │
│  │   ├── oracleClient.ts (JDBC/REST)                 │
│  │   ├── oracleSegments.ts                           │
│  │   └── oracleHierarchySets.ts                      │
│  ├── sql/                                            │
│  │   ├── genericSqlClient.ts (ODBC/JDBC)             │
│  │   └── queryTemplates.ts                           │
│  └── csv/                                            │
│      └── csvFileConnector.ts (watch folder)          │
├──────────────────────────────────────────────────────┤
│ Mapping Engine (src/shared/mappingEngine.ts)         │
│  ├── Field mapping rules (source → target)           │
│  ├── Value transformations (trim, prefix, lookup)    │
│  ├── Hierarchy construction rules                    │
│  └── Conflict resolution logic                       │
├──────────────────────────────────────────────────────┤
│ Sync Scheduler (src/server/scheduler/)              │
│  ├── syncJobs table                                  │
│  ├── syncRuns table (execution history)              │
│  └── deltaDetection.ts (compare snapshots)           │
└──────────────────────────────────────────────────────┘
```

#### Data Model Changes

```sql
CREATE TABLE connector_definitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  connector_type TEXT NOT NULL,  -- 'sap' | 'oracle' | 'sql' | 'csv' | 'rest'
  connection_config TEXT NOT NULL, -- Encrypted JSON: host, port, credentials, etc.
  extraction_config TEXT NOT NULL, -- JSON: what to extract (tables, BAPIs, queries)
  is_active INTEGER NOT NULL DEFAULT 1,
  last_tested_at TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE mapping_rules (
  id TEXT PRIMARY KEY,
  connector_id TEXT NOT NULL REFERENCES connector_definitions(id),
  name TEXT NOT NULL,
  source_entity TEXT NOT NULL,    -- 'SAP_COST_CENTER' | 'SAP_GL_ACCOUNT' etc.
  target_dimension_type TEXT NOT NULL,
  field_mappings TEXT NOT NULL,   -- JSON: [{source, target, transform}]
  hierarchy_rules TEXT,           -- JSON: how to build parent-child from flat data
  filter_rules TEXT,              -- JSON: which source records to include/exclude
  conflict_resolution TEXT NOT NULL DEFAULT 'source_wins',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sync_jobs (
  id TEXT PRIMARY KEY,
  connector_id TEXT NOT NULL REFERENCES connector_definitions(id),
  mapping_rule_id TEXT NOT NULL REFERENCES mapping_rules(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  schedule_cron TEXT,            -- NULL = manual only
  auto_approve INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  next_run_at TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sync_runs (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES sync_jobs(id),
  status TEXT NOT NULL,          -- 'running' | 'success' | 'failed' | 'partial'
  source_records_read INTEGER DEFAULT 0,
  members_created INTEGER DEFAULT 0,
  members_updated INTEGER DEFAULT 0,
  members_deleted INTEGER DEFAULT 0,
  relationships_created INTEGER DEFAULT 0,
  relationships_updated INTEGER DEFAULT 0,
  conflicts_detected INTEGER DEFAULT 0,
  conflicts_resolved INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE member_source_registry (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  dimension_type TEXT NOT NULL,
  member_key TEXT NOT NULL,
  source_system TEXT NOT NULL,   -- 'sap' | 'oracle' | 'manual' | 'onestream'
  source_id TEXT,                -- External system ID
  last_synced_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, dimension_type, member_key)
);
```

#### Mapping Rule Examples

```yaml
# SAP Cost Center → OneStream UD3
mapping:
  source: SAP_COST_CENTER
  target: UD3
  fields:
    - source: KOSTL          # Cost Center number
      target: memberKey
      transform: 'prefix("CC_")'
    - source: KTEXT          # Description
      target: description
    - source: KOSAR          # Cost Center category
      target: properties.Category
  hierarchy:
    parentField: KHINR       # Higher-level cost center
    parentTransform: 'prefix("CC_")'
    rootParent: 'Root'
  filters:
    - field: BUKRS
      operator: 'in'
      values: ['1000', '2000', '3000']
```

#### API Contracts

```
-- Connector Management
GET    /api/connectors                         → ConnectorDefinition[]
POST   /api/connectors                         { type, name, config } → ConnectorDefinition
PATCH  /api/connectors/:id                     { ... } → ConnectorDefinition
DELETE /api/connectors/:id                     → 204
POST   /api/connectors/:id/test                → { success, recordCount, sampleData[] }
POST   /api/connectors/:id/preview             { mappingRuleId } → PreviewResult

-- Mapping Rules
GET    /api/connectors/:id/mappings            → MappingRule[]
POST   /api/connectors/:id/mappings            { ... } → MappingRule
PATCH  /api/mappings/:id                       { ... } → MappingRule
DELETE /api/mappings/:id                       → 204

-- Sync Jobs
GET    /api/sync-jobs                          → SyncJob[]
POST   /api/sync-jobs                          { connectorId, mappingId, projectId, cron? } → SyncJob
POST   /api/sync-jobs/:id/run                  → SyncRun
GET    /api/sync-jobs/:id/runs                 → SyncRun[]
GET    /api/sync-runs/:id                      → SyncRunDetail

-- Source Registry
GET    /api/projects/:id/source-registry       ?dimensionType= → MemberSourceRecord[]
PATCH  /api/source-registry/:id                { sourceSystem } → MemberSourceRecord
```

#### Edge Cases & Validation

- SAP connection failure mid-sync: mark run as partial, preserve successfully synced records
- Mapping produces duplicate member keys: configurable resolution (skip, rename, merge)
- Source member deleted in ERP: configurable action (delete in project, mark inactive, warn only)
- Encoding mismatches: normalize Unicode from ERP sources
- Large extract (100K+ records): stream processing with progress reporting
- Circular hierarchy from ERP flat data: detect and report before import

#### Testing Strategy

- Unit tests: mapping transforms, hierarchy builder, conflict resolution
- Integration tests: mock SAP/Oracle responses, full sync pipeline
- Delta detection tests: identify adds/updates/deletes between sync runs
- Performance tests: 50K member sync should complete in < 60 seconds

#### Acceptance Criteria

- [ ] SAP connector extracts Cost Centers, GL Accounts, Company Codes
- [ ] Oracle connector extracts segments and hierarchy sets
- [ ] Generic SQL connector runs custom queries against ODBC sources
- [ ] Mapping rules transform source data into OneStream member format
- [ ] Delta detection identifies changes since last sync
- [ ] Sync runs create members/relationships in the target project
- [ ] Source registry tracks which system owns each member
- [ ] Conflict resolution handles duplicates per configuration
- [ ] Scheduled sync runs on cron cadence
- [ ] Sync history shows all past runs with statistics

---

### Feature 5: Impact Analysis Engine

#### Purpose & Business Value

OneStream's biggest pain point: "What breaks if I move/delete this member?" The platform offers no native impact preview. This feature provides pre-change impact analysis across data, security, workflows, business rules, and downstream systems.

#### User Stories

1. As a dimension author, I want to see what data exists for a member before I delete it.
2. As an admin, I want to know which reports and business rules reference a member I'm moving.
3. As a reviewer, I want to see the consolidation impact of a hierarchy restructure.
4. As a security admin, I want to know if moving an entity changes who can access it.
5. As a consultant, I want to simulate a restructure and preview all downstream effects.

#### Technical Architecture

```
┌──────────────────────────────────────────────────────┐
│ Impact Analysis Engine (src/shared/impactAnalysis/)  │
│  ├── dataImpact.ts (check for data existence)        │
│  ├── hierarchyImpact.ts (consolidation path changes) │
│  ├── securityImpact.ts (access group membership)     │
│  ├── crossDimensionImpact.ts (references in other    │
│  │    dimensions)                                    │
│  ├── workflowImpact.ts (workflow boundary changes)   │
│  ├── ruleImpact.ts (business rule member refs)       │
│  └── impactReport.ts (aggregates all analyzers)      │
├──────────────────────────────────────────────────────┤
│ Impact Data Sources                                  │
│  ├── Local project data (immediate analysis)         │
│  ├── OneStream environment (live data query)         │
│  └── Rule/report registry (if connected)             │
└──────────────────────────────────────────────────────┘
```

#### Data Model Changes

```sql
CREATE TABLE impact_analyses (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  change_set_id TEXT REFERENCES change_sets(id),
  analysis_type TEXT NOT NULL,   -- 'delete' | 'move' | 'restructure' | 'whatIf'
  scope TEXT NOT NULL,           -- JSON: {dimensionType, memberKeys[], action}
  environment_id TEXT REFERENCES environments(id), -- NULL = local only
  results TEXT NOT NULL,         -- JSON: full impact report
  severity TEXT NOT NULL,        -- 'high' | 'medium' | 'low' | 'none'
  summary TEXT NOT NULL,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);
```

#### Impact Report Schema

```typescript
interface ImpactReport {
  severity: 'high' | 'medium' | 'low' | 'none';
  summary: string;
  dataImpact: {
    hasData: boolean;
    cellCount: number;          // Approximate cells affected
    cubeTypes: string[];        // Which cubes have data
    scenarioTypes: string[];    // Which scenarios affected
    timePeriods: string[];      // Date range of affected data
  };
  hierarchyImpact: {
    consolidationPathsChanged: number;
    orphanedMembers: string[];
    newParentPaths: { member: string; oldPath: string; newPath: string }[];
  };
  securityImpact: {
    accessGroupChanges: { member: string; oldGroup: string; newGroup: string }[];
    usersAffected: number;
  };
  crossDimensionImpact: {
    referencesInOtherDimensions: { dimension: string; members: string[] }[];
  };
  workflowImpact: {
    boundaryChanges: { entity: string; oldWorkflow: string; newWorkflow: string }[];
  };
  recommendations: string[];
}
```

#### API Contracts

```
POST   /api/projects/:id/impact-analysis       { type, scope, environmentId? } → ImpactReport
GET    /api/projects/:id/impact-analyses        → ImpactAnalysis[]
GET    /api/impact-analyses/:id                → ImpactAnalysisDetail

POST   /api/projects/:id/what-if               { changes[] } → WhatIfResult
```

#### Testing Strategy

- Unit tests: each impact analyzer independently
- Integration tests: full impact report generation for move/delete scenarios
- Mock tests: simulated OneStream data responses for data impact
- Edge case tests: members with no data, members with circular shared-member references

#### Acceptance Criteria

- [ ] Delete impact shows data existence, cell count, affected periods
- [ ] Move impact shows consolidation path changes
- [ ] Hierarchy restructure shows cascading effects
- [ ] Cross-dimension references identified
- [ ] Security impact shows access group changes
- [ ] "What if" simulation runs without modifying actual data
- [ ] Impact severity rating (high/medium/low/none) computed automatically
- [ ] Recommendations generated for high-severity impacts
- [ ] Works in local-only mode (without OneStream connection) for hierarchy/cross-dim analysis

---

### Feature 6: Multi-Environment Management

#### Purpose & Business Value

OneStream implementations always span multiple environments (Development, UAT, Production). Consultants need to track what's deployed where, promote changes between environments, and compare state across instances.

#### User Stories

1. As a consultant, I want to see the deployment status of each dimension across all environments.
2. As an admin, I want to promote changes from Dev to UAT to Prod with gates between each.
3. As an admin, I want to compare dimension state across two environments.
4. As an admin, I want environment-specific property overrides (e.g., security groups differ per env).
5. As a consultant, I want a single dashboard showing all environments and their sync status.

#### Technical Architecture

```
┌──────────────────────────────────────────────────────┐
│ Environment Manager (src/server/environments/)       │
│  ├── environmentRegistry.ts (CRUD + connection pool) │
│  ├── promotionPipeline.ts (Dev→UAT→Prod workflow)    │
│  ├── crossEnvCompare.ts (diff two environments)      │
│  ├── envOverrides.ts (per-env property overrides)    │
│  └── syncStatus.ts (tracks what's deployed where)    │
├──────────────────────────────────────────────────────┤
│ UI                                                   │
│  ├── EnvironmentDashboard.tsx (overview panel)       │
│  ├── PromotionWizard.tsx (guided promotion flow)     │
│  ├── CrossEnvDiff.tsx (side-by-side comparison)      │
│  └── EnvironmentSettings.tsx (connection config)     │
└──────────────────────────────────────────────────────┘
```

#### Data Model Changes

```sql
-- Extends the environments table from Feature 3

CREATE TABLE environment_promotion_pipelines (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  stages TEXT NOT NULL,          -- JSON: [{environmentId, requiresApproval, gateConditions}]
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE environment_sync_status (
  id TEXT PRIMARY KEY,
  environment_id TEXT NOT NULL REFERENCES environments(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  dimension_type TEXT NOT NULL,
  last_deployed_at TEXT,
  last_deployment_id TEXT REFERENCES deployment_history(id),
  local_version_hash TEXT,      -- Hash of current local state
  remote_version_hash TEXT,     -- Hash of last known remote state
  sync_status TEXT NOT NULL,    -- 'in_sync' | 'local_ahead' | 'remote_ahead' | 'diverged' | 'unknown'
  checked_at TEXT NOT NULL,
  UNIQUE(environment_id, project_id, dimension_type)
);

CREATE TABLE environment_overrides (
  id TEXT PRIMARY KEY,
  environment_id TEXT NOT NULL REFERENCES environments(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  dimension_type TEXT NOT NULL,
  member_key TEXT NOT NULL,
  property_name TEXT NOT NULL,
  override_value TEXT NOT NULL,
  reason TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

#### API Contracts

```
-- Promotion Pipeline
GET    /api/promotion-pipelines                → Pipeline[]
POST   /api/promotion-pipelines                { name, stages[] } → Pipeline
POST   /api/promotion-pipelines/:id/promote    { projectId, fromStage, toStage } → Promotion

-- Cross-Environment Compare
POST   /api/environments/compare               { envId1, envId2, projectId } → CrossEnvDiff

-- Sync Status
GET    /api/projects/:id/sync-status           → EnvironmentSyncStatus[]
POST   /api/projects/:id/sync-status/refresh   { environmentId } → EnvironmentSyncStatus[]

-- Environment Overrides
GET    /api/projects/:id/env-overrides         ?environmentId= → Override[]
POST   /api/projects/:id/env-overrides         { environmentId, dimensionType, memberKey, property, value } → Override
DELETE /api/env-overrides/:id                  → 204
```

#### Acceptance Criteria

- [ ] Dashboard shows all environments with connection status
- [ ] Sync status indicates in-sync/ahead/behind per dimension per environment
- [ ] Cross-environment diff uses existing diff engine on two remote states
- [ ] Promotion pipeline moves changes through stages with approval gates
- [ ] Environment overrides apply property differences per environment
- [ ] Promotion history shows what was promoted when and by whom
- [ ] Connection failures gracefully degrade (show "unknown" status)

---

## Tier 2: Competitive Differentiators

---

### Feature 7: AI-Powered Metadata Intelligence

#### Purpose & Business Value

OneStream SensibleAI focuses on forecasting and analysis — NOT metadata management. This is a wide-open market opportunity. AI-powered intelligence for dimension design, validation, and optimization creates a unique competitive moat.

#### User Stories

1. As a dimension author, I want AI to suggest the correct parent when I add a new member.
2. As a reviewer, I want AI to detect potential duplicates with fuzzy name matching.
3. As an admin, I want AI to identify members that break established naming patterns.
4. As a consultant, I want to ask questions in natural language (e.g., "Which entities are missing currency?").
5. As a consultant, I want AI to suggest hierarchy optimizations (e.g., "These 15 members under 'Other' could be grouped").

#### Technical Architecture

```
┌──────────────────────────────────────────────────────┐
│ AI Engine (src/server/ai/)                           │
│  ├── llmClient.ts (OpenAI/Anthropic/local adapter)   │
│  ├── embeddings.ts (member name/description vectors) │
│  ├── suggestions/                                    │
│  │   ├── parentSuggestion.ts                         │
│  │   ├── duplicateDetection.ts (fuzzy matching)      │
│  │   ├── namingAnomaly.ts (pattern deviation)        │
│  │   ├── hierarchyOptimization.ts                    │
│  │   └── propertySuggestion.ts (auto-categorize)     │
│  ├── naturalLanguage/                                │
│  │   ├── queryParser.ts (NL → filter/action)         │
│  │   └── responseGenerator.ts                        │
│  └── impactPrediction/                               │
│      └── riskScoring.ts (ML-based change risk)       │
├──────────────────────────────────────────────────────┤
│ Vector Store (SQLite FTS5 or external)               │
│  └── member_embeddings table                         │
└──────────────────────────────────────────────────────┘
```

#### Data Model Changes

```sql
CREATE TABLE ai_suggestions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  dimension_id TEXT,
  suggestion_type TEXT NOT NULL,  -- 'parent' | 'duplicate' | 'naming' | 'hierarchy' | 'property'
  target_member_key TEXT,
  suggestion TEXT NOT NULL,       -- JSON: the specific suggestion
  confidence REAL NOT NULL,       -- 0.0 to 1.0
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'accepted' | 'dismissed'
  acted_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE ai_conversations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  messages TEXT NOT NULL,         -- JSON: [{role, content, timestamp}]
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE member_fts USING fts5(
  project_id, dimension_type, member_key, description, properties
);
```

#### API Contracts

```
-- Suggestions
GET    /api/projects/:id/ai/suggestions        ?type=&status= → AISuggestion[]
POST   /api/projects/:id/ai/analyze            { scope? } → AISuggestion[] (trigger analysis)
PATCH  /api/ai/suggestions/:id                 { status } → AISuggestion
POST   /api/projects/:id/ai/suggest-parent     { memberKey, dimensionType } → ParentSuggestion[]

-- Natural Language
POST   /api/projects/:id/ai/query              { question } → NLQueryResult
POST   /api/projects/:id/ai/chat               { message, conversationId? } → ChatResponse

-- Duplicate Detection
POST   /api/projects/:id/ai/duplicates         { threshold? } → DuplicateGroup[]

-- Configuration
GET    /api/ai/config                          → AIConfig
PATCH  /api/ai/config                          { provider, model, ... } → AIConfig
```

#### Configuration

```yaml
ai:
  enabled: true
  provider: 'openai'           # 'openai' | 'anthropic' | 'azure' | 'local'
  model: 'gpt-4o'
  apiKey: '${AI_API_KEY}'
  features:
    parentSuggestions: true
    duplicateDetection: true
    namingAnomalies: true
    hierarchyOptimization: true
    propertySuggestions: true
    naturalLanguageQuery: true
  duplicateDetection:
    similarityThreshold: 0.85
    methods: ['levenshtein', 'soundex', 'embedding']
  suggestions:
    maxPerAnalysis: 50
    autoRunOnImport: true
```

#### Acceptance Criteria

- [ ] Parent suggestion returns top-3 candidates with confidence scores
- [ ] Duplicate detection finds fuzzy matches across member names
- [ ] Naming anomaly detection flags members that break established patterns
- [ ] Natural language queries return filtered member lists
- [ ] Hierarchy optimization suggests grouping sparse leaf nodes
- [ ] Property suggestion auto-categorizes Account Type based on name
- [ ] Suggestions can be accepted or dismissed with tracking
- [ ] AI features gracefully degrade when API key not configured
- [ ] Response times < 5 seconds for single-member suggestions

---

### Feature 8: Cross-Dimension Relationship Mapping

#### Purpose & Business Value

OneStream has 18 dimensions but no native tool to visualize how they relate to each other. Organizations need to understand dependencies between entities, accounts, and UD dimensions for proper governance.

#### User Stories

1. As a consultant, I want to see a visual map of how dimensions reference each other.
2. As an admin, I want "Where Used" lookup — which dimensions reference a specific member.
3. As a consultant, I want to understand the extensible dimension inheritance chain.
4. As a reviewer, I want cross-dimension validation rules (e.g., every Entity needs a UD3 mapping).

#### Data Model Changes

```sql
CREATE TABLE cross_dimension_rules (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  source_dimension_type TEXT NOT NULL,
  target_dimension_type TEXT NOT NULL,
  rule_type TEXT NOT NULL,       -- 'member_exists' | 'property_maps' | 'hierarchy_mirrors'
  rule_config TEXT NOT NULL,     -- JSON: specific rule parameters
  severity TEXT NOT NULL DEFAULT 'warning',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE cross_dimension_mappings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  source_dimension_type TEXT NOT NULL,
  source_member_key TEXT NOT NULL,
  target_dimension_type TEXT NOT NULL,
  target_member_key TEXT NOT NULL,
  mapping_type TEXT NOT NULL,    -- 'reference' | 'mirror' | 'lookup' | 'default_value'
  created_at TEXT NOT NULL
);
```

#### API Contracts

```
GET    /api/projects/:id/cross-dimension/map    → DimensionRelationshipMap
GET    /api/projects/:id/cross-dimension/where-used?memberKey=&dimensionType= → WhereUsedResult
GET    /api/projects/:id/cross-dimension/inheritance → InheritanceChain[]
POST   /api/projects/:id/cross-dimension/validate → CrossDimValidationResult

GET    /api/projects/:id/cross-dimension/rules  → CrossDimensionRule[]
POST   /api/projects/:id/cross-dimension/rules  { ... } → CrossDimensionRule
```

#### Acceptance Criteria

- [ ] Visual relationship map shows inter-dimension dependencies
- [ ] "Where Used" finds all references to a member across all dimensions
- [ ] Inheritance chain visualizes extensible dimension relationships
- [ ] Cross-dimension validation rules enforced during validation run
- [ ] Validation issues generated for cross-dimension rule violations

---

### Feature 9: Template Library & Reusable Patterns

#### Purpose & Business Value

Consultants rebuild the same dimension structures for every client. A template library captures best-practice patterns (Manufacturing CoA, Financial Services entity hierarchy, etc.) and lets consultants start from proven foundations.

#### Data Model Changes

```sql
CREATE TABLE templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,        -- 'industry' | 'dimension_type' | 'pattern' | 'custom'
  industry TEXT,                 -- 'manufacturing' | 'financial_services' | 'technology' | 'retail'
  dimension_types TEXT NOT NULL, -- JSON array
  template_data TEXT NOT NULL,   -- JSON: full dimension structure (members + relationships + properties)
  tags TEXT,                     -- JSON array for search
  version TEXT NOT NULL DEFAULT '1.0.0',
  is_public INTEGER NOT NULL DEFAULT 0,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE template_applications (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES templates(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  applied_by TEXT REFERENCES users(id),
  rename_mapping TEXT,           -- JSON: {oldName: newName} for customization
  applied_at TEXT NOT NULL
);
```

#### API Contracts

```
GET    /api/templates                          ?category=&industry=&search= → Template[]
POST   /api/templates                          { name, data, ... } → Template
POST   /api/templates/from-project             { projectId, dimensionTypes[] } → Template
POST   /api/templates/:id/apply                { projectId, renameMapping? } → ApplyResult
GET    /api/templates/:id/preview              → TemplatePreview
```

#### Acceptance Criteria

- [ ] Templates can be created from existing project dimensions
- [ ] Templates can be applied to new or existing projects with smart renaming
- [ ] Industry-specific templates ship as defaults
- [ ] Template search by name, category, industry, tags
- [ ] Template versioning tracks changes over time
- [ ] Template preview shows structure before applying

---

### Feature 10: Advanced Reporting & Analytics

#### Purpose & Business Value

Clients need to report on metadata health, change velocity, and compliance status for executive steering committees and audit purposes.

#### Data Model Changes

```sql
CREATE TABLE report_definitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  report_type TEXT NOT NULL,     -- 'health' | 'velocity' | 'compliance' | 'coverage' | 'custom'
  config TEXT NOT NULL,          -- JSON: filters, date range, dimensions, metrics
  schedule_cron TEXT,
  format TEXT NOT NULL DEFAULT 'pdf', -- 'pdf' | 'xlsx' | 'pptx' | 'json'
  recipients TEXT,               -- JSON: email addresses
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE report_runs (
  id TEXT PRIMARY KEY,
  definition_id TEXT NOT NULL REFERENCES report_definitions(id),
  status TEXT NOT NULL,
  output_path TEXT,
  generated_at TEXT NOT NULL
);

CREATE TABLE metadata_health_snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  dimension_type TEXT NOT NULL,
  quality_score REAL NOT NULL,   -- 0-100
  completeness_score REAL NOT NULL,
  naming_score REAL NOT NULL,
  validation_error_count INTEGER NOT NULL,
  validation_warning_count INTEGER NOT NULL,
  member_count INTEGER NOT NULL,
  orphan_count INTEGER NOT NULL,
  captured_at TEXT NOT NULL
);
```

#### Acceptance Criteria

- [ ] Metadata health dashboard shows quality scores per dimension over time
- [ ] Change velocity chart shows modifications per week/month
- [ ] Compliance report exports all changes with approval status
- [ ] Coverage analysis identifies neglected dimensions
- [ ] Stale member report finds members with no recent activity
- [ ] Reports exportable as PDF, XLSX, or PowerPoint
- [ ] Scheduled reports sent via email

---

### Feature 11: Version Control & Git Integration

#### Purpose & Business Value

Metadata should be versioned like code. Git integration provides branching, merging, history, and collaborative review workflows that align with modern DevOps practices.

#### Technical Architecture

```
┌──────────────────────────────────────────────────────┐
│ Version Control Layer (src/server/vcs/)              │
│  ├── gitAdapter.ts (isomorphic-git operations)       │
│  ├── projectSerializer.ts (DB → file format)         │
│  ├── projectDeserializer.ts (file format → DB)       │
│  ├── branchManager.ts (create, merge, delete)        │
│  ├── diffRenderer.ts (visual diff between commits)   │
│  └── tagManager.ts (release tagging)                 │
├──────────────────────────────────────────────────────┤
│ Storage Format (git-tracked)                         │
│  └── .dimbuilder/                                    │
│      ├── project.yaml (project metadata)             │
│      ├── dimensions/                                 │
│      │   ├── scenario.yaml                           │
│      │   ├── entity.yaml                             │
│      │   └── account.yaml                            │
│      └── config/                                     │
│          └── validation-overrides.yaml               │
└──────────────────────────────────────────────────────┘
```

#### Acceptance Criteria

- [ ] Projects can be exported to a git-trackable file format
- [ ] Every save creates a git commit with meaningful message
- [ ] Branches allow parallel workstreams on same project
- [ ] Merge combines two branches with conflict detection
- [ ] History timeline shows all changes with visual diff
- [ ] Tags mark release points (e.g., "v1.0-golive")
- [ ] Pull request-style review for branch merges

---

### Feature 12: Extensible Dimensionality Modeler

#### Purpose & Business Value

Extensible dimensionality is OneStream's most powerful and most confusing feature. There is NO existing design tool for planning extensibility. This is a unique competitive feature no other tool provides.

#### User Stories

1. As a consultant, I want to visually design cube/dimension inheritance before implementing.
2. As an admin, I want to see which members are inherited vs. local in each cube type.
3. As a consultant, I want "what if" extensibility planning to avoid irreversible mistakes.
4. As a reviewer, I want warnings for extensibility anti-patterns.

#### Acceptance Criteria

- [ ] Visual cube/dimension inheritance designer (drag-and-drop)
- [ ] Shows base → extended dimension relationships
- [ ] Inherited vs. local member distinction highlighted
- [ ] "What if" planner shows impact of adding extensibility
- [ ] Anti-pattern warnings (too deep inheritance, orphaned extensions)
- [ ] Varying property visualization by cube type and scenario type
- [ ] Export extensibility documentation

---

## Tier 3: Power Features

---

### Feature 13: Excel Add-In

#### Purpose & Business Value

Finance teams live in Excel. An add-in lets them work in their familiar environment while benefiting from server-side validation, governance, and collaboration.

#### Acceptance Criteria

- [ ] Excel add-in connects to Dim Builder server
- [ ] Members/relationships editable in Excel with real-time validation
- [ ] "Publish" pushes Excel changes to server project
- [ ] "Download" pulls project data into formatted worksheets
- [ ] Cell-level validation indicators (color coding)
- [ ] Works with Excel Desktop and Excel Online

---

### Feature 14: Conflict Resolution & Merge

#### Purpose & Business Value

Multiple users editing the same dimension simultaneously requires conflict detection and resolution. This is essential for team deployment.

#### Acceptance Criteria

- [ ] Optimistic locking detects concurrent edits
- [ ] 3-way merge for non-overlapping changes
- [ ] Conflict UI shows side-by-side with common ancestor
- [ ] Manual resolution for overlapping changes
- [ ] Merge history with full attribution
- [ ] Auto-merge succeeds for non-conflicting parallel edits

---

### Feature 15: Scheduled Jobs & Automation

#### Purpose & Business Value

"Set it and forget it" metadata sync from ERP, scheduled validation runs, and automated notifications reduce manual overhead.

#### Acceptance Criteria

- [ ] Cron-style scheduler for sync jobs
- [ ] Event-triggered actions (new member in source → draft in project)
- [ ] Webhook support for external system notifications
- [ ] Auto-validation on import
- [ ] Daily digest emails of pending changes
- [ ] Job execution history with success/failure tracking

---

### Feature 16: Data Quality Scoring

#### Purpose & Business Value

Quantifiable metadata quality metrics enable executive reporting, quality gates for deployment, and continuous improvement tracking.

#### Acceptance Criteria

- [ ] Per-member quality score (0-100) based on completeness, naming, properties
- [ ] Per-dimension aggregate quality score
- [ ] Quality trend over time (daily/weekly snapshots)
- [ ] Configurable quality rules with customizable weights
- [ ] Quality gates: block deployment below threshold
- [ ] Quality score breakdown showing which factors are low

---

### Feature 17: Migration Assistant

#### Purpose & Business Value

Many organizations migrate from Hyperion HFM/Planning, SAP BPC, or other CPM tools to OneStream. A migration assistant accelerates this process.

#### Acceptance Criteria

- [ ] Import Hyperion metadata (.app, MaxL export, EPMA flat files)
- [ ] Import SAP BPC dimension loads (.csv format)
- [ ] Mapping table generation (source → OneStream)
- [ ] Gap analysis (unmapped members, missing properties)
- [ ] Migration progress tracker per dimension
- [ ] Side-by-side comparison of source vs. target structure

---

### Feature 18: API & Extensibility Platform

#### Purpose & Business Value

Large customers need to integrate with their own systems. A well-documented API and plugin architecture enables custom workflows.

#### Acceptance Criteria

- [ ] Full REST API with OpenAPI 3.0 specification
- [ ] Swagger UI for API exploration
- [ ] Webhook subscriptions for change events
- [ ] Plugin architecture for custom validators
- [ ] Custom property types beyond OneStream defaults
- [ ] API key authentication for machine-to-machine access
- [ ] Rate limiting per API key

---

### Feature 19: Offline Mode & Local-First Sync

#### Purpose & Business Value

Consultants work at client sites without reliable internet. The tool must work fully offline and sync when connectivity returns.

#### Acceptance Criteria

- [ ] Full offline capability (all features work without server connection)
- [ ] Sync queue for pending changes
- [ ] Conflict detection on sync
- [ ] Progress indicator for sync operations
- [ ] Graceful degradation of connected features (AI, OneStream integration)
- [ ] Clear online/offline status indicator

---

### Feature 20: Documentation Auto-Generation

#### Purpose & Business Value

Every implementation needs a "dimension design document" for client handoff. Auto-generation eliminates hours of manual documentation work.

#### Acceptance Criteria

- [ ] Auto-generate Word/PDF design documents from project metadata
- [ ] Include hierarchy diagrams, property summaries, validation results
- [ ] Customizable templates (SR branding, client branding)
- [ ] Version-stamped documentation tied to snapshots
- [ ] Change log generation between versions
- [ ] Export as DOCX, PDF, or HTML

---

## Tier 4: Platform & Scale

---

### Feature 21: Multi-Tenant Architecture

#### Purpose & Business Value

Cloud SaaS deployment requires tenant isolation so multiple customer organizations can use the platform independently.

#### Acceptance Criteria

- [ ] Tenant isolation (each org gets isolated data)
- [ ] Tenant-level configuration (branding, validation rules, workflows)
- [ ] Central admin portal for tenant management
- [ ] Usage metering and billing hooks
- [ ] Tenant provisioning and deprovisioning
- [ ] Cross-tenant data is never accessible

---

### Feature 22: Real-Time Collaboration

#### Purpose & Business Value

Team members should see each other's changes in real-time, like Google Docs for metadata.

#### Acceptance Criteria

- [ ] WebSocket-based live editing
- [ ] Presence indicators (who's viewing which dimension)
- [ ] Real-time conflict highlighting
- [ ] Comment threads on specific members
- [ ] @-mentions with notifications
- [ ] Changes merge automatically for non-conflicting edits

---

### Feature 23: Audit & Compliance Module

#### Purpose & Business Value

SOX compliance requires complete audit trails, segregation of duties enforcement, and retention policies for financial metadata changes.

#### Acceptance Criteria

- [ ] SOX compliance report generation
- [ ] Configurable retention policies (keep logs for N years)
- [ ] Export audit data to GRC systems (ServiceNow, Archer)
- [ ] Digital signatures on approved changes
- [ ] Segregation of duties enforcement (author ≠ approver)
- [ ] Immutable audit log (append-only, tamper-evident)
- [ ] Compliance dashboard with violation alerts

---

### Feature 24: Performance & Scale

#### Purpose & Business Value

Enterprise deployments may have 100K+ members per dimension. The platform must handle this scale without degradation.

#### Acceptance Criteria

- [ ] Database migration path: SQLite → PostgreSQL
- [ ] Connection pooling for concurrent users
- [ ] Background job processing for large imports/exports
- [ ] Caching layer for frequently-accessed metadata
- [ ] Virtual scrolling for 100K+ member grids
- [ ] API response pagination with cursor-based navigation
- [ ] Import performance: 50K members in < 30 seconds
- [ ] Validation performance: 100K members in < 10 seconds
- [ ] Export performance: full XML for 100K members in < 15 seconds

---

## Implementation Order

The features are designed to be built sequentially with each tier building on the previous:

1. **Feature 1** (Auth) unlocks all multi-user features
2. **Feature 2** (Workflows) requires Feature 1
3. **Feature 6** (Multi-Environment) requires Feature 3 (OneStream Integration)
4. **Feature 4** (ERP Connectors) is independent of Features 2-3
5. **Feature 5** (Impact Analysis) benefits from Feature 3 but works locally
6. **Feature 7** (AI) is independent and can be built any time
7. **Tier 3-4** features build on the Tier 1-2 foundation

---

## Non-Functional Requirements

### Security
- All credentials encrypted at rest (AES-256)
- HTTPS enforced in production
- OWASP Top 10 compliance
- Regular dependency vulnerability scanning
- CSP headers configured
- Input sanitization on all user inputs

### Reliability
- Graceful degradation when external services unavailable
- Transaction safety for all database operations
- Automatic retry with exponential backoff for transient failures
- Health check endpoints for monitoring

### Observability
- Structured logging (Pino) with correlation IDs
- Request tracing across async operations
- Metrics export (Prometheus format)
- Error alerting (configurable thresholds)

### Compatibility
- OneStream XF versions 7.0 through 9.x
- Browsers: Chrome, Edge, Firefox (latest 2 versions)
- Node.js 18+ runtime
- Windows, macOS, Linux deployment targets

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Dimension build time (vs. manual) | 5-10x faster |
| Validation error detection rate | 95%+ before deployment |
| Deployment success rate | 99%+ (zero orphan creation) |
| User adoption (within client org) | 80%+ of dimension authors |
| Change cycle time (request → deployed) | < 48 hours |
| Audit compliance score | 100% traceability |

---

*End of specification document.*
