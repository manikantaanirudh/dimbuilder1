# Production Readiness Checklist

Use this checklist before treating SR Onestream Dim Builder as a production or shared service.

## Application Behavior

- [ ] Blank project creation works from `config/dimbuilder.yaml`.
- [ ] XLSX seeding remains optional and clearly labeled.
- [ ] XML export works from app-authored records.
- [ ] Validation runs successfully after edits.
- [ ] Export is blocked server-side when blocking validation severities exist.
- [ ] Large dimensions remain responsive in the UI.

## Configuration

- [ ] `config/dimbuilder.yaml` has reviewed identity, paths, enabled dimension types, display order, and blueprints.
- [ ] Blueprint fields are validated in tests.
- [ ] Environment overrides are documented for deployment.
- [ ] Metadata reference file strategy is documented.

## Data And Persistence

- [ ] Database location is backed up.
- [ ] Migration strategy exists.
- [ ] Snapshot restore strategy exists.
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

