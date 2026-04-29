# Epic 3 – Frontend (React & PWA)

> Quelle: [`base-instructions.md`](../../base-instructions.md), Epic 3 (US 3.1 – 3.5).
> UI-System: **Material Design 3** durchgängig (MUI v6 mit MD3-Theme oder `@material/web`).

## Tech-Entscheidungen

- **Bundler:** Vite (TypeScript Template).
- **Routing:** `react-router-dom` v6.
- **State/Data:** TanStack Query v5 für Server-State, Zustand für lokalen UI-State.
- **API-Client:** generiert aus OpenAPI (`openapi-typescript` + ein dünner fetch-Wrapper) – kein manuelles Tippen von Response-Typen.
- **PWA:** `vite-plugin-pwa` mit Workbox-Strategie `autoUpdate`. Offline-Fallback nur für Static Assets; API-Calls ohne Netz schlagen sichtbar fehl.
- **i18n:** zunächst Deutsch hart verdrahtet; `react-i18next` vorbereitet für späteren EN-Wechsel.
- **Forms:** `react-hook-form` + `zod`-Schema (geteilt mit Backend-Validierungs-DTO, falls möglich).
- **Date:** `date-fns-tz` (Europe/Berlin).
- **Tests:** Vitest + Testing Library; Playwright für E2E.

## Module / Routen

```
/login                  Azure AD (PKCE)
/                       Dashboard (US 3.4)
/booking                Mobile Kommen/Gehen (US 3.1) – primärer PWA-Screen
/calendar               Jahreskalender (US 3.3)
/requests               Antrags-Liste + Formulare (US 3.2)
/requests/new/:type     Antragsformular je Typ
/admin/requests         Vorgesetzten-Inbox (US 3.5)
/admin/employees        Mitarbeiterverwaltung (US 3.5)
```

Route-Schutz per Rollen-Guard (`Employee` reicht für `/booking`, `Manager+` für `/admin/*`).

## Wichtige Komponenten

| Komponente | Beschreibung | Story |
|---|---|---|
| `ClockInOutCard` | Große Kommen/Gehen-Buttons, GPS-Icon mit Status, letzte Buchung sichtbar | US 3.1 |
| `RequestForm` | Polymorphes Formular pro Antragstyp; warnt bei Zeit < 07:00 / > 23:00 | US 3.2 |
| `YearCalendar` | 12-Monats-Grid, farbcodierte Status-Pills | US 3.3 |
| `OvertimeCard` / `VacationCard` | KPI-Tiles mit Saldo + Resturlaub | US 3.4 |
| `CoreTimeViolationBanner` | rote Warnung im Dashboard | US 3.4 |
| `ApprovalQueueTable` | Tabelle offener Anträge mit Approve/Reject; Hervorhebung Sonderfälle | US 3.5 |

## Arbeitspakete

### AP 3.1 – Skelett & Theme

- [x] Vite-Projekt mit TS strict (Prettier optional, kommt mit Lint-Setup).
- [x] MD3-Theme `src/theme/theme.ts` mit Light + Dark `colorSchemes` (CSS-Variablen, Pill-Buttons, weiche Cards, Roboto-Flex).
- [x] App-Shell `src/app/AppShell.tsx`: Top-Bar mit Color-Scheme-Toggle, persistente Side-Nav ab `md`, BottomNavigation mobil.
- [x] Routing-Skelett (`/`, `/booking`, `/calendar`, `/requests`, `/admin/requests`) mit Platzhalterseiten; Health-Smoke ist Dashboard-Karte.
- [x] PWA-Manifest in `vite.config.ts` (Name, Theme-Color, Display=standalone).
- [ ] PWA-Icons (192/512 + maskable PNGs) – Manifest referenziert sie, Dateien liegen noch nicht.
- [ ] Installations-Prompt-Hook (`beforeinstallprompt`).

### AP 3.2 – Auth & API-Client

- [ ] MSAL-Browser für Azure AD.
- [ ] Token in `Authorization`-Header injizieren (Axios-Interceptor oder Fetch-Wrapper).
- [ ] OpenAPI-Generierung als npm-Script (`npm run generate:api`).

### AP 3.3 – Mobile Buchung (US 3.1)

- [ ] Geolocation API mit Permissions-Fallback (Buchung möglich auch ohne GPS).
- [ ] Optimistic UI: Button toggelt Status sofort, rollback bei Fehler.
- [ ] Sichtbarer Offline-Hinweis, falls Netz fehlt (Buchung wird dann nicht queued — bewusst, um Ambiguität zu vermeiden).

### AP 3.4 – Anträge (US 3.2)

- [ ] Formularvarianten Urlaub / Home-Office / Sonderurlaub / Zeitantrag.
- [ ] Live-Validierung der Zeitfenster (07–23 Warnung als MD3 `Snackbar` / `Banner`).
- [ ] Datei-Upload für Sonderurlaub-Belege (optional, hinter Feature-Flag).

### AP 3.5 – Kalender (US 3.3)

- [ ] `YearCalendar` als virtualisiertes Grid; Status-Legende.
- [ ] Tooltip mit Details bei Hover/Tap.

### AP 3.6 – Dashboard (US 3.4)

- [ ] Drei KPI-Tiles + Verstoß-Banner.
- [ ] Schnellzugriff "Heute buchen" für Mobile.

### AP 3.7 – Admin-Bereich (US 3.5)

- [ ] Inbox mit Filter (offen, genehmigt, abgelehnt) und Highlight für 07–23-Sonderfälle.
- [ ] Bulk-Approve mit Bestätigung.
- [ ] Mitarbeiter-CRUD (HRAdmin only).

### AP 3.8 – Tests & Qualität

- [ ] Unit-Tests pro Komponente (Vitest).
- [ ] E2E-Smoke (Playwright): Login → Buchen → Dashboard.
- [ ] Lighthouse-CI im PR-Check (PWA-Score > 90, A11y > 95).

## Reihenfolge

1. AP 3.1 → 3.2 (Skelett, Auth) — blockiert alles andere.
2. AP 3.3 + 3.6 (Mobile-Pfad MVP).
3. AP 3.4 → 3.5 → 3.7 (Anträge, Kalender, Admin).
4. AP 3.8 fortlaufend; verpflichtend vor Release.

## Risiken

- **iOS-PWA-Limits:** Push, Background Sync und Geolocation im Hintergrund sind eingeschränkt. Buchung nur im Vordergrund versprechen.
- **MD3-Reife:** MUI-MD3 ist noch nicht 100 % feature-complete. Bei Lücken `@material/web` Web Components als Notnagel.
- **OpenAPI-Drift:** Generierung muss in CI laufen; abweichende Typen brechen den Build.
