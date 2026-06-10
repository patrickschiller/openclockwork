# Anweisungen zur Programmierung: Integrated Digital Time and Attendance Management System

## Projektübersicht & Tech-Stack
- **Cloud-Provider:** Backend komplett in der Azure Cloud mit Azure SQL und App Services [1].
- **Backend:** C#-Entwicklung unter strikter Verwendung von `async`-Methoden [1]. Es gilt eine klare Trennung von Backend und Frontend durch einen API-First Ansatz [1].
- **Frontend:** React für die Browser-Administrationsoberfläche; als Progressive Web App (PWA) für die mobile Zeiterfassung (Architektur soll eine spätere Migration zu React Native offenlassen) [1].
- **Deployment:** Code-Hosting auf GitHub mit CI/CD-Pipelines via GitHub Actions für automatisiertes Azure Deployment [1].

---

## Epic 1: Infrastruktur & CI/CD
**Ziel:** Bereitstellung der grundlegenden Cloud-Architektur, der Datenbank und der Automatisierungs-Pipelines.

### User Stories

**US 1.1: Azure Cloud & Datenbank Setup**
- **Story:** Als DevOps-Engineer möchte ich eine Azure SQL-Datenbank und Azure App Services bereitstellen, damit das C#-Backend skalierbar in der Cloud läuft [1].
- **Akzeptanzkriterien:**
  - Azure SQL Instanz ist provisioniert und erreichbar.
  - Azure App Service für das C#-Backend ist konfiguriert.
  - Connection Strings sind sicher in den Azure-Umgebungsvariablen (Key Vault) hinterlegt.

**US 1.2: GitHub Actions Pipeline**
- **Story:** Als Entwickler möchte ich eine CI/CD-Pipeline mit GitHub Actions einrichten, um automatisierte Deployments in die Azure Cloud zu gewährleisten [1].
- **Akzeptanzkriterien:**
  - Push auf den Main-Branch triggert einen automatischen Build des C#-Backends und React-Frontends.
  - Erfolgreiche Builds werden automatisch in die Azure App Services deployt.

**US 1.3: PWA- & Frontend-Grundgerüst**
- **Story:** Als Frontend-Entwickler möchte ich das React-Projekt initiieren und als PWA konfigurieren, damit die mobile App installationsfähig ist [1].
- **Akzeptanzkriterien:**
  - React-Projekt ist aufgesetzt.
  - Service Worker und Manifest-Dateien für die PWA sind konfiguriert.
  - API-Clients zur Kommunikation mit dem C#-Backend (API-First) sind vorbereitet.

---

## Epic 2: Backend (C# / API-First)
**Ziel:** Entwicklung der Geschäftslogik, asynchronen REST-APIs, Zeitberechnungen und Workflows. **Alle Methoden müssen zwingend `async` implementiert werden [1]!**

### User Stories

**US 2.1: Verwaltung der Zeitmodelle**
- **Story:** Als HR-Administrator möchte ich verschiedene Zeitmodelle im System anlegen können, um die individuellen Verträge der Mitarbeiter abzubilden [2].
- **Akzeptanzkriterien:**
  - Backend-Datenmodell und API-Endpoints unterstützen die Zeitmodelle: **Teilzeit, Vollzeit, Vertrauensarbeitszeit und Gleitzeit** [2].
  - Pro Mitarbeiter kann ein spezifisches Zeitmodell zugewiesen werden, das als Basis für Soll-Stunden-Berechnungen dient [2].

**US 2.2: Automatische Pausenregelung**
- **Story:** Als Systemadministrator möchte ich, dass Pausenzeiten automatisch nach gesetzlichen Vorgaben abgezogen werden [2].
- **Akzeptanzkriterien:**
  - Das Backend zieht automatisch **30 Minuten Pause nach 6 Stunden** Arbeitszeit ab [2].
  - Nach **9 Stunden Arbeitszeit** werden **weitere 15 Minuten** (insgesamt 45 Minuten) automatisch abgezogen [2].
  - Die API liefert sowohl die Brutto- als auch die Nettoarbeitszeit zurück.

