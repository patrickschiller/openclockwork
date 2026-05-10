# Epic 2 – Backend (NestJS, API-First)

> Quelle: [`base-instructions.md`](../../base-instructions.md), Epic 2 (US 2.1 – 2.5).
> Harte Regel laut [`CLAUDE.md`](../../CLAUDE.md): **alle I/O-Methoden async**, keine blockierenden Calls in Request-Handlern. Domänenregeln liegen pure in `libs/shared` oder Provider-internen Services und sind ohne Postgres testbar.

## Architekturüberblick

```
apps/api/                    → NestJS-App (Controller dünn, Services schlank)
  src/main.ts                → Bootstrap (CORS, Swagger, Validation)
  src/app/app.module.ts      → Composition Root
  src/<feature>/             → ein Modul pro Feature (employees, time-entries, requests, accounts, violations, erp-export, leave-allowances)

libs/shared/                 → reine TS-Domänenfunktionen (importierbar von api + web)
  src/lib/work-time/         → Pausenrechner, Soll-Stunden, Kernzeit
  src/lib/vacation/          → LeaveCalculator, Feiertage NRW
  src/lib/workflow/          → Request-State-Machine, Regel-Funktionen

prisma/schema.prisma         → DB-Single-Source-of-Truth
apps/api-e2e/                → Jest-basierte API-Integrations-Tests (NestJS Testing + Supertest)
```

- **Persistenz:** Prisma-Client gegen PostgreSQL, gekapselt in `PrismaService` (Singleton).
- **Validierung:** `class-validator` + `class-transformer` über `ValidationPipe({ whitelist: true, transform: true })` global.
- **Auth (vorgesehen):** JWT-Bearer (`@nestjs/jwt` + Passport-Strategy). Bis dahin liest jeder Endpoint `actorId`/`employeeId` aus dem Body — exakt so wie der Frontend-Client das heute schickt.
- **Hintergrundjobs:** zunächst keine; bei Bedarf `@nestjs/schedule` + `@Cron`.
- **Realtime:** Socket.IO über NestJS-WebSocket-Gateway, auf demselben HTTP-Server.

## Domänenmodell (alle Modelle bereits in `prisma/schema.prisma`)

| Aggregat | Wesentliche Felder | Anmerkungen |
|---|---|---|
| `Employee` | `id`, `personalNo`, `firstName`, `lastName`, `email`, `role` (`Employee`/`Manager`/`HRAdmin`), `timeModel`, `weeklyHours`, `annualLeaveDays`, `managerId`, `isActive` | `timeModel ∈ {Teilzeit, Vollzeit, Vertrauensarbeitszeit, Gleitzeit}`. `annualLeaveDays` bleibt als Default-Quelle für neue Jahre erhalten (siehe Epic 4). |
| `TimeEntry` | `id`, `employeeId`, `clockIn`, `clockOut?`, `source` (`Manual`/`Pwa`/`Terminal`/`Erp`), `status` (`Open`/`Pending`/`Approved`/`Rejected`), `latitude?`, `longitude?`, `note?` | Index `(employeeId, clockIn)`; `clockOut == null` → laufende Session. |
| `Request` | `id`, `employeeId`, `type` (`Vacation`/`HomeOffice`/`SpecialLeave`/`TimeAdjustment`), `status`, `workflowState`, `from`, `to`, `reason?`, `requiresApproval`, `calculatedDays`, plus alle Workflow-Felder aus Epic 4 | Vollständige Workflow-Logik in [Epic 4](./epic-4-vacation-workflow.md). |
| `RequestEvent` | `id`, `requestId`, `kind`, `actorId?`, `note?`, `occurredAt` | Append-only Audit-Log. |
| `EmployeeLeaveAllowance` | `id`, `employeeId`, `year`, `baseDays`, `carryOverDays`, `bonusDays` | Unique `(employeeId, year)`. |

`Account` ist **kein eigenes Aggregat**, sondern wird on-the-fly aus `TimeEntry` und genehmigten/eingereichten `Request`s berechnet — siehe AP 2.3.

## API-Vertrag (Auszug – vollständig in `apps/web/src/api/client.ts` getypt)

| Method | Path | Beschreibung |
|---|---|---|
| `GET` | `/api/health` | Liveness/Readiness |
| `GET` | `/api/employees` | Mitarbeiterliste (Übergangs-Login-Quelle) |
| `POST` | `/api/timeentries/clock-in` | Beginn (optional GPS) |
| `POST` | `/api/timeentries/clock-out` | Ende (Brutto/Netto + Sondergenehmigungs-Flag im Response) |
| `GET` | `/api/timeentries?employeeId=&from=&to=` | Buchungen + `TimeSummary` |
| `GET` | `/api/accounts/{employeeId}` | Überstundenkonto + Resturlaubs-Zusammenfassung |
| `POST` | `/api/requests` | Antrag (Typ im Body) |
| `GET` | `/api/requests` | Filter: `employeeId`, `status`, `workflowState`, `currentApproverId`, `substituteId` |
| `POST` | `/api/requests/{id}/approve` \| `/reject` | Generische Entscheidung (für `HomeOffice`/`TimeAdjustment`) |
| `GET` | `/api/violations?employeeId=&from=&to=` | Kernzeitverletzungen on-the-fly |
| `GET` | `/api/erp/timeentries?from=&to=` | ERP-Export, separater Auth-Scope |

