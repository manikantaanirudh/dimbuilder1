# Feature Status

Feature availability is controlled by `config/dimbuilder.yaml` (`modules`, `ai`, `integrations`) and `operations.appMode`. Defaults are conservative: **core workbench only**.

## Categories

| Category | Description | Default |
|----------|-------------|---------|
| **core** | Projects, dimensions, import/export, validation, diff, change sets, release packages, ACM handoff, XD X-Ray, POV simulator, artifact impact | On (always mounted) |
| **advanced** | Workflows, snapshots, readiness score, XML round-trip check, audit log | On (`features.*`) |
| **experimental** | Mock environment handoff tracking, ERP connectors, migration cockpit, tier3 Excel add-in | Off (`modules.environmentManagement`, `modules.platformExtras`) |
| **platform** | Multi-tenancy, API keys, webhooks, offline sync, scheduler, VCS | Off (`modules.*`) |
| **disabled** | Direct OneStream write-back, stub compliance metrics | Off + hidden |

## Module flags (`config.modules`)

| Flag | When true | Default |
|------|-----------|---------|
| `environmentManagement` | Environments, connectors, sync jobs, mock handoff tracking | `false` |
| `chatAssistant` | AI routes, Chat, Smart Insights, Project Assistant | `false` |
| `offlineSync` | Tier3 offline/sync endpoints | `false` |
| `apiPlatform` | Tier3 API keys, webhooks, Excel add-in API | `false` |
| `multiTenancy` | Tier4 tenant APIs | `false` |
| `scheduler` | In-process scheduled jobs (if started) | `false` |
| `platformExtras` | VCS, extensibility, templates, migration cockpit routes | `false` |

## AI (`config.ai`)

Requires `modules.chatAssistant: true` **and** `ai.enabled: true`. Default: `ai.enabled: false`.

## Integrations (`config.integrations`)

| Integration | Default | Notes |
|-------------|---------|-------|
| `acm` | enabled when unset | File-based ACM handoff package (core) |
| `epmware` | enabled when unset | Experimental; P2 maturity |

## App mode (`operations.appMode`)

| Mode | Auth | Config editor | Experimental modules |
|------|------|---------------|----------------------|
| `local` | Optional | Allowed (admin) | Can enable in YAML |
| `shared` | Required | Disabled | Forced off unless `UNSAFE_ALLOW_EXPERIMENTAL=true` |
| `production` | Required + strong secrets | Disabled | Forced off |

Source: `src/server/startupSafety.ts`, `src/server/registerApiRoutes.ts`, `src/client/ui/moduleNav.ts`.
