# OpenClockwork v1.1.1

## Highlights

- Fresh production installations can create their first HR administrator with
  an interactive, one-time bootstrap command. Production no longer depends on
  demo users or known default passwords.
- The login form is empty by default. Demo credentials and the demo notice are
  shown only when demo mode is explicitly enabled.
- Login failures now distinguish invalid credentials, connection failures, and
  server failures with user-friendly German and English messages instead of
  exposing technical API responses.
- The production installation guide is now a complete step-by-step procedure
  covering secret generation, release and local-source deployments, migration
  verification, administrator creation, and data-protection warnings.

## Upgrade notes

- Back up PostgreSQL and request attachments before upgrading.
- Set `OPENCLOCKWORK_VERSION=1.1.1` and follow the
  [upgrade guide](https://github.com/patrickschiller/openclockwork/blob/v1.1.1/UPGRADING.md).
- Existing production volumes are retained; do not use `docker compose down -v`.
- Existing installations require no bootstrap action. The administrator command
  refuses to run as soon as any employee exists.

## Database migrations

None.

## Breaking changes

None.

## Docker images

- `ghcr.io/patrickschiller/openclockwork-api:1.1.1`
- `ghcr.io/patrickschiller/openclockwork-web:1.1.1`

## Known issues

None known.
