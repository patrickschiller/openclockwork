# Backlog — offene User-Stories

Lebendige Liste der offenen und geplanten User-Stories für OpenClockwork.
Ergänzt die vier abgeschlossenen Epic-Pläne unter [`docs/plans/`](./plans/):
Punkte, die *nach* dem Epic-Durchlauf aufkommen, landen hier — nicht in den
Epic-Dateien.

- **Verbindliche Quelle der Domäne** bleibt [`base-instructions.md`](../base-instructions.md).
- **Umsetzungsstand der Epics:** [`implementation-status.md`](./implementation-status.md).
- Deployment-/Infra-Folgearbeiten (Custom Domain, VNet, HA-Postgres, …) stehen
  bewusst in [`adr/0001-azure-hosting.md`](./adr/0001-azure-hosting.md), nicht hier.

## Eine Story hinzufügen

1. Vorlage unten kopieren, ans **Ende** der Story-Liste einfügen.
2. Nächste freie ID vergeben (`B-1`, `B-2`, … — fortlaufend, IDs werden nie
   wiederverwendet).
3. Status auf 🔵 setzen, Datum unter "Erfasst" eintragen.
4. Beim Bearbeiten Status pflegen; erledigte Stories bleiben mit 🟢 stehen
   (Historie), nicht löschen.

## Status-Legende

| Symbol | Bedeutung |
|---|---|
| 🔵 | Offen — noch nicht begonnen |
| 🟡 | In Arbeit |
| 🟢 | Erledigt |
| ⚪ | Zurückgestellt / bewusst nicht geplant |

## Priorität

`Hoch` / `Mittel` / `Niedrig` — grobe Einordnung, keine feste Reihenfolge.

## Vorlage (kopieren)

```markdown
### B-X — Kurztitel

- **Status:** 🔵 Offen
- **Priorität:** Mittel
- **Erfasst:** YYYY-MM-DD
- **Bezug:** (optionaler Verweis: Epic-AP, ADR, Datei, Issue)

**Story:** Als &lt;Rolle&gt; möchte ich &lt;Ziel&gt;, damit &lt;Nutzen&gt;.

**Akzeptanzkriterien:**
- [ ] …
- [ ] …

**Notizen:** (optional — Kontext, Abhängigkeiten, offene Designfragen)
```

---

## Stories

### B-1 — OpenAPI-Contract-Drift-Check in CI

- **Status:** 🔵 Offen
- **Priorität:** Mittel
- **Erfasst:** 2026-05-19
- **Bezug:** Epic 2 / AP 2.8, Epic 3 / AP 3.2

**Story:** Als Maintainer möchte ich, dass CI fehlschlägt, wenn der
Frontend-API-Client vom NestJS-OpenAPI-Schema abweicht, damit der hand­
gepflegte `client.ts` nicht still gegen die echte API auseinanderläuft.

**Akzeptanzkriterien:**
- [ ] `.github/workflows/ci.yml` führt `pnpm verify:api` aus.
- [ ] Schema-Drift (`apps/api/openapi.json` oder `apps/web/src/api/generated.ts`
      nicht aktuell) lässt den Job rot werden.
- [ ] Doku, wie man Drift lokal behebt (`pnpm generate:api`).

**Notizen:** Skripte `generate:api` / `verify:api` existieren bereits,
`generated.ts` wird erzeugt — aber CI erzwingt nichts und `client.ts` ist
weiterhin handgetypt. Entscheidung offen: nur Drift-Gate, oder `client.ts`
ganz auf `generated.ts` umstellen.

### B-2 — NRW-Feiertage im Jahreskalender markieren

- **Status:** 🔵 Offen
- **Priorität:** Niedrig
- **Erfasst:** 2026-05-19
- **Bezug:** Epic 3 / AP 3.5

**Story:** Als Mitarbeiter möchte ich gesetzliche Feiertage im Jahres­
kalender als Hintergrund-Marker sehen, damit ich Urlaubsanträge nicht
versehentlich auf Feiertage lege.

**Akzeptanzkriterien:**
- [ ] `CalendarPage` rendert Feiertage des Mitarbeiter-Bundeslands optisch
      (z.B. dezenter Hintergrund + Tooltip mit dem Feiertagsnamen).
- [ ] Quelle ist `holidaysFor(bundesland, year)` aus `libs/shared`.
- [ ] Feiertage sind von Abwesenheits- und Antrags-Pills klar unterscheidbar.

**Notizen:** `holidaysFor()` existiert in `libs/shared`; es fehlt nur das
Rendering. Pro-Mitarbeiter-Bundesland ist im Datenmodell schon vorhanden.

### B-3 — E-Mail-/Teams-Benachrichtigung bei Workflow-Übergängen

- **Status:** 🔵 Offen
- **Priorität:** Mittel
- **Erfasst:** 2026-05-19
- **Bezug:** `RequestNotificationService`

**Story:** Als Mitarbeiter/Vorgesetzter möchte ich bei Workflow-Übergängen
(Antrag eingereicht, genehmigt, abgelehnt, zur Korrektur zurück) eine
Benachrichtigung per E-Mail oder Teams erhalten, damit ich nicht aktiv im
System nachsehen muss.

**Akzeptanzkriterien:**
- [ ] Adapter-Pattern analog zum `StorageAdapter` (Interface + Implementierung,
      per Env-Variable wählbar; NoOp-Default bleibt).
- [ ] Mindestens ein echter Adapter (SMTP-E-Mail).
- [ ] Konfiguration über Umgebungsvariablen, keine Secrets im Code.
- [ ] Fehlversand bricht den Workflow-Übergang nicht ab (fire-and-forget,
      geloggt).

**Notizen:** `RequestNotificationService` loggt aktuell nur und broadcastet
das Socket-Event. In den Epic-Plänen war stets nur der Stub spezifiziert —
der echte Versand ist deshalb Backlog, kein offenes Epic-Item.

### B-4 — Halbtags-Abwesenheit entschuldigt die betroffene Kernzeit

- **Status:** 🔵 Offen
- **Priorität:** Niedrig
- **Erfasst:** 2026-05-19
- **Bezug:** `ViolationsService`, `detectCoreTimeViolationsForDay`

**Story:** Als Mitarbeiter mit einem genehmigten halben Gleittag/Urlaubstag
möchte ich, dass die in diese Hälfte fallende Kernzeit nicht als Verletzung
gewertet wird, damit ich für eine genehmigte Abwesenheit nicht abgemahnt
werde.

**Akzeptanzkriterien:**
- [ ] `ViolationsService` berücksichtigt genehmigte Abwesenheiten/Anträge,
      die ein Kernzeit-Fenster abdecken, und überspringt diese.
- [ ] Ganztägige genehmigte Abwesenheit → keine Kernzeitverletzung am Tag.
- [ ] Halbtags-Abwesenheit → nur die nicht abgedeckte Kernzeit kann noch
      verletzt werden.

**Notizen:** Aufgekommen beim TimeAdjustment-Fix (Commit `e869dd0`). Aktuell
prüft die Kernzeit-Logik ausschließlich `TimeEntry`-Buchungen, keine
genehmigten Abwesenheiten. Domänenregel mit `base-instructions.md` abgleichen,
bevor implementiert wird.
