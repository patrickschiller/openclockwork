# Epic 5 – Projektzeiterfassung (Projekte, Service-Aufträge, Zuweisungsmatrix)

> Quelle: [`base-instructions.md`](../../base-instructions.md) (Epic 5) und [`CLAUDE.md`](../../CLAUDE.md).
> Auftrag: Zeiten optional auf Projekte buchen. Admin-Bereich für Projekte mit Service-Aufträgen, Mitarbeiter×Projekte-Zuweisungsmatrix als harte Buchungsberechtigung, Projektwahl beim Stempeln plus nachträgliche Zuordnung und Aufteilen von Einträgen, ERP-Export mit Projektbezug.
> Baut auf Epic 2 (TimeEntries, Auth, ERP-Export) und Epic 3 (BookingPage, Admin-Pages) auf.
>
> **Status (2026-06-10):** Vollständig umgesetzt; alle Checkboxen entsprechen dem realen Code-Stand.
> **Revision 2026-06-11 (Epic 5.1):** Service-Auftrag wird bedingt-pflichtige Buchungsebene, Tätigkeit je Buchung, PLAN/IST je Projekt+Auftrag, Nachtrag, Kundenauswertung; die Approved-Sperre entfällt. Details und AP 5.8–5.15 am Dokumentende — sie überschreiben die betroffenen Regeln unten.

## Geschäftslogik (verbindliche Entscheidungen)

- ~~**Buchungsebene = Projekt.** Service-Aufträge strukturieren ein Projekt nur administrativ; `TimeEntry` referenziert ausschließlich `Project` (kein `serviceOrderId`).~~ _Revidiert 2026-06-11: Service-Aufträge sind bedingt-pflichtige Buchungsebene, s. Revision unten._
- **Buchungsmodell „Beides":** Projektwahl beim „Kommen" (der ganze Eintrag gehört zum Projekt) **und** nachträgliche Zuordnung (setzen/ändern/entfernen, auch auf offenen Einträgen) sowie **Aufteilen** eines geschlossenen Eintrags an einem Zeitpunkt in zwei lückenlose Segmente.
- **Harte Zuweisungs-Autorisierung:** Nur per Matrix zugewiesene Mitarbeiter dürfen auf ein (aktives) Projekt buchen. Validierung greift bei Clock-in, nachträglicher Zuordnung und beim Split-Segment-2-Projekt (404 unbekannt / 400 inaktiv / 403 nicht zugewiesen).
- ~~**Approved-Sperre:** Einträge mit `status = Approved` sind für Projektänderung und Split gesperrt (409).~~ _Revidiert 2026-06-11: Sperre entfällt — geschlossene Einträge approven automatisch, die Sperre hätte Nachträge praktisch unmöglich gemacht. Anwesenheitssummen ändern sich nie; das pull-basierte ERP behandelt Entry-IDs als Quelle der Wahrheit._
- **Split-Semantik:** Zeitpunkt strikt zwischen `clockIn` und `clockOut`. Segment 1 behält Identität, GPS und Notiz; Segment 2 kopiert `source`. `projectId` im Split-Body weggelassen → Segment 2 erbt das Projekt; explizit `null` → ohne Projekt. `requiresApproval`/`status` werden je Segment per `requiresSpecialApproval()` neu berechnet; `Rejected` bleibt in beiden Segmenten `Rejected`.
- **Berechtigungen:** Projekt-/Service-Auftrags-/Zuweisungspflege durch `Manager` und `HRAdmin`. Eintrags-Mutationen (PATCH/Split) durch den Eigentümer oder Manager/HRAdmin (JWT-geguardet).
- **Löschsemantik:** Hard-Delete eines Projekts nur ohne referenzierende `TimeEntry`s (Service-Check + `onDelete: Restrict`); regulärer Weg ist Deaktivieren (`isActive = false`). Service-Aufträge und Zuweisungen kaskadieren.

## Domänenmodell

| Aggregat | Wesentliche Felder | Anmerkungen |
|---|---|---|
| `Project` | `code` (unique), `name`, `description?`, `isActive` | `code` erscheint im ERP-Export |
| `ServiceOrder` | `projectId` (Cascade), `orderNo` (unique je Projekt), `title`, `isActive` | reine Admin-Struktur |
| `ProjectAssignment` | `employeeId` + `projectId` (`@@unique`), Cascade beidseitig | Matrix-Zeile = Buchungsberechtigung |
| `TimeEntry` (erweitert) | `projectId?` (`onDelete: Restrict`), Index | nullable — Buchung ohne Projekt bleibt Normalfall |

