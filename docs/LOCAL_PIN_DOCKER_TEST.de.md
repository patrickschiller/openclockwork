# OpenClockwork 2.2.0 mit PIN lokal im Docker testen

Version 2.2.0 enthält weiterhin die in 2.1.0 eingeführte QR/PIN-Implementierung
von Inkrement A. API und Web
verwenden die zusammen gebauten Images `openclockwork-api:2.2.0-pin-local` und
`openclockwork-web:2.2.0-pin-local`. Nach dem Neubau muss die API unter
`/api/health` Version `2.2.0` melden.

Die lokale PIN-Abnahme und die Release-Freigabe für 2.1.0 wurden am 11.10.2026
vom Nutzer bestätigt. Damit ist keine zusätzliche Zielgeräte-/OS-
oder externe Archivabnahme behauptet; diese bleibt installationsbezogen.

Die separate Testversion bindet auf `http://localhost:18082`. Projektname,
Volumes und Images sind von den bestehenden Solo-/Team-Teststacks getrennt.
Alle enthaltenen Zugangsdaten sind synthetisch und nur für lokale Tests gedacht.

```sh
docker compose -p openclockwork-pin-test -f docker-compose.pin-test.yml up -d --build
```

Der separate Migrationscontainer führt Migrationen aus und richtet die
eingeschränkte Runtime-Datenbankrolle ein. Erst danach startet die API.
Die vorhandene Testdatenbank und ihre Volumes beim Update erhalten und zuvor
sichern. Sie benötigen weder Seed noch Reset. Eine bereits angewandte
PIN-Migration bleibt unverändert; Prisma überspringt sie beim erneuten Start.
Nur eine neue leere Testdatenbank einmal synthetisch befüllen:

```sh
docker compose -p openclockwork-pin-test -f docker-compose.pin-test.yml run --rm \
  -e NODE_ENV=development \
  -e OPENCLOCKWORK_SEED_CONFIRM_DATABASE=openclockwork_test_pin \
  migrate node --import tsx prisma/seed.ts
```

HR: `hannah.roth@openclockwork.test`, Passwort `openclockwork`.
Die Mitarbeiterliste enthält weitere synthetische Konten und Personalnummern.
HR konfiguriert QR/PIN und vergibt einen PIN; er wird bei jeder Vergabe zufällig
erzeugt und einmal angezeigt. Unter `/kiosk/pair` mit dem HR-Pairing-Code koppeln.
Zum Desktoptest den Geofence bewusst ausschalten; für GPS/Tablet-Abnahme einen
vertrauenswürdigen HTTPS-Ursprung mit passender CORS-Konfiguration verwenden.

Prüfen: PIN identifiziert ohne Buchung, ausdrückliches IN/OUT bucht genau einmal,
falsche PIN bleibt neutral, Reset/Deaktivieren/Widerruf sperrt alte Freigaben,
QR bleibt nutzbar, wenn es für das Terminal aktiviert ist. Nach Deaktivierung
eines ganzen Terminals oder Gerätewiderruf ist eine neue Kopplung erforderlich.
In HR ist der Audit-Verlauf sichtbar. Die Zugriffsbeschränkungen aus 2.0.1
bleiben aktiv: Mitarbeiter sehen eigene Personaldaten, Manager ihr direktes
Team und HR alle Mitarbeiter; PIN-Verwaltung bleibt HR vorbehalten.
Details zu Grenzen und Betrieb: [QR/PIN-Betriebsanleitung](TERMINAL_AUTH_OPERATIONS.de.md).

Audit-Testadapter im separaten Exportvolume. Bei jeder Wiederholung frische
Dateinamen für Export und Anker wählen: Die Werkzeuge überschreiben keine
Dateien, und das Volume bleibt nach `down` erhalten.

```sh
docker compose -p openclockwork-pin-test -f docker-compose.pin-test.yml exec -T api \
  node ops/terminal-audit.mjs export /app/data/audit/pilot.json
docker compose -p openclockwork-pin-test -f docker-compose.pin-test.yml exec -T api \
  node ops/terminal-audit.mjs anchor /app/data/audit/pilot.json /app/data/audit/pilot.anchor.json
docker compose -p openclockwork-pin-test -f docker-compose.pin-test.yml exec -T api \
  node ops/terminal-audit.mjs verify /app/data/audit/pilot.json /app/data/audit/pilot.anchor.json
```

Diese beiden lokalen Dateien sind eine Funktionsprüfung. Produktionsanker müssen
in ein unabhängig geschütztes Archiv übertragen und dort nachgeprüft werden.

```sh
docker compose -p openclockwork-pin-test -f docker-compose.pin-test.yml ps
docker compose -p openclockwork-pin-test -f docker-compose.pin-test.yml logs --tail=100 api
docker compose -p openclockwork-pin-test -f docker-compose.pin-test.yml down
```

`down` erhält Testdaten. `down -v` würde sie löschen; vor erneutem Seeden vorhandene
Daten prüfen. Port ändern: `PIN_TEST_WEB_PORT=18083` bei allen Compose-Befehlen.
RFID ist kein Bestandteil dieser Testversion.
