# OpenClockwork Features

OpenClockwork is a mobile-first, self-hostable time-and-attendance system for
small and mid-sized organisations. Its domain model focuses on German
working-time workflows while keeping deployment and integration under the
operator's control.

> **Project status:** Alpha. The capabilities below are implemented, but APIs,
> schemas, and user flows may still change before the first stable release.

## Mobile PWA

The responsive web application can be installed as a Progressive Web App and
provides role-aware navigation for employees, managers, and HR administrators.

<p align="center">
  <img src="assets/screenshots/mobile/dashboard.jpg" alt="Mobile dashboard" width="30%">
  <img src="assets/screenshots/mobile/booking.jpg" alt="Mobile booking view" width="30%">
  <img src="assets/screenshots/mobile/calendar.jpg" alt="Mobile annual calendar" width="30%">
</p>

<p align="center">
  <img src="assets/screenshots/mobile/requests.jpg" alt="Mobile request overview" width="30%">
  <img src="assets/screenshots/mobile/vacation-request.jpg" alt="Mobile vacation request form" width="30%">
</p>

## Employee Experience

| Capability                 | What it provides                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| Personal dashboard         | Vacation balance, overtime account, and detected core-time violations at a glance             |
| Clock in and out           | PWA-based time booking with optional GPS coordinates and recent-booking history               |
| Automatic break accounting | Statutory break deduction after six and nine hours                                            |
| Time accounts              | Calculated target hours, actual hours, overtime, and opening balances                         |
| Annual calendar            | Year overview for vacation, home office, special leave, sickness, training, and flextime days |
| Requests                   | Vacation, home-office, special-leave, and time-adjustment requests                            |
| Half-day vacation          | First-day and last-day half-day selection with calculated leave usage                         |
| Vacation balance preview   | Available, approved, and submitted leave shown while creating a request                       |
| Request lifecycle          | View requests, workflow state, decisions, and cancellation state                              |
| Substitute inbox           | Accept or decline requests when named as a substitute                                         |
| Absence records            | Record sickness, training, and flextime days                                                  |
| Theme preference           | Light, dark, or operating-system theme                                                        |

## Approval Workflows

OpenClockwork models approvals as explicit workflow states instead of a single
approved/rejected flag.

```text
Employee submits
  -> optional substitute confirmation
  -> manager approval
  -> optional HR confirmation
  -> approved
```

- Manager and HR approval inboxes
- Substitute acceptance and rejection
- Manager approval, rejection, and return-for-correction
- HR confirmation and rejection
- Bulk approval and rejection
- Request cancellation
- Audit trail of workflow events
- Special approval flag for bookings and time adjustments outside configured
  working frames
- Request attachments with local-filesystem or Azure Blob storage adapters

## HR and Administration

| Capability             | What it provides                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------- |
| Employee management    | Create, edit, deactivate, reactivate, and reset employee passwords                  |
| Roles                  | Employee, Manager, and HRAdmin access levels                                        |
| Time models            | Full-time, part-time, trust-based working time, and flextime                        |
| Work schedules         | Configurable working days, permitted booking frames, and multiple core-time windows |
| Schedule assignment    | Assign schedules to individual employees or bulk-assign by time model               |
| Leave allowances       | Base leave, carry-over, adjustments, expiry dates, and adjustment reasons           |
| German public holidays | Configurable German-state holiday calendars used in vacation calculations           |
| Absence administration | Record and review sickness, training, and flextime entries for employees            |
| Approval operations    | Role-aware manager and HR inboxes with bulk actions and audit history               |

## Compliance-Oriented Domain Logic

OpenClockwork makes working-time rules visible in code and testable as domain
logic. It is not a substitute for legal advice or organisation-specific policy
configuration.

- Statutory break calculation
- Target-versus-actual hour accounting
- Configurable working days and core-time windows
- Detection of core-time violations
- Special approval handling for out-of-frame bookings
- Vacation calculation using working days and public holidays
- Carry-over expiry processing
- Multi-stage approval workflows

## API and Integrations

- REST API implemented with NestJS
- Generated OpenAPI specification
- JWT access and refresh authentication
- Role-based endpoint protection
- Authenticated Socket.IO events for real-time client refreshes
- API-key-protected, paginated ERP time-entry export
- Pluggable attachment storage
- Health endpoint

## Self-Hosting and Operations

- Dockerfiles for API and web applications
- Docker Compose configurations for local development and self-hosting
- PostgreSQL with versioned Prisma migrations
- Seed data for local evaluation
- Generic Azure Bicep reference infrastructure
- Azure Key Vault and managed-identity integration
- Azure Blob Storage support for attachments
- Nx workspace with lint, type-check, build, unit, integration, and browser
  test targets

## Current Limitations

- OpenClockwork is in alpha and is not yet recommended for production use.
- There is no hosted public demo or stable release yet.
- Public APIs and database schemas may change before `0.1.0`.
- Organisation-specific labour agreements and payroll integrations require
  validation and potentially customisation.

## Explore the Project

- [Set up a local development environment](README.md#getting-started-development)
- [Contribute to OpenClockwork](CONTRIBUTING.md)
- [Review the security policy](SECURITY.md)
- [Inspect the generated OpenAPI specification](apps/api/openapi.json)
