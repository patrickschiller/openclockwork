# Epic 4 – Urlaub & vollständiger Freigabe-Workflow

> Auftrag (2026-04-30): Stammdaten um jahresweise Urlaubstage erweitern, korrekte Resttage berechnen und einen vollständigen Genehmigungs-Workflow für Urlaubsanträge implementieren.
> Baut auf Epic 2 (Domain, API) und Epic 3 (Frontend) auf. Vorhandener `RequestStateMachine` (`Submitted → Approved | Rejected`) wird zu einem Mehr-Stufen-Workflow erweitert.

## Geschäftslogik – Was sich ändert

### Heute (Stand Ende Epic 3)

- `Employee.AnnualLeaveDays` ist ein einzelner `int` – derselbe Wert für jedes Jahr, manuell gepflegt.
- `Account.VacationDaysRemaining = AnnualLeaveDays − Σ(genehmigte Vacation-Requests des laufenden Jahres)`. Vorjahresreste, Übertrag, anteilige Berechnung bei Eintritt/Austritt: nicht abgebildet.
- `Request.Status ∈ {Submitted, Approved, Rejected}`. Eine Person entscheidet final, kein Vier-Augen-Prinzip, keine Vertretung, kein Widerruf.

### Ziel

- **Stammdaten pro Jahr:** Anspruch + Übertrag + Eintritts-/Austrittsanpassung pro Mitarbeiter und Jahr.
- **Resttage rollierend:** Resturlaub berücksichtigt bewilligten Urlaub *und* eingereichten/in-Prüfung-stehenden Urlaub, sodass Doppelbeantragung verhindert wird.
- **Vollständiger Workflow:** Eingereicht → ggf. Vertretungs-Bestätigung → Vorgesetzter genehmigt → ggf. HR-Bestätigung → Genehmigt. Mit Rückgabe/Ergänzungs-Schritt und expliziter Stornierung.

## Domänenmodell – neue/erweiterte Entitäten

| Aggregat | Felder | Anmerkungen |
|---|---|---|
| `EmployeeLeaveAllowance` *(neu)* | `Id`, `EmployeeId`, `Year` (int), `BaseDays` (decimal), `CarryOverDays` (decimal), `CarryOverExpiresOn` (date, nullable), `AdjustmentDays` (decimal, default 0), `AdjustmentReason` (string, nullable) | Genau ein Eintrag pro `(EmployeeId, Year)`. Ersetzt `Employee.AnnualLeaveDays` als Quelle für Jahresansprüche. `Employee.AnnualLeaveDays` bleibt als Default für neue Jahre erhalten (Auto-Anlage). |
| `Request` (erweitert) | + `WorkflowState` (enum), + `CurrentApproverId` (Guid?), + `SubstituteId` (Guid?), + `SubstituteAcceptedAt` (DateTimeOffset?), + `HrConfirmedAt` (DateTimeOffset?), + `CancelledAt` (DateTimeOffset?), + `CalculatedDays` (decimal) | `Status` bleibt für Abwärtskompat., wird aus `WorkflowState` abgeleitet. `CalculatedDays` ist Werktage zwischen `From` und `To` abzüglich Feiertage. |
| `RequestEvent` *(neu, Audit)* | `Id`, `RequestId`, `At`, `ActorId`, `Kind` (enum: `Submitted`, `SubstituteAccepted`, `SubstituteDeclined`, `ManagerApproved`, `ManagerRejected`, `HrConfirmed`, `ReturnedForRevision`, `Cancelled`, `Resubmitted`), `Note` | Append-only. Liefert Genehmigungs-Audit (Vorbereitung AP 2.6 / DSGVO). |

### `WorkflowState` (neuer Enum)

```
Draft               – Antrag steht, aber noch nicht eingereicht (für "Speichern und später senden")
Submitted           – beim Vorgesetzten in Eingang
PendingSubstitute   – wartet auf Bestätigung Vertretung (optional, nur wenn SubstituteId gesetzt)
PendingManager      – Vertretung hat zugestimmt, Vorgesetzter entscheidet
PendingHr           – Vorgesetzter hat genehmigt, HR muss noch Sichtprüfung machen (nur Vacation/SpecialLeave)
Approved            – final genehmigt
Rejected            – final abgelehnt (durch Manager oder HR)
ReturnedForRevision – Vorgesetzter hat zur Korrektur zurückgegeben (z. B. Datum klären)
Cancelled           – durch Antragsteller storniert (vor Approved oder, mit Sondervalidierung, vor Beginn)
```

