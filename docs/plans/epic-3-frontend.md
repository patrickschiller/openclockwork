# Epic 3 – Frontend (React + Vite + Tailwind + shadcn/ui)

> Quelle: [`base-instructions.md`](../../base-instructions.md), Epic 3 (US 3.1 – 3.5).
> UI-System laut [`CLAUDE.md`](../../CLAUDE.md): **Tailwind CSS + shadcn/ui** (Radix-basiert) durchgängig. Kein MUI, kein Material Web Components. Die App ist eine **PWA** (Service Worker + Manifest); die gleiche React-Codebasis bleibt für eine spätere React-Native-Migration plausibel — Browser-only-APIs gehören in Adapter, nicht in Shared-Logik.
>
> **Status (2026-05-19):** Checkboxen gegen den realen Code-Stand abgeglichen. Alle Pages (Dashboard, Booking, Calendar, Requests, Substitute, Admin-Requests/-Employees/-Schedules), JWT-Auth, PWA, Realtime und die Test-/Lighthouse-Qualitätsgates sind umgesetzt. Offen: der CI-Schema-Drift-Job (AP 3.2) und der NRW-Feiertags-Marker im Kalender (AP 3.5) — siehe unten.

## Tech-Entscheidungen

- **Bundler:** Vite (über `@nx/react` und `@nx/vite`).
- **Routing:** `react-router-dom` v6.
- **Server-State:** TanStack Query v5 (`@tanstack/react-query`); kein zweiter State-Store, solange Server-State reicht.
- **API-Client:** aktuell von Hand getypt in `apps/web/src/api/client.ts` (Fetch-Wrapper + alle Endpoints aus Epic 2 + 4). Mittelfristig generiert aus dem NestJS-Swagger-Schema (Skript `pnpm generate:api` mit z. B. `openapi-typescript-codegen` oder `orval`).
- **Forms:** `react-hook-form` + `zod`-Schema. `zod` ist bereits als Dependency vorhanden.
- **Datum:** `date-fns` (bereits vorhanden); für Zeitzonen `date-fns-tz` (`Europe/Berlin`).
- **PWA:** `vite-plugin-pwa` mit Workbox-Strategie `autoUpdate`. Offline-Fallback nur für statische Assets; API-Calls ohne Netz schlagen sichtbar fehl, kein Buchungs-Queueing (zu viel Ambiguität bei Zeiterfassung).
- **Auth (perspektivisch):** JWT-Bearer (siehe Epic 2 / AP 2.6). Bis dahin lebt `CurrentEmployee`-Provider als Übergangs-Login.
- **i18n:** zunächst Deutsch hart verdrahtet; `react-i18next` vorbereiten für späteren EN-Wechsel.
- **Tests:** Vitest + Testing Library für Komponenten; Playwright (in `apps/web-e2e/`) für E2E.

## Module / Routen (aus `src/app/navigation.ts`)

```
/                       Dashboard (US 3.4)
/booking                Mobile Kommen/Gehen (US 3.1)
/calendar               Jahreskalender (US 3.3)
/requests               Antrags-Liste + Formulare (US 3.2)
/substitute             Vertretungs-Inbox (Epic 4)
/admin/requests         Vorgesetzten-/HR-Inbox (US 3.5)
```

Route-Schutz per Rollen-Guard: `Employee+` für Standard-Routen, `Manager`/`HRAdmin` für `/admin/*`. Aktuelle `visibleNavItems(role)`-Logik filtert die Sidebar entsprechend.

## Wichtige Komponenten

| Komponente | Beschreibung | Story |
|---|---|---|
| `ClockInOutCard` | Große Kommen/Gehen-Buttons, GPS-Icon mit Status, letzte Buchung sichtbar | US 3.1 |
| `RequestForm` | Polymorphes Formular pro Antragstyp; warnt bei Zeit < 07:00 / > 23:00; Vacation zeigt Live-Saldo | US 3.2 |
| `YearCalendar` | 12-Monats-Grid, farbcodierte Status-Pills (Krankheit, Urlaub, Home-Office, Schulung, Sonderurlaub, Gleittage) | US 3.3 |
| `OvertimeCard` / `VacationCard` | KPI-Tiles mit Saldo + Resturlaub | US 3.4 |
| `CoreTimeViolationBanner` | Warn-Banner im Dashboard | US 3.4 |
| `ApprovalQueueTable` | Tabelle offener Anträge mit Approve/Reject; Hervorhebung für Sonderfälle | US 3.5 |

## Arbeitspakete

### AP 3.1 – Skelett, Theme, App-Shell

