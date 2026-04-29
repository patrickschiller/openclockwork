# Implementierungsplan – Übersicht

Quelle aller fachlichen Anforderungen ist [`base-instructions.md`](../../base-instructions.md). Die Pläne hier brechen das Projekt in drei teilbare Arbeitspakete (eines pro Epic), sodass Backend, Frontend und Infrastruktur parallel oder von verschiedenen Personen umgesetzt werden können.

## Reihenfolge

1. **Epic 1 – Infrastruktur & CI/CD** ([Plan](./epic-1-infrastructure.md))
   Muss als Erstes laufen, weil ohne CI/CD-Pipeline und Azure-Ressourcen kein Backend deployed werden kann. Die Azure-Schritte sind in [`../azure-setup.md`](../azure-setup.md) dokumentiert.
2. **Epic 2 – Backend (C# / API-First)** ([Plan](./epic-2-backend.md))
   Domänenlogik, Datenmodell, REST-API. Muss vor produktiver Frontend-Arbeit eine stabile API-Vertragsbasis liefern (OpenAPI).
3. **Epic 3 – Frontend (React & PWA)** ([Plan](./epic-3-frontend.md))
   Browser-Admin-UI und mobile PWA. Konsumiert ausschließlich die in Epic 2 definierte API.
4. **Epic 4 – Urlaub & Freigabe-Workflow** ([Plan](./epic-4-vacation-workflow.md))
   Erweiterung der Stammdaten um jahresweise Urlaubsansprüche, korrekte Resttage-Berechnung und vollständiger Genehmigungs-Workflow für Urlaubsanträge.

## Querschnittliche Regeln (gelten in allen Epics)

- **Async-Pflicht im Backend:** Jede C#-Methode mit I/O-Bezug ist `async` zu implementieren. Keine `.Result`/`.Wait()`-Aufrufe.
- **API-First:** Datenformate werden im Backend definiert und per OpenAPI-Spezifikation publiziert. Frontend-Typen werden aus dem OpenAPI-Schema generiert.
- **Material Design 3** für die gesamte Frontend-Oberfläche.
- **Secrets niemals im Code:** Verbindungen, Schlüssel und Tokens nur über Azure Key Vault bzw. GitHub Encrypted Secrets.
- **Trunk-based Branching:** Feature-Branches kurz halten, PRs gegen `main`. Push auf `main` triggert Deployment (siehe Azure-Setup).

## Definition of Done je Epic

Ein Epic gilt als abgeschlossen, wenn alle User Stories des Epics erfüllt sind, die Akzeptanzkriterien getestet wurden und der zugehörige Code im `main`-Branch deployed ist.
