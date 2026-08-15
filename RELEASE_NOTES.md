# OpenClockwork v1.1.0

## Highlights

- HR administrators can enable direct daily-block booking for individual
  employees. Enabled employees can book their contractual daily target as one
  completed, directly approved block without creating an approval request.
- Daily targets are derived from weekly hours and the employee's configured
  working days. Automatic statutory breaks are added to the required attendance
  time while the booked net working time remains equal to the daily target.
- Daily blocks are rejected for future dates, non-working days, public holidays,
  dates before employment, out-of-frame times, absences, active requests, and
  days that already contain time entries.
- The booking dialog and daily-block validation feedback are available in German
  and English, and daily-block entries are identified in booking history.

## Upgrade notes

- Back up PostgreSQL and request attachments before upgrading.
- Set `OPENCLOCKWORK_VERSION=1.1.0` and follow the
  [upgrade guide](https://github.com/patrickschiller/openclockwork/blob/v1.1.0/UPGRADING.md).
- Existing production volumes are retained; do not use `docker compose down -v`.
- Existing employees keep direct daily-block booking disabled. HR must enable
  the option explicitly for each employee who should use it.

## Database migrations

Migration `20260815120000_daily_block_booking` adds the `DailyBlock` time-entry
source, the per-employee `allowDailyBlockBooking` setting, and a nullable local
booking date on time entries. A unique employee/date constraint prevents more
than one daily block for the same day. Existing rows remain valid and existing
employees receive the safe default `false`.

The API applies the migration automatically through `prisma migrate deploy` on
startup. No reset or manual data migration is required.

## Breaking changes

None.

## Docker images

- `ghcr.io/patrickschiller/openclockwork-api:1.1.0`
- `ghcr.io/patrickschiller/openclockwork-web:1.1.0`

## Known issues

None known.