**US 2.3: Zeitkonten (Überstunden & Urlaub)**
- **Story:** Als Mitarbeiter möchte ich, dass das System meine Arbeitszeiten saldiert, um stets den aktuellen Stand meiner Konten abfragen zu können [2].
- **Akzeptanzkriterien:**
  - Das System führt ein **Überstundenkonto** (Ist-Stunden minus Soll-Stunden) [2].
  - Das System führt ein **Urlaubskonto** [2].
  - Asynchrone API-Endpoints stellen den aktuellen Saldo beider Konten für das Frontend bereit [2].

**US 2.4: Antrags-Workflow Engine (Backend)**
- **Story:** Als Mitarbeiter möchte ich verschiedene Anträge stellen, die durch eine Workflow-Engine geprüft und zur Genehmigung weitergeleitet werden [2].
- **Akzeptanzkriterien:**
  - API-Endpoints für das Einreichen von: **Urlaubsanträgen, Home-Office Anträgen, Sonderurlaub und Zeitanträgen** [2].
  - **Sonderregel/Warnung:** Buchungen und Zeitanträge für Zeiten **vor 7:00 Uhr oder nach 23:00 Uhr** triggern einen speziellen Genehmigungsprozess ("Genehmigungspflichtig") [2].

**US 2.5: Kernzeitverletzung & ERP-Schnittstelle**
- **Story:** Als Vorgesetzter möchte ich über Regelverstöße informiert werden und als ERP-System benötige ich die gebuchten Zeiten [1, 2].
- **Akzeptanzkriterien:**
  - Die Backend-Logik erkennt **Kernzeitverletzungen** und stellt entsprechende Infos/Flags via API bereit [2].
  - Es existiert eine gesonderte API-Schnittstelle, die gebuchte und freigegebene Zeiten asynchron für den Abruf durch das externe **ERP-System** bereitstellt [1].

---

## Epic 3: Frontend (React & PWA)
**Ziel:** Entwicklung der responsiven Benutzeroberflächen. Browser für Admins, PWA für mobile Mitarbeiter [1]. Die gesamte Anwendung soll in Material Desgin 3 Patterns umgesetzt werden.

### User Stories

**US 3.1: Mobile Zeiterfassung (Kommen/Gehen via PWA)**
- **Story:** Als Mitarbeiter möchte ich meine Arbeitszeiten mobil erfassen, inklusive automatischer Standortübermittlung [1, 2].
- **Akzeptanzkriterien:**
  - Die PWA bietet gut bedienbare Buttons für **"Kommen" und "Gehen"** [2].
  - Bei der Buchung wird (sofern geräteseitig möglich und berechtigt) der **GPS-Standort** erfasst und an die API übermittelt [1].

**US 3.2: Antrags-Interface (Frontend)**
- **Story:** Als Mitarbeiter möchte ich im Frontend meine Abwesenheiten und Korrekturen beantragen [2].
- **Akzeptanzkriterien:**
  - Formulareingaben für **Urlaub, Home-Office, Sonderurlaub und Zeitanträge** sind verfügbar [2].
  - Das System warnt den Nutzer visuell im Frontend, wenn eine Zeit **vor 7 Uhr oder nach 23 Uhr** gebucht/beantragt wird, da dies eine explizite Genehmigung erfordert [2].

**US 3.3: Jahreskalender-Ansicht**
- **Story:** Als Mitarbeiter möchte ich mein gesamtes Jahr visuell überblicken können [2].
- **Akzeptanzkriterien:**
  - Implementierung einer **Jahreskalender-Komponente** [2].
  - Visuelle (farbliche) Unterscheidung der Status: **Krankheit, Urlaub, Home-Office, Schulung, Sonderurlaub, Gleittage** [2].

**US 3.4: Dashboard & Kontenübersicht**
- **Story:** Als Mitarbeiter möchte ich auf der Startseite direkt meine wichtigsten Zeitsalden sehen [2].
- **Akzeptanzkriterien:**
  - Übersichtliche Anzeige des aktuellen **Überstundenkontos** [2].
  - Übersichtliche Anzeige des **Urlaubskontos** (inkl. Resturlaub) [2].
  - Anzeige von eventuellen Warnungen (z.B. Infos zu **Kernzeitverletzungen**) [2].

