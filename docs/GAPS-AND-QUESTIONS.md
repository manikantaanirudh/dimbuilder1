# Gaps and Open Questions

These items remain unresolved after the documentation refresh. They are intentionally not presented as implemented capabilities.

| ID | Question / gap | Why it matters | Related evidence | Confidence |
|---|---|---|---|---|
| Q-001 | Which optional platform modules are approved for a shared or production deployment, and what acceptance evidence is required for each? | The code exists, but the committed profile disables the modules and non-local app modes force them off by default. | MOD-001, SEC-001 | Unknown |
| Q-002 | What is the deployment-specific migration and rollback procedure for SQLite and PostgreSQL? | Named migration runners exist, but operational rollout, rollback, backup, and compatibility procedures are environment decisions. | DB-002 | Unknown |
| Q-003 | Has the OIDC flow been exercised against an actual provider configuration? | The route and strategy are implemented, but repository tests do not establish provider interoperability. | AUTH-001 | Unknown |
| Q-004 | What upload file-type and size policy should be enforced for shared deployments beyond the application’s configured upload limit? | The application has upload handling and limits, but deployment policy remains incomplete. | SEC-001 | Unknown |
| Q-005 | Should `/api/ai/config` remain reachable when `modules.chatAssistant` is disabled? | `src/server/registerApiRoutes.ts` mounts the base AI router unconditionally, while `src/test/moduleRoutes.test.ts` expects `/api/ai/config` to return 404 when chat is disabled. | MOD-001 | Unknown |
