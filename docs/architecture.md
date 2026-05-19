# Architecture & Implementation Guide

This document describes how OpenClockwork is built, the conventions a contributor needs to absorb, and the skill profile that makes mid-stream contribution effective.

It complements three other documents — read them first if you haven't already:

- [`base-instructions.md`](../base-instructions.md) — the German requirements specification. The **what**.
- [`CLAUDE.md`](../CLAUDE.md) — binding stack decisions + working-style notes. The **how**.
- [`README.md`](../README.md) — install + run instructions. The **getting started**.

This file is the **deep-dive** that fills the gap between "I cloned the repo" and "I understand where to put my change."

---

## 1. System overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Browser (PWA, mobile or desktop)                │
│   React 18 · Vite · Tailwind · shadcn/ui · TanStack Query · Socket.IO  │
└──────────────┬───────────────────────────────────────────┬─────────────┘
               │ HTTPS (REST)                              │ WSS
               ▼                                           ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       NestJS API (Node 20, TypeScript)                 │
│  Controllers (thin) → Services → libs/shared (pure domain functions)   │
│  Modules: Auth, Employees, TimeEntries, Requests, Accounts, …          │
│  EventsGateway broadcasts state changes to subscribed clients          │
└──────┬─────────────────────┬───────────────────────────┬──────────────┘
       │ Prisma              │ KeyVault (Azure ref dep)  │ Blob storage
       ▼                     ▼                           ▼ (optional)
   PostgreSQL              Secrets                 Attachments
