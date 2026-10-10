# Solo mode

Solo mode in OpenClockwork 2.0.1 is for one person managing their own work:
freelancers, independent consultants, and owner-operated businesses. It provides
time capture, customers, projects, service orders, personal calendar entries, and
timesheets without manager approvals or a fictional HR department.

It is one operating mode of the same self-hosted application, not a separate
edition or paid tier. The owner uses an administrative identity internally, but
the UI exposes a personal workflow. See [Operating modes](OPERATING_MODES.md)
to compare it with [Team mode](TEAM_MODE.md).

## What you can use immediately

- Start and stop one timer, add completed work manually, and switch the running
  timer to another project.
- Correct, split, or cancel your own entries with revision checks and an audit
  history.
- Organise customer projects and service orders, track planned versus actual
  hours, and classify work as billable or non-billable.
- Review a personal dashboard and calendar, then filter and export customer
  timesheets.
- Keep weekly targets, leave accounting, break deductions, personal time-window
  hints, daily target blocks, and GPS off unless you want them.

The billable flag is a classification, not a price calculation. Rates, invoices,
payments, tax documents, CAUR imports, agent tokens, and model-cost accounting
are **not implemented** in this release. See the [roadmap](../ROADMAP.md).

## Install a release and create the owner

Use the [production installation guide](../README.md#production-installation-step-by-step)
for host requirements, independent secrets, TLS, persistent volumes, and backups.
For 2.0.1, check out the `v2.0.1` tag and set the following in your private
`.env.prod`:

```dotenv
OPENCLOCKWORK_VERSION=2.0.1
TZ=UTC
```

Choose the actual IANA working timezone for your installation before recording
real work; `UTC` is the neutral default, not a recommendation for every operator.
Do not copy the two lines above as a complete configuration: all required
credentials and browser origins from `.env.prod.example` must also be configured.

Start the versioned release images:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
```

The API container applies pending migrations. Production does not run the demo
seed. On the still-empty installation, start the interactive bootstrap:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec api node --import tsx prisma/create-admin.ts
```

Do not add `-T` to that interactive command. Select **Solo**, then enter your
name and email. A strong random initial password is printed once. Save it
privately; do not redirect it into shared logs. Bootstrap refuses to run when
any employee record already exists.

For scripted provisioning, the supported non-interactive fields can be inspected
without creating an account:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec -T api node --import tsx prisma/create-admin.ts --help
```

Pass `--mode Solo`, `--first-name`, `--last-name`, and `--email` together.
The personnel number defaults to `OWNER`; contract fields are not required for
Solo. The CLI generates the password rather than accepting it on the command
line. With no arguments, the interactive mode selector defaults to Solo; with
arguments and no `--mode`, it defaults to Team to preserve existing scripts.

For source development the same entry point is `pnpm db:create-admin`.
Development startup does not automatically load a seed. A database deliberately
populated with demo data is no longer empty and cannot be used for first-owner
bootstrap.

## Complete the first-run setup

1. Sign in at your configured application URL using the generated credentials.
2. Review your profile and change the initial password in **Settings → Password**.
   The new password must contain at least 12 characters. Password changes
   invalidate existing access and refresh sessions, so sign in again afterward.
3. Confirm the working timezone shown by the application. It comes from the
   installation's `TZ`; the settings page is not a timezone-migration tool.
4. Keep all optional policies off, or configure only the ones you need.
5. Confirm the displayed timezone and chosen rules, then complete setup.

The initial personal policy has no weekly target, leave account, automatic break
deduction, core-time hints, daily block, GPS, or regional holiday preset.
Working days initially use Monday–Friday but create no target obligation while
targets are disabled. Review that selection before enabling any account that
uses working days.

German and English are available from the login screen and application header.
The language choice is remembered; it does not select a country's calendar or
working-time rules.

## A normal workday

### Create a booking target

Create a customer if the work belongs to a client. Customer name is required;
code and internal note are optional. Create a project and select that customer,
or leave the project customer empty for internal work. A project can contain
service orders and optional planned-hour budgets.

New Solo projects are automatically assigned to the owner. Only active,
bookable targets can be selected. If a project has active service orders, choose
a service order rather than booking at the project root.

Billability starts with the project's default. A service order can inherit that
default or override it; an individual booking can also explicitly override it.
The booking keeps its own billable value, so changing a default does not silently
reclassify already recorded work.

### Track work

Use **Overview** or **Times** to start and stop the timer. A project is optional,
so unassigned work can be organised later. Add a customer-facing activity
description when useful. Put private working notes in the separately marked
private-note field.

Use the running timer's project switch when the work changes without a pause.
It closes the previous segment and starts the next as one server operation.
Only one owner timer can run at a time. A timer left running for a long time is
flagged for review; it is not automatically converted into a finished timesheet.

GPS begins disabled. If enabled in personal settings, location capture still
requires an explicit booking choice and browser permission. Solo does not offer
shared kiosk setup or terminal geofencing.

### Add or correct past work

Use a manual entry for a completed interval. Manual and correction forms use the
installation's working timezone and send an unambiguous instant to the server.
Impossible local times during the spring clock change are rejected. During a
repeated autumn hour, choose the intended UTC offset.

Corrections and cancellations require a reason and retain before/after history.
Split a completed entry when an allocation changes partway through. Cancelled
entries remain inspectable but do not contribute to report totals. A split or
running project switch preserves its capture group's overall break deduction
instead of deducting the same break again for every fragment.

Overlaps and future end times are rejected. Revision checks prevent a stale
browser tab from silently overwriting a newer edit or stopping a different
timer. If a conflict appears, refresh and review the current record before
retrying; opening another tab does not create a second independent timer.

## Personal calendar and optional policies

The calendar combines completed net working time with personal free days,
vacation, sickness, and training. Personal-day entries can span dates and use
first/last-day half-day flags. Notes are internal. Edit or cancel entries
directly; their history is retained rather than routed to an approver.

Policies live in **Settings** and have an effective date:

| Option                         | Purpose                                                                                              |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Weekly target and time account | Compare actual work against a chosen weekly target and working-day mask                              |
| Leave account                  | Track an explicitly chosen annual allowance, yearly carry-over, expiry, and documented adjustments   |
| Holiday calendar               | Choose no preset, an optional German regional preset, and/or custom holiday dates                    |
| Break rules                    | Configure thresholds and deduction minutes; an empty list means no automatic deduction               |
| Personal time-window hints     | Review work outside a chosen frame or gaps in configured core windows without an approval workflow   |
| Daily target block             | Add a completed daily-target block when the target is enabled and all date/conflict checks permit it |
| GPS                            | Make explicit location capture available for personal bookings                                       |

Choose a future effective date if today already contains recorded work or
personal time off. Past policy dates cannot be edited retroactively. Future
versions are shown in settings; historic calculations use the applicable rules,
and stored break evidence is not replaced simply because settings change.

Personal hints concern completed past days. They are guidance, not requests or
attendance enforcement. Missing days, free days, holidays, and the still-open
current day are not treated as automatic core-time violations.

Daily target blocks are optional and cannot coexist with conflicting work or
time off. Their availability is evaluated for the selected date. A repeated
daylight-saving start time must be replaced by an unambiguous start for this
specific booking shortcut.

## Customers, archives, and history

Archive records that should no longer accept new work. A referenced customer,
project, or order cannot simply be deleted; only unused records can be removed.
A customer with project references must be retained or archived. Archiving a
target used by a running timer is blocked until that timer is stopped or
reassigned.

A project that already has booked work cannot be moved to a different customer.
Create a new project for the new customer instead. Historical assignments and
billability remain traceable.

Customer and booking private notes are not customer-report descriptions. Keep
client-facing explanations in the activity field and review them before export.

## Reports and browser handoffs

Reports can be filtered by dates, customer, project, service order, billability,
or unassigned work. The totals distinguish:

- **Gross:** elapsed completed working intervals.
- **Break:** deductions attributed to those intervals.
- **Net:** gross minus break deductions.
- **Billable net:** the net portion classified as billable.

Reports use the installation's timezone and split overnight work at local day
boundaries. Open timers are shown as an outstanding count and are excluded from
final report totals and CSV rows. Cancelled work is excluded. Private notes are
not exported.

**CSV** requests the server-generated file for the applied filters.
“Download started” means the browser handoff was initiated, not that a file has
been saved successfully. **Print/PDF** opens the browser print flow; PDF saving
depends on the browser and operating system. Neither feature automatically
emails a customer, creates an invoice, or marks time as invoiced.

Verify downloads and print output in the actual browser or installed PWA you
will use. Some embedded browser surfaces do not expose these system handoffs
reliably. Use a supported full browser for an end-to-end file/print check and
inspect the output before sending it externally.

## Connectivity, access, and recovery

Solo is online-first: mutations require a server response. The server timer
continues while a client is disconnected, but offline edits are not queued as
saved work. Reconnect and confirm the current timer before continuing.

Only the active owner can use Solo data endpoints. Historical Team identities
are not removed by a mode change, but their accounts and legacy Team endpoints
do not gain access to the owner's personal workflow. Keep host/database access
restricted, and protect the database and attachment volumes with tested backups.

### Lost owner password

A trusted operator with access to the configured database can reset the existing
active Solo owner without creating a new identity. On the production host,
replace the placeholder with the owner's exact stored email:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec api node --import tsx prisma/reset-owner-password.ts --email '<owner-email>'
```

The placeholder is not an example account. The command generates a strong random
password, displays it once after committing, and invalidates old access and
refresh sessions. Store the output privately, sign in, and change it in
Settings. Work history and identity remain unchanged.

Recovery refuses Team mode, an inactive owner, an email mismatch, or a concurrent
identity/credential change. It is not a mechanism for creating administrators,
reactivating people, or granting privileges. Do not rerun first-account bootstrap,
seed the database, or reset migrations to recover a password.

## Moving to or from Team

Use [the mode-switch procedure](OPERATING_MODES.md#switching-modes-safely).
An upgrade alone never enables Solo. A Team administrator must resolve blockers
and explicitly confirm the switch, then finish personal setup. Existing work may
carry relevant personal accounting settings forward; do not assume a converted
installation has the all-off defaults of a fresh Solo bootstrap.

Switch to Team before adding another active person. Customer/project references,
bookings, and personal history are preserved, but the Solo customer-management,
personal-policy, and billable-report screens are not Team screens in 2.0.
Review Team schedules and permissions before resuming work with other people.

For backups, forward migrations, validation, and rollback use
[UPGRADING.md](../UPGRADING.md). Container replacement is not a reason to remove
persistent volumes.
