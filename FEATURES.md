# OpenClockwork Features

OpenClockwork is a mobile-first, self-hostable time-and-attendance system for
small and mid-sized organisations. Its domain model focuses on German
working-time workflows while keeping deployment and integration under the
operator's control.

> **Project status:** Beta. The capabilities below are implemented and covered
> by automated tests. APIs, schemas, and user flows may still evolve before the
> first stable release.

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
| Project booking            | Optional project selection when clocking in, limited to active projects assigned to the employee |
| Retroactive project changes | Assign, change, or clear an entry's project after booking; approved entries stay locked       |
| Entry splitting            | Split a closed entry at a chosen time, e.g. when switching projects mid-day                   |
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
| Project management     | Projects structured by service orders, with an active/inactive lifecycle and deletion protection once time is booked |
| Project assignment matrix | Employee-by-project matrix that controls who may book time on each project       |
| Leave allowances       | Base leave, carry-over, adjustments, expiry dates, and adjustment reasons           |
| German public holidays | Configurable German-state holiday calendars used in vacation calculations           |
| Absence administration | Record and review sickness, training, and flextime entries for employees            |
| Approval operations    | Role-aware manager and HR inboxes with bulk actions and audit history               |

## Data Privacy & Security (DSGVO/GDPR)

As a system handling sensitive employee data within the EU, OpenClockwork places
strong emphasis on privacy and security.

- **Data Protection**: User data is stored securely; no external tracking or commercial telemetry is used.
- **Right to Erasure**: Administrators can delete users and their associated data (time entries, requests) while retaining audit logs if required by law.
- **Access Control**: Fine-grained Role-Based Access Control (RBAC) ensures employees only see relevant information.
- **Audit Logs**: All administrative actions (e.g., mass edits, user deletions) are recorded in immutable system logs.
- **Encryption**: Support for HTTPS/TLS and encrypted database connections in production configurations.

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

A robust REST API enables integration with existing ERP or HR systems.

- **Implementation**: NestJS with a Prisma ORM layer.
- **Documentation**: Auto-generated OpenAPI (Swagger) specification included in the repository (`apps/api/openapi.json`).
- **Authentication**: JWT (Access/Refresh token flow) and dedicated API Key support for machine-to-machine integration.
- **Real-time Updates**: Socket.IO endpoints provide real-time notifications for workflow changes (e.g., approved requests).
- **ERP Export**: Paginated, secure export of time data compatible with common payroll systems.

## Self-Hosting and Operations

Designed for operator control, allowing deployment on-premise or in private clouds.

- **Containerization**: Official Dockerfiles for API and Web apps; `docker-compose` stack for quick start.
- **Infrastructure as Code**: Reference Bicep templates for Azure deployment (Kubernetes/Container Apps ready).
- **Database**: PostgreSQL with versioned Prisma migrations. Supports automated backups (via `pg_dump` or volume snapshots).
- **Storage**: Pluggable storage backend (Local disk, S3-compatible, or Azure Blob) for documents and images.
- **Secrets Management**: Integration with environment variables and Azure Key Vault.

## Beta Considerations

- There is currently no hosted public demo or stable release.
- Public APIs and database schemas may still evolve before the first stable
  release.
- Production deployments should validate organisation-specific labour
  agreements, payroll integrations, security requirements, backups, monitoring,
  and operating procedures.

## Explore the Project

- [Set up a local development environment](README.md#getting-started-development)
- [Contribute to OpenClockwork](CONTRIBUTING.md)
- [Review the security policy](SECURITY.md)
- [Inspect the generated OpenAPI specification](apps/api/openapi.json)
