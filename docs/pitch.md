# OpenClockwork — Pitch

> Self-hostable, lawful-by-construction Zeiterfassung für kleine und mittlere Organisationen.
> Open Source unter Apache 2.0.

Diese Datei ist als Markdown-Slide-Deck formatiert (`---` trennt die Folien). Sie rendert direkt in Marp, reveal-md, oder als normales Markdown.

---

## Das Problem

Der Markt für Zeiterfassung kennt zwei Extreme:

- **Stempeluhr-Apps** (50–200 € / Mitarbeiter / Jahr) ignorieren deutsches Arbeitsrecht. Pausenregeln, Kernzeiten, Urlaubskontingente werden „später bei Bedarf" gerechnet — meistens manuell in Excel.
- **Enterprise-Zeitwirtschaft** (SAP, Atoss, Interflex) kann alles, kostet vierstellig pro Modul und ist nur mit dediziertem HR-IT-Projekt einführbar.

Dazwischen ist eine Lücke: Organisationen mit 20–250 Mitarbeitern, die ihre Daten selbst hosten wollen, deren HR korrekte Salden braucht, und denen kein Budget für ein Sechsstellen-Rollout zur Verfügung steht.

---

## Die Lösung

**OpenClockwork** rechnet das deutsche Arbeitszeitgesetz nicht „on top", sondern in der Domänen-Schicht:

- Pausenabzug **30 min ab 6 h**, **45 min ab 9 h** — automatisch, nicht konfigurierbar abschaltbar
- Kernzeitverletzungen (zu spät rein, zu früh raus, Mittagslücke) werden **serverseitig erkannt** und live im Dashboard markiert
- Anträge außerhalb 07:00–23:00 lösen automatisch eine **genehmigungspflichtige Workflow-Stufe** aus
- Urlaubskontingente, Carry-Over, Übertragsablauf laufen als einheitliches Konto pro Mitarbeiter
- 16 deutsche Bundesländer mit korrekten Feiertagen (Anonymous Gregorian Easter)

---

## Wer profitiert

- **Mittelständler** (20–250 MA), die ihre HR-Daten nicht in einer US-Cloud sehen wollen
- **Werkstätten / Praxen / Kanzleien** mit Hybrid-Office-Modellen und tatsächlich gelebter Gleitzeit
- **Open-Source-orientierte IT-Abteilungen**, die ein nachvollziehbares System ohne SaaS-Lock-in suchen
- **Berater & Integratoren**, die eine modifizierbare Basis für Kundenprojekte brauchen (Apache 2.0 erlaubt Vendoring)

Nicht das richtige Tool: Konzerne mit >1000 MA und Tarifbindung, hochregulierten Schicht- und Zuschlagsmodellen, oder integrierter Lohnabrechnung.

---

## Was es heute kann (Alpha — May 2026)

### Für jeden Mitarbeiter

- **Kommen / Gehen** auf Web + Mobil, mit optionaler GPS-Position (PWA, kein App-Store nötig)
- **Live-Saldo** für Überstunden- und Urlaubskonto auf dem Dashboard
- **Anträge** für Urlaub, Home-Office, Sonderurlaub, Zeitanträge mit Vertretersuche
- **Jahreskalender** mit Farb-Codierung pro Antragstyp (genehmigt vs. ausstehend)
- **Push-Live-Updates** im Browser (Socket.IO) — Genehmigungen kommen ohne Reload an

### Für Manager

- **Inbox** aller offenen Anträge des eigenen Teams
- **Bulk-Genehmigung** / -Ablehnung mit optionaler HR-Bestätigung-Kennung
- **Return-for-Revision** schickt Anträge mit Notiz zurück
- **Audit-Drawer** zeigt den vollständigen Workflow-Verlauf jedes Antrags

### Für HR-Admins

- **Mitarbeiterverwaltung** (CRUD, Aktivierung, Deaktivierung, Passwort-Reset)
- **Arbeitszeitmodelle** (Vollzeit, Teilzeit, Vertrauensarbeitszeit, Gleitzeit) mit konfigurierbaren Kernzeit-Fenstern
- **Urlaubskontingente** pro Jahr inklusive manuellem Adjustment + Carry-Over-Ablauf
- **Substitute-Inbox** + manuelle HR-Bestätigung in den späteren Workflow-Stufen

### Für die Buchhaltung / ERP

