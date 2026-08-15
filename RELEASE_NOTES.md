# OpenClockwork v1.0.0

## Highlights

- First stable OpenClockwork release with documented, versioned updates.
- HR administrators can review and export working times independently of the
  project feature, so the report remains available when projects are unused.
- Production deployments can pin versioned API and web images from GHCR.

## Upgrade notes

- Back up PostgreSQL and request attachments before upgrading.
- Set `OPENCLOCKWORK_VERSION=1.0.0` and follow the
  [upgrade guide](https://github.com/patrickschiller/openclockwork/blob/v1.0.0/UPGRADING.md).
- Existing production volumes are retained; do not use `docker compose down -v`.

## Database migrations

This release does not add a database schema migration. The API still runs
`prisma migrate deploy` on startup so existing installations receive any
pending committed migrations without a reset.

## Breaking changes

None.

## Docker images

- `ghcr.io/patrickschiller/openclockwork-api:1.0.0`
- `ghcr.io/patrickschiller/openclockwork-web:1.0.0`

## Known issues

None known.
