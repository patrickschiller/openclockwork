# OpenClockwork v1.2.2

## Highlights

- Prevents mixed web/API rollouts from exposing terminal controls against an
  older API. This fixes the production failure that surfaced as
  `Cannot POST /api/terminals` even though the terminal UI was already visible.
- Reports the running API release version through `/api/health`. The web
  container waits for the matching API version before nginx accepts browser
  traffic, so an incomplete rollout fails safely instead of serving an
  incompatible application.
- Makes production Docker Compose wait for API health before starting the web
  service and documents the required API-before-web order for separate Azure
  Container App revisions.
- Adds regression coverage for creating and activating the very first terminal
  after production administrator bootstrap, with no seeded terminal or support
  prompt state.

## Upgrade notes

- Back up PostgreSQL and request attachments before upgrading.
- Set `OPENCLOCKWORK_VERSION=1.2.2` and follow the
  [upgrade guide](https://github.com/patrickschiller/openclockwork/blob/v1.2.2/UPGRADING.md).
- Existing production volumes are retained; do not use `docker compose down -v`.
- This patch contains no database migration and does not add demo data to
  production installations.
- When API and web are deployed as separate services, deploy the `1.2.2` API
  first and wait for `/api/health` to report version `1.2.2`; then deploy the
  web image. Docker Compose performs this ordering automatically.

## Database migrations

None.

## Breaking changes

None.

## Docker images

- `ghcr.io/patrickschiller/openclockwork-api:1.2.2`
- `ghcr.io/patrickschiller/openclockwork-web:1.2.2`

## Known issues

None known.