- [x] React-18-App via `@nx/react` + Vite + TypeScript strict.
- [x] Tailwind-Setup (`tailwind.config.js`, `postcss.config.js`, `src/styles.css`) inklusive `tailwindcss-animate`.
- [x] shadcn/ui-Setup: `components.json`, `src/lib/utils.ts` (`cn`), Primitive in `src/components/ui/`: `alert`, `badge`, `button`, `card`, `dialog`, `dropdown-menu`, `input`, `label`, `separator`, `sheet`, `tooltip`.
- [x] App-Shell (`src/app/AppShell.tsx`): Sidebar (ab `md`), Topbar mit `EmployeePicker`, Bottom-Nav (mobil); rollenbasiertes Filtern via `visibleNavItems(role)`.
- [x] Navigation in `src/app/navigation.ts` mit allen sechs Routen oben (Lucide-Icons).
- [x] Routing-Skelett mit `react-router-dom` v6 — Routen mounten `DashboardPage` (echt) und `PlaceholderPage` (Stub für alle anderen).
- [x] PWA-Manifest `manifest.webmanifest` und `<link rel="manifest">` in `index.html`. `index.html` aktuell mit Default-Title "Web", ohne Manifest, ohne `theme-color`.
- [x] Service Worker via `vite-plugin-pwa` (Workbox `autoUpdate`); Plugin noch nicht in `vite.config.mts`.
- [x] PWA-Icons (PNGs 192, 512, maskable) in `apps/web/public/` (aktuell nur `favicon.ico`).
- [x] Installations-Prompt-Hook (`beforeinstallprompt`).

### AP 3.2 – Auth & API-Client

- [x] Übergangs-Login: `CurrentEmployeeProvider` (`src/app/CurrentEmployee.tsx`) lädt Mitarbeiter via `/api/employees`, persistiert die Auswahl in `localStorage`, stellt sie als `useCurrentEmployee()` bereit. Auswahl-Dropdown sitzt in der App-Bar.
- [x] Typisierter Fetch-Wrapper `src/api/client.ts` mit allen Endpoints aus Epic 2 und Epic 4.
- [x] JWT-Auth-Provider (`AuthProvider`, `useAuth()`), Login-Page, Token in `localStorage`/`sessionStorage`, Auto-Refresh — sobald Backend-AP 2.6 liefert.
- [x] `Authorization: Bearer …` als Default-Header im Fetch-Wrapper, `401` triggert Re-Login.
- [x] OpenAPI-Codegen-Skript `pnpm generate:api` (z. B. `openapi-typescript-codegen` oder `orval`), damit `src/api/client.ts` nicht von Hand mit dem NestJS-Schema synchronisiert werden muss. *(Skript vorhanden; erzeugt `src/api/generated.ts`. `client.ts` konsumiert es noch nicht — bewusst handgepflegt, bis das Schema stabil ist.)*
- [ ] CI-Job, der bei Schema-Drift fehlschlägt. *(Offen: `verify:api` ist nicht in `.github/workflows/ci.yml` verdrahtet.)*

### AP 3.3 – Mobile Buchung (US 3.1)

- [x] `BookingPage` (`src/routes/BookingPage.tsx`): `ClockInOutCard` mit Statuschip, optionalem GPS-Switch (Promise-basiertes `getCurrentPosition`, weicher Fallback "ohne GPS senden").
- [x] Buchungstabelle der letzten 20 Einträge via `api.timeEntries(employeeId, …)`.
- [x] 07–23-Warnbanner für Außerregelzeit-Buchungen (sondergenehmigungspflichtig).
- [x] Optimistic UI: Button toggelt Status sofort, Rollback bei Fehler.
- [x] Sichtbarer Offline-Hinweis, wenn Netz fehlt — Buchung wird **nicht** gequeued (bewusst, siehe AP 3.1 / PWA).

### AP 3.4 – Anträge (US 3.2)

- [x] `RequestsPage` (`src/routes/RequestsPage.tsx`) mit Antragsliste + shadcn `Dialog` für neue Anträge. Alle vier Typen (`Vacation`, `HomeOffice`, `SpecialLeave`, `TimeAdjustment`).
- [x] Vacation-Variante zeigt Live-Saldo (siehe Epic 4 / AP 4.4) und blockiert Submit, wenn Tage < benötigt.
- [x] Live-Warnung bei `TimeAdjustment` außerhalb 07–23 (shadcn `Alert`).
- [x] Statusbadge spiegelt `workflowState` (nicht nur `status`) — eigene Badge-Variante pro State.
- [x] Optional (hinter Feature-Flag): Datei-Upload für Sonderurlaub-Belege.

### AP 3.5 – Kalender (US 3.3)

