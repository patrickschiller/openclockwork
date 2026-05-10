# Epic 4 – Urlaub & vollständiger Freigabe-Workflow

> Quelle: [`base-instructions.md`](../../base-instructions.md) und [`CLAUDE.md`](../../CLAUDE.md).
> Auftrag: Stammdaten um jahresweise Urlaubstage erweitern, korrekte Resttage berechnen und einen vollständigen Genehmigungs-Workflow für Urlaubsanträge implementieren.
> Baut auf Epic 2 (NestJS-Domain + REST-API) und Epic 3 (Tailwind/shadcn-Pages) auf. Erweitert die generische Antragslogik aus Epic 2 / AP 2.4 um einen Mehr-Stufen-Workflow (Substitute → Manager → optional HR → Approved).

## Ausgangslage im Repo (Stand 2026-05-10)

Das Datenmodell ist bereits im Pivot-Commit komplett angelegt — Code dahinter fehlt:

| Ebene | Status | Quelle |
|---|---|---|
| Prisma-Schema (`EmployeeLeaveAllowance`, `Request.WorkflowState/Substitute*/HrConfirmedAt/CalculatedDays`, `RequestEvent`) | ✓ vorhanden | [`prisma/schema.prisma`](../../prisma/schema.prisma) |
| Frontend-API-Typen + Client (Vacation-Endpoints, Workflow-Übergänge, Allowance-CRUD) | ✓ vorhanden | [`apps/web/src/api/client.ts`](../../apps/web/src/api/client.ts) |
| Prisma-Migrationen (`prisma/migrations/`) | ✗ fehlt | — |
| NestJS-Module für Employees, TimeEntries, Requests, Accounts, LeaveAllowances | ✗ nur Default-Skelett (`AppController.getData()`) | [`apps/api/src/app/`](../../apps/api/src/app/) |
| Domain-Services (`LeaveCalculator`, `VacationBalanceService`, `VacationWorkflow`) | ✗ fehlt; `libs/shared` ist Stub (`shared() => 'shared'`) | [`libs/shared/src/lib/shared.ts`](../../libs/shared/src/lib/shared.ts) |
| Frontend-Pages (`RequestsPage`, `AdminRequestsPage`, Substitute-Inbox, Audit-Drawer, Konto-Widget) | ✗ nur `DashboardPage` + `PlaceholderPage` | [`apps/web/src/routes/`](../../apps/web/src/routes/) |

Heißt: Schema und Vertrag sind vorausgedacht, **alle Verarbeitungs- und UI-Schichten** sind im neuen Stack noch zu bauen. Die Status-Checkboxen unten reflektieren das.

## Geschäftslogik

- **Stammdaten pro Jahr:** Anspruch + Übertrag + Eintritts-/Austrittsanpassung pro Mitarbeiter und Jahr (`EmployeeLeaveAllowance`). `Employee.annualLeaveDays` bleibt als Default-Quelle für neu anzulegende Jahre.
- **Resttage rollierend:** Resturlaub berücksichtigt bewilligten *und* eingereichten/in-Prüfung-stehenden Urlaub, sodass Doppelbeantragung verhindert wird.
- **Vollständiger Workflow:** Eingereicht → ggf. Vertretungs-Bestätigung → Vorgesetzter genehmigt → ggf. HR-Bestätigung → Genehmigt. Mit Rückgabe-zur-Korrektur und expliziter Stornierung. Generische `Submitted → Approved | Rejected`-Logik aus Epic 2 bleibt für `HomeOffice`/`TimeAdjustment` aktiv.

## Domänenmodell (im Schema bereits vorhanden)

