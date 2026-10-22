# OpenClockwork Roadmap

OpenClockwork is a public, Apache-2.0 self-hosted application for personal work
and Team time and attendance. Version **2.2.0** adds HR working-time PDF exports
for one or several employees, building on PIN tablet terminals from 2.1.0,
Solo/Team workflows from 2.0 and the access-control fixes from 2.0.1.
Customer invoicing and coding-agent usage accounting remain
future work; a billable time flag does not mean those features already exist.

This roadmap expresses priorities and intended scope, not release dates or
promises of regulatory compliance. See [FEATURES.md](FEATURES.md) for implemented
capabilities, [the mode comparison](docs/OPERATING_MODES.md) for current
boundaries, and [README.md](README.md) for release installation.

## Delivery order

| Stage | Scope                                               | Status / dependency                     |
| ----- | --------------------------------------------------- | --------------------------------------- |
| 1     | Country-neutral configuration and defaults          | Included in 1.4.0; retained in 2.2.0    |
| 2     | Complete personal Solo workflow alongside Team      | Included in 2.0.0                       |
| 3     | QR/PIN tablet terminals and HR authentication audit | Included in 2.1.0; Team only            |
| 4     | Optional RFID terminal extension                    | Planned separately after PIN acceptance |
| 5     | Customer billing and invoice creation               | Planned; intended for Solo and Team     |
| 6     | CAUR usage import, attribution, and review          | Planned; can progress alongside stage 5 |
| 7     | Agent billing and combined customer invoices        | Planned; depends on stages 5 and 6      |

Version 2.0 deliberately marks a new product generation, not an invented
breaking Team API or a required data reset. Existing installations migrate
forward and remain Team. Future compatibility changes follow semantic
versioning and are documented in release notes and upgrade instructions.

## 1. International foundation and remaining work

Implemented foundations include:

- [x] German and English UI, browser-language detection, English fallback, and
      locale-aware display formatting.
- [x] Explicit installation working timezone and independently configured kiosk
      display timezone, with UTC as the neutral deployment default.
- [x] Optional holiday calendars and custom dates; German regional calendars
      remain presets rather than defaults selected by language.
- [x] Configurable break thresholds and deductions, without imposing an
      automatic break policy on newly created schedules.
- [x] Explicit leave allowances and working-day masks, with no assumed annual
      leave entitlement for new employee records.
- [x] Preservation of existing calendars/schedules and stored break evidence.
- [x] Effective-dated personal policies and yearly leave information for Solo,
      including accounting boundaries during mode transitions.

Remaining internationalisation work:

- [ ] Multiple simultaneous employee/workspace working timezones. The current
      API uses one installation timezone for working-day and schedule boundaries.
- [ ] Maintained regional calendar imports/updates with visible coverage years;
      custom date lists require operators to maintain the periods in use.
- [ ] Additional UI languages, configurable regional week-start preferences, and
      an English equivalent of the German iPad operations guide.
- [ ] Broader effective-dated Team schedule and leave-policy administration,
      beyond existing break snapshots and the new Solo policy versions.
- [ ] Currency, address, tax, and invoice-format settings independent of UI
      language, as part of a future billing feature.

## 2. Solo and Team in 2.0.0

[The Solo guide](docs/SOLO_MODE.md) documents the shipped personal workflow.
[The Team guide](docs/TEAM_MODE.md) explains organisation setup and daily use.

- [x] Explicit first-owner bootstrap, authenticated setup, profile/password
      management, and local recovery of an existing active Solo owner.
- [x] Personal Overview, Times, Calendar, Customers, Projects, Reports, and
      Settings navigation without Team approval or terminal screens.
- [x] Live timer, manual intervals, direct reasoned corrections/cancellations,
      splitting, running project changes, revisions, and audit history.
- [x] Optional targets, leave accounting, holiday dates, break rules, personal
      time-window hints, daily blocks, and GPS.
- [x] Customer/internal projects, service orders, planned-hour budgets, billable
      classification, private notes, and protected archive/delete operations.
- [x] Owner reports with period/allocation filters, gross/break/net/billable-net
      distinctions, CSV output, and browser print/PDF.
- [x] Guarded mode previews and explicit transitions preserving history and
      defining accounting-effective dates.
- [x] Existing Team workflows retained, with existing installations remaining
      Team after upgrade.
- [x] Automated domain/API/UI regression coverage and local Docker acceptance
      work. Browser file/print handoffs and operator-specific rules still require
      validation in the actual deployment; see release notes for scope.

