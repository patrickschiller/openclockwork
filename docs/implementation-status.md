# Implementation status

## Update 2026-06-10 — Epic 5: project time tracking

[`docs/plans/epic-5-projekte.md`](./plans/epic-5-projekte.md) is implemented
end-to-end (spec section added to `base-instructions.md`):

- **Schema** — `Project`, `ServiceOrder`, `ProjectAssignment`, nullable
  `TimeEntry.projectId` (`onDelete: Restrict`); migration
  `20260609211423_add_projects`; seed ships three projects with service
  orders and matrix assignments.
- **API** — new `projects` module (CRUD + service orders + idempotent
  assignment endpoints + `bookable`/`assignments` reads, mutations guarded
  `Manager`/`HRAdmin`); clock-in accepts an optional `projectId` (hard
  assignment check: 404/400/403); `PATCH /timeentries/:id` and
  `POST /timeentries/:id/split` (JWT, owner-or-admin, Approved entries
  locked, per-segment `requiresSpecialApproval` recompute); ERP export
  carries `projectCode`/`projectName`.
- **Web** — `AdminProjectsPage` (`/admin/projects`, Manager + HRAdmin) with
  project cards, inline service-order management, and the employee×project
  assignment matrix; BookingPage gained the project selector, project
  badges, and "Projekt zuordnen"/"Aufteilen" dialogs; realtime invalidation
  for `project:changed`.
- **Tests** — `projects.e2e.spec.ts` + `time-entry-projects.e2e.spec.ts`
  (split semantics incl. boundaries, status recompute, GPS retention),
  extended ERP export spec, `AdminProjectsPage.spec.tsx`, extended
  `BookingPage.spec.tsx`. OpenAPI artifacts regenerated.

Known gap carried over: `clock-in`/`clock-out` remain unguarded (the
project check there is a business rule, not access control) — general
TimeEntries hardening is still the open follow-up below.

---

## Update 2026-05-19 — all four epics functionally complete

All four epic plans under [`docs/plans/`](./plans/) are implemented. The
checkboxes in those files were reconciled against the real code state on
2026-05-19 (they had drifted — they still showed the pre-implementation
snapshot). The application runs as a live Azure Container Apps
deployment with the full domain feature set.

Landed since the 2026-05-10 snapshot below:

- **Auth hardening** — Socket.IO gateway now verifies the JWT on the
  handshake and rejects tokenless connections.
- **Vacation extras (Epic 4 / AP 4.7)** — half-day requests,
  per-Bundesland holiday provider, carry-over expiry, employee CRUD.
- **Deployment** — `Dockerfile.api` / `Dockerfile.web`,
  `docker-compose.prod.yml`, and an Azure reference (`infra/azure/`,
  Bicep) with a `deploy-azure` GitHub Actions pipeline (build → push →
  migrate → roll) and a post-deploy Lighthouse audit.
- **Server timezone** — the API runs in `Europe/Berlin` so core-time
  and off-hours reasoning is wall-clock-correct.
- **Theme** — per-profile light/dark/system preference.
- **Bug fixes** — overtime excludes the in-progress day; core-time
  violations are assessed only retroactively; an approved
  `TimeAdjustment` now materialises a real `TimeEntry`.

### Genuinely open follow-ups (not blocking)

- **OpenAPI contract-drift CI gate** — `generate:api` / `verify:api`
  scripts exist and `apps/web/src/api/generated.ts` is produced, but
  CI does not run `verify:api` and `client.ts` is still hand-typed.
  (Epic 2 / AP 2.8, Epic 3 / AP 3.2.)
- **NRW holiday markers in the year calendar** — `holidaysFor()` is
  available in `libs/shared`; `CalendarPage` does not yet render it.
  (Epic 3 / AP 3.5.)
- **Email / Teams notifications** — `RequestNotificationService` logs
  + broadcasts the socket event only; a real delivery adapter is
  future work (always scoped as a stub in the plans).

---

# Implementation status (2026-05-10)

> Historical snapshot. Superseded by the 2026-05-19 update above — kept
> for the run instructions and the record of the autonomous pass.

This is a snapshot of what landed in the autonomous implementation pass and what's
explicitly still open. The four epic plans under [`docs/plans/`](./plans/) remain
the binding reference; the checkboxes there have been updated to match the state
described here.

## Run instructions

```bash
# 1. install dependencies
pnpm install

# 2. start the local PostgreSQL (Docker required)
pnpm db:up

# 3. apply the migration and seed users + sample data
pnpm db:migrate
pnpm db:seed

# 4. start the API and the web client (parallel)
pnpm nx serve api      # http://localhost:3000/api  (Swagger at /api/docs)
pnpm nx dev web        # http://localhost:4200

# 5. log in
#    Default seed users:
#      hannah.roth@openclockwork.test     (HRAdmin)
#      marc.becker@openclockwork.test     (Manager)
#      stefanie.weiss@openclockwork.test  (Manager)
#      anna.muller@openclockwork.test     (Employee)  + 5 more
#    Default password for everyone: openclockwork
```

