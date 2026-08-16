# OpenClockwork v1.1.2

## Highlights

- The demo notice on the login page now stays within the intended content width
  instead of stretching across the full browser window.

## Upgrade notes

- Back up PostgreSQL and request attachments before upgrading.
- Set `OPENCLOCKWORK_VERSION=1.1.2` and follow the
  [upgrade guide](https://github.com/patrickschiller/openclockwork/blob/v1.1.2/UPGRADING.md).
- Existing production volumes are retained; do not use `docker compose down -v`.

## Database migrations

None.

## Breaking changes

None.

## Docker images

- `ghcr.io/patrickschiller/openclockwork-api:1.1.2`
- `ghcr.io/patrickschiller/openclockwork-web:1.1.2`

## Known issues

None known.