| Aggregat | Wesentliche Felder | Anmerkungen |
|---|---|---|
| `EmployeeLeaveAllowance` | `id`, `employeeId`, `year`, `baseDays`, `carryOverDays`, `bonusDays`, mit unique `(employeeId, year)` | **Hinweis:** Schema verwendet `bonusDays`; der Frontend-Client und der `VacationBalanceDto` sprechen von `adjustmentDays`. Vor AP 4.2 *eine* Variante festziehen und Schema/Client harmonisieren. `adjustmentReason: String?` und `carryOverExpiresOn: DateTime?` fehlen aktuell und sind beim ersten Migrations-Lauf zu ergänzen. |
| `Request` (erweitert) | `workflowState` (`WorkflowState`-Enum), `currentApproverId`, `substituteId`, `substituteAcceptedAt`, `hrConfirmedAt`, `cancelledAt`, `calculatedDays` | Schema hat alles. `status` (`RequestStatus`) bleibt parallel und wird aus `workflowState` abgeleitet, damit ältere Clients nicht brechen. |
| `RequestEvent` | `id`, `requestId`, `kind` (`RequestEventKind`), `actorId`, `note`, `occurredAt` | Append-only Audit. Kinds laut Schema: `Submitted`, `SubstituteAccepted`, `SubstituteDeclined`, `ManagerApproved`, `ManagerRejected`, `Returned`, `Resubmitted`, `HrConfirmed`, `HrRejected`, `Cancelled`. |

### `WorkflowState`-Übergänge

```
Draft               – Antrag steht, aber noch nicht eingereicht (Speichern-und-später-senden)
Submitted           – beim Vorgesetzten in Eingang
PendingSubstitute   – wartet auf Bestätigung Vertretung (nur wenn substituteId gesetzt)
PendingManager      – Vertretung hat zugestimmt, Vorgesetzter entscheidet
PendingHr           – Vorgesetzter hat genehmigt, HR muss noch Sichtprüfung machen (Vacation/SpecialLeave)
Approved            – final genehmigt
Rejected            – final abgelehnt (durch Manager oder HR)
Cancelled           – durch Antragsteller storniert (vor Approved oder, mit Sondervalidierung, vor Beginn)
```

`Request.status` wird automatisch abgeleitet:
- `Draft | Submitted | PendingSubstitute | PendingManager | PendingHr` → `Submitted`
- `Approved` → `Approved`
- `Rejected` → `Rejected`
- `Cancelled` → `Cancelled`

> **Hinweis:** Es gibt keinen eigenen `ReturnedForRevision`-State — die Rückgabe-zur-Korrektur wird über das `Returned`-Event modelliert; der State bleibt `PendingManager`. Bewusste Vereinfachung; beim Implementieren prüfen, ob das so bleibt oder doch ein separater State sinnvoller ist.

## API-Vertrag

Frontend-Client ([`apps/web/src/api/client.ts`](../../apps/web/src/api/client.ts)) ruft alle folgenden Endpoints bereits auf — Server-Seite muss sie liefern:

| Method | Path | Verwendet von | Beschreibung |
|---|---|---|---|
| `GET` | `/api/employees/{id}/leave-allowances` | `api.leaveAllowances` | Liste der Anspruchsstammdaten pro Jahr |
| `PUT` | `/api/employees/{id}/leave-allowances/{year}` | `api.upsertLeaveAllowance` | HR-Admin pflegt Anspruch/Übertrag/Anpassung (idempotent) |
| `GET` | `/api/accounts/{employeeId}/vacation?year=` | `api.vacationBalance` | Detail-Saldo: Anspruch, Übertrag, genehmigt, eingereicht, verfügbar |
| `POST` | `/api/requests/vacation` | `api.createVacationRequest` | Spezial-Endpoint mit Pflichtfeldern (`from`, `to`, optional `substituteId`, `reason`) |
| `POST` | `/api/requests/{id}/manager-approve` | `api.managerApprove` | Manager genehmigt, optional `requiresHrConfirmation: true` für Vacation/SpecialLeave |
| `POST` | `/api/requests/{id}/manager-reject` | `api.managerReject` | Manager lehnt ab |
| `POST` | `/api/requests/{id}/hr-confirm` | `api.hrConfirm` | HR-Admin bestätigt nach Manager-Approval |
| `POST` | `/api/requests/{id}/hr-reject` | `api.hrReject` | HR-Admin lehnt nach Manager-Approval ab (`note` Pflicht) |
| `POST` | `/api/requests/{id}/substitute/accept` | `api.substituteAccept` | Vertretung bestätigt |
| `POST` | `/api/requests/{id}/substitute/decline` | `api.substituteDecline` | Vertretung lehnt ab → Antrag geht zurück (`note` Pflicht) |
| `POST` | `/api/requests/{id}/return` | `api.returnRequest` | Manager gibt zur Korrektur zurück (`note` Pflicht) |
| `POST` | `/api/requests/{id}/cancel` | `api.cancelRequest` | Antragsteller storniert (HR/Manager dürfen ebenfalls) |
| `GET` | `/api/requests/{id}/events` | `api.getRequestEvents` | Audit-Trail |

