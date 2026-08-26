# OpenClockwork v1.2.1

## Highlights

- Adds an active, ready-to-pair `Demo-Empfang` tablet terminal to the synthetic
  development seed and the disposable public-demo reset. Visitors can discover
  and test the tablet workflow immediately after signing in as the demo HR
  administrator.
- Disables geofencing for the seeded terminal so evaluation does not require a
  physical office location or GPS permission. No pairing code, bearer token, or
  reusable device credential is stored in the public seed; visitors exercise
  the real short-lived pairing flow themselves.
- Gives the demo terminal a stable identifier. Ordinary repeated seed runs
  preserve terminal edits and pairings, while the guarded nightly public-demo
  reset recreates the clean, unpaired baseline from an empty database.
- Adds a browser smoke test for the seeded terminal and updates the German iPad
  guide and Azure demo-reset documentation with the fastest evaluation path.
- Updates contributor guidance so it no longer requires an unavailable
  `nx-workspace` skill while retaining the repository's Nx and pnpm rules.

## Upgrade notes

- Back up PostgreSQL and request attachments before upgrading.
- Set `OPENCLOCKWORK_VERSION=1.2.1` and follow the
  [upgrade guide](https://github.com/patrickschiller/openclockwork/blob/v1.2.1/UPGRADING.md).
- Existing production volumes are retained; do not use `docker compose down -v`.
- This patch contains no new database migration. Production startup remains
  seed-free, so normal self-hosted installations do not receive demo data.
- For the disposable Azure public demo, deploy the `1.2.1` API image so the
  reset job is pinned to it, then start that job once manually or wait for its
  next scheduled run. The reset recreates `Demo-Empfang` automatically.
- Local development installations can run `pnpm db:seed` to add the terminal.
  Re-running the seed does not overwrite an existing terminal session with the
  stable demo identifier.
- Follow the updated
  [iPad terminal guide](https://github.com/patrickschiller/openclockwork/blob/v1.2.1/docs/IPAD_TERMINAL_SETUP.de.md)
  to pair the seeded terminal and test employee QR bookings.

## Database migrations

None.

## Breaking changes

None.

## Docker images

- `ghcr.io/patrickschiller/openclockwork-api:1.2.1`
- `ghcr.io/patrickschiller/openclockwork-web:1.2.1`

## Known issues

None known.