- [x] `CalendarPage` zeigt 12 Monate als Grid; Tage werden über genehmigte/offene Requests eingefärbt (Urlaub/Home-Office/Sonderurlaub/Zeitkorrektur). Offene Anträge: gestrichelter Outline.
- [x] shadcn `Tooltip` pro Tag mit Typ, Status, Begründung.
- [x] Erweiterung um Krankheit, Schulung, Gleittage, sobald die zugehörigen Statusquellen modelliert sind (separater Plan).
- [ ] Feiertage NRW als Hintergrund-Marker (siehe `LeaveCalculator` aus Epic 4). *(Offen: `holidaysFor()` existiert in `libs/shared`, wird im `CalendarPage` aber noch nicht gerendert.)*

### AP 3.6 – Dashboard (US 3.4)

- [x] Dashboard-Skelett (`src/routes/DashboardPage.tsx`) als Landing-Page hinter `/`.
- [x] KPI-Tiles für Überstundenkonto, Resturlaub und YTD-Kernzeitverletzungen (`api.account`, `api.vacationBalance`, `api.violations`).
- [x] "Aktuelle Buchung"-Karte mit Schnellzugriff zur Buchungsseite.
- [x] Liste offener Anträge mit Sondergenehmigungs-Chip.
- [x] `CoreTimeViolationBanner`, wenn Violations vorliegen.
- [x] Detail-Vacation-Saldo-Widget (siehe Epic 4 / AP 4.6).

### AP 3.7 – Admin-Bereich (US 3.5)

- [x] `AdminRequestsPage` (Manager + HRAdmin only) mit Statusfilter (Offen / Genehmigt / Abgelehnt / Alle), shadcn `Table` und Approve/Reject-Buttons. Sondergenehmigungs-Zeilen farblich hervorgehoben.
- [x] Audit-Drawer (shadcn `Sheet`) mit `api.getRequestEvents(id)`-Timeline (siehe Epic 4 / AP 4.6).
- [x] Bulk-Approve mit Bestätigungs-Modal.
- [x] Mitarbeiter-CRUD (`/admin/employees`, HRAdmin only) — eigener Folge-AP.

### AP 3.8 – Realtime-Anbindung

- [x] `socket.io-client` mit Auth-Handshake (JWT aus AuthProvider).
- [x] TanStack-Query-Cache wird auf Server-Events invalidiert (`request:transitioned`, `time-entry:created`, `violation:detected`).
- [x] Kein paralleler State-Store; Sockets sind nur Invalidations-Trigger.

### AP 3.9 – Tests & Qualität

- [x] Vitest pro Page-Komponente (`RequestsPage`-Dialog disabled bei zu wenig Tagen, `BookingPage` Status-Wechsel, etc.).
- [x] Playwright-Smoke (`apps/web-e2e/`): Login → Buchen → Dashboard.
- [x] Lighthouse-CI im PR-Check (PWA installierbar, A11y > 95).
- [x] axe-Run gegen kritische Pages (Dashboard, Booking, Requests, Admin).

## Reihenfolge

1. **AP 3.1 fertigstellen** (PWA-Manifest + Service Worker + Icons) — blockiert PWA-Anspruch.
2. **AP 3.2 zweite Hälfte** sobald Backend-AP 2.6 (Auth) steht.
3. **AP 3.3 + 3.6** (Mobile-Buchung + Dashboard-KPIs) als MVP.
4. **AP 3.4 → 3.5 → 3.7** (Anträge, Kalender, Admin) — bauen auf den Endpoints aus Epic 2/4 auf.
5. **AP 3.8** sobald Backend-Gateway aus Epic 2 / AP 2.7 läuft.
6. **AP 3.9** fortlaufend, Pflicht vor Release-Tag.

## Risiken

- **iOS-PWA-Limits:** Push, Background Sync und Geolocation im Hintergrund sind eingeschränkt. Buchung nur im Vordergrund versprechen.
- **shadcn-"Komponentenbibliothek-aber-nicht-wirklich":** shadcn-Komponenten leben kopiert im Repo, nicht als Dependency. Das ist Absicht (volle Kontrolle), heißt aber: keine automatischen Upgrades — bei Radix-Major-Wechseln manuell nachziehen.
- **OpenAPI-Drift:** Solange `src/api/client.ts` von Hand gepflegt wird, kann er still gegen das NestJS-Schema auseinanderlaufen. Spätestens vor dem ersten externen Konsumenten muss AP 3.2 / OpenAPI-Codegen stehen.
- **Übergangs-Login bleibt sichtbar:** Der `EmployeePicker` ist offensichtlich kein echter Login. In allen Demos klar als "Pre-Auth-Stand-in" benennen.