Migration: [`prisma/migrations/20260609211423_add_projects/`](../../prisma/migrations/20260609211423_add_projects/migration.sql)

## API-Vertrag

| Methode | Pfad | Guard | Beschreibung |
|---|---|---|---|
| GET | `/api/projects?includeInactive=` | — | Projektliste inkl. Service-Aufträge + `assignedEmployeeCount` |
| GET | `/api/projects/assignments` | Manager/HRAdmin | komplette Matrix (`{employeeId, projectId}[]`) |
| GET | `/api/projects/bookable?employeeId=` | — | aktive, zugewiesene Projekte (Selector-Quelle) |
| GET | `/api/projects/:id` | — | Einzelprojekt |
| POST/PUT/DELETE | `/api/projects(/:id)` | Manager/HRAdmin | CRUD; 409 bei Code-Duplikat bzw. Delete mit Buchungen |
| POST/PUT/DELETE | `/api/projects/:id/service-orders(/:orderId)` | Manager/HRAdmin | Service-Auftrags-CRUD; 409 bei `orderNo`-Duplikat |
| PUT/DELETE | `/api/projects/:id/assignments/:employeeId` | Manager/HRAdmin | idempotentes Zuweisen/Entziehen (je 204) |
| POST | `/api/timeentries/clock-in` | — (Bestand) | + optionales `projectId` |
| PATCH | `/api/timeentries/:id` | JWT (Owner/Manager/HR) | `{ projectId: uuid \| null }`; 409 bei Approved |
| POST | `/api/timeentries/:id/split` | JWT (Owner/Manager/HR) | `{ at, projectId? }` → `{ first, second }` |
| GET | `/api/erp/timeentries` | X-Api-Key (Bestand) | + `projectCode`/`projectName` (nullable) |

Socket-Event: `project:changed { projectId }` bei allen Projekt-/Service-Auftrags-/Zuweisungs-Mutationen; das Web invalidiert `['projects']`, `['project-assignments']`, `['bookable-projects']`.

⚠️ Routen-Reihenfolge im Controller: `assignments` und `bookable` sind **vor** `:id` deklariert (Nest matcht in Deklarationsreihenfolge; `ParseUUIDPipe` würde sonst 400 liefern).

## Arbeitspakete

### AP 5.1 – Datenmodell & Migration

- [x] `Project`, `ServiceOrder`, `ProjectAssignment` + `TimeEntry.projectId` in [`prisma/schema.prisma`](../../prisma/schema.prisma)
- [x] Migration `20260609211423_add_projects` erzeugt und angewendet
- [x] Seed: 3 Projekte (PRJ-001/002 aktiv mit Service-Aufträgen, PRJ-003 deaktiviert), Zuweisungen für Anna/Bernd/Diana, zwei von Annas Beispiel-Einträgen auf PRJ-001 ([`prisma/seed.ts`](../../prisma/seed.ts))

### AP 5.2 – Projects-Modul (NestJS)

- [x] `ProjectsService`: CRUD, Service-Auftrags-CRUD, idempotente `assign`/`unassign`, `listAssignments`, `listBookable`, `assertBookable`, Delete-Sperre, `project:changed`-Broadcast
- [x] `ProjectsController` mit Guards (`@Roles('Manager','HRAdmin')` auf Mutationen + Matrix-Endpoint)
- [x] `ProjectsModule` `@Global()` (Muster `WorkSchedulesModule`), registriert in `AppModule`

### AP 5.3 – TimeEntries-Erweiterung

- [x] `ClockInDto.projectId?` mit `assertBookable`-Validierung
- [x] `PATCH /timeentries/:id` (`UpdateTimeEntryProjectDto`, Owner-oder-Admin, Approved-Sperre)
- [x] `POST /timeentries/:id/split` (`SplitTimeEntryDto`, Transaktion, Status-Recompute, Events)
- [x] `TimeEntryDto` + `projectId`/`projectCode`/`projectName`

### AP 5.4 – ERP-Export

- [x] `ErpTimeEntryDto` + `projectCode`/`projectName` (nullable), `include project` im Query

### AP 5.5 – Web: Admin-Bereich

