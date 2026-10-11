# Solo und Team lokal in Docker testen

Diese Anleitung startet zwei unabhängige Installationen aus dem aktuellen
Quellcode. Voraussetzung sind Docker mit Compose und ein laufender Docker-Daemon;
Node.js und pnpm werden auf dem Host nicht benötigt. Alle Befehle werden im
Repository-Verzeichnis ausgeführt.

| Modus | Compose-Projekt | Browser-Adresse |
| --- | --- | --- |
| Solo | `openclockwork-test-solo` | <http://localhost:18080> |
| Team | `openclockwork-test-team` | <http://localhost:18081> |

Die Projekte verwenden dieselben lokal gebauten Images, besitzen aber getrennte
PostgreSQL-Datenbanken, Netzwerke und Anhang-Volumes. Nur die Weboberfläche wird
an `127.0.0.1` veröffentlicht; die API ist über `/api` an derselben Adresse
erreichbar. Datenbank und API haben keine veröffentlichten Host-Ports.

Die Konfiguration enthält ausschließlich synthetische lokale Testschlüssel und
ist für Tests auf diesem Rechner vorgesehen. Verwende nur erfundene Personen und
Testdaten. Die Server-Zeitzone ist `Europe/Berlin`. Der API-Prozess läuft mit
`NODE_ENV=production`, die Weboberfläche mit `DEMO_MODE=false`.

## Einmal bauen und beide Installationen starten

`--env-file /dev/null` verhindert, dass Compose eine vorhandene `.env` als
Konfigurationsquelle lädt. Datenbank und Testschlüssel sind in der Testdatei fest
vorgegeben. `TEST_WEB_PORT` wird für jeden Befehl explizit gesetzt.

```bash
TEST_WEB_PORT=18080 docker compose --env-file /dev/null \
  -p openclockwork-test-solo -f docker-compose.test.yml build

TEST_WEB_PORT=18080 docker compose --env-file /dev/null \
  -p openclockwork-test-solo -f docker-compose.test.yml up -d --wait

TEST_WEB_PORT=18081 docker compose --env-file /dev/null \
  -p openclockwork-test-team -f docker-compose.test.yml up -d --wait
```

Der erste Build kann einige Minuten dauern. Beim API-Start werden ausstehende
Prisma-Migrationen angewendet. Compose wartet auf die Healthchecks von Datenbank,
API und Web. Es werden keine Konten oder Beispieldaten automatisch angelegt.

## Solo einmalig einrichten

Dieser Bootstrap ist nur für eine leere Mitarbeiter-Tabelle vorgesehen:

```bash
TEST_WEB_PORT=18080 docker compose --env-file /dev/null \
  -p openclockwork-test-solo -f docker-compose.test.yml exec -T api \
  node --import tsx prisma/create-admin.ts \
  --mode Solo --first-name Solo --last-name Test --email solo@example.com
```

Der Befehl aktiviert Solo und gibt ein zufällig erzeugtes **Initial password**
einmalig im Terminal aus. Melde dich auf <http://localhost:18080> mit
`solo@example.com` und diesem Passwort an. Du kannst es anschließend unter
**Einstellungen → Passwort** ändern. Das erzeugte Passwort gehört nicht in
Repository-Dateien oder öffentliche Logs.

Teste beispielsweise Timer, manuelle Einträge, Kunden, Projekte, Aufträge und
Timesheets. Die optionale persönliche Arbeitszeitregelung kann separat
konfiguriert werden. Details stehen im [Solo-Leitfaden](SOLO_MODE.md).

## Team einmalig mit synthetischen Beispieldaten einrichten

Führe den Seed nur bei der ersten Einrichtung der leeren Team-Testinstallation
aus. Er legt HR, Führungskräfte, Beschäftigte, Arbeitszeitpläne, Projekte und
Beispielbuchungen an. Wiederholtes Seeding kann geänderte Testkonfigurationen
überschreiben; es gehört weder zum normalen Neustart noch in die Solo-Installation.