Vacation-spezifische Workflow-Endpoints (`/api/requests/vacation`, `/manager-approve`, `/hr-confirm`, `/substitute/accept|decline`, `/return`, `/cancel`, `/api/employees/{id}/leave-allowances`, `/api/accounts/{id}/vacation`) gehören zu Epic 4 und sind dort dokumentiert.

## Arbeitspakete

### AP 2.1 – PrismaService & Bootstrap

- [x] `prisma/schema.prisma` mit allen aktuellen Modellen.
- [ ] `PrismaModule` + `PrismaService` (Singleton, `onModuleInit → $connect`, `enableShutdownHooks`).
- [ ] Erste Migration erzeugen (`pnpm prisma migrate dev --name epic2_initial`) und committen — `prisma/migrations/` existiert noch nicht.
- [ ] `main.ts` wirklich initialisieren: CORS aus `API_CORS_ORIGINS`, globaler `ValidationPipe`, Swagger unter `/api/docs`, Listen auf `API_PORT` (Default 3000).
- [ ] Health-Endpoint `/api/health` → `{ status, service, utcTimestamp }`.

### AP 2.2 – Pausenregelung (US 2.2)

- [ ] `libs/shared/src/lib/work-time/calculator.ts`:
  - `calculateNetMinutes(grossMinutes)` → 30 min Abzug ab 6 h, weitere 15 min ab 9 h (45 min gesamt).
  - `summarize(timeEntry)` → `{ grossMinutes, breakMinutes, netMinutes }`.
- [ ] Vitest-Suite mit Grenzfällen 5:59 / 6:00 / 8:59 / 9:00 / Mitternacht-Crossing / leere Sessions.
- [ ] `TimeEntriesService` ruft `summarize()` und liefert `TimeSummaryDto` als Teil von `TimeEntryDto` (Typ existiert bereits im Frontend-Client).

### AP 2.3 – Zeitkonten (US 2.3)

- [ ] `AccountsModule` + `GET /api/accounts/{employeeId}`:
  - `overtimeMinutes` = ∑(Netto-Ist YTD) − ∑(Soll-Minuten YTD nach `weeklyHours` / Werktagen).
  - `vacationDaysTotal/Used/Remaining` als kompakte Sicht (Detail-Saldo gehört zu Epic 4 unter `/api/accounts/{id}/vacation`).
  - `asOf` als ISO-Timestamp.
- [ ] **Kein Cron-Job** für Vorberechnung; on-the-fly reicht. Cache erst, wenn Latenz auf dem Endpoint spürbar wird.

### AP 2.4 – Antrags-Workflow-Grundlage (US 2.4)

- [ ] `libs/shared/src/lib/workflow/request-rules.ts`:
  - `requiresSpecialApproval(timeRange)` → `true` wenn vor 07:00 oder nach 23:00 (oder Mitternacht-Crossing) — gilt für `TimeAdjustment` und für `clock-out` außerhalb Regelzeit.
  - `assertValidTransition(currentState, event)` als Vor-Validierung der Detail-State-Machine aus Epic 4.
- [ ] Anwendung in `clock-out`: `requiresApproval`-Flag im `TimeEntry` setzen.
- [ ] `RequestsModule` mit `POST /api/requests`, `GET /api/requests` (Filter), `POST /api/requests/{id}/approve|reject` (für `HomeOffice`/`TimeAdjustment`).
- [ ] Approver-Rolle wird gegen `Manager`/`HRAdmin` validiert (403 bei Verstoß) — bis Auth da ist über `actorId` aus dem Body und Lookup auf `Employee.role`.
- [ ] `RequestNotificationService` als Interface mit NoOp-Default (loggt jeden Übergang). Echte Implementierung (Email/Teams) folgt mit Auth in AP 2.6.

### AP 2.5 – Kernzeit & ERP-Export (US 2.5)

- [ ] `libs/shared/src/lib/work-time/core-time.ts`:
  - `detectViolations(timeEntry, rule)` → `LateArrival` / `EarlyDeparture` mit `deltaMinutes`.
  - Default-Kernzeit 09:00–15:00, parametrierbar; `Vertrauensarbeitszeit` ausgenommen.