`Request.Status` wird automatisch abgeleitet:
- `Submitted | PendingSubstitute | PendingManager | PendingHr | ReturnedForRevision` → `Submitted`
- `Approved` → `Approved`
- `Rejected | Cancelled` → `Rejected`

## API-Vertrag (Erweiterung)

| Method | Path | Beschreibung |
|---|---|---|
| `GET` | `/api/employees/{id}/leave-allowances?year=` | Anspruchsstammdaten je Jahr |
| `PUT` | `/api/employees/{id}/leave-allowances/{year}` | HRAdmin pflegt Anspruch/Übertrag/Anpassung (idempotent) |
| `GET` | `/api/accounts/{employeeId}/vacation?year=` | Detail-Saldo: Anspruch, Übertrag, genehmigt, eingereicht, verfügbar |
| `POST` | `/api/requests/vacation` | Spezial-Endpoint mit Pflichtfeldern (`from`, `to`, optional `substituteId`, `note`) |
| `POST` | `/api/requests/{id}/substitute/accept` | Vertretung bestätigt |
| `POST` | `/api/requests/{id}/substitute/decline` | Vertretung lehnt ab → Antrag geht zurück an Antragsteller |
| `POST` | `/api/requests/{id}/return` | Manager gibt zur Korrektur zurück (`note` Pflicht) |
| `POST` | `/api/requests/{id}/hr-confirm` | HRAdmin bestätigt nach Manager-Approval (für `Vacation`/`SpecialLeave`) |
| `POST` | `/api/requests/{id}/cancel` | Antragsteller storniert (HR/Manager dürfen ebenfalls) |
| `GET` | `/api/requests/{id}/events` | Audit-Trail |

Alte Endpoints `/api/requests/{id}/approve` und `/reject` bleiben für andere Antragstypen aktiv und werden für `Vacation` als Convenience auf `manager-approve` / `manager-reject` gemappt.

## Arbeitspakete

### AP 4.1 – Datenmodell & Migrationen

- [ ] Entität `EmployeeLeaveAllowance` mit unique Index `(EmployeeId, Year)`. Auto-Migration beim Backend-Start.
- [ ] Erweiterung `Request` um `WorkflowState`, `CurrentApproverId`, `SubstituteId`, `SubstituteAcceptedAt`, `HrConfirmedAt`, `CancelledAt`, `CalculatedDays`.
- [ ] Entität `RequestEvent` mit Append-Only-Repository.
- [ ] EF-Migration `0002_VacationWorkflow` (SQL Server) + `EnsureCreatedAsync` für SQLite-Dev.
- [ ] Datenmigration: pro existierendem Mitarbeiter automatisch `EmployeeLeaveAllowance` für das aktuelle Jahr aus `Employee.AnnualLeaveDays` anlegen (idempotent).

### AP 4.2 – Domain Services

- [ ] `LeaveCalculator` (rein, ohne I/O): Werktage zwischen zwei Daten unter Berücksichtigung Feiertagen NRW (zunächst hardcodiert, später konfigurierbar). Halbtage (Vormittag/Nachmittag) als Erweiterung in 4.7.
- [ ] `VacationBalanceService`: berechnet `Anspruch + Übertrag + Anpassung − genehmigt − eingereicht-in-Prüfung` für ein Jahr.
- [ ] `VacationWorkflow` (State Machine), Übergänge gemäß `WorkflowState`-Enum oben. Ungültige Übergänge → `InvalidOperationException`. Vollständige Tests (xUnit).
- [ ] Erweiterung `RequestRules`: bei `Vacation` zusätzlich Validierung (a) Resturlaub reicht, (b) `From` und `To` liegen im Wunschjahr (sonst zwei Anträge), (c) `From <= To`, (d) Vertretung ist nicht der Antragsteller selbst.

### AP 4.3 – API-Endpoints

- [ ] Endpoints aus dem Vertrag oben implementieren. Pro Übergang: Persistenz `Request` + neuen `RequestEvent` schreiben.
- [ ] `POST /api/requests/vacation` validiert via `VacationBalanceService`, lehnt mit `409 Conflict` ab, wenn nicht genug Tage übrig.
- [ ] Notification-Stub triggert auf jedem Übergang (`IRequestNotificationService.NotifyTransitionedAsync` neu, alte Methoden bleiben).
- [ ] OpenAPI: neue Endpoints kommentiert, Beispiele mitgeliefert.

### AP 4.4 – Frontend: Antrag