- **REST-Export-Endpoint** (`GET /api/erp/timeentries`) mit eigenem API-Key, paginiert, nur genehmigte Einträge
- **Append-only Audit-Log** für jeden Workflow-Übergang — DSGVO-konform reproduzierbar

---

## Demo

Live-Instanz (Alpha, kann jederzeit zurückgesetzt werden):

```
https://oclock-dev-web.lemondune-0385198e.westeurope.azurecontainerapps.io
```

Demo-Zugänge (alle mit Passwort `openclockwork`):

| Rolle | E-Mail |
|---|---|
| HR-Admin | `hannah.roth@openclockwork.test` |
| Manager | `marc.becker@openclockwork.test` |
| Mitarbeiter | `anna.mueller@openclockwork.test` |

In ~30 Sekunden kannst du als Anna eine Stunde buchen, als Hannah ein neues Urlaubskontingent setzen, und als Marc den Urlaub genehmigen — alle Änderungen erscheinen ohne Reload bei den jeweils anderen.

---

## Use Case: Anna bucht einen Arbeitstag

1. Anna öffnet die Web-App auf dem Handy, klickt **Kommen** um 09:00. Der Browser fragt nach GPS — sie erlaubt es.
2. Mittags vergisst sie eine Pause; das System rechnet **automatisch 30 min ab**, sobald sie nach 6 h Arbeitszeit auf **Gehen** klickt.
3. Um 18:30 (länger als 9 h) löst es **45 min Pausenabzug** aus und markiert die Buchung als regulär.
4. Hätte sie nach 23:00 geklickt, wäre der Eintrag automatisch als `requiresApproval` markiert worden — ihr Manager sieht ihn in seiner Inbox.

---

## Use Case: Bernd beantragt Urlaub

1. Bernd öffnet **Anträge → Neu**, wählt **Urlaub**, vom 12.08. bis 19.08.
2. Die UI zeigt ihm in Echtzeit das **verbleibende Urlaubskontingent** (`Resturlaub: 14,5 Tage`) und blendet den Submit-Button aus, sobald < 1 Tag übrig wäre.
3. Bernd wählt **Anna** als Vertretung. Sie bekommt die Anfrage in ihre Substitute-Inbox und kann annehmen oder mit Begründung ablehnen.
4. Erst nach Annas Zusage geht der Antrag an Bernds Manager.

---

## Use Case: Marc genehmigt 5 Anträge

1. Marc öffnet **Admin → Anträge**, sieht 5 Anträge mit `PendingManager`-Status.
2. Er hakt alle 5 an, wählt **Bulk-Genehmigen** mit dem Flag **„HR-Bestätigung erforderlich"** (Sonderurlaub, weil > 1 Woche).
3. Alle 5 wandern automatisch in den `PendingHr`-Status. Hannah bekommt eine Live-Notification im Dashboard.
4. Bernd sieht parallel sein Antrag-Statusbadge sofort auf **„Wartet auf HR"** umspringen — kein Refresh.

---

## Use Case: ERP-Export für die Lohnbuchhaltung

```bash
curl -H "X-Api-Key: $ERP_API_KEY" \
  "https://your-instance/api/erp/timeentries?from=2026-05-01&to=2026-05-31&page=1&pageSize=200"
```

Response: nur **genehmigte** Buchungen, paginiert, mit Brutto- + Nettozeit. Kein Zugriff auf andere Endpoints mit demselben Key — separate Authentifizierungs-Surface.

---

## Tech-Stack (5-Sekunden-Version)

| Komponente | Technologie |
|---|---|
| Backend | NestJS auf Node 20+, TypeScript strict |
| Datenbank | PostgreSQL 16 via Prisma ORM |
| Frontend | React 18 + Vite + Tailwind + shadcn/ui, PWA |
| Echtzeit | Socket.IO mit JWT-Handshake |
| Container | Docker Compose oder Azure Container Apps (Bicep mitgeliefert) |
| Mobile | Dieselbe PWA — kein App-Store, keine Native-Build-Pipeline |

Komplette Stack-Begründung in [`CLAUDE.md`](../CLAUDE.md). Cloud-Deploy-Beispiel als Azure-Reference in [`infra/azure/`](../infra/azure/README.md) — kein Lock-in.

---

## Sicherheit + Compliance