Quality gates that pass locally: `pnpm lint`, `pnpm typecheck`, `pnpm test`,
`pnpm build`. Domain test count: **38 Vitest specs** in `libs/shared` plus a
smoke test for the React app.

---

## Done

### Workspace & schema

- `prisma/schema.prisma` harmonised (`adjustmentDays`/`adjustmentReason`/
  `carryOverExpiresOn` on `EmployeeLeaveAllowance`, `passwordHash` on `Employee`,
  `accuracyMeters`/`requiresApproval` on `TimeEntry`, `approverId`/`decidedAt`/
  `decisionNote` on `Request`, `Submitted` added to `WorkflowState`).
- First migration `prisma/migrations/0001_init/migration.sql` (177 lines, generated
  via `prisma migrate diff`) plus `migration_lock.toml`.
- `prisma/seed.ts` (idempotent — 9 employees, current-year leave allowances, 5 sample
  time entries for "Anna"). Bcrypt-hashed default password.
- Workspace switched to `swc-loader` for the API build (works around `tsc`'s rootDir
  issues with cross-project imports). `nx.json` gets `sync.applyChanges: true`.

### libs/shared (pure domain)

- `work-time/breaks.ts` — `calculateBreakMinutes`, `calculateNetMinutes`, `summarize`.
- `work-time/core-time.ts` — `detectViolations` with configurable `CoreTimeRule` (default 09:00–15:00).
- `workflow/request-rules.ts` — `requiresSpecialApproval` (07:00 / 23:00 + midnight crossing).
- `workflow/vacation-workflow.ts` — pure state machine `nextState(state, event, ctx)` with `InvalidWorkflowTransitionError`, plus `isFinal` and `deriveStatus`.
- `vacation/holidays.ts` — Anonymous Gregorian Easter algorithm + 11 NRW holidays per year, `HolidayProvider` interface, `NrwHolidayProvider`.
- `vacation/leave-calculator.ts` — `calculateWorkingDays(from, to, provider)`, `isWeekend`.
- 38 Vitest specs covering all of the above.

### NestJS API (`apps/api`)

- Bootstrap: `ConfigModule.forRoot({ isGlobal: true })`, global `ValidationPipe` (whitelist + transform), CORS from `API_CORS_ORIGINS`, Swagger at `/api/docs`, listens on `API_PORT`.
- `PrismaModule` + `PrismaService` (global, `onModuleInit/$connect`).
- `HealthModule` — `GET /api/health`.
- `AuthModule` — `POST /api/auth/login` (bcrypt + JWT 12 h), `GET /api/auth/me`, `JwtStrategy`, `JwtAuthGuard`, `RolesGuard`, `@Roles()` decorator, `@CurrentUser()` decorator.
- `EmployeesModule` — `GET /api/employees`, `GET /api/employees/:id`.
- `TimeEntriesModule` — `GET /api/timeentries`, `POST /api/timeentries/clock-in` (with optional GPS + accuracy + open-session conflict), `POST /api/timeentries/clock-out` (sets `requiresApproval` via `requiresSpecialApproval`).
- `LeaveAllowancesModule` — `GET /api/employees/:id/leave-allowances`, `PUT /api/employees/:id/leave-allowances/:year` (HRAdmin-guarded).
- `AccountsModule` — `GET /api/accounts/:id` (overtime + vacation summary, on-the-fly), `GET /api/accounts/:id/vacation` (detailed balance via `VacationBalanceService`).
- `RequestsModule` with the full vacation workflow:
  - `GET /api/requests` (filterable by `employeeId`, `status`, `workflowState`, `currentApproverId`, `substituteId`)
  - `GET /api/requests/:id`, `GET /api/requests/:id/events`
  - `POST /api/requests` (generic for non-Vacation), `POST /api/requests/vacation` (with leave-balance check, returns 409 if insufficient)
  - `POST /api/requests/:id/approve` and `/reject` (legacy generic path)
  - `POST /api/requests/:id/manager-approve` (with `requiresHrConfirmation` flag), `/manager-reject`
  - `POST /api/requests/:id/hr-confirm`, `/hr-reject`
  - `POST /api/requests/:id/substitute/accept`, `/substitute/decline`
  - `POST /api/requests/:id/return` (manager → Draft)
  - `POST /api/requests/:id/cancel` (employee or HR/Manager)
  - Every transition writes a `RequestEvent` row (append-only audit) inside a Prisma transaction.
- `ViolationsModule` — `GET /api/violations` (uses `detectViolations`; skips Vertrauensarbeitszeit).
- `ErpExportModule` — `GET /api/erp/timeentries` with `X-Api-Key` guard, paginated, only `Approved` entries with `clockOut`.
- `EventsGateway` (Socket.IO) — broadcasts `request:transitioned`, `time-entry:created`, `time-entry:updated`. CORS open for the local Vite proxy.
- `NotificationsModule` — `RequestNotificationService` logs every transition and emits the socket event (real email/Teams adapter is the open follow-up).