Die generischen `POST /api/requests/{id}/approve|reject` (aus Epic 2) bleiben für `HomeOffice`/`TimeAdjustment` aktiv. Für `Vacation`/`SpecialLeave` werden sie als Convenience auf `manager-approve`/`manager-reject` gemappt.

## Arbeitspakete

### AP 4.1 – Datenmodell & Migrationen

- [x] Entität `EmployeeLeaveAllowance` mit unique `(employeeId, year)`. *(Schema vorhanden.)*
- [x] `Request` erweitert um `workflowState`, `currentApproverId`, `substituteId`, `substituteAcceptedAt`, `hrConfirmedAt`, `cancelledAt`, `calculatedDays`. *(Schema vorhanden.)*
- [x] Entität `RequestEvent` mit Append-Only-Charakteristik. *(Schema vorhanden.)*
- [ ] **Erste Prisma-Migration** `pnpm prisma migrate dev --name epic4_initial` erzeugen und committen (Verzeichnis `prisma/migrations/` existiert noch nicht).
- [ ] Schema-Ergänzungen: `EmployeeLeaveAllowance.adjustmentReason: String?` und `carryOverExpiresOn: DateTime?` für AP 4.7 nachziehen, `bonusDays` umbenennen zu `adjustmentDays` (oder explizit beibehalten und im Plan ehrlich machen).
- [ ] Datenmigration via Seeder: pro existierendem Mitarbeiter automatisch `EmployeeLeaveAllowance` für das aktuelle Jahr aus `Employee.annualLeaveDays` anlegen (idempotent), sobald ein Seeder existiert. Hängt am Setup-Stand von Epic 2.

### AP 4.2 – Domain Services (in `libs/shared`, pure TS)

- [ ] `LeaveCalculator` (rein, ohne I/O): Werktage zwischen zwei Daten unter Berücksichtigung NRW-Feiertage (Default per Anonymous-Gregorian-Easter-Algorithmus laut `base-instructions.md`; Holiday-Provider als Interface, später konfigurierbar). Halbtage in AP 4.7.
- [ ] `VacationBalanceService` (Application-Layer, liest Prisma): berechnet `baseDays + carryOverDays + adjustmentDays − approvedDays − pendingDays` für ein Jahr; gibt `VacationBalanceDto` zurück (siehe Frontend-Typen in `client.ts`).
- [ ] `VacationWorkflow` als reine State Machine: `transition(currentState, event, context) → nextState`. Ungültige Übergänge werfen `InvalidWorkflowTransitionError`. Vollständige Jest-Unit-Tests.
- [ ] `RequestRules` (pre-pivot-Begriff weiterleben lassen): bei `Vacation` zusätzlich (a) Resturlaub ≥ benötigte Tage, (b) `from`/`to` im selben Jahr (sonst zwei Anträge), (c) `from <= to`, (d) Vertretung ≠ Antragsteller.

### AP 4.3 – NestJS-Endpoints

Vor diesem AP muss aus Epic 2 mindestens das `Requests`-Modul, `Employees`-Modul, `Accounts`-Modul, `PrismaService`-Wrapper und ein einfaches Actor-Resolution stehen (so lange ohne echte Auth, mit `actorId` aus dem Body — exakt wie der Frontend-Client das heute schickt).

