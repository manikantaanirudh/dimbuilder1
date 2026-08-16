# Validation Rules

Validation is driven by the shared catalog in `src/shared/validationRuleCatalog.ts`. The catalog is the source of truth for the validation engine, Admin page, API, export guards, snapshots, and documentation. The current target is OneStream `9.2.0.18004` (catalog `1.0.0`).

## Rule classes

| Class | Meaning | Export behavior |
| --- | --- | --- |
| Blocking error | Confirmed OneStream 9.2 constraint or deterministic file/schema integrity failure | Locked, always `error`, blocks export |
| Advisory | Consultant, governance, performance, or unverified platform review | `warning`, `info`, or `off`; never blocks export |
| Informational | Preservation or diagnostic context | `info` or `off`; never blocks export |

The Admin page displays all catalog rules in these three sections. Hard errors cannot be overridden. Project overrides apply to the exact rule code only; changing `MEMBER_KEY_REQUIRED` does not change relationship or dimension-required rules.

## OneStream evidence

The catalog links official evidence where a rule is a platform constraint:

- [Configurable Dimensions](https://documentation.onestream.com/9.2.0/Content/Design%20and%20Reference/Cube/Configurable%20Dimensions.html): member-name uniqueness within a dimension type, 500-character maximum, restricted characters, aliases, spaces, periods, and query bracket guidance.
- [Parent Dimension](https://documentation.onestream.com/docs/Content/Design%20and%20Reference/Cube/Parent%20Dimension.html): alternate hierarchies and members with multiple parents are supported states.
- [Metadata Analysis Reports](https://documentation.onestream.com/docs/Content/RPTA/Metadata%20Analysis%20Reports.html): orphaned members are reportable diagnostic states, not automatically platform errors.

Rules without explicit official support remain advisories or informational. The catalog records evidence kind (`official`, `format`, `implementation`, or `local_policy`) and target version for every rule.

## Blocking errors

The locked blocking catalog includes missing required schema values, duplicate members and aliases within a dimension type, the documented member-name limit and restricted characters, invalid typed property values, formula/XML integrity failures, and missing relationship parent/child values. Cross-dimension member and alias uniqueness is evaluated across all dimensions of the same dimension type.

Reserved structural names are checked separately. User-created reserved names are errors, while recognized inherited/system `Root` and `None` members are allowed; non-canonical casing is an advisory. A missing local Root is not an error because inherited/system hierarchy behavior must not be mistaken for a platform failure.

## Advisories and information

The catalog keeps the following nonblocking:

- unknown or duplicate relationship references, cycles, self-references, orphans, and hierarchy-depth thresholds;
- spaces, periods, query-bracket guidance, leading/trailing whitespace, sort-order zero/duplicates, parent input, and local single-parent policy conflicts;
- shared members and relationships with no local members;
- missing optional design properties, unknown properties, varying-property issues, currency checks without a configured authoritative list, and change-set risk checks;
- XML preservation notices.

Spaces, periods, alternate hierarchies, shared members, and orphan members are supported or diagnostic states in the official documentation. They must not be presented as OneStream import errors. The configured hierarchy threshold is a consultant performance advisory; there is no hard 30-level claim in this product.

Currency validation is only performed when `validation.oneStreamProfile.validCurrencyCodes` contains an explicit authoritative list. It never compares Entity currencies to Account members.

## API and Admin configuration

- `GET /api/projects/:projectId/validation-rules` returns the catalog, effective project severities, blocking state, target version, evidence, and ignored legacy overrides.
- `PUT /api/projects/:projectId/validation-config` replaces the project override set. Unknown codes, illegal severities, and locked-rule changes return `400`.
- `POST /api/projects/:projectId/validation-config` remains a deprecated compatibility adapter for one release and returns deprecation headers.

Advisory severities are limited to `warning`, `info`, and `off`. Informational severities are limited to `info` and `off`. A saved configuration removes overrides not present in the replacement payload; unknown legacy rows are reported as ignored until the project is saved again.

## Snapshots and exports

Every validation run stores the catalog version and OneStream target version in its snapshot. Export guards consult the catalog’s `blocksExport` result and only locked hard-error findings block XML, JSON, XLSX, CSV, and snapshot exports. The YAML `exportBlockedBySeverities` setting is no longer allowed to turn advisories or informational findings into export blockers.

Existing validation history is preserved. Corrected classifications apply to the next validation run.
