# Operating modes: Solo and Team

OpenClockwork 2.0.0 offers two workflows on the same self-hosted installation.
The mode is installation-wide, not a per-browser preference, billing plan, or
separate database. Pick the workflow that matches who uses the application and
who needs to make decisions about the recorded work.

## Choose a starting point

| Question                              | Solo                                                                              | Team                                                                           |
| ------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Who records work?                     | One active owner                                                                  | Employees with role-based access                                               |
| Who corrects personal time?           | The owner, directly, with reasons and audit history                               | Employee/manager/HR workflows according to Team rules                          |
| Must I set attendance targets?        | No; targets, leave accounts, breaks, and hints are optional                       | Configure employee contracts, accounts, and schedules explicitly               |
| Can I organise customer work?         | Customers, projects, service orders, billable classification, personal timesheets | Assigned projects/orders and Team reports; no Solo customer/billable-report UI |
| Can I use a shared QR tablet?         | No                                                                                | Yes; optional location/geofence checks                                         |
| Can I invite colleagues?              | Switch to Team before adding another active person                                | HR creates employee accounts; email invitations are not implemented            |
| Are invoices or agent usage included? | No                                                                                | No                                                                             |
| Which UI languages are available?     | German and English                                                                | German and English, including kiosk routes                                     |

Use [the Solo guide](SOLO_MODE.md) for independent work and [the Team guide](TEAM_MODE.md)
for organisation setup. Both share the [production installation](../README.md#production-installation-step-by-step),
backup, security, and upgrade requirements.

## Defaults and existing installations

- A fresh interactive bootstrap asks for Solo or Team; its displayed default
  is Solo. Solo asks only for the owner's identity and starts with optional
  personal accounts and deductions disabled.
- Existing non-interactive bootstrap commands without a mode remain Team.
  Use an explicit `--mode` for new provisioning scripts.
- Upgrading an existing database leaves it in **Team**. Migrations do not
  reinterpret a one-person employee database as a Solo installation.
- Conversion is not identical to fresh setup: relevant accounting settings may
  be carried forward from an existing owner's Team work. Review the proposed
  personal policy and complete Solo setup after converting.

One administrator can operate Team mode, but that still means using Team
workflows. Solo exists so that an owner does not have to create a second account
to act as their own manager.

## Switching modes safely

Make a restorable backup first. Sign in as the Solo owner or an active Team HR
administrator, open **Settings**, and request the mode-change preview. A preview
only checks prerequisites; it does not save a new mode. Resolve any listed
blockers, request a fresh preview, then explicitly confirm the change.

The backend repeats the checks during the change and verifies the installation
revision. Another user's action after preview can still block confirmation.
Do not bypass a failed check with direct database edits.

### Solo → Team

1. Stop every running timer.
2. Preview and confirm the Team switch in Settings.
3. Review the owner's Team employee record, schedules, and account settings.
4. Create additional employees, manager relationships, and project assignments
   only after the installation is in Team mode.

The owner retains their administrative identity. Customers, projects/orders,
bookings, private notes, policies, and audit history are preserved. Existing
Solo work retains its original approval mode and does not become a pending
employee request. Solo-only screens and endpoints are no longer the active
workflow; preservation of data is not a promise that every Solo view exists
in Team.

### Team → Solo

The active administrator confirming the conversion becomes the explicit owner.
The following prerequisites are checked across the installation:

- No open, non-cancelled time entries, including another person's running timer.
- No other active employees.
- No unresolved requests, including substitute or approval steps.
- No pending, non-cancelled time approvals.
- No active terminals.

Finish work and resolve workflows before deactivating people or terminals; do
not delete historical data just to pass a check. Eligible active projects are
assigned to the Solo owner during the conversion. Existing assignments and
identifiers remain intact. Confirm the timezone and personal policy in the
first-run Solo setup before using the personal workflow.

Inactive historical employees and their records remain stored. Solo reports
select the owner's work, and the server blocks legacy Team capabilities in Solo;
this is not merely hiding navigation links. A mode switch is not a data-erasure,
anonymisation, or retention operation.

### Access changes now; accounting changes at a day boundary

The UI and endpoint access change immediately. Accounting follows the
installation's working timezone:

- If today is still empty of effective work and personal/historical time off,
  the new accounting mode can apply today.
- If today already contains that history, the new accounting mode starts on
  the **next calendar date**, not the next scheduled working day.

The mode-change audit records `accountingEffectiveFrom`. This avoids changing
today's target/leave interpretation after work has already been recorded.
Personal policy changes also carry effective dates; never expect a switch to
retroactively rewrite past rules or remove prior deductions.

## Common boundaries

There is one configured working timezone per installation. User language,
browser timezone, and terminal display timezone do not choose accounting rules.
Set `TZ` before recording real data and handle later changes deliberately.

Both modes are online-first. Server confirmation is required for writes; the
PWA is not an offline edit queue. Test download and print/PDF handoffs in the
browser or installed PWA used in production, particularly if starting from an
embedded browser.

Targets, calendars, leave allowances, and break policies require operator
validation. Neither mode supplies a universal employment-law or tax-compliance
guarantee. Invoice creation, rate calculations, payment tracking, CAUR imports,
and agent cost/token accounting remain [future work](../ROADMAP.md).

## Why version 2.0.0?

The major version deliberately marks the product-generation change from a
Team-only focus to two first-class workflows. It does not invent a breaking
Team API change or require a data reset. Forward migration and keeping existing
installations in Team are intentional compatibility guarantees for this upgrade.
Future compatibility changes follow semantic versioning and will be documented
in [release notes](../RELEASE_NOTES.md) and [upgrade instructions](../UPGRADING.md).
