# OpenClockwork v1.2.0

## Highlights

- Adds a complete tablet terminal workflow: HR administrators can configure,
  activate, pair, monitor, re-pair, deactivate, and permanently delete kiosks,
  while employees scan rotating QR challenges from the authenticated PWA to
  clock in or out.
- Adds optional server-enforced geofencing with freshness and accuracy checks.
  Location, accuracy, distance, radius, and terminal snapshots remain available
  for historical audits even after a terminal is deleted.
- Separates kiosk access from employee sessions with hash-only device
  credentials, short-lived and rate-limited challenges, daily signing-key
  rotation, per-employee replay protection, and a dedicated QR secret.
- Adds a trusted-HTTPS Docker overlay and a detailed German iPad setup and
  operations guide, plus matching Azure Key Vault and Container Apps settings.
- Refreshes the responsive German/English PWA, mobile navigation, account menu,
  absence layouts, branding, screenshots, kiosk manifest, and visible admin
  version information.
- Hardens live time booking so employee identity always comes from the bearer
  token and concurrent clock-in/out or daily-block requests are serialised.

## Upgrade notes

- Back up PostgreSQL and request attachments before upgrading.
- Before starting the new API, add an independent random
  `TERMINAL_QR_SECRET` of at least 32 characters. Do not reuse `JWT_SECRET`.
  Azure deployments must set the secure `terminalQrSecret` Bicep parameter.
- External clients of the live-booking endpoints must send an employee bearer
  token and should be regenerated from the updated OpenAPI specification.
- Set `OPENCLOCKWORK_VERSION=1.2.0` and follow the
  [upgrade guide](https://github.com/patrickschiller/openclockwork/blob/v1.2.0/UPGRADING.md).
- Existing production volumes are retained; do not use `docker compose down -v`.
- The API applies the three forward-only Prisma migrations automatically during
  production startup. No manual data backfill is required.
- For a local or managed tablet rollout, follow the
  [iPad terminal guide](https://github.com/patrickschiller/openclockwork/blob/v1.2.0/docs/IPAD_TERMINAL_SETUP.de.md)
  before pairing a kiosk.

## Database migrations

- `20260824120000_terminal_kiosk` creates terminal, device, challenge,
  redemption, and support-prompt records and adds terminal/geofence audit fields
  to time entries.
- `20260824180000_optional_terminal_geofence` lets administrators explicitly
  operate a terminal without collecting employee GPS data while preserving the
  location-bound default for existing terminals.
- `20260825120000_terminal_permanent_delete` permits permanent terminal cleanup
  while retaining existing time entries and their scalar audit snapshots.

## Breaking changes

- `GET /api/timeentries`, `POST /api/timeentries/clock-in`, and
  `POST /api/timeentries/clock-out` now require an employee bearer token.
  Clock-in/out uses the authenticated employee identity; a legacy `employeeId`
  request property is ignored.
- Production Compose and Azure deployments require the new independent
  `TERMINAL_QR_SECRET`/`terminalQrSecret` configuration before the API starts.

## Docker images

- `ghcr.io/patrickschiller/openclockwork-api:1.2.0`
- `ghcr.io/patrickschiller/openclockwork-web:1.2.0`

## Known issues

None known.