- [ ] `GET /api/violations?employeeId=&from=&to=` flacht Violations on-the-fly aus, kein eigenes Persistenzschema. 404 bei unbekanntem Mitarbeiter.
- [ ] `ErpExportModule` mit `GET /api/erp/timeentries`:
  - Eigener Auth-Guard `ApiKeyGuard` (Header `X-Api-Key` gegen `process.env.ERP_API_KEY`).
  - Liefert nur `status === Approved`, sortiert nach `clockIn`, paginiert (`page`, `pageSize` default 100, max 500).
  - Vertraglich getrennt vom internen App-API.

### AP 2.6 – Auth & Security

- [ ] JWT-Auth via `@nestjs/jwt` + Passport (`PassportModule`, `JwtStrategy`, `JwtAuthGuard`).
- [ ] `POST /api/auth/login` (E-Mail + Passwort → Bcrypt-Hash auf `Employee`-Tabelle, neues Feld `passwordHash`). Migration nötig.
- [ ] Refresh-Token oder kurz-lebige Access-Tokens (TTL ≤ 1 h) — Entscheidung dokumentieren.
- [ ] Rollen-Guard `RolesGuard` mit `@Roles('Manager', 'HRAdmin')`-Dekorator.
- [ ] Frontend-Anpassung: `apps/web/src/api/client.ts` injiziert `Authorization: Bearer …` aus einem Auth-Provider, der den Übergangs-`CurrentEmployeeProvider` ablöst.
- [ ] Audit-Log für Genehmigungen (siehe `RequestEvent`).

### AP 2.7 – Realtime (Socket.IO)

- [ ] `EventsGateway` (`@WebSocketGateway`) mit Auth über JWT-Handshake (siehe AP 2.6).
- [ ] Channels: `request:transitioned` (Workflow-Übergänge), `time-entry:created` (Live-Buchungen für Manager-Dashboard), `violation:detected` (Kernzeit-Flags für Dashboard-Banner).
- [ ] `RequestNotificationService` und `TimeEntriesService` rufen das Gateway pro Event.
- [ ] Frontend: TanStack-Query-Cache wird über Socket-Events invalidiert; kein zweiter State-Store.

### AP 2.8 – Tests

- [ ] Vitest-Tests in `libs/shared` für Pausen, Kernzeit, Workflow-Regeln, Feiertage (siehe Epic 4 für Vacation-Domain).
- [ ] Jest-Tests in `apps/api` pro Service (Module-Provider mit Prisma-Mock oder Test-DB).
- [ ] Jest-Tests in `apps/api-e2e` (NestJS-`Test.createTestingModule` + Supertest) für die Endpoints aus AP 2.3 / 2.4 / 2.5.
- [ ] Contract-Drift-Check: `apps/web/src/api/client.ts` muss zur generierten OpenAPI passen — sobald OpenAPI-Codegen läuft (Epic 3 / AP 3.2), wird das ein automatisierter Check.

## Reihenfolge der Bearbeitung

1. **AP 2.1** zuerst — ohne PrismaService und Migration funktioniert kein einziger anderer Endpoint.
2. **AP 2.2 → 2.3 → 2.4** (Datenfluss: Pausen, dann Konten, dann generische Anträge).
3. **AP 2.5** (Kernzeit + ERP-Export) parallel zu AP 2.4.
4. **AP 2.6 → 2.7** (Auth, dann Realtime auf Auth aufsetzen).
5. **AP 2.8** fortlaufend — neue Endpoints ohne Test werden nicht gemerged ([`CLAUDE.md`](../../CLAUDE.md)).

Epic 4 (Vacation-Workflow) lebt parallel: dessen Domain-Services (`LeaveCalculator`, `VacationBalanceService`, `VacationWorkflow`) sind genauso "pure TS in `libs/shared`" und können vor den abhängigen NestJS-Endpoints geschrieben werden.

## Risiken

- **Zeitzonen:** Alles in UTC speichern (Prisma `DateTime` ist `timestamptz`), an der API-Grenze in `Europe/Berlin` rendern. Kein `date` ohne explizite TZ.
- **Sommerzeit:** Tageslängen-Berechnungen (Soll-Stunden, Werktage) mit `date-fns` oder `Temporal`-Polyfill, nicht mit nackten `Date`-Subtraktionen.
- **Konten-Performance:** `accounts/{employeeId}` aggregiert pro Request — bei wachsenden Datenmengen Materialized View oder Redis-Cache erwägen, nicht jetzt.
- **Race-Conditions:** Parallele Requests gegen `clock-in` oder Vacation-Approve können doppelt schreiben. Wo nötig Prisma-Transaktion + `SELECT FOR UPDATE` oder optimistic locking via `updatedAt`.
- **Auth-Migrations-Pfad:** Solange `actorId` aus dem Body kommt, ist die API explizit untrusted — nicht öffentlich exponieren, bis AP 2.6 fertig ist.
