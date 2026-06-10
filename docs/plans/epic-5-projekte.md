# Epic 5 – Projektzeiterfassung (Projekte, Service-Aufträge, Zuweisungsmatrix)

> Quelle: [`base-instructions.md`](../../base-instructions.md) (Epic 5) und [`CLAUDE.md`](../../CLAUDE.md).
> Auftrag: Zeiten optional auf Projekte buchen. Admin-Bereich für Projekte mit Service-Aufträgen, Mitarbeiter×Projekte-Zuweisungsmatrix als harte Buchungsberechtigung, Projektwahl beim Stempeln plus nachträgliche Zuordnung und Aufteilen von Einträgen, ERP-Export mit Projektbezug.
> Baut auf Epic 2 (TimeEntries, Auth, ERP-Export) und Epic 3 (BookingPage, Admin-Pages) auf.
>
> **Status (2026-06-10):** Vollständig umgesetzt; alle Checkboxen entsprechen dem realen Code-Stand.

## Geschäftslogik (verbindliche Entscheidungen)

- **Buchungsebene = Projekt.** Service-Aufträge strukturieren ein Projekt nur administrativ; `TimeEntry` referenziert ausschließlich `Project` (kein `serviceOrderId`).
- **Buchungsmodell „Beides":** Projektwahl beim „Kommen" (der ganze Eintrag gehört zum Projekt) **und** nachträgliche Zuordnung (setzen/ändern/entfernen, auch auf offenen Einträgen) sowie **Aufteilen** eines geschlossenen Eintrags an einem Zeitpunkt in zwei lückenlose Segmente.
- **Harte Zuweisungs-Autorisierung:** Nur per Matrix zugewiesene Mitarbeiter dürfen auf ein (aktives) Projekt buchen. Validierung greift bei Clock-in, nachträglicher Zuordnung und beim Split-Segment-2-Projekt (404 unbekannt / 400 inaktiv / 403 nicht zugewiesen).
- **Approved-Sperre:** Einträge mit `status = Approved` sind für Projektänderung und Split gesperrt (409) — sie können bereits ans ERP exportiert sein. Ein Split erzeugt für das ERP zwei neue Entry-IDs; das ERP muss IDs als Quelle der Wahrheit behandeln.
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

- `clock-in`/`clock-out` sind weiterhin ungeguardet (Bestandslücke, siehe `implementation-status.md`) — die Projektvalidierung dort ist Geschäftsregel, kein Zugriffsschutz. Die neuen PATCH-/Split-Routen sind JWT-geguardet.
- Ein Split nach erfolgter ERP-Abholung ist durch die Approved-Sperre ausgeschlossen; ein Split *vor* der Abholung erzeugt zwei IDs — ERP-seitig unkritisch, solange IDs als Identität gelten.
- `requiresSpecialApproval` rechnet in lokaler Serverzeit (`Europe/Berlin`); Tests verwenden UTC-Fixtures, die in CET **und** CEST auf derselben Seite der 07:00/23:00-Grenzen liegen.