- [ ] Endpoints aus dem Vertrag oben implementieren. Pro Übergang persistiert der Service den `Request` und schreibt einen `RequestEvent` in einer Prisma-Transaktion.
- [ ] `POST /api/requests/vacation` validiert via `VacationBalanceService`, lehnt mit `409 Conflict` ab, wenn nicht genug Tage übrig sind. Body schließt `actorId`/`employeeId` ein (siehe `CreateVacationPayload` im Client).
- [ ] Notification-Stub: `RequestNotificationService` mit `notifyTransitioned(request, event)`-Methode (NoOp-Default, später Email/Teams). Ruft auf jedem Übergang.
- [ ] OpenAPI: `@nestjs/swagger`-Dekoratoren auf jedem Endpoint, Beispiele in DTOs.
- [ ] Realtime-Bridge: nach jedem Übergang ein Socket.IO-Event über das (in Epic 2 anzulegende) NestJS-Gateway broadcasten, damit Manager-Inboxen live aktualisieren.

### AP 4.4 – Frontend: Antrag (Tailwind + shadcn)

- [ ] Neue Route `/requests` (`apps/web/src/routes/RequestsPage.tsx`), in `apps/web/src/app/navigation.ts` und `AppShell.tsx` eintragen.
- [ ] Antragsdialog mit shadcn `Dialog`/`Select`/`Calendar`/`Textarea` für alle vier Typen (`Vacation`, `HomeOffice`, `SpecialLeave`, `TimeAdjustment`).
- [ ] Vacation-Sicht zeigt **Live-Saldo** über `useQuery(api.vacationBalance(employeeId, year))`: Anspruch, davon genehmigt, davon eingereicht, verfügbar. Submit ist disabled, wenn Tage < benötigt.
- [ ] Vertretungs-Auswahl als shadcn `Select` (gleicher Manager-Bereich, "keine" als Default).
- [ ] Statusbadge in der Antragsliste spiegelt `workflowState` (nicht nur `status`) — eigene Badge-Variante pro State.

### AP 4.5 – Frontend: Vertretungs-Inbox

- [ ] Neue Inbox-Sektion (eigene Route `/substitute-inbox` oder Reiter auf `/requests`) für Anträge, in denen der eingeloggte Mitarbeiter als `substituteId` gewählt ist (`api.listRequests({ substituteId })`).
- [ ] Buttons "Annehmen" / "Ablehnen". Ablehnen öffnet shadcn `Dialog` mit Pflicht-`Textarea` (Note).
- [ ] Bestätigungs-Modal mit Hinweis auf Zeitraum + Antragsteller.

### AP 4.6 – Frontend: Genehmigungs-Workflow

- [ ] Neue Route `/admin/requests` (Manager + HRAdmin only — Rollen-Guard via `CurrentEmployee`-Provider).
- [ ] Zeigt Anträge gefiltert nach `currentApproverId == self` (`api.listRequests({ currentApproverId })`).
- [ ] Aktionen: `Genehmigen` (mit Checkbox "HR-Bestätigung erforderlich"), `Ablehnen` (Pflichtnotiz), `Zur Korrektur zurück` (Pflichtnotiz).
- [ ] Audit-Drawer: Klick auf eine Antragszeile öffnet shadcn `Sheet` (rechts) mit `api.getRequestEvents(id)` als Timeline.
- [ ] Dashboard-Erweiterung: neues Konto-Widget mit Detail-Saldo (Anspruch / Übertrag / Geplant / Genehmigt / Verfügbar) per `api.vacationBalance(self, currentYear)`.

### AP 4.7 – Erweiterungen (nach MVP)

- [ ] Halbtage (Vormittag/Nachmittag) als Auswahl im Antrag — `EmployeeLeaveAllowance.baseDays` ist schon `Decimal(5,2)`, also platztauglich.
- [ ] Feiertagskalender konfigurierbar pro Bundesland (`HolidayProvider`-Interface, NRW als Default).
- [ ] Übertrag-Verfall: Cron-Job (`@Cron` aus `@nestjs/schedule`), der nach `carryOverExpiresOn` automatisch den Übertrag auf 0 setzt und ein artiges Event-Log schreibt.
- [ ] Mitarbeiter-CRUD im HR-Bereich (Schnittstelle zu Epic 3, AP 3.7).

