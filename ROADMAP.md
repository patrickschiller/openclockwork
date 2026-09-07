# OpenClockwork Roadmap

OpenClockwork is evolving from team time and attendance into a self-hosted
workspace for personal work, customer billing, and coding-agent usage accounting.
The project remains public and Apache-2.0 licensed.

This roadmap describes intended scope and delivery order, not a release-date
commitment. **Solo mode, invoice creation, and CAUR integration are planned and
are not implemented yet.** See [FEATURES.md](FEATURES.md) for the current
application and [README.md](README.md) for installation.

## Delivery order

| Stage | Scope                                        | Status / dependency                            |
| ----- | -------------------------------------------- | ---------------------------------------------- |
| 1     | Country-neutral configuration and defaults   | Included in v1.4.0                             |
| 2     | Complete Solo mode                           | Planned; builds on stage 1                     |
| 3     | Customer billing and invoice creation        | Planned; available to Solo and team workspaces |
| 4     | CAUR usage import, attribution, and review   | Planned; can progress alongside stage 3        |
| 5     | Agent billing and combined customer invoices | Planned; requires stages 3 and 4               |

## 1. Country-neutral foundation

The application must not infer a country's work rules from the user's language.
The initial foundation includes:

- English and German UI, browser-language detection, English fallback, and
  regional date formatting.
- Explicit installation and terminal timezones, with UTC as the neutral
  deployment fallback.
- Optional holiday calendars and custom holiday dates for national, regional,
  and company calendars. Existing German state calendars remain optional presets.
- Configurable schedule break thresholds and deductions, without automatically
  imposing the previous German policy on new schedules.
- Explicit leave allowances and working-day masks. New employee forms and
  bootstrap no longer assume a 30-day entitlement.
- Forward migration of existing calendars and schedules, plus stored break
  policy snapshots so later policy edits do not rewrite historical deductions.

Further internationalisation work remains planned:

- [ ] Per-workspace and per-employee working timezones, including midnight,
      daylight-saving changes, overnight shifts, and cross-zone reporting. The
      current API uses one deployment timezone for day and schedule boundaries.
- [ ] Reusable, maintained regional calendars with import/update workflows and
      visible coverage years; custom date lists currently require each year's dates.
- [ ] Additional UI translations, regional week-start and number preferences,
      and an English equivalent of the German iPad operations guide.
- [ ] Versioned schedule/leave policies where effective dates are needed for
      historical target hours and leave calculations, beyond break snapshots.
- [ ] Currency, address, tax, and invoice-format settings selected independently
      from language as part of billing. No country-wide compliance claim is implied.

## 2. Complete Solo mode

Solo mode is a first-class workflow for freelancers, independent consultants,
and people tracking their own work. It must work without creating a fictional
manager, HR department, or employee approval chain.

- [ ] **Setup and identity:** choose Solo or Team during setup; create one owner
      account and a personal workspace with timezone, language, working days, optional
      weekly target, holidays, and optional leave tracking. Reuse secure login,
      password management, backup, and self-hosting workflows.
- [ ] **Focused navigation:** a personal dashboard, timer/bookings, calendar,
      customers, projects, reports, and settings. Show billing and agent usage when
      those capabilities become available. Team administration, substitutes, approval
      inboxes, and kiosk setup should not be required in the Solo workflow.
- [ ] **Time capture:** start/stop a timer, add and correct manual entries, split
      work between projects, edit activity descriptions, and review daily/weekly
      totals. Keep the mobile PWA experience. GPS and the existing daily-target block
      remain optional and explicitly configured.
- [ ] **Personal policies:** optional work targets, break deduction, time-off and
      overtime tracking; support working without attendance obligations or a fixed
      schedule. Use direct owner actions for personal bookings and corrections,
      preserving an audit history without routing them through employee approvals.
- [ ] **Customer and project work:** customer records, projects/service orders,
      billable versus non-billable entries, estimates/budgets, and customer-facing
      activity descriptions. Rates will feed the shared invoicing foundation.
- [ ] **Reports and exports:** personal productivity and project totals, customer
      timesheets, period filters, and exportable billing evidence. Distinguish raw
      tracked time, deductible breaks, and billable time.
- [ ] **Transition to a team:** invite additional people and enable Team mode
      without losing customers, projects, bookings, settings, or invoice references.
      Map the Solo owner to an explicit administrative role; define who can see and
      approve existing records. Returning to Solo must require resolving active team
      members and pending workflows first.
- [ ] **Acceptance coverage:** complete setup → track work → assign to a customer
      → review/export flow in both UI languages, optional-policy behaviour, owner
      access boundaries, and migration of an existing one-person installation.

**Done when:** one person can operate the application end to end without an HR
workflow, and can later enable team collaboration while preserving their data.

## 3. Customer billing and invoice creation

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

## 4. CAUR coding-agent usage accounting

[CAUR — Coding Agent Usage Record](https://github.com/patrickschiller/caur)
defines a vendor-neutral usage record for a completed or interrupted coding-agent
run. It is currently a **v0.1 draft**, not an invoice format or pricing catalogue.
OpenClockwork will consume these records and provide attribution, review, and
billing around them. The integration must follow the
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

## 5. Agent billing and combined invoices

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