- [ ] `RequestsPage`-Dialog für Typ `Vacation` zeigt Live-Saldo (Anspruch, davon genehmigt, davon eingereicht, verfügbar) und blockiert Submit, wenn Tage < benötigt.
- [ ] Vertretungs-Auswahl (Dropdown gleicher Manager-Bereich, "keine" als Default).
- [ ] Statusbadge im Antragslisten-Eintrag spiegelt `WorkflowState` (nicht nur `Status`).

### AP 4.5 – Frontend: Vertretung

- [ ] Neue Inbox-Spalte "Vertretungs-Bestätigung" (für Mitarbeiter, die als Vertretung gewählt sind). Buttons: Annehmen / Ablehnen mit Pflichtnotiz bei Ablehnung.
- [ ] Bestätigungs-Modal mit Hinweis auf Zeitraum + Antragsteller.

### AP 4.6 – Frontend: Genehmigungs-Workflow

- [ ] `AdminRequestsPage` zeigt nur Anträge im Zustand des aktuellen Approvers (`PendingManager` für Manager, `PendingHr` für HRAdmin).
- [ ] Aktionen: `Genehmigen`, `Ablehnen`, `Zur Korrektur zurück` (öffnet Notiz-Pflichtfeld).
- [ ] Audit-Drawer: Klick auf Antrag öffnet rechte Sidesheet mit `GET /api/requests/{id}/events` Verlauf.
- [ ] Eigenes Konto-Widget auf Dashboard zeigt Detail-Saldo (Anspruch / Übertrag / Geplant / Genehmigt / Verfügbar).

### AP 4.7 – Erweiterungen (nach MVP)

- [ ] Halbtage (Vormittag/Nachmittag) als Auswahl im Antrag.
- [ ] Feiertagskalender konfigurierbar pro Bundesland.
- [ ] Übertrag-Verfall: Job, der nach `CarryOverExpiresOn` automatisch den Übertrag auf 0 setzt und ein `RequestEvent` artige `LeaveAllowanceEvent`-Audit schreibt.
- [ ] Mitarbeiter-CRUD im HR-Bereich (verknüpft mit AP 3.7).

### AP 4.8 – Tests

- [ ] Domain-Tests für `LeaveCalculator` (Wochenenden, Feiertage, Halbjahres-Eintritt).
- [ ] Domain-Tests für `VacationWorkflow` (alle Übergänge + Negativ-Pfade).
- [ ] Domain-Tests für `VacationBalanceService` (Übertrag, Verfall, parallele Anträge).
- [ ] API-Integrations-Tests (`BagChronos.Api.Tests`): vollständiger Flow Submit → SubstituteAccept → ManagerApprove → HrConfirm + Negativ-Pfade.
- [ ] Frontend-Vitests für `RequestsPage`-Dialog (Disable bei zu wenig Tagen).

## Reihenfolge

1. AP 4.1 → 4.2 (Datenmodell + Domänenlogik) – blockiert alles andere.
2. AP 4.3 (Endpoints) und parallel AP 4.4 (Frontend Antrag) auf Mock-Basis.
3. AP 4.5 → 4.6 (Vertretung, Genehmigungs-UI).
4. AP 4.8 fortlaufend, Pflicht vor Release.
5. AP 4.7 als Polish, nach erstem Release-Schnitt.

## Risiken & Hinweise

- **Übergangskompatibilität:** `Employee.AnnualLeaveDays` darf nicht entfernt werden, solange existierende Datensätze und Seeds darauf basieren. Es bleibt als Default-Quelle und wird beim ersten `LeaveAllowance`-Lookup migriert.
- **Status-Mapping:** Die abgeleitete `Request.Status`-Spalte verhindert, dass alte Frontend-Versionen brechen. Beim Schreiben aktualisiert die State-Machine beide Felder atomar.
- **Doppelbuchung:** Verfügbarkeit muss bei Submit *und* bei Manager-Approve geprüft werden (Race-Condition mit parallelen Anträgen). Anders gelöst, sehen Mitarbeiter je nach Reihenfolge unterschiedliche Salden.
- **Feiertage:** Hartcodierung NRW reicht für die Pilot-Phase. Vor Roll-out auf andere Bundesländer ist `IHolidayProvider` Pflicht (`/api/holidays?state=NW&year=`).
- **Vertretung optional:** Spezifikation lässt offen, ob jede Vertretung Pflicht ist. Default: optional, konfigurierbar pro Mitarbeiter (`Employee.RequiresSubstituteForVacation`, später).
