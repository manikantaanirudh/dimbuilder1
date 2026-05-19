# Production Readiness Checklist

Use this checklist before treating SR Onestream Dim Builder as a production or shared service.

## Application Behavior

- [ ] Blank project creation works from `config/dimbuilder.yaml`.
- [ ] XLSX seeding remains optional and clearly labeled.
- [ ] XML import round-trips representative OneStream metadata files with unknown fields preserved.
- [ ] XML export works from app-authored records.
- [ ] Varying property CRUD, validation, and XML output are verified for representative cube/scenario/time contexts.
- [ ] Baseline creation and metadata diff review are verified for representative member, relationship, move/copy, and property changes.
- [ ] Change set lifecycle is verified from diff conversion through validation, approval/rejection, and release package generation.
- [ ] Bulk update preview/apply is verified for representative member and relationship property changes.
- [ ] Release packages are reviewed for required files, manifest accuracy, and XML/report readability.
- [ ] Snapshot restore and branch-from-snapshot are tested on representative projects.
- [ ] Validation runs successfully after edits.
- [ ] OneStream validation profile findings are reviewed for naming, alias, sort order, shared-member, and dimension-specific property quality.
- [ ] Export is blocked server-side when blocking validation severities exist.
- [ ] Large dimensions remain responsive in the UI.

## Configuration

- [ ] `config/dimbuilder.yaml` has reviewed identity, paths, enabled dimension types, display order, and blueprints.
- [ ] Blueprint fields are validated in tests.
- [ ] Environment overrides are documented for deployment.
- [ ] Metadata reference file strategy is documented.
- [ ] Export validation bypass settings are reviewed; bypass remains disabled unless operationally approved.
- [ ] `validation.oneStreamProfile` severities, reserved words, restricted characters, and naming limits are reviewed for the target OneStream implementation.

## Data And Persistence

- [ ] Database location is backed up.
- [ ] Migration strategy exists.
- [ ] Schema evolution for `varying_property_values` is covered by the migration strategy.
- [ ] Schema evolution for baseline and diff tables is covered by the migration strategy.
- [ ] Schema evolution for change set and release package tables is covered by the migration strategy.
- [ ] Baseline/diff retention and cleanup policy exists.
- [ ] Change set, approval, and release package retention policy exists.
- [ ] Bulk update job retention and rollback procedure exists.
- [x] Snapshot restore strategy exists.
- [ ] Export and upload retention policy exists.
- [ ] Concurrent edit behavior is defined.

## Security

- [ ] Authentication is implemented.
- [ ] Authorization is project-aware.
- [ ] CORS is restricted.
- [ ] Upload size and file type are enforced.
- [ ] Audit user id comes from authenticated identity.
- [ ] Sensitive paths are not exposed.

## Reliability

- [ ] Health checks cover server and database.
- [ ] Logs are structured and collected.
- [ ] Export failures are reported clearly.
- [ ] Backup and restore have been tested.
- [ ] Error responses avoid leaking internals.

## Documentation

- [ ] `npm.cmd run docs:check` passes.
- [ ] API changes are reflected in `api-reference.md`.
- [ ] Config changes are reflected in `configuration-guide.md` and `dimension-blueprints.md`.
- [ ] Database changes are reflected in `database-architecture.md`.
- [ ] Export changes are reflected in `export-modes.md` and `xml-generation-guide.md`.
- [ ] Security changes are reflected in `security-model.md`.

## Verification

- [ ] `npm.cmd test` passes.
- [ ] `npm.cmd run build` passes.
- [ ] Browser smoke test passes on desktop.
- [ ] Browser smoke test passes on mobile.
