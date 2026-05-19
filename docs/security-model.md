# Security Model

SR Onestream Dim Builder is currently a local-first workbench. It is not yet hardened as a multi-user production service.

## Current Posture

- The server binds to the configured host, defaulting to `127.0.0.1`.
- CORS is enabled without a strict origin allow-list.
- There is no login flow.
- Route actions use `local-admin` as the user id.
- Uploaded workbook files are written to `paths.uploadsDirectory`.
- Exported files are written to `paths.exportsDirectory`.
- SQLite stores project data locally.

## Existing Safety Measures

- Config is validated at startup.
- Unknown dimension types and unsupported blueprint fields are rejected.
- Upload handling uses `multer` with the configured upload directory.
- XML output escapes attribute and property values.
- Validation detects XML-invalid control characters.
- Repository transactions prevent partial blueprint project creation.

## Known Gaps

- No authentication or authorization.
- No CSRF protection.
- No CORS origin restriction.
- No upload file type or size policy beyond middleware defaults.
- No per-user project ownership enforcement.
- No server-side export blocking based on validation issues.
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
- Enforce export blocking server-side.
- Add backup and restore procedures for SQLite or move to a managed database.
- Add migration tooling.
- Add structured logging and operational monitoring.