```

Two binary deployment targets are first-class:

1. **Docker Compose** — single host, one Postgres + api + web container, nginx proxies `/api` and `/socket.io` to the api. See [`docker-compose.prod.yml`](../docker-compose.prod.yml).
2. **Azure Container Apps** — fully Bicep-described in [`infra/azure/`](../infra/azure/README.md), scale-to-zero, OIDC-deployed.

Both run the **same** images built from [`Dockerfile.api`](../Dockerfile.api) and [`Dockerfile.web`](../Dockerfile.web).

---

## 2. Tech stack rationale

These are the choices that constrain everything else. Don't override them lightly.

| Layer | Choice | Rationale |
|---|---|---|
| Monorepo | Nx + pnpm | Two apps (`api`, `web`) + a domain lib (`shared`) need cross-project type checks. Nx caches builds locally; Nx Cloud is disabled to keep the project hostable anywhere. |
| Backend | NestJS 11 | Module + DI conventions match the role-based access model. Decorators (`@Roles`, `@CurrentUser`) keep controllers declarative. |
| DB | Prisma + Postgres 16 | Single source of truth (`prisma/schema.prisma`). Type-safe queries. Migrations are committed and never edited after merge. |
| Frontend | React 18 + Vite + TanStack Query + shadcn/ui | Server-state in React Query (no Redux). Tailwind for styling. Radix-based shadcn primitives stay accessible by default. |
| Realtime | Socket.IO + NestJS gateway | Lower friction than raw WebSocket; rooms + acks come for free. JWT-in-handshake auth is in flight (see §10). |
| PWA | vite-plugin-pwa | Service worker with `autoUpdate`, manifest, navigation fallback denies `/api` + `/socket.io` paths so they bypass the SW. |
| Auth | JWT (access + refresh) | Stateless, easy to forward to mobile, no session store needed. bcrypt (cost 10) for password hashing. |
| Tests | Vitest (web + libs), Jest + supertest (api-e2e), Playwright (web smoke) | Pick the framework with the best DX per layer. |

Anything else (alternate ORM, Redux, an OpenAPI alternative, etc.) needs a written justification in the PR description.

---

## 3. Repository layout (annotated)

```
apps/
  api/                              NestJS application
    src/
      app/                          One folder per feature module
        auth/                       Login, JWT issue, refresh, RolesGuard
        employees/                  CRUD, activate/deactivate, password reset
        time-entries/               Clock-in/out, GPS, off-hours flag
        requests/                   Vacation/HomeOffice/Special/TimeAdjustment workflow
        absences/                   Authoritative absence records
        accounts/                   Overtime + vacation balance aggregation
        leave-allowances/           Per-year vacation quota CRUD + carry-over expiry
        work-schedules/             Frame + core-time windows, bulk assignment
        attachments/                File upload, storage-adapter pattern
        violations/                 Core-time violation read API
        erp/                        Read-only export for payroll, separate API key
        events/                     Socket.IO gateway
        health/                     Liveness/readiness
        prisma/                     PrismaService wrapper (global)
      generate-openapi.ts           Boots Nest, dumps openapi.json
      main.ts                       Bootstrap
    openapi.json                    Committed; used by `pnpm verify:api`
    webpack.config.js               swc-loader (faster than ts-loader for cross-project imports)

  api-e2e/                          Jest + supertest integration tests against a real Postgres
    src/
      support/test-setup.ts         Spins up isolated test DB
      api/*.e2e.spec.ts             One file per feature flow

  web/                              React app (Vite, TypeScript strict)
    src/
      api/
        client.ts                   Hand-typed fetch wrapper, auto-injects Authorization
        generated.ts                Generated from openapi.json (verify in CI)
      app/
        AppShell.tsx                Sidebar + topbar + bottom-nav, current user, logout
        AuthProvider.tsx            Token + employee in localStorage, refresh-on-401
        RealtimeProvider.tsx        Socket.IO connection + cache invalidation
        ProtectedRoute.tsx          Role-gated outlet
      components/                   shadcn/ui primitives + composite components
      routes/                       Page-level components (one per route, see §6)
      hooks/                        useAuth, useRealtimeInvalidation, etc.
      lib/                          Date utils, cn() helper, etc.

  web-e2e/                          Playwright smoke + axe-core a11y

libs/
  shared/                           Pure TypeScript — no I/O, importable everywhere
    src/lib/
      work-time/breaks.ts           §6 ArbZG break deduction (30 min ≥ 6 h, +15 min ≥ 9 h)
      work-time/core-time.ts        Late-arrival / early-departure / mid-day-gap detection
      work-time/overtime.ts         YTD balance: opening + net YTD − soll
      vacation/holidays.ts          Anonymous Gregorian Easter + 16 Bundesländer
      vacation/leave-calculator.ts  Working-day counting incl. half-day flags
      workflow/request-rules.ts     07:00 / 23:00 threshold + midnight crossing
      workflow/vacation-workflow.ts Pure state machine (8 states + transitions)

prisma/
  schema.prisma                     17 models, the canonical schema
  migrations/                       8 numbered migrations, committed, never edited after merge
  seed.ts                           Idempotent seed: 9 employees, 3 schedules, balances, sample bookings

infra/
  azure/                            Bicep templates for the Azure reference deploy
    main.bicep                      Subscription-scoped entry point
    modules/                        UAMI, RG-scoped roles, ACR, KV, Postgres, ACA env + apps + jobs

ops/
  nginx.conf.template               envsubst template for ${API_UPSTREAM}, used by Dockerfile.web

.github/workflows/
  ci.yml                            lint + typecheck + test + build on every PR + push
  dco.yml                           DCO sign-off check on PR commits
  deploy-azure.yml                  build-push → migrate (prisma migrate deploy) → roll (az containerapp update)
  lighthouse.yml                    Audits the deployed URL after deploy-azure success

docs/
  pitch.md                          End-user pitch deck
  architecture.md                   This file
  implementation-status.md          Snapshot of what landed vs. what's open
  plans/                            Per-epic implementation plans with status checkboxes
  adr/0001-azure-hosting.md         Architecture Decision Record for the Azure reference
```

---

## 4. Backend architecture

### Module pattern

Every feature has its own folder under `apps/api/src/app/<feature>/` with three flavours of file:

```
<feature>.module.ts        Wires controllers + providers + imports
<feature>.controller.ts    HTTP routes — thin, 5–20 LOC each
<feature>.service.ts       Business logic — orchestrates Prisma + libs/shared
<feature>.dto.ts           class-validator DTOs for request bodies
<feature>.types.ts         Optional: shared response shapes
```

**Strict rule:** controllers never call Prisma directly. They delegate to services. Services compose Prisma queries + pure functions from `libs/shared`. This makes the domain testable without spinning up Postgres.

### Layering example

The vacation workflow shows the layering at full strength:

```
RequestsController.managerApprove()                         (thin)
  └─→ RequestsService.transitionWith(id, event, actor)      (orchestration)
       ├─→ libs/shared workflow.nextState(current, event)   (pure)
       ├─→ libs/shared deriveStatus(nextState)              (pure)
       ├─→ prisma.$transaction()                            (I/O)
       │    ├─→ prisma.request.update(...)
       │    └─→ prisma.requestEvent.create(...)             (audit log)
       └─→ EventsGateway.emit('request:transitioned', ...)  (realtime)
```

Every transition is wrapped in a Prisma transaction so the audit row and the new state are atomic. The pure `nextState()` throws `InvalidWorkflowTransitionError` for invalid transitions — the service turns that into a 409 `ConflictException`.

### Authentication & authorization

Three independent auth surfaces, by design:

| Surface | Guard | Used by |
|---|---|---|
| User JWT | `JwtAuthGuard` (Passport-JWT strategy) | Web UI + future mobile |
| ERP API key | `ErpApiKeyGuard` (reads `X-Api-Key`, compares to `ERP_API_KEY`) | Payroll / finance integration only |
| Cron API key | `CronKeyGuard` (reads `X-Cron-Key`, compares to `CRON_API_KEY`) | Unattended scheduled jobs (ACA Job, k8s CronJob) |

Roles are checked with the `@Roles('HRAdmin')` decorator + `RolesGuard`. The role list lives on the JWT and is validated against the live employee record on every request — so revoking a role takes effect on the next request without waiting for the token to expire.

Refresh tokens carry a `typ: 'refresh'` claim and a `jti` (unique id) — `POST /api/auth/refresh` rejects access tokens, and a future revocation store can blocklist `jti`s without invalidating every other session.

### Storage adapter pattern

File attachments (Sonderurlaub-Belege, etc.) go through the `StorageAdapter` interface:

```typescript
interface StorageAdapter {
  put(key: string, body: Buffer, mime: string): Promise<{ key: string }>;
  get(key: string): Promise<{ body: Readable; mime: string } | null>;
  delete(key: string): Promise<void>;
}
```

Two implementations live side by side:

- `LocalFsStorageAdapter` writes under `ATTACHMENTS_DIR` (default `data/attachments`). For dev + single-host docker-compose deploys.
- `AzureBlobStorageAdapter` uses `@azure/identity` + `@azure/storage-blob` with `DefaultAzureCredential`, so it transparently picks the User-Assigned Managed Identity in ACA.

The active adapter is selected at module-load via a factory provider that reads `STORAGE_BACKEND`. Adding e.g. an S3 adapter is a 100-line file + one line in the factory.

### Prisma & migrations

- `prisma/schema.prisma` is the only source of truth for the DB. Edit it, then run `pnpm prisma migrate dev --name <descriptive>` locally.
- Migrations are committed under `prisma/migrations/`. **Never edit a migration after merge** — write a follow-up migration if you need a change.
- The api container runs `npx prisma migrate deploy` on every deploy (Docker Compose does it inline; the Azure deploy uses a dedicated ACA Job that runs **before** the new image is rolled).
- `pnpm prisma generate` regenerates `@prisma/client`. Re-run after schema changes; commit the regenerated client if checked-in.

### Realtime gateway

`EventsGateway` lives at `apps/api/src/app/events/events.gateway.ts`. It broadcasts:

- `request:transitioned` — payload `{ requestId, fromState, toState, byEmployeeId }`
- `time-entry:created` — payload `{ id, employeeId, clockIn }`
- `time-entry:updated` — payload `{ id, employeeId, clockIn, clockOut? }`

The web client subscribes via `useRealtimeInvalidation()` and **doesn't apply patches directly** — it just calls `queryClient.invalidateQueries(...)` for the affected query keys. TanStack Query refetches; SWR-style staleness keeps the UI honest without complex local merges.

---

## 5. Frontend architecture

### Routing & shells

`AppShell` wraps every authenticated route with a sidebar (desktop) + bottom-nav (mobile) + topbar (current user, logout). Routes:

| Path | Component | Auth |
|---|---|---|
| `/login` | `LoginPage` | public |
| `/` | `DashboardPage` | any role |
| `/booking` | `BookingPage` | any role |
| `/calendar` | `CalendarPage` | any role |
| `/requests` | `RequestsPage` | any role |
| `/substitute` | `SubstitutePage` | any role (shows entries where you're the substitute) |
| `/absences` | `AbsencesPage` | any role |
| `/admin/requests` | `AdminRequestsPage` | Manager + HRAdmin |
| `/admin/employees` | `AdminEmployeesPage` | HRAdmin |
| `/admin/schedules` | `AdminSchedulesPage` | HRAdmin |

### Server state via TanStack Query

The whole UI uses TanStack Query v5 for server state. Conventions:

- Query keys are arrays of `[domain, id?, params?]`. E.g. `['requests', { employeeId }]`, `['employees', id]`.
- Mutations call the typed client in `apps/web/src/api/client.ts`, then `queryClient.invalidateQueries({ queryKey: [...] })` for affected keys.
- Realtime invalidations (Socket.IO) call the same `invalidateQueries` — no separate "live state" path.
- No Redux, no Zustand, no Jotai. Component-local state via `useState` / `useReducer` only.

### Auth context

`AuthProvider` keeps `{ accessToken, refreshToken, employee }` in `localStorage`. The fetch wrapper:

1. Injects `Authorization: Bearer <accessToken>` on every request.
2. On 401, attempts `POST /api/auth/refresh` once.
3. On refresh failure, clears localStorage and navigates to `/login`.

### shadcn/ui

Components live under `apps/web/src/components/ui/`. Add new ones with the [shadcn CLI](https://ui.shadcn.com/docs/cli) (`npx shadcn add <name>`). They are pure Radix wrappers with Tailwind classes — modify them in place if you need project-specific behaviour, that's the whole point of shadcn (versus a black-box library).

### PWA

`vite-plugin-pwa` runs in `autoUpdate` mode. The service worker:

- Caches hashed JS/CSS/font assets with `cache-first`.
- Lets `/api/*` and `/socket.io/*` bypass the SW (network-first).
- Updates the SW on every page load; clients pick up new versions without explicit prompt.

The manifest declares maskable icons (192/512), `theme_color`, `background_color`, and `display: standalone`. Install prompts are *not* programmatically triggered — let the browser decide.

---

## 6. Domain core (`libs/shared`)

The whole reason this lib exists: **the rules in `base-instructions.md` are the same regardless of language, framework, or transport.** Keeping them in one pure-TypeScript folder means:

- You can unit-test them in milliseconds without Postgres.
- A future React Native app reuses them verbatim.
- A future Rust or Go rewrite of the api can ship the same outputs by porting these functions one-by-one.

| Module | Key exports | What it answers |
|---|---|---|
| `work-time/breaks` | `summarize(clockIn, clockOut)` | "Given Brutto-Zeit, how much is Netto?" |
| `work-time/core-time` | `detectCoreTimeViolationsForDay` | "Did the employee leave the core window?" |
| `work-time/overtime` | `calculateOvertimeMinutes` | "Was ist die YTD-Saldo-Bilanz?" |
| `vacation/holidays` | `holidaysFor(bundesland, year)` | "Was ist ein Feiertag in NW vs BY?" |
| `vacation/leave-calculator` | `calculateWorkingDays(from, to, opts)` | "Wie viele Werktage liegen im Zeitraum?" |
| `workflow/request-rules` | `requiresSpecialApproval(start, end, frame)` | "Liegt die Buchung außerhalb 07–23?" |
| `workflow/vacation-workflow` | `nextState(state, event, ctx)` | "Welche Übergänge sind erlaubt?" |

**Don't** add side-effects (`fetch`, `Date.now()`, `fs`) to this lib — they make it untestable and unfit for future runtime targets. Time-dependent functions take `now` as a parameter.

---

## 7. Data flows (worked examples)

### 7.1 Clock-in

```
Browser POST /api/timeentries/clock-in { employeeId, latitude?, longitude?, accuracy? }
  → JwtAuthGuard validates token
  → TimeEntriesController.clockIn(dto)
  → TimeEntriesService.clockIn(dto)
     ├─ check no open entry for this employee (409 if exists)
     ├─ requiresSpecialApproval() ← libs/shared
     ├─ prisma.timeEntry.create({ data: { ...dto, requiresApproval } })
     └─ EventsGateway.emit('time-entry:created', entry)
  → 201 Created
```

### 7.2 Vacation request (multi-step approval)

```
1. Employee submits:
   POST /api/requests/vacation { employeeId, from, to, substituteId, note }
   → calculateVacationDays() checks balance, 409 if insufficient
   → prisma.$transaction:
        request.create({ state: PendingSubstitute, currentApproverId: substituteId })
        requestEvent.create({ event: SUBMITTED, byEmployeeId: employeeId })
   → emit 'request:transitioned'

2. Substitute accepts:
   POST /api/requests/:id/substitute/accept
   → nextState(PendingSubstitute, SUBSTITUTE_ACCEPTED) → PendingManager
   → tx: update + audit
   → emit

3. Manager approves with HR confirmation:
   POST /api/requests/:id/manager-approve { requiresHrConfirmation: true }
   → nextState(PendingManager, MANAGER_APPROVED, {requiresHrConfirmation:true}) → PendingHr
   → tx: update + audit
   → emit

4. HR confirms:
   POST /api/requests/:id/hr-confirm
   → nextState(PendingHr, HR_CONFIRMED) → Approved
   → tx: update, audit, decrement leave allowance
   → emit
```

The state machine in `libs/shared/workflow/vacation-workflow.ts` is the single source of truth — every guard, controller path, and audit log relies on the same `nextState` function.

### 7.3 ERP export

```
GET /api/erp/timeentries?from=2026-05-01&to=2026-05-31&page=1&pageSize=200
  Header: X-Api-Key: <ERP_API_KEY>
  → ErpApiKeyGuard validates key (no JWT here)
  → ErpController.list(query)
  → ErpService.list(query)
     ├─ prisma.timeEntry.findMany({ where: { status: Approved, clockOut: { gte: from, lte: to } }, skip, take })
     └─ map to ERP DTO (no internal IDs leak)
  → 200 OK { items, total, page, pageSize }
```

Separate guard + separate URL prefix means rotating the ERP key doesn't invalidate user sessions, and a leaked ERP key can't login as anyone.

---

## 8. Deployment

### Docker Compose (single host)

`docker-compose.prod.yml` brings up Postgres + api + web. The api `command` runs `npx prisma migrate deploy && node dist/main.js` on every start (idempotent). Web container's nginx has `${API_UPSTREAM}` defaulting to `http://api:3000`.

### Azure Container Apps (reference)

Documented end-to-end in [`infra/azure/README.md`](../infra/azure/README.md). Quick summary:

1. **Bootstrap** (one-time): create Entra App + SP + federated GitHub OIDC credential, grant Contributor + User Access Administrator at subscription scope.
2. **Bicep deploy**: `az deployment sub create` materializes the RG + ACR + Postgres + KV + Storage + ACA env + UAMI + 4 ACA apps/jobs.
3. **GitHub Action** (`deploy-azure.yml`) on every push to `main`:
   - `build-push`: builds both Docker images, pushes to ACR with the commit sha as tag.
   - `migrate`: pins the migrate ACA Job to the new image, starts it, polls until `Succeeded`. The deploy aborts here if migrations fail.
   - `roll`: `az containerapp update --image` on api + web. ACA does the blue/green flip when the new revision goes healthy.
4. **Lighthouse audit** (`lighthouse.yml`) fires after a successful deploy, against the public web FQDN.

Why **User-Assigned Managed Identity** instead of System-Assigned: role grants need to be applied **before** the container starts (so it can read Key Vault on first revision). System-Assigned identities only exist after the container app is created, causing a chicken-and-egg. The UAMI is created up-front, gets its AcrPull + KV Secrets User + Blob Data Contributor role grants in a separate Bicep module, and is then referenced by every ACA app/job.

---

## 9. Testing strategy

| Layer | Framework | What gets tested |
|---|---|---|
| Domain (`libs/shared`) | Vitest | All pure functions. No mocks needed. ~77 specs. |
| API (`apps/api-e2e`) | Jest + supertest | One spec per business flow against an isolated test DB (`openclockwork_test` on Postgres :5433). ~60 specs. |
| Web (`apps/web`) | Vitest + @testing-library/react | Component smoke tests + AuthProvider behaviour. |
| Web e2e (`apps/web-e2e`) | Playwright + @axe-core/playwright | Browser smoke + accessibility audit. Currently a placeholder; full login→buchen→dashboard flow is a planned addition. |
| Visual / perf | Lighthouse CI | Post-deploy budgets (a11y ≥ 0.9 hard error; perf ≥ 0.7 warn). |

**Rule:** every new endpoint or business rule lands with at least one test. Domain rule → Vitest. API surface → api-e2e. Frontend interaction → Vitest with TanStack Query mock client.

The api project has no `nx test api` target — that's intentional. Unit-testing a Nest service means stubbing Prisma, which is brittle. The api-e2e suite exercises the real path with a real DB.

---

## 10. CI/CD

All workflows live in `.github/workflows/`:

| Workflow | Trigger | What it does |
|---|---|---|
| `ci.yml` | PR + push | lint + typecheck + test + build, all projects in parallel via `nx affected` |
| `dco.yml` | PR | Verifies every commit in the PR is signed off (`Signed-off-by:` trailer) |
| `deploy-azure.yml` | push to main + workflow_dispatch | Build + push images, run migrations, roll the apps |
| `lighthouse.yml` | workflow_run after deploy-azure success | Lighthouse audit against the deployed URL |

Conventional Commits style (`feat:`, `fix:`, `chore:`, `docs:`, etc.) is used but not enforced — keep it readable.

---

## 11. Known gaps & open follow-ups

These are documented here so contributors can find natural starting points:

- **Socket.IO handshake JWT auth** — `EventsGateway` currently accepts any connection. The web client already sends the JWT; the gateway needs to validate it. (~30 min, blockers: nothing.)
- **OpenAPI codegen** — `apps/web/src/api/generated.ts` is hand-typed. Wire `openapi-typescript` into the build, regenerate on api change, fail CI on drift. (~2 h, sees [`docs/plans/epic-3-frontend.md`](./plans/epic-3-frontend.md) §3.7.)
- **Half-day vacations** — datamodel has the flag, no UI exposes it. (~half a day.)
- **Email / Teams notifications** — `RequestNotificationService` logs only. Add an adapter pattern similar to storage. (~1 day per adapter.)
- **Playwright happy-path** — login → buchen → request → approval in one browser flow. (~2 h, depends on having a deterministic test DB.)
- **Custom domain + Let's Encrypt cert** in the Azure reference. (~1 day, needs DNS access.)

If you want to pick one up, open a GitHub issue first so we can talk shape before code.

---

## 12. Contributor skill profile

OpenClockwork is a mid-stack TypeScript project. You don't need expert-level depth in every layer, but you'll be much more productive if you bring the following:

### Required (cannot work effectively without these)

- **TypeScript** at a comfortable level — strict mode is enforced. Discriminated unions, generics, `unknown`-handling are routine.
- **Node.js** ≥ 20 — async/await, ES modules, basic understanding of the npm/pnpm ecosystem.
- **Git** + Conventional Commits — every PR needs DCO sign-off (`git commit -s`).
- **HTTP & REST basics** — you can read an OpenAPI spec and write a curl command.
- **SQL fluency at a basic level** — you don't need to write the migrations by hand (Prisma does it), but you need to read EXPLAIN output and reason about indexes.

### Strongly preferred (you'll spend most of your time in this)

- **NestJS** — module + DI + decorator patterns. The codebase shows the same shape in every feature, so you can absorb it by reading a couple of modules.
- **Prisma ORM** — schema-first thinking, `prisma migrate diff`, relation modelling.
- **React 18** with hooks + TypeScript. Functional components only.
- **TanStack Query v5** — query keys, mutations, cache invalidation. We don't use Redux, so this is where state lives.
- **Tailwind CSS + shadcn/ui** — utility classes and Radix-based primitives.

### Nice to have

- **Vitest + Jest** — test-driving the domain layer is the fastest way to feel productive.
- **Socket.IO** — for the realtime gateway. Light reading covers it.
- **Docker + docker-compose** — for local DB and the production-flavoured stack test.
- **Azure CLI + Bicep** — only if you touch the Azure reference deploy. Most contributors won't need this.
- **GitHub Actions** YAML — only for CI/CD changes.

### Domain familiarity

You don't need to be a German labour lawyer, but you should know:

- **Arbeitszeitgesetz §4** (statutory break deduction) — *why* the magic numbers 6 h / 9 h / 30 min / 45 min are not negotiable.
- The mental model of **Soll vs Ist Stunden**, **Brutto vs Netto Arbeitszeit**, **Urlaubsanspruch**, **Übertrag** — German HR vocabulary.
- The **NRW Bundesland** as default for the holiday calendar; **all 16 Bundesländer** are supported and configurable per employee.

If you're contributing a feature for a non-German jurisdiction, propose the design in a GitHub Discussion first — the holiday provider + workflow are extensible, but the defaults stay German.

### What we don't expect

- A degree in HR systems.
- Deep CI/CD wizardry.
- Comfort with our Claude-based development workflow — humans are equally welcome; the [`CLAUDE.md`](../CLAUDE.md) is an aide-mémoire, not a requirement.

---

## 13. Getting started as a contributor

```bash
# 1. Clone + install
git clone https://github.com/patrickschiller/openclockwork
cd openclockwork
pnpm install

# 2. Start local Postgres in Docker
docker compose up -d db

# 3. Apply migrations + seed
cp .env.example .env
pnpm prisma migrate deploy
pnpm prisma db seed

# 4. Run api + web in parallel
pnpm nx run-many -t serve -p api,web
# → api on http://localhost:3000  (Swagger: /api/docs)
# → web on http://localhost:4200

# 5. Log in
#   hannah.roth@openclockwork.test / openclockwork (HRAdmin)
```

Quality gates (mirror CI):

```bash
pnpm lint              # eslint across all projects
pnpm typecheck         # tsc --noEmit
pnpm test              # Vitest (web + shared) + Jest (api-e2e)
pnpm build             # Webpack (api) + Vite (web) — must pass before push
```

Running a single api-e2e spec:

```bash
pnpm nx e2e api-e2e -- --testPathPattern=vacation-workflow
```

---

## 14. Where to find things

Quick reference index for common questions:

| "Where is …" | File / folder |
|---|---|
| The database schema | `prisma/schema.prisma` |
| Break-deduction logic | `libs/shared/src/lib/work-time/breaks.ts` |
| The vacation state machine | `libs/shared/src/lib/workflow/vacation-workflow.ts` |
| The German holiday calendar | `libs/shared/src/lib/vacation/holidays.ts` |
| The JWT validation strategy | `apps/api/src/app/auth/jwt.strategy.ts` |
| The Roles decorator | `apps/api/src/app/auth/roles.decorator.ts` |
| The Socket.IO gateway | `apps/api/src/app/events/events.gateway.ts` |
| The TanStack Query client setup | `apps/web/src/app/RealtimeProvider.tsx` |
| Where the dashboard KPIs are computed | `apps/api/src/app/accounts/accounts.service.ts` |
| The nginx config used in production | `ops/nginx.conf.template` |
| The Azure Bicep entrypoint | `infra/azure/main.bicep` |
| The deploy workflow | `.github/workflows/deploy-azure.yml` |
| Seed data | `prisma/seed.ts` |
| ERP export DTO + guard | `apps/api/src/app/erp/erp.controller.ts` + `erp-api-key.guard.ts` |

---

## 15. Asking for help

- **Code questions** → GitHub Discussions, tag `architecture` or `q&a`.
- **Found a bug** → GitHub Issue with reproduction. Don't include real personal data in the report.
- **Security issue** → private channel per [`SECURITY.md`](../SECURITY.md), not a public issue.
- **Want to add a major feature** → open a Discussion with the design before writing code. A few hours of conversation saves days of rework.

Maintainer: [Patrick Schiller](https://github.com/patrickschiller) — usually responds within a few days. This is a side project; please be patient on weekends.
