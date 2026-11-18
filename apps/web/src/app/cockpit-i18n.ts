export const cockpitDe: Record<string, string> = {
  'cockpit.expectation.CoreWindow':
    'Buchung während einer belegten Kernzeitpflicht.',
  'cockpit.expectation.OutsideCore':
    'Derzeit außerhalb der belegten Kernzeit – keine daraus abgeleitete Buchungspflicht.',
  'cockpit.expectation.Flexible': 'Keine aktuelle Kernzeitpflicht festgelegt.',
  'cockpit.expectation.Holiday':
    'Feiertag laut bestätigtem Vertragskalender – keine Buchungspflicht.',
  'cockpit.expectation.NonWorkingDay':
    'Vertraglich freier Wochentag – keine Buchungspflicht.',
  'cockpit.expectation.ApprovedAbsence':
    'Genehmigte oder erfasste Abwesenheit – von der Buchungspflicht befreit.',
  'cockpit.expectation.PartialDayTimingUnknown':
    'Halbtägige Abwesenheit ohne belegte Uhrzeit – die aktuelle Pflicht ist unbestimmbar.',
  'cockpit.expectation.UnknownContract':
    'Buchungspflicht ohne bekannte bestätigte Vertrags-/Kalenderdaten unbestimmbar.',
  'cockpit.expectation.UnknownSchedule':
    'Buchungspflicht wegen eines fehlenden oder uneindeutigen Arbeitszeitplans unbestimmbar.',
  'cockpit.expectation.OutsideEmployment':
    'Außerhalb des bestätigten Beschäftigungszeitraums – keine Buchungspflicht.',

  'nav.teamCockpit': 'Team-Cockpit',
  'cockpit.title': 'Team-Cockpit',
  'cockpit.description':
    'Tagesstatus, Genehmigungen und Vertretungsbuchungen für dein aktuelles Team.',
  'cockpit.scope.Team': 'Aktuelles direkt zugeordnetes Team',
  'cockpit.scope.Organisation': 'Aktive Personen der Organisation',
  'cockpit.status': 'Heutiger Buchungsstatus',
  'cockpit.generated': 'Stand: {at} · Zeitzone: {zone}',
  'cockpit.bookingOnly':
    'Eine laufende Buchung ist kein Nachweis physischer Anwesenheit.',
  'cockpit.stale':
    'Der Tagesstatus ist nicht aktuell bestätigt. Bis zur erfolgreichen Aktualisierung ist keine aktuelle Fehlend-Aussage möglich.',
  'cockpit.loadFailed': 'Das Team-Cockpit konnte nicht aktualisiert werden.',
  'cockpit.noEmployees': 'Keine berechtigten Teammitglieder vorhanden.',
  'cockpit.employee': 'Person für Details und Vertretungsaktionen',
  'cockpit.selectEmployee': 'Person auswählen',
  'cockpit.details': 'Verlauf und Vertretungsaktionen',
  'cockpit.since': 'Laufende Buchung seit {at}',
  'cockpit.core': 'Heutige Kernzeitfenster',
  'cockpit.noCore': 'Keine bekannten Kernzeitfenster für heute.',
  'cockpit.absences': 'Genehmigte oder erfasste Abwesenheiten heute',
  'cockpit.coverage': '{coverage} Tag(e)',
  'cockpit.Recorded': 'Erfasst (kein Genehmigungsstatus)',
  'cockpit.Approved': 'Genehmigt',
  'cockpit.approvals': 'Offene Genehmigungen',
  'cockpit.corrections': 'Korrekturanträge für Zeitbuchungen',
  'cockpit.noApprovals':
    'Keine offenen Korrekturanträge im aktuellen Zuständigkeitsbereich.',
  'cockpit.blockedManager':
    'Keine geeignete zuständige Führungskraft zugeordnet. HR muss die Zuordnung prüfen; eine Entscheidung ist hier nicht möglich.',
  'cockpit.waiting':
    'Wartet auf den zuständigen nächsten Schritt. Hier ist keine Entscheidung möglich.',
  'cockpit.decisionFailed':
    'Entscheidung fehlgeschlagen oder bereits geändert. Die aktuellen Daten werden neu geladen.',
  'cockpit.decisionSaved':
    'Entscheidung gespeichert; die nächste zuständige Stelle übernimmt.',
  'cockpit.notAllowed':
    'Für diesen Schritt nicht berechtigt oder Ablehnungsgrund fehlt.',
  'cockpit.auditFailed': 'Der Verlauf konnte nicht vollständig geladen werden.',
  'cockpit.noEvents': 'Keine Ereignisse vorhanden.',
  'cockpit.status.Booked': 'Laufende Zeitbuchung',
  'cockpit.status.Missing': 'Keine Buchung während erforderlicher Kernzeit',
  'cockpit.status.NoCoreNow': 'Aktuell keine Kernzeitpflicht',
  'cockpit.status.Flexible': 'Flexible Arbeitszeit ohne Kernzeitpflicht',
  'cockpit.status.Holiday': 'Feiertag',
  'cockpit.status.NonWorkingDay': 'Arbeitsfreier Tag',
  'cockpit.status.ApprovedAbsence':
    'Genehmigt abwesend oder Abwesenheit erfasst',
  'cockpit.status.PartialAbsenceUnknown':
    'Halbtägige Abwesenheit – aktuelle Pflicht nicht bestimmbar',
  'cockpit.status.UnknownContract': 'Vertragsdaten fehlen – nicht bestimmbar',
  'cockpit.status.UnknownSchedule': 'Arbeitszeitplan fehlt – nicht bestimmbar',
  'cockpit.status.OutsideEmployment': 'Außerhalb des Beschäftigungszeitraums',
  'cockpit.unknownCurrent': 'Aktueller Status nicht bestätigt',
};
export const cockpitEn: Record<string, string> = {
  'cockpit.expectation.CoreWindow':
    'Booked during a known required core-time window.',
  'cockpit.expectation.OutsideCore':
    'Currently outside the known core window; no booking obligation is inferred.',
  'cockpit.expectation.Flexible': 'No current core-time obligation is defined.',
  'cockpit.expectation.Holiday':
    'Holiday in the confirmed contractual calendar; no booking obligation.',
  'cockpit.expectation.NonWorkingDay':
    'Contractual non-working weekday; no booking obligation.',
  'cockpit.expectation.ApprovedAbsence':
    'Approved or recorded absence excuses the booking obligation.',
  'cockpit.expectation.PartialDayTimingUnknown':
    'A half-day absence has no known time-of-day placement; the current obligation cannot be determined.',
  'cockpit.expectation.UnknownContract':
    'The booking obligation cannot be determined without known confirmed contract/calendar facts.',
  'cockpit.expectation.UnknownSchedule':
    'The booking obligation cannot be determined with a missing or ambiguous work schedule.',
  'cockpit.expectation.OutsideEmployment':
    'Outside the confirmed employment period; no booking obligation.',

  'nav.teamCockpit': 'Team cockpit',
  'cockpit.title': 'Team cockpit',
  'cockpit.description':
    'Daily status, approvals and proxy bookings for your current team.',
  'cockpit.scope.Team': 'Currently assigned direct team',
  'cockpit.scope.Organisation': 'Active people in the organisation',
  'cockpit.status': 'Today’s booking status',
  'cockpit.generated': 'As of: {at} · Time zone: {zone}',
  'cockpit.bookingOnly': 'A running booking is not proof of physical presence.',
  'cockpit.stale':
    'Daily status is not currently confirmed. No current missing-status assertion is possible until refresh succeeds.',
  'cockpit.loadFailed': 'The team cockpit could not be refreshed.',
  'cockpit.noEmployees': 'No authorised team members available.',
  'cockpit.employee': 'Person for details and proxy actions',
  'cockpit.selectEmployee': 'Select a person',
  'cockpit.details': 'History and proxy actions',
  'cockpit.since': 'Running booking since {at}',
  'cockpit.core': 'Today’s core-time windows',
  'cockpit.noCore': 'No known core-time windows today.',
  'cockpit.absences': 'Approved or recorded absences today',
  'cockpit.coverage': '{coverage} day(s)',
  'cockpit.Recorded': 'Recorded (not an approval state)',
  'cockpit.Approved': 'Approved',
  'cockpit.approvals': 'Pending approvals',
  'cockpit.corrections': 'Time-entry correction requests',
  'cockpit.noApprovals': 'No pending correction requests in the current scope.',
  'cockpit.blockedManager':
    'No eligible responsible manager is assigned. HR must review the assignment; no decision is available here.',
  'cockpit.waiting':
    'Waiting for the responsible next step. No decision is available here.',
  'cockpit.decisionFailed':
    'Decision failed or already changed. Current data is being reloaded.',
  'cockpit.decisionSaved':
    'Decision saved; the next responsible reviewer takes over.',
  'cockpit.notAllowed':
    'Not authorised for this step or rejection reason is missing.',
  'cockpit.auditFailed': 'History could not be loaded completely.',
  'cockpit.noEvents': 'No events available.',
  'cockpit.status.Booked': 'Running time booking',
  'cockpit.status.Missing': 'No booking during required core time',
  'cockpit.status.NoCoreNow': 'No core-time obligation now',
  'cockpit.status.Flexible':
    'Flexible working time without core-time obligation',
  'cockpit.status.Holiday': 'Public holiday',
  'cockpit.status.NonWorkingDay': 'Non-working day',
  'cockpit.status.ApprovedAbsence': 'Approved or recorded absence',
  'cockpit.status.PartialAbsenceUnknown':
    'Half-day absence – current obligation cannot be determined',
  'cockpit.status.UnknownContract':
    'Contract facts missing – cannot be determined',
  'cockpit.status.UnknownSchedule':
    'Work schedule missing – cannot be determined',
  'cockpit.status.OutsideEmployment': 'Outside employment period',
  'cockpit.unknownCurrent': 'Current status not confirmed',
};