```bash
TEST_WEB_PORT=18081 docker compose --env-file /dev/null \
  -p openclockwork-test-team -f docker-compose.test.yml exec -T \
  -e NODE_ENV=development \
  -e OPENCLOCKWORK_SEED_CONFIRM_DATABASE=openclockwork_test \
  api node --import tsx prisma/seed.ts
```

Die beiden Umgebungsvariablen gelten nur für diesen Seed-Prozess. Der laufende
API-Prozess bleibt im Produktionsmodus. Der Seed prüft Datenbankname und Schema;
die Bestätigung bezeichnet ausschließlich die isolierte Testdatenbank dieses
Compose-Projekts. Die frisch migrierte Installation verwendet standardmäßig Team.

Alle folgenden Konten aus [prisma/seed.ts](../prisma/seed.ts) haben anfangs das
Testpasswort **`openclockwork`**:

| Rolle | Name | E-Mail |
| --- | --- | --- |
| HR-Administration | Hannah Roth | `hannah.roth@openclockwork.test` |
| Führungskraft | Marc Becker | `marc.becker@openclockwork.test` |
| Führungskraft | Stefanie Weiss | `stefanie.weiss@openclockwork.test` |
| Beschäftigte | Anna Müller | `anna.mueller@openclockwork.test` |
| Beschäftigter | Bernd Schulz | `bernd.schulz@openclockwork.test` |
| Beschäftigter | Cengiz Yilmaz | `cengiz.yilmaz@openclockwork.test` |
| Beschäftigte | Diana Fischer | `diana.fischer@openclockwork.test` |
| Beschäftigter | Erik Lindgren | `erik.lindgren@openclockwork.test` |
| Beschäftigte | Fatma Demir | `fatma.demir@openclockwork.test` |

Öffne <http://localhost:18081>. Für einen Genehmigungsablauf kannst du einen
Antrag als Anna Müller erstellen und ihn anschließend als Marc Becker oder
Hannah Roth bearbeiten. Separate Browserprofile oder private Fenster erleichtern
den Vergleich verschiedener Rollen. Details stehen im
[Team-Leitfaden](TEAM_MODE.md). Für einen Test auf einem Tablet mit Kamera und
Standortzugriff verwende den gesonderten
[HTTPS-iPad-Leitfaden](IPAD_TERMINAL_SETUP.de.md).

## Stoppen und fortsetzen

Diese Befehle stoppen die Container und erhalten Datenbanken und Anhänge:

```bash
TEST_WEB_PORT=18080 docker compose --env-file /dev/null \
  -p openclockwork-test-solo -f docker-compose.test.yml stop
TEST_WEB_PORT=18081 docker compose --env-file /dev/null \
  -p openclockwork-test-team -f docker-compose.test.yml stop
```

Zum Fortsetzen führe die beiden `up -d --wait`-Befehle vom Anfang erneut aus.
Bootstrap und Seed werden dabei **nicht** wiederholt. Nach Quellcodeänderungen
baue die Images erneut mit dem obigen Build-Befehl und führe anschließend beide
`up -d --wait`-Befehle aus.

Verwende keine Option `down -v`, wenn du deine Testdaten behalten möchtest: Sie
löscht die Volumes des betreffenden Projekts. Andere Compose-Projekte und ihre
Volumes werden von diesen Testbefehlen nicht angesprochen.

## Status und Logs

```bash
TEST_WEB_PORT=18080 docker compose --env-file /dev/null \
  -p openclockwork-test-solo -f docker-compose.test.yml ps
TEST_WEB_PORT=18081 docker compose --env-file /dev/null \
  -p openclockwork-test-team -f docker-compose.test.yml ps

TEST_WEB_PORT=18081 docker compose --env-file /dev/null \
  -p openclockwork-test-team -f docker-compose.test.yml logs --tail=100 api web
```

Gesundheitsstatus im Browser: <http://localhost:18080/api/health> beziehungsweise
<http://localhost:18081/api/health>. Falls ein Port bereits belegt ist, verwende
für alle Befehle dieses Projekts einen anderen `TEST_WEB_PORT`; dadurch werden
Portfreigabe und erlaubte Browser-Origin gemeinsam angepasst.