- [x] `AdminProjectsPage` (`/admin/projects`, Manager + HRAdmin): Projekt-Cards mit Inline-Service-Auftrags-Pflege, Editor-Dialog, Lösch-/Deaktivier-Fehlerbehandlung
- [x] Zuweisungsmatrix (Mitarbeiter × Projekte, Checkbox-Toggles mit optimistischem Update)
- [x] Nav-Eintrag „Projekte" + lazy Route

### AP 5.6 – Web: Buchung

- [x] Projekt-Selector („— ohne Projekt —") vor Kommen/Gehen, Quelle `bookable`
- [x] Projekt-Badge in der Buchungsliste
- [x] Dialoge „Projekt zuordnen" und „Buchung aufteilen" (nur Einträge mit `status !== 'Approved'`)
- [x] `client.ts`-Methoden + Realtime-Invalidation

### AP 5.7 – Tests & Vertrag

- [x] API-e2e: [`projects.e2e.spec.ts`](../../apps/api-e2e/src/api/projects.e2e.spec.ts) (Guards, CRUD, Idempotenz, bookable), [`time-entry-projects.e2e.spec.ts`](../../apps/api-e2e/src/api/time-entry-projects.e2e.spec.ts) (Clock-in-Validierung, PATCH, Split-Semantik inkl. Grenzfälle und Status-Recompute), ERP-Export-Erweiterung
- [x] Web-Vitest: `AdminProjectsPage.spec.tsx`, `BookingPage.spec.tsx` erweitert
- [x] `pnpm generate:api` — `apps/api/openapi.json` + `apps/web/src/api/generated.ts` regeneriert

## Risiken & Hinweise

- `clock-in`/`clock-out` sind weiterhin ungeguardet (Bestandslücke, siehe `implementation-status.md`) — die Projektvalidierung dort ist Geschäftsregel, kein Zugriffsschutz. Die neuen PATCH-/Split-/Nachtrag-Routen sind JWT-geguardet.
- Splits/Nachträge können nach einer ERP-Abholung neue Entry-IDs erzeugen bzw. Felder ändern — ERP-seitig unkritisch, solange IDs als Identität gelten (verbindliche Integrationsannahme).
- `requiresSpecialApproval` rechnet in lokaler Serverzeit (`Europe/Berlin`); Tests verwenden UTC-Fixtures, die in CET **und** CEST auf derselben Seite der 07:00/23:00-Grenzen liegen.

---

## Revision 2026-06-11 — Epic 5.1 (Service-Auftrags-Buchung, Tätigkeit, PLAN/IST, Nachtrag, Auswertung)

### Geschäftslogik-Änderungen (verbindlich, ersetzen die obigen Regeln)

- **Service-Auftrag als bedingt-pflichtige Buchungsebene:** Hat das Projekt ≥1 **aktiven** Auftrag, muss bei jeder Neuspezifikation des Buchungsziels (Clock-in, PATCH mit `projectId`, Split mit explizitem Projekt, Nachtrag) ein aktiver Auftrag des Projekts gewählt werden (`resolveServiceOrder` in `projects.service.ts` ist der einzige Validierungspfad: 404 fremd/unbekannt, 400 inaktiv/fehlend). Legacy-Einträge ohne Auftrag bleiben gültig; activity-only-PATCH und Split-Vererbung validieren nicht neu.
- **Tätigkeit (`TimeEntry.activity`, max. 500):** kundenfähiger Freitext je Buchung, unabhängig editierbar.
- **Approved-Sperre entfernt:** PATCH/Split/Nachtrag auf allen geschlossenen Einträgen; `Rejected` bleibt bei Splits erhalten („keine Genehmigungswäsche").
- **Nachtrag (`POST /api/timeentries/book-project`):** Intervall muss vollständig durch geschlossene, nicht-abgelehnte Einträge gedeckt sein (Union-Walk, sonst 400 mit gedeckten Fenstern). Carving-Fälle A–D (innen / links / rechts / beidseitig herausragend) in einer Transaktion; GPS/Notiz bleiben beim jeweils ersten physischen Segment; Genehmigungs-Recompute je Segment; bestehende Projektzuordnung im Intervall wird ersetzt.
- **PLAN-Zeiten (`planHours`, Decimal(8,2), nullable):** je Projekt und Auftrag. Invariante Σ Auftrags-PLAN ≤ Projekt-PLAN (nur bei gesetztem Projekt-PLAN; 409 bei Verstoß, auch bei Reduktion des Projekt-PLANs). Überbuchen durch Mitarbeiter erlaubt — IST/PLAN-Balken in der Projektübersicht wird rot.
- **IST-Verbrauch:** Brutto-Minuten (Raw-SQL-GroupBy, `FLOOR` je Eintrag synchron zu `summarize()`) geschlossener, nicht-abgelehnter Einträge; je Projekt gesamt und je Auftrag.
- **Service-Auftrags-Löschsperre:** 409 bei referenzierenden TimeEntries (+ DB-Backstop `onDelete: Restrict`); Deaktivieren ist der reguläre Weg.

### API-Delta

| Methode | Pfad | Guard | Beschreibung |
|---|---|---|---|
| POST | `/api/timeentries/book-project` | JWT (self oder Manager/HR) | Nachtrag; 201 `{ entries: TimeEntryDto[] }` |
| GET | `/api/projects/:id/report?from&to` | JWT + Manager/HRAdmin | Kundenauswertung (Datum, Mitarbeiter, Auftrag, Brutto-Minuten, Tätigkeit, Summe) |
| PATCH | `/api/timeentries/:id` | JWT (Bestand) | DTO → `{ projectId?, serviceOrderId?, activity? }` (min. 1 Key); `projectId` = komplette Neuspezifikation |
| — | DTO-Erweiterungen | | `ClockInDto`/`SplitTimeEntryDto` + `serviceOrderId?`/`activity?`; `TimeEntryDto` + 4 Felder; `ProjectDto`/`ServiceOrderDto` + `planHours`/`bookedMinutes`; `bookable` + aktive `serviceOrders`; ERP-Export + `orderNo`/`orderTitle`/`activity` |

Migration: `prisma/migrations/20260611103350_service_order_booking_activity_plan_hours/`

### Arbeitspakete (Revision)

#### AP 5.8 – Schema & Seed
- [x] `TimeEntry.serviceOrderId` (Restrict) + `activity`; `Project.planHours`; `ServiceOrder.planHours`; Migration
- [x] Seed: PRJ-001 PLAN 120 h (SA-001: 40, SA-002: 60), PRJ-002 nur Auftrags-PLAN 25 h; Annas Einträge mit SA-001 + Tätigkeit

#### AP 5.9 – Service-Auftrags-Buchungsebene
- [x] `resolveServiceOrder` als zentraler Validierungspfad in allen vier Buchungswegen
- [x] Auftrags-Löschsperre (409) + `bookable` inkl. aktiver Aufträge
- [x] BookingPage: Auftrags-Select (pflichtig bei Aufträgen), „Kommen" gesperrt bis Auswahl

#### AP 5.10 – Tätigkeit
- [x] `activity` auf Clock-in/PATCH/Split/Nachtrag; Anzeige in der Buchungsliste; ERP-Export

#### AP 5.11 – Approved-Sperre entfernt
- [x] `assertNotApproved` gelöscht; e2e-Tests geflippt; BookingPage-Aktionen für alle Einträge

#### AP 5.12 – Nachtrag
- [x] `bookProjectRange` mit Coverage-Check + Carving A–D ([time-entries.service.ts](../../apps/api/src/app/time-entries/time-entries.service.ts))
- [x] `BookProjectDialog` auf der BookingPage
- [x] e2e: [project-booking-range.e2e.spec.ts](../../apps/api-e2e/src/api/project-booking-range.e2e.spec.ts) (Fälle A–D, Lücken, Rejected/offen, Rechte, Recompute)

#### AP 5.13 – PLAN/IST
- [x] PLAN-Invariante (409) in Projekt-/Auftrags-Upserts; Raw-SQL-IST-Statistik
- [x] AdminProjectsPage: PLAN-Inputs + IST/PLAN-Balken (rot bei Überbuchung) je Projekt und Auftrag

#### AP 5.14 – Kundenauswertung
- [x] `report()`-Service + Endpoint (Manager/HR); Dialog mit Zeitraumfilter + clientseitigem CSV-Export (UTF-8-BOM, Semikolon)

#### AP 5.15 – Tests, Vertrag & Doku
- [x] API-e2e: 18 Suiten / 106 Tests grün (inkl. Conditional-Mandatory-Matrix, PLAN-409, Stats, Report, ERP)
- [x] Web-Vitest: Mocks nachgezogen, Approved-Flip, Auftrags-Select-/Nachtrag-/Balken-/Report-Tests
- [x] `pnpm generate:api`; `base-instructions.md` US 5.1–5.8 revidiert/ergänzt
