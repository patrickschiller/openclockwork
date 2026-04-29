# BagChronos

> Digitales Zeiterfassungs- und Anwesenheitsmanagement-System – Cloud-native, API-first, mobil-fähig.

Mitarbeiter buchen Kommen/Gehen mobil per PWA, Vorgesetzte verwalten Anträge im Browser, das Backend rechnet Salden, Pausen und Kernzeitverletzungen automatisch und stellt Daten via API für ein externes ERP bereit. Vollständige fachliche Spezifikation: [`base-instructions.md`](./base-instructions.md).

---

## Tech-Stack

| Schicht | Technologie | Anmerkungen |
|---|---|---|
| **Backend** | C# / .NET 8, ASP.NET Core Minimal APIs | **Alle I/O-Methoden async** – harte Regel |
| **Persistenz** | Azure SQL + EF Core 8 (Code-First) | Connection-String über Key Vault Reference |
| **Auth** | Azure AD (MSAL / Microsoft.Identity.Web) | Rollen: Employee, Manager, HRAdmin, ErpClient |
| **Frontend Web** | React 18 + Vite + TypeScript | Material UI v6 mit MD3-Theme |
| **Frontend Mobile** | Gleicher Code als PWA (`vite-plugin-pwa`) | Architektur hält React-Native-Migration offen |
| **Hosting** | Azure App Service (API) + Static Web App (Frontend) | Linux Plan, B1 für Start |
| **CI/CD** | GitHub Actions, OIDC-Federation zu Azure | Kein Publish-Profile, keine Long-Lived Secrets |
| **Secrets** | Azure Key Vault + Managed Identity | Keine Secrets im Repo, niemals |

Querschnittliche Regeln stehen in [`docs/plans/README.md`](./docs/plans/README.md) und [`CLAUDE.md`](./CLAUDE.md).

---

## Repository-Layout

```
backend/                 ASP.NET Core 8 Web API
  BagChronos.sln
  src/BagChronos.Api/    Minimal APIs, Health-Endpoint, Swagger
frontend/                React + Vite + PWA
  src/                   App-Code (TS, MUI MD3)
  public/                Statische Assets, PWA-Icons
docs/
  plans/                 Implementierungspläne pro Epic
  azure-setup.md         Schritt-für-Schritt Azure + GitHub Actions
.github/workflows/       CI (PR) + Deploy (Push auf main)
base-instructions.md     Fachliche Spezifikation (Quelle der Wahrheit)
CLAUDE.md                Hinweise für KI-Assistenten in diesem Repo
```

---

## Epics auf einen Blick

| # | Titel | Inhalt | Plan |
|---|---|---|---|
| **1** | Infrastruktur & CI/CD | Azure-Ressourcen, Repo-Bootstrap, GitHub-Actions-Pipelines, PWA-Grundgerüst | [Plan](./docs/plans/epic-1-infrastructure.md) |
| **2** | Backend (C# / API-First) | Domänenmodell (Mitarbeiter, Buchungen, Konten, Anträge), Pausenregelung, Workflow-Engine, ERP-Schnittstelle, Auth | [Plan](./docs/plans/epic-2-backend.md) |
| **3** | Frontend (React & PWA) | Mobile Buchung mit GPS, Antragsformulare, Jahreskalender, Dashboard, Admin-Inbox | [Plan](./docs/plans/epic-3-frontend.md) |

Reihenfolge ist verbindlich: Epic 1 muss laufen, bevor Epic 2 deployed werden kann; Epic 3 hängt am API-Vertrag aus Epic 2.

### Schlüsselregeln aus der Fachspezifikation

- **Pausen:** automatischer Abzug von 30 min ab 6 h, weitere 15 min ab 9 h Arbeitszeit (gesamt 45 min).
- **Sonderfreigabe:** Buchungen/Anträge mit Zeit **vor 07:00 oder nach 23:00** triggern Genehmigungspflicht; Frontend warnt visuell.
- **Zeitmodelle:** Teilzeit, Vollzeit, Vertrauensarbeitszeit, Gleitzeit – ein Modell pro Mitarbeiter.
- **Konten:** Überstundenkonto (Ist − Soll) und Urlaubskonto, beide per API als Saldo abrufbar.
- **ERP-Export:** separater API-Endpoint, eigener Auth-Scope, nur freigegebene Buchungen.

---

## Schnellstart (lokal)

### Voraussetzungen

- .NET SDK **8.x**
- Node.js **20.x** + npm
- (für Cloud-Setup) Azure CLI ≥ 2.60

### Backend

```bash
cd backend
dotnet restore
dotnet run --project src/BagChronos.Api
```

- Swagger UI: http://localhost:5080/swagger
- Health: http://localhost:5080/api/health

### Frontend

```bash
cd frontend
cp .env.example .env      # VITE_API_BASE_URL ggf. anpassen
npm install
npm run dev
```

- App: http://localhost:5173

Die Smoke-Page lädt initial den Health-Endpoint des Backends und zeigt das Ergebnis an. Wenn das funktioniert, ist die Umgebung sauber aufgesetzt.

---

## Workflow für Entwickler

1. **Branch** vom aktuellen `main` ziehen (Trunk-based, kurze Branches).
2. Vor dem ersten Commit `dotnet build` bzw. `npm run typecheck` lokal grün bekommen.
3. **Pull Request** gegen `main` öffnen → CI-Workflows laufen automatisch:
   - `backend-ci` (Build + Test)
   - `frontend-ci` (Type-Check + Build)
4. **Review + Merge** → Push auf `main` triggert die Deploy-Workflows nach Azure.
5. Nach Merge: Smoke-Test auf Prod-URLs (Health + Frontend lädt).

> ⚠️ **Niemals** Secrets oder Connection-Strings ins Repo committen. Lokal `.env`, in Azure Key Vault, in GitHub als Encrypted Secret/Variable.

---

## Deployment

- Push auf `main` ⇒ automatisches Deployment via GitHub Actions.
- Backend nach Azure App Service (`app-bagchronos-api`).
- Frontend nach Azure Static Web App (`swa-bagchronos-web`).
- Vollständige Cloud-Einrichtung: [`docs/azure-setup.md`](./docs/azure-setup.md).

---

## Weiterführende Dokumente

- 📐 Fachliche Spezifikation: [`base-instructions.md`](./base-instructions.md)
- 🗺️ Plan-Übersicht: [`docs/plans/README.md`](./docs/plans/README.md)
- ☁️ Azure-Setup & GitHub Actions: [`docs/azure-setup.md`](./docs/azure-setup.md)
- 🤖 Hinweise für KI-Assistenten: [`CLAUDE.md`](./CLAUDE.md)