**US 3.5: Admin-Browser-Ansicht (Vorgesetzte)**
- **Story:** Als Vorgesetzter möchte ich im Browser-Frontend Anträge prüfen und Mitarbeiterdaten verwalten [1].
- **Akzeptanzkriterien:**
  - Übersichtsliste aller offenen Anträge der Mitarbeiter (Urlaub, Home-Office etc.) mit Genehmigen/Ablehnen-Buttons.
  - Spezielle Hervorhebung von Anträgen, die **vor 7 Uhr /
 oder nach 23 Uhr** liegen (genehmigungspflichtig).

---

## Epic 5: Projektzeiterfassung (Projekte & Service-Aufträge)
**Ziel:** Zeiten können optional auf Projekte gebucht werden. Projekte werden im Admin-Bereich gepflegt und über Service-Aufträge strukturiert; eine Zuweisungsmatrix steuert, wer auf welches Projekt buchen darf.

### User Stories

**US 5.1: Projekt- & Service-Auftragsverwaltung**
- **Story:** Als HR-Administrator oder Vorgesetzter möchte ich Projekte anlegen, bearbeiten und deaktivieren sowie sie über Service-Aufträge strukturieren, um Projektzeiten auswertbar zu machen.
- **Akzeptanzkriterien:**
  - Projekte haben einen eindeutigen Code, Namen, optionale Beschreibung und einen Aktiv-Status.
  - Service-Aufträge (Auftragsnummer eindeutig je Projekt, Titel, Aktiv-Status) strukturieren ein Projekt rein administrativ — gebucht wird ausschließlich auf Projektebene.
  - Projekte mit gebuchten Zeiten können nicht gelöscht, nur deaktiviert werden (ERP-Historie bleibt erhalten).

**US 5.2: Zuweisungsmatrix (Mitarbeiter × Projekte)**
- **Story:** Als HR-Administrator oder Vorgesetzter möchte ich in einer Matrix Mitarbeiter den Projekten zuordnen, um Buchungsberechtigungen zu steuern.
- **Akzeptanzkriterien:**
  - Der Admin-Bereich zeigt eine Matrix Mitarbeiter (Zeilen) × Projekte (Spalten) mit umschaltbaren Zuordnungen.
  - Nur zugewiesene Mitarbeiter können Zeiten auf ein Projekt buchen; die API validiert das hart (fehlende Zuweisung wird abgelehnt).

**US 5.3: Zeitbuchung mit Projekt**
- **Story:** Als Mitarbeiter möchte ich beim Erfassen meiner Zeit direkt ein Projekt auswählen können.
- **Akzeptanzkriterien:**
  - Beim „Kommen" kann optional ein Projekt gewählt werden; der gesamte Zeiteintrag gehört dann zu diesem Projekt.
  - Die Auswahl zeigt nur aktive, dem Mitarbeiter zugewiesene Projekte; Buchung ohne Projekt bleibt möglich.
  - Inaktive, unbekannte oder nicht zugewiesene Projekte werden serverseitig mit klarer Fehlermeldung abgelehnt.

**US 5.4: Nachträgliche Zuordnung & Aufteilen**
- **Story:** Als Mitarbeiter möchte ich das Projekt eines Eintrags nachträglich setzen, ändern oder entfernen und einen Eintrag an einem Zeitpunkt in zwei Buchungen aufteilen (z. B. bei Projektwechsel innerhalb eines Arbeitstags).
- **Akzeptanzkriterien:**
  - Projektzuordnung ist auch nachträglich (inkl. offener Einträge) möglich; bereits freigegebene (Approved) Einträge sind gesperrt, da sie ggf. schon ans ERP exportiert wurden.
  - Der Aufteilungszeitpunkt muss strikt zwischen Kommen und Gehen liegen; die entstehenden Segmente sind lückenlos.
  - Die Genehmigungspflicht (07:00/23:00-Regel) wird je Segment neu berechnet; abgelehnte Einträge bleiben in beiden Segmenten abgelehnt.
  - GPS-Daten verbleiben beim ersten Segment (sie gehören zum physischen Einstempeln).
  - Vorgesetzte/HR dürfen fremde Einträge zuordnen und aufteilen, Mitarbeiter nur eigene.

**US 5.5: ERP-Export mit Projektbezug**
- **Story:** Als ERP-System benötige ich zu jeder freigegebenen Zeit den Projektbezug.
- **Akzeptanzkriterien:**
  - Der ERP-Export liefert je Zeiteintrag `projectCode` und `projectName` (null, wenn ohne Projekt gebucht).