### Web client (`apps/web`)

- `AuthProvider` + `useAuth/useCurrentUser` (replaces the old `CurrentEmployee` picker). Token + user in `localStorage`, fetch wrapper auto-injects `Authorization: Bearer …`.
- `LoginPage` (Tailwind + shadcn `Card`/`Input`/`Button`/`Alert`).
- `AppShell`: same sidebar/topbar/bottom-nav as before, but the topbar now shows the logged-in employee with a logout entry; subscribes to Socket.IO via `useRealtimeInvalidation()` and invalidates the right TanStack Query caches on each event.
- Real pages (no more `PlaceholderPage` for the main routes):
  - `DashboardPage` — KPIs (Resturlaub / Überstundenkonto / YTD-Kernzeitverletzungen), violation banner, "Aktuelle Buchung" card, "Offene Anträge" list.
  - `BookingPage` — Kommen / Gehen with optional GPS, off-hours warning, last-20 entries with break + net summary.
  - `RequestsPage` — list + new-request `Dialog`; Vacation variant shows live balance from `vacationBalance(year)` and disables submit when remaining < 1 day; sub­stitute picker (excludes self); off-hours warning for `TimeAdjustment`.
  - `CalendarPage` — 12-month grid, color-coded per `RequestType`, dashed outline for not-yet-approved entries, year navigation.
  - `AdminRequestsPage` — Manager/HR-only: inbox filtered by `currentApproverId`/`PendingHr`, Approve/Reject/Return-for-revision actions, `requiresHrConfirmation` checkbox, audit `Sheet` drawer with `getRequestEvents`.
  - `SubstitutePage` — inbox of `PendingSubstitute` requests where the user is `substituteId`, accept/decline (decline requires note).
- `index.html` rewritten with proper title, theme-color, manifest link, SVG icon.
- `vite-plugin-pwa` wired (autoUpdate, manifest, navigation fallback denylist for `/api` and `/socket.io`). `apps/web/public/icon.svg` ships as a maskable scalable icon.

---

## Open / explicitly skipped

### User-requested skips (per the implementation prompt)

- **GitHub Actions** — no CI workflow changes in this pass. Existing `.github/workflows/ci.yml` and `dco.yml` were not touched.
- **Azure resources / deployment** — no infra. `docs/azure-setup.md` from the pre-pivot world is not coming back; the deployment story stays cloud-agnostic per `CLAUDE.md`.

### Functional gaps

- **No actual database run** — Docker is not running on this machine, so the migration was generated but not applied, and the seeder was not executed. First-time setup will reveal whether Postgres accepts the SQL exactly as written. Likely fine (it's pure `prisma migrate diff` output) but unverified.
- **Socket.IO handshake auth** — `EventsGateway` accepts any connection. JWT-based handshake is the next-step hardening (planned in Epic 2 / AP 2.7).
- **Vacation workflow `Submitted` state vs auto-advance** — current creation jumps straight to `PendingSubstitute`/`PendingManager`. The `Submitted` enum value is reserved but not currently used at runtime; could become useful if we later add a "save as draft → explicit submit" UI step.
- **Email / Teams notifications** — `RequestNotificationService` only logs and broadcasts. Adapter implementations are out of scope for this pass.
- **Bulk-approve, employee CRUD** — listed in Epic 3 / AP 3.7 as nice-to-have; not built.
- **Half-day vacations**, **configurable holiday provider**, **carry-over expiry job** — Epic 4 / AP 4.7 (post-MVP); not built.
- **Lighthouse CI / axe checks** — Epic 3 / AP 3.9 (post-MVP); not wired.
- **OpenAPI codegen for the frontend client** — `apps/web/src/api/client.ts` is still hand-typed against the NestJS surface. The plan recommends `openapi-typescript-codegen` or `orval` once the schema stabilises.

### Tests not yet written

- **API integration tests** (`apps/api-e2e`) for the vacation workflow, ERP export, time entries — would need a running test DB. Domain logic itself is covered by the 38 pure-function specs.
- **Web component/page Vitests** beyond the smoke test — would benefit from a small MSW/handler suite for the hand-typed client.
- **Playwright smoke** — login → buchen → dashboard happy-path, planned but not added.

### Known sharp edges

- **`bcrypt` native binding** — needs Node ≥ 20 with build tools. CI image is fine; on Apple Silicon you may need `pnpm rebuild bcrypt` after `pnpm install` if the prebuilt wheel doesn't match.
- **`swc-loader` for the API** — chosen because `ts-loader` errored on cross-project `import 'shared'` (TS6059, "rootDir"). `swc` is more permissive but does not type-check at build time; type checking happens via `pnpm nx typecheck api`.
- **`socket.io` log noise on startup** — the gateway logs every connect/disconnect at `log` level. Drop to `verbose` once we're confident in the wiring.
