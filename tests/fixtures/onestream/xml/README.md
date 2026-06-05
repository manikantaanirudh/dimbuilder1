# OneStream XML fixture pack

Sanitized, synthetic OneStream-style metadata XML used by Vitest for **internal** import, export, and XML round-trip checks.

## What these fixtures are

- **Not** customer exports and **not** confidential data
- **Not** proof of successful import into a live OneStream DEV application
- **Not** OneStream-certified or guaranteed import success

They support [XML Round-Trip / Import Readiness](../../../docs/xml-round-trip-readiness.md): export → re-import → compare normalized structure in-app.

## Layout

| File | Intent |
|------|--------|
| `account-basic.xml` | Account types, alias, formula, hierarchy |
| `entity-basic.xml` | Currency, consolidation/ownership on relationships |
| `scenario-basic.xml` | Scenario Type on members |
| `flow-basic.xml` | Flow hierarchy |
| `ud1-basic.xml` / `ud2-basic.xml` | UD hierarchies and aliases |
| `relationship-properties.xml` | Relationship consolidation properties |
| `varying-properties.xml` | Scenario/time/cube context on properties |
| `alternate-hierarchy.xml` | Member under multiple parents |
| `special-characters.xml` | `&amp;`, `&apos;`, `&quot;`, `&lt;`, padding |
| `invalid-xml-*.xml` | Negative parse/validation cases only |

`manifest.json` documents each file and expected test behavior. Tests fail if manifest and disk files drift apart.

## Sanitization rules

1. Use synthetic names only (`PL_Revenue`, `ENT_US`, `SCN_Actual`, etc.).
2. No client, project, or environment identifiers from real engagements.
3. Prefer `metadataRoot` / `dimensions` / `dimension` structure (canonical importer path).
4. Keep each file under 2 MB.

## Running tests

```powershell
npx vitest run src/test/onestreamXmlFixtures.test.ts
npm.cmd test
```

## Legacy fixtures

Older files under `tests/fixtures/xml/` (`roundtrip-*.xml`) remain for backward compatibility. New work should use this pack.

## Related docs

- [docs/xml-round-trip-readiness.md](../../../docs/xml-round-trip-readiness.md)
- [docs/testing-strategy.md](../../../docs/testing-strategy.md)
- [docs/onestream-next-enhancement-backlog.md](../../../docs/onestream-next-enhancement-backlog.md)