- **Apache 2.0** — du darfst forken, vendor-en, kommerziell anpassen. Markenschutz auf den Namen via [`NOTICE`](../NOTICE).
- **DSGVO-Audit-Trail** — jeder Workflow-Übergang ist als `RequestEvent`-Eintrag mit Aktor, Zeit und Begründung gespeichert. Append-only.
- **JWT-Auth** mit Access + Refresh Token, bcrypt-gehashte Passwörter (Faktor 10).
- **Role-Based Access** in jedem Endpoint (Employee / Manager / HRAdmin).
- **Secrets** nie im Code; im Azure-Reference-Deploy in Key Vault, über User-Assigned Managed Identity auflöst.
- **Sicherheits-Lücken** bitte privat melden via [`SECURITY.md`](../SECURITY.md), nicht als Public Issue.

---

## Selbst hosten

Drei dokumentierte Pfade — alle erzeugen dieselben Container:

### 1. Single-Host Docker-Compose (Recommended für KMU)

```bash
git clone https://github.com/patrickschiller/openclockwork
cd openclockwork
cp .env.example .env.prod   # Secrets eintragen
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
# → http://localhost:8080
```

Inklusive PostgreSQL, API + Web als jeweils ein Container, nginx-Proxy für `/api` und `/socket.io`. Eine VM, ~200 MB RAM idle.

### 2. Azure Container Apps Reference (für Cloud-First-Teams)

Bicep-Templates in [`infra/azure/`](../infra/azure/README.md) deployen den vollständigen Stack:

- Container Apps mit Scale-to-Zero
- Postgres Flexible Server (Burstable B1ms)
- Key Vault für alle Secrets
- ACR für Image-Registry
- Blob Storage für Anhänge
- ~50 EUR/Monat im Alpha-Tier, mit Scale-to-Zero deutlich weniger

GitHub Actions Workflow ist ebenfalls mit dabei: Push auf `main` → Build → Push → Migrate → Roll → Lighthouse-Audit, alles per OIDC ohne Long-Lived-Secrets.

### 3. Kubernetes (nicht out-of-the-box)

Die Images sind k8s-tauglich (read-only, kein lokales Mount nötig wenn `STORAGE_BACKEND=azure-blob` o.ä.). Helm-Chart ist offene Roadmap; gerne PR.

---

## Roadmap

**In nächster Iteration:**

- E-Mail- / Teams-Benachrichtigungen bei Workflow-Übergängen (Service-Stub vorhanden)
- Half-Day Urlaubsbeantragung in der UI (Datenmodell vorbereitet)
- OpenAPI-Client-Codegen für den Frontend (Client aktuell handgepflegt)
- Vollständige Playwright-E2E (Login → Buchen → Antrag → Genehmigung)
- Custom-Domain + Lets-Encrypt-Cert im Azure-Reference

**Mittelfristig:**

- Native Mobile (React Native via Expo, Wiederverwendung der `libs/shared`-Domänen-Schicht)
- Konfigurierbare Schicht-Pläne mit Zuschlägen
- ERP-Anbindungen out of the box (DATEV-Export, Lexware-Format)
- Mehrsprachigkeit (Englisch als zweite Sprache, Übersetzung-Framework vorbereitet)

**Bewusst NICHT geplant:**

- Lohnabrechnung (gibt's bessere spezialisierte Tools)
- Schicht-Modellierung im Konzern-Umfang
- Customer-Support-Vertrag (Apache 2.0 = Self-Support oder via Dritt-Dienstleister)

---

## Beitragen

Du arbeitest in einem ähnlichen Stack und willst mitschrauben? Hier sind die hilfreichsten Einstiegspunkte:

- 🐛 [Issues mit `good first issue`-Label](https://github.com/patrickschiller/openclockwork/issues?q=label%3A%22good+first+issue%22)
- 📚 Tech-Doku für Mitwirkende: [`docs/architecture.md`](./architecture.md)
- 📜 [DCO-Sign-off](../CONTRIBUTING.md#developer-certificate-of-origin-dco) ist Pflicht (`git commit -s`)
- 💬 GitHub Discussions für Feature-Vorschläge bevor du Code schreibst

---

## Kontakt

- GitHub Repository: [github.com/patrickschiller/openclockwork](https://github.com/patrickschiller/openclockwork)
- Maintainer: [Patrick Schiller](https://github.com/patrickschiller) — `p@trickschiller.de`
- Sicherheits-Meldungen: siehe [`SECURITY.md`](../SECURITY.md)

OpenClockwork ist ein Reputations-Projekt, kein Profit-Vehikel. Code-Qualität und Klarheit zählen mehr als Feature-Breite.
