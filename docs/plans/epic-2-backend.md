# Epic 2 – Backend (C# / API-First)

> Quelle: [`base-instructions.md`](../../base-instructions.md), Epic 2 (US 2.1 – 2.5).
> Harte Regel: **Alle Methoden mit I/O zwingend `async`**, keine `.Result`/`.Wait()`.

## Architekturüberblick

```
BagChronos.Api          → ASP.NET Core 8 Minimal APIs / Controller, OpenAPI
BagChronos.Application  → Use Cases, Validierung (FluentValidation), DTOs
BagChronos.Domain       → Aggregates (Employee, TimeEntry, Account, Request), Domain Services
BagChronos.Infrastructure → EF Core (SQL Server), Repositories, Auth, Key-Vault-Clients
BagChronos.Tests        → xUnit + FluentAssertions, In-Memory + SQL-Testcontainers
```

- **Persistenz:** EF Core 8 mit Code-First-Migrationen gegen Azure SQL.
- **Auth:** Azure AD (Microsoft.Identity.Web) für Admin-Browser; JWT-Bearer für PWA.
- **Hintergrundjobs:** zunächst HostedService für tägliche Saldenberechnung; bei Wachstum Migration auf Azure Functions.
- **Validierung:** Domänenregeln im Domain-Layer; technische Validierung (Format, Pflichtfelder) per FluentValidation in Application-Layer.

## Domänenmodell (Kernaggregate)

| Aggregat | Wesentliche Felder | Anmerkungen |
|---|---|---|
| `Employee` | Id, PersonalNo, Name, Email, TimeModel, AnnualLeaveDays | TimeModel ∈ {Teilzeit, Vollzeit, Vertrauensarbeitszeit, Gleitzeit} |
| `TimeEntry` | Id, EmployeeId, ClockIn, ClockOut, Source (PWA/Manual), Geo (lat/lng/accuracy), Status | Status ∈ {Pending, Approved, Rejected} |
| `Request` | Id, Type, EmployeeId, From, To, Reason, ApproverId, Status, RequiresApproval | Type ∈ {Vacation, HomeOffice, SpecialLeave, TimeCorrection} |
| `Account` | EmployeeId, OvertimeBalanceMinutes, VacationDaysRemaining | wird durch Domain Service berechnet |
| `WorkingTimeRule` | Id, Scope (Global/Employee), CoreTimeStart, CoreTimeEnd, EarliestBookingTime, LatestBookingTime | Standard 07:00–23:00 |

## API-Vertrag (OpenAPI – Auszug)

| Method | Path | Beschreibung |
|---|---|---|
| `GET` | `/api/health` | Liveness/Readiness |
| `GET` | `/api/employees/me` | aktueller Benutzer |
| `POST` | `/api/timeentries/clock-in` | Beginnen, optional GPS |
| `POST` | `/api/timeentries/clock-out` | Beenden |
| `GET` | `/api/timeentries?from=&to=` | Buchungen + Brutto/Netto |
| `GET` | `/api/accounts/me` | Überstunden- und Urlaubssaldo |
| `POST` | `/api/requests` | Antrag (Typ im Body) |
| `GET` | `/api/requests?status=` | Anträge filtern |
| `POST` | `/api/requests/{id}/approve` | Genehmigung (Vorgesetzter) |
| `POST` | `/api/requests/{id}/reject` | Ablehnung (Vorgesetzter) |
| `GET` | `/api/violations?employeeId=` | Kernzeitverletzungen |
| `GET` | `/api/erp/timeentries?from=&to=` | ERP-Export (separater Auth-Scope) |

## Arbeitspakete

### AP 2.1 – Datenmodell & Migrationen (US 2.1)

- [ ] Entitäten + EF-Konfigurationen für Tabelle oben.
- [ ] Initial-Migration `0001_InitialSchema`.
- [ ] Seed-Daten für TimeModel-Defaults.

### AP 2.2 – Pausenregelung (US 2.2)

- [ ] Domain-Service `WorkTimeCalculator` (rein, ohne I/O):
  - `CalculateNet(grossMinutes)` → 30 min Abzug ab 6 h, weitere 15 min ab 9 h (gesamt 45 min).
  - Unit-Tests mit Grenzfällen 5:59 / 6:00 / 8:59 / 9:00 / mehrere Sessions am Tag.
- [ ] DTO `TimeSummary { GrossMinutes, NetMinutes, BreakMinutes }` in jeder Buchungsabfrage.

### AP 2.3 – Zeitkonten (US 2.3)

- [ ] `AccountService.GetCurrentAsync(employeeId)`:
  - Überstunden = ∑(Netto-Ist) − ∑(Soll laut TimeModel).
  - Urlaubskonto = JahresAnspruch − genehmigte Urlaubsanträge bis heute.
- [ ] HostedService `DailyAccountRecalculation` (täglich 03:00).

### AP 2.4 – Antrags-Workflow (US 2.4)

- [ ] State Machine `Submitted → Approved | Rejected` (kein Editieren genehmigter Anträge).
- [ ] Regel: Buchung/Zeitantrag mit `From < 07:00 || To > 23:00` ⇒ `RequiresApproval = true`, andere Anträge laufen nach normalem Workflow.
- [ ] Notifications-Stub (Interface), spätere Implementierung via Email/Teams.

### AP 2.5 – Kernzeit & ERP-Export (US 2.5)

- [ ] `CoreTimeViolationDetector`: prüft jeden TimeEntry gegen `WorkingTimeRule` und schreibt Violation-Records.
- [ ] `/api/erp/timeentries`: API-Key-Auth (separater Scope), liefert nur freigegebene Buchungen, paginiert.

### AP 2.6 – Auth & Security

- [ ] Azure AD Login für Browser-UI (Authority + Audience aus Config).
- [ ] PWA: PKCE-Flow, Token-Refresh.
- [ ] Rollen: `Employee`, `Manager`, `HRAdmin`, `ErpClient`.
- [ ] Audit-Log für Genehmigungen.

### AP 2.7 – Tests

- [ ] Unit-Tests Domain (Pausen, Konten, Workflow-Regeln).
- [ ] Integration-Tests gegen SQL-Testcontainer.
- [ ] Contract-Tests gegen veröffentlichte OpenAPI.

## Reihenfolge der Bearbeitung

1. AP 2.1 → 2.2 → 2.3 (Datenmodell + Kernberechnungen)
2. AP 2.4 → 2.5 (Workflow, Sonderfälle)
3. AP 2.6 → 2.7 (Auth, Tests)

## Risiken

- **Zeitzonen:** Alles in UTC speichern, an der API-Grenze in `Europe/Berlin` rendern.
- **Sommerzeit:** Tageslängenberechnung mit `NodaTime` statt `DateTime` reduziert Bugs.
- **EF-Performance:** Konten-Endpoint kann teuer werden; bei Wachstum materialized view oder Cache erwägen.
