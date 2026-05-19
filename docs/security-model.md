# Security Model

SR Onestream Dim Builder is currently a local-first workbench. It is not yet hardened as a multi-user production service.

## Current Posture

- The server binds to the configured host, defaulting to `127.0.0.1`.
- CORS is enabled without a strict origin allow-list.
- There is no login flow.
- Route actions use `local-admin` as the user id.
- Uploaded workbook and XML files are written to `paths.uploadsDirectory`.
- Exported files are written to `paths.exportsDirectory`.
- SQLite stores project data locally.

## Existing Safety Measures

- Config is validated at startup.
- Unknown dimension types and unsupported blueprint fields are rejected.
- Upload handling uses `multer` with the configured upload directory.
- XML output escapes attribute and property values.
- Validation detects XML-invalid control characters.
- Server export routes block file generation when stored validation issues match configured blocking severities.
- Optional export validation bypass is disabled by default and records an audit entry when enabled and used.
- Repository transactions prevent partial blueprint project creation and partial XML import persistence.

## Known Gaps

- No authentication or authorization.
- No CSRF protection.
- No CORS origin restriction.
- No upload file type or size policy beyond middleware defaults.
- No per-user project ownership enforcement.
- No database migration framework.
- No secrets management model.

## Production Hardening Recommendations

Before shared or production use:

- Add authentication.
- Add project-level authorization.
- Restrict CORS origins.
- Add CSRF protection or same-site deployment controls.
- Add upload extension, MIME, and size validation.
- Add audit user identity from the authenticated session.
- Keep export bypass disabled in shared environments unless an approval workflow records the reason.
- Add backup and restore procedures for SQLite or move to a managed database.
- Add migration tooling.
- Add structured logging and operational monitoring.