Follow-up work, not part of this release:

- [ ] Shared Team customer management and billable reporting beyond the current
      Solo-only screens, with explicit billing permissions.
- [ ] Invitations and guided onboarding of additional team members. Team
      currently uses administrator-created employee accounts.
- [ ] Rate management and invoice linking, delivered with the billing foundation.
- [ ] Further device/PWA coverage and any additional export delivery formats.
      Online-first operation is the current contract, not an offline write queue.

## 3. QR/PIN tablet terminals in 2.1.0

The PIN increment of [issue #33](https://github.com/patrickschiller/openclockwork/issues/33)
is implemented and locally accepted on 11 October 2026. It is available in Team
mode; Solo does not expose terminal authentication or booking.

- [x] Per-terminal QR, PIN, or combined authentication, preserving QR-only
      configuration for existing terminals after an upgrade.
- [x] Personal number and a separate eight-digit terminal PIN; HR generation
      with one-time display, replacement, disabling, and unlocking.
- [x] Short-lived device-bound permission after identification, followed by an
      explicit clock-in/out action without an employee session on the kiosk.
- [x] Shared attempt limits, credential/configuration revocation, transactional
      duplicate protection, and safe retries of an unconfirmed booking.
- [x] German/English kiosk and HR interfaces, personal-data cleanup, online-only
      booking, and optional server-validated geofencing.
- [x] HR authentication audit, restricted runtime database rights, signed event
      chain, and export/verification tools for independent archive anchors.
- [x] Forward-only migration, QR/PIN and access-control regression tests, local
      Docker verification, and operator documentation.

See [release notes](RELEASE_NOTES.md) for validation and
[PIN operations](docs/TERMINAL_AUTH_OPERATIONS.de.md) for deployment requirements.
Local acceptance does not configure a production archive or certify every
tablet/browser combination. Operators validate their devices, GPS requirements,
sleep/resume behaviour, and independently managed archive and retention setup.

## 4. Optional RFID terminal extension

RFID remains the separate, unimplemented increment B of issue #33. No particular
reader is required by the PIN release. Future reader support must be tested with
the devices and badges chosen by the operator.

- [ ] Keyboard-wedge reader support through an explicit scan dialog, with a
      configurable manual submit or reader-Enter submit mode per terminal.
- [ ] Card enrolment, replacement, revocation, and transfer with HR permissions,
      protected card identifiers, and authentication audit coverage.
- [ ] RFID identification using the same limited booking permission and separate
      explicit clock-in/out confirmation; a scan never clocks time automatically.
- [ ] Reader format/focus validation, real-device acceptance, operational guidance,
      and QR/PIN regression coverage.

RFID work can proceed independently of the billing roadmap. PIN acceptance does
not mark the remaining RFID scope of issue #33 as completed.

## 5. Customer billing and invoice creation

Invoices should be available in both Solo and Team mode, using the same customer,
project, permission, and audit model.

- [ ] **Billing profiles:** issuer and customer details, addresses, tax identifiers,
      invoice language, ISO currency, payment terms, payment instructions, and
      jurisdiction-specific invoice/tax settings. Do not assume German addresses,
      EUR, a particular tax rate, or a single national invoice format.
- [ ] **Rates and charge rules:** customer/project/service-order rates, hourly and
      fixed-fee lines, discounts, expenses, rounding, and effective dates. Preserve
      rate/currency snapshots and use decimal arithmetic for money.
- [ ] **From work to invoice:** select reviewed billable entries by customer and
      period, preview descriptions/quantities/rates, add manual lines, and attach an
      activity report. Track uninvoiced, reserved-for-draft, and invoiced work so the
      same entry cannot be charged twice.
- [ ] **Invoice lifecycle:** draft, review, issue with a unique configured number,
      due dates, payment status including partial payments, and overdue overview.
      Issued invoices retain their original contents; corrections and credits link
      to the affected invoice and keep their own history.
- [ ] **Documents and exchange:** printable/downloadable PDF, CSV/accounting
      export, and documented APIs. Add jurisdiction-specific structured invoice
      formats through explicit adapters and validation. Sending invoices or payment
      reminders requires a deliberate action or configured automation.
- [ ] **Permissions and data:** authorised billing roles, customer separation,
      backups and retention for documents, and an auditable connection from every
      invoice line to its time entries or other evidence.
- [ ] **Acceptance coverage:** tracked work → draft → issued document → payment
      or correction; rate changes, decimal rounding, currencies, access boundaries,
      and duplicate-invoicing prevention.

**Done when:** a Solo owner or authorised team member can create a reproducible
customer invoice from tracked work and follow it through payment or correction.

## 6. CAUR coding-agent usage accounting

[CAUR — Coding Agent Usage Record](https://github.com/patrickschiller/caur)
defines a vendor-neutral usage record for a completed or interrupted coding-agent
run. It is a separate specification project, not an invoice format or pricing
catalogue, and is not imported by OpenClockwork 2.2.0. A future integration should
consume explicitly supported schema versions and provide attribution, review,
and billing around them. Its design should follow the
[CAUR specification](https://github.com/patrickschiller/caur/blob/main/SPEC.md)
and [JSON Schema](https://github.com/patrickschiller/caur/blob/main/schema/caur-v0.1.schema.json).

- [ ] **Ingestion:** validated file import and authenticated API ingestion, explicit
      supported schema versions, import diagnostics, and deduplication by `record_id`.
      Preserve original immutable records; corrections use new records linked by
      `supersedes`, with review of their impact on previously billed work.
- [ ] **Attribution:** assign each run/session to a workspace, customer, project,
      service order, and responsible person. Retain producer/harness versions, run
      identity, parent-run relationships, outcomes, and optional external trace
      references without importing trace payloads.
- [ ] **Measured usage:** preserve per-request provider/model identity, requested
      aliases, input/output/cache/reasoning token quantities, tool aggregates, and
      measurement provenance. Keep estimates visibly marked and missing quantities
      unknown. Reconcile equivalent measurements using CAUR's source precedence
      rather than adding them together.
- [ ] **Time and nested agents:** distinguish wall time, active/model/tool time,
      approval waits, and queue time. Overlapping intervals are unions, not sums;
      never blindly add child durations to parent time or child usage to an existing
      roll-up. Reject or flag records that cannot support a reproducible aggregation.
- [ ] **Cost evidence:** preserve list, contract, and effective cost interpretations,
      decimal amount strings, ISO currencies, measurement sources, and price
      references/versions. A supplied cost is evidence, not automatically a verified
      payable amount. Keep currencies separate until an explicit, recorded conversion.
- [ ] **Privacy:** store no prompts, responses, source code, patches, tool arguments,
      tool output, environment variables, or credentials. Minimise identities and
      protect accounting records with appropriate access, export, and retention rules.
      Ignore unknown extensions in calculations and enforce the same privacy boundary
      for any stored extension data.
- [ ] **Acceptance coverage:** duplicate delivery, out-of-order replacements,
      parallel/nested agents, mixed measured/estimated data, unknown quantities,
      failed/cancelled/timed-out runs, currency separation, and privacy violations.

**Done when:** records from independent agent harnesses can be imported, attributed,
and reviewed with reproducible totals and no duplicated usage or sensitive payloads.

## 7. Agent billing and combined invoices

- [ ] **Commercial rules:** explicitly configure whether to pass through verified
      costs, apply a markup, bill usage units or agent time, or use an agreed fixed
      fee. Separate actual resource cost, the customer's price, and human tracked
      time. Define how failures, retries, waits, and estimates affect billability.
- [ ] **Review and budgets:** show agent usage and costs by customer/project/run,
      budget progress, unresolved attribution, missing pricing, and estimates before
      charges are approved for invoicing. Unknown cost must not silently become zero.
- [ ] **Invoice integration:** combine human services and separately identifiable
      agent charges on one customer invoice, with clear units, quantities, rates,
      currencies, and optional usage evidence. Preserve links to contributing CAUR
      record IDs and the exact pricing/billing rule version.
- [ ] **Corrections and reconciliation:** prevent repeated imports or replacement
      records from generating duplicate charges. Reconcile usage totals with cost
      evidence; post-issue changes create explicit adjustments or credits instead of
      rewriting issued invoices.
- [ ] **Acceptance coverage:** customer/project → human work + agent runs → reviewed
      charges → invoice → payment/correction, including a nested-agent example and a
      corrected CAUR record that arrives after invoicing.

**Done when:** human work and coding-agent usage can be billed together with a
clear, reproducible trail from invoice line to source record and agreed price.

## Contributing and priorities

Delivery should remain incremental: focused domain tests, API/client consistency,
forward-only migrations, and upgrade verification for existing installations.
Proposals and implementation feedback are welcome through
[GitHub issues](https://github.com/patrickschiller/openclockwork/issues).
Contributions follow [CONTRIBUTING.md](CONTRIBUTING.md), including DCO sign-off.
