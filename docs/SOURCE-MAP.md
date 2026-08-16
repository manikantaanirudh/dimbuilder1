# Source Map

This ledger records the strongest repository evidence behind the refreshed documentation. Confidence describes the claim, not merely the existence of prose about it.

| Evidence ID | Claim / area | Confidence | Evidence kind | Primary sources |
|---|---|---|---|---|
| CFG-001 | The committed profile is local-first, uses local ports, and disables optional modules and AI by default. | Verified | implementation, configuration | `config/dimbuilder.yaml`; `src/shared/appConfigDefaults.ts` |
| MOD-001 | Optional route groups and client navigation are gated by module flags; the base AI router is an exception and is mounted independently. Tests can intentionally enable all modules. | Inferred | implementation, test-intent | `src/server/registerApiRoutes.ts`; `src/client/ui/moduleNav.ts`; `src/shared/modulesConfig.ts`; `src/test/modulesConfig.test.ts`; `src/test/moduleRoutes.test.ts` |
| AUTH-001 | Local credentials and OIDC use JWT access tokens and refresh sessions; auth is disabled by default. | Verified | implementation, test-executed | `src/server/routes/auth.ts`; `src/server/middleware/authenticate.ts`; `src/shared/appConfigTypes.ts`; `src/test/auth.test.ts`; `src/test/appConfig.test.ts` |
| AUTH-002 | Legacy Basic Auth is only a compatibility branch for enabled `strategy: none` configuration. | Verified | implementation | `src/server/app.ts`; `src/server/middleware/basicAuth.ts` |
| SEC-001 | Shared/production startup rejects missing auth, placeholder JWT secrets, and weak first-admin credentials; experimental modules are forced off. | Verified | implementation, test-executed | `src/server/startupSafety.ts`; `src/test/startupGuard.test.ts` |
| API-001 | Health is unauthenticated, while auth, rate limiting, validation, and route registration are applied in a defined Express pipeline. | Verified | implementation, runtime | `src/server/app.ts`; `src/server/registerApiRoutes.ts`; local `/api/health` runtime check |
| DB-001 | SQLite uses Node `node:sqlite` by default; `DATABASE_URL` selects PostgreSQL and both share repositories. | Verified | implementation, configuration | `src/server/db/createDbClient.ts`; `src/server/db/sqliteClient.ts`; `src/server/db/postgresClient.ts`; `src/shared/appConfigTypes.ts` |
| DB-002 | Named migrations are recorded in `schema_migrations`; PostgreSQL additionally applies SQL migration files. | Verified | implementation, test-executed | `src/server/db/migrations.ts`; `src/server/db/migrations/postgres/`; `src/test/migrationRunner.test.ts`; `src/test/migrationUpgrade.test.ts` |
| OPS-001 | The supported Windows development restart script clears ports 8787/5173 and starts the concurrent API/UI dev process. | Verified | configuration, runtime | `scripts/restart-services.bat`; local service restart and HTTP checks |
| AI-001 | Natural-language query handling includes project-context, hierarchy, property, relationship, listing, and existence intents; chat also requires module and AI gates. | Inferred | implementation | `src/server/ai/naturalLanguage/queryParser.ts`; `src/server/ai/projectContext.ts`; `src/server/registerApiRoutes.ts`; `src/client/ui/moduleNav.ts` |
| DOC-001 | The repository documentation pack is checked for required files, headings, links, and source-to-doc pairing. | Verified | implementation | `scripts/check-docs.mjs`; `package.json` |