### AP 4.8 – Tests

- [ ] Vitest-Tests in `libs/shared` für `LeaveCalculator` (Wochenenden, NRW-Feiertage, Halbjahres-Eintritt, Jahresgrenzen).
- [ ] Jest-Tests im NestJS-API für `VacationWorkflow` (alle Übergänge + Negativ-Pfade) — Domain-Service ist pure, läuft ohne Postgres.
- [ ] Jest-Tests für `VacationBalanceService` mit Prisma-Test-DB (Übertrag, Verfall, parallele Anträge mit Race-Condition-Szenario).
- [ ] API-Integrations-Tests in `apps/api-e2e/`: vollständiger Flow Submit → SubstituteAccept → ManagerApprove → HrConfirm + Negativ-Pfade.
- [ ] Vitest-Tests für `RequestsPage`-Dialog (Submit-Disable bei zu wenig Tagen) und `AdminRequestsPage` (Approve/Reject mit Pflichtnotiz).
- [ ] Playwright-Smoke in `apps/web-e2e/` für den Happy-Path.

## Reihenfolge der Bearbeitung

1. **AP 4.1 abschließen** (erste Migration + Schema-Feinjustierung) — danach läuft der lokale Postgres mit echtem Schema.
2. **AP 4.2 zuerst**, weil reine Domain-Logik unabhängig von NestJS testbar ist und die Endpoints-Implementierung dann nur noch Service-Verdrahtung ist.
3. **AP 4.3** parallel zu Epic 2 (Endpoints-Bündel: erst die generischen Request-Endpoints aus Epic 2, dann die Vacation-spezifischen oben).
4. **AP 4.4** kann parallel ab dem Punkt, an dem `POST /api/requests/vacation` und `GET /api/accounts/{id}/vacation` antworten.
5. **AP 4.5 → 4.6** (Vertretung, Genehmigungs-UI) — setzt die übrigen Endpoints voraus.
6. **AP 4.8** fortlaufend, Pflicht vor Release-Tag.
7. **AP 4.7** als Polish, nach erstem Release-Schnitt.

## Risiken & Hinweise

- **Übergangskompatibilität:** `Employee.annualLeaveDays` darf nicht entfernt werden, solange existierende Datensätze und Seeds darauf basieren. Es bleibt als Default-Quelle und wird beim ersten `LeaveAllowance`-Lookup für das aktuelle Jahr migriert.
- **Status-Mapping:** Die abgeleitete `Request.status`-Spalte verhindert, dass alte Frontend-Versionen brechen. Beim Schreiben aktualisiert die Workflow-Engine beide Felder atomar (eine Prisma-Transaktion).
- **Doppelbuchung / Race Condition:** Verfügbarkeit muss bei Submit *und* bei Manager-Approve geprüft werden. Andernfalls sehen Mitarbeiter je nach Reihenfolge unterschiedliche Salden. Bei Bedarf optimistic locking via `Request.updatedAt`.
- **Feiertage:** Hartcodierung NRW per Anonymous-Gregorian-Easter-Algorithmus reicht für den Start. Vor Roll-out auf andere Bundesländer ist `HolidayProvider`-Interface Pflicht (`/api/holidays?state=NW&year=`).
- **Vertretung optional:** `base-instructions.md` lässt offen, ob jede Vertretung Pflicht ist. Default: optional, später konfigurierbar pro Mitarbeiter.
- **Keine Auth in 4.3:** Bis Epic 2 (AP 2.6) Auth liefert, kommt `actorId` weiter aus dem Request-Body. Beim Auth-Schritt durch JWT-Subject ersetzen — der Frontend-Client kapselt das schon, also nur eine Stelle anzupassen.
- **`bonusDays` vs `adjustmentDays`:** Schema sagt `bonusDays`, der Frontend-Client (`VacationBalanceDto`/`UpsertLeaveAllowancePayload`) sagt `adjustmentDays`. Vor AP 4.2 *eine* Variante festziehen und im Schema (oder im Client) per Migration nachziehen.
