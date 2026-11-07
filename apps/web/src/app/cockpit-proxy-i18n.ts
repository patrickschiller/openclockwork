export const cockpitProxyDe: Record<string, string> = {
  'cockpitProxy.directoryFailed':
    'Die vollständige Vertretungsauswahl konnte nicht geladen werden. Die Team-Auswahl bleibt verfügbar; weitere Personen nach erneuter Aktualisierung.',
  'cockpitProxy.title': 'Im Auftrag erfassen',
  'cockpitProxy.beneficiary': 'Für {name}',
  'cockpitProxy.action': 'Aktion',
  'cockpitProxy.clockIn': 'Jetzt einstempeln',
  'cockpitProxy.manual': 'Abgeschlossene Zeit nachtragen',
  'cockpitProxy.absence': 'Abwesenheit erfassen',
  'cockpitProxy.request': 'Abwesenheit beantragen',
  'cockpitProxy.clockInHelp':
    'Der Server verwendet den aktuellen Zeitpunkt. Die Person stempelt anschließend im normalen Ablauf aus.',
  'cockpitProxy.manualHelp':
    'Nur abgeschlossene Zeiträume in der Vergangenheit. Gesetzliche und vertragliche Pausen werden vom Server abgezogen. Außerhalb der Rahmenzeit bleibt die Genehmigung durch Führungskraft und HR erforderlich.',
  'cockpitProxy.absenceHelp':
    'Direkte Erfassung ohne Antrags-Genehmigungsablauf. Keine Diagnosen, medizinischen Details oder Bescheinigungen eingeben.',
  'cockpitProxy.requestHelp':
    'Der Antrag durchläuft den normalen Vertretungs-, Führungskraft- und HR-Ablauf. Diese Erfassung ist keine Genehmigung.',
  'cockpitProxy.proxyReason': 'Betriebliche Begründung für die Stellvertretung',
  'cockpitProxy.reasonHelp':
    'Pflichtfeld: 5–1000 Zeichen. Nur den betrieblichen Anlass nennen, keine medizinischen Details.',
  'cockpitProxy.reasonInvalid':
    'Bitte eine betriebliche Begründung mit 5–1000 Zeichen eingeben.',
  'cockpitProxy.project': 'Projekt (optional)',
  'cockpitProxy.noProject': 'Ohne Projekt',
  'cockpitProxy.order': 'Service-Auftrag (erforderlich)',
  'cockpitProxy.chooseOrder': 'Service-Auftrag auswählen',
  'cockpitProxy.activity': 'Tätigkeit (optional)',
  'cockpitProxy.billable': 'Abrechenbar',
  'cockpitProxy.note': 'Buchungsnotiz (optional)',
  'cockpitProxy.targetsLoading':
    'Buchungsziele werden für diese Person geladen …',
  'cockpitProxy.targetsFailed':
    'Buchungsziele konnten nicht geladen werden. Vor dem Buchen erneut laden.',
  'cockpitProxy.targetsEmpty':
    'Dieser Person sind keine buchbaren Projekte zugewiesen. Eine Buchung ohne Projekt ist möglich.',
  'cockpitProxy.retry': 'Erneut laden',
  'cockpitProxy.targetInvalid':
    'Bitte die aktuellen Buchungsziele prüfen und einen gültigen Service-Auftrag auswählen.',
  'cockpitProxy.zone': 'Eingaben in Server-Zeitzone: {timeZone}',
  'cockpitProxy.clockInTime': 'Beginn',
  'cockpitProxy.clockOutTime': 'Ende',
  'cockpitProxy.occurrence': 'Zeitpunkt für {field} (Zeitumstellung)',
  'cockpitProxy.chooseOccurrence': 'Zeitpunkt ausdrücklich auswählen',
  'cockpitProxy.gap':
    'Ungültige Ortszeit oder Zeitlücke bei der Zeitumstellung. Bitte einen existierenden Zeitpunkt eingeben.',
  'cockpitProxy.fold':
    'Diese Ortszeit kommt zweimal vor. Bitte den gemeinten Zeitpunkt anhand von UTC-Offset und ISO-Zeit wählen.',
  'cockpitProxy.instant': 'Tatsächlicher ISO-Zeitpunkt: {iso}',
  'cockpitProxy.timeInvalid':
    'Beginn und Ende müssen eindeutig bestimmt sein. Das Ende muss nach dem Beginn liegen und darf nicht in der Zukunft liegen.',
  'cockpitProxy.kind': 'Abwesenheitsart',
  'cockpitProxy.type': 'Antragsart',
  'cockpitProxy.from': 'Von (einschließlich)',
  'cockpitProxy.to': 'Bis (einschließlich)',
  'cockpitProxy.dateInvalid':
    'Bitte gültige Datumswerte eingeben; das Enddatum darf nicht vor dem Startdatum liegen.',
  'cockpitProxy.vacationYear':
    'Urlaub muss innerhalb eines Kalenderjahres liegen. Bitte in zwei Anträge aufteilen.',
  'cockpitProxy.halfDayStart': 'Erster Tag halb',
  'cockpitProxy.halfDayEnd': 'Letzter Tag halb',
  'cockpitProxy.substitute': 'Vertretung (optional)',
  'cockpitProxy.noSubstitute': 'Keine Vertretung',
  'cockpitProxy.requestReason': 'Antragsbegründung (optional)',
  'cockpitProxy.invalid':
    'Bitte alle Pflichtfelder und Längenbegrenzungen prüfen.',
  'cockpitProxy.submit': 'Für {name} speichern',
  'cockpitProxy.saving': 'Wird gespeichert …',
  'cockpitProxy.saved':
    'Erfassung im Auftrag gespeichert. Der normale Genehmigungsablauf bleibt unverändert.',
  'cockpitProxy.failed':
    'Erfassung fehlgeschlagen. Bitte den aktuellen Stand und die Eingaben prüfen und erneut versuchen.',
  'cockpitProxy.unavailable':
    'Stellvertretende Erfassung ist nur für andere Personen im freigegebenen Team möglich.',
  'cockpitProxy.offline':
    'Offline: Stellvertretende Erfassungen sind deaktiviert.',
};

export const cockpitProxyEn: Record<string, string> = {
  'cockpitProxy.directoryFailed':
    'The full substitute directory could not be loaded. Team choices remain available; refresh to select other colleagues.',
  'cockpitProxy.title': 'Record on behalf',
  'cockpitProxy.beneficiary': 'For {name}',
  'cockpitProxy.action': 'Action',
  'cockpitProxy.clockIn': 'Clock in now',
  'cockpitProxy.manual': 'Add completed time retrospectively',
  'cockpitProxy.absence': 'Record an absence',
  'cockpitProxy.request': 'Request an absence',
  'cockpitProxy.clockInHelp':
    'The server uses the current time. The employee clocks out through the normal flow.',
  'cockpitProxy.manualHelp':
    'Completed periods in the past only. The server applies statutory and contractual breaks. Time outside the working frame still requires manager approval and HR confirmation.',
  'cockpitProxy.absenceHelp':
    'Direct recording without a request approval workflow. Do not enter diagnoses, medical details or certificates.',
  'cockpitProxy.requestHelp':
    'The request follows the normal substitute, manager and HR workflow. Recording it does not approve it.',
  'cockpitProxy.proxyReason': 'Operational reason for acting on behalf',
  'cockpitProxy.reasonHelp':
    'Required: 5–1000 characters. Describe the operational reason only, without medical details.',
  'cockpitProxy.reasonInvalid':
    'Enter an operational reason of 5–1000 characters.',
  'cockpitProxy.project': 'Project (optional)',
  'cockpitProxy.noProject': 'No project',
  'cockpitProxy.order': 'Service order (required)',
  'cockpitProxy.chooseOrder': 'Choose a service order',
  'cockpitProxy.activity': 'Activity (optional)',
  'cockpitProxy.billable': 'Billable',
  'cockpitProxy.note': 'Booking note (optional)',
  'cockpitProxy.targetsLoading': 'Loading booking targets for this employee …',
  'cockpitProxy.targetsFailed':
    'Booking targets could not be loaded. Reload before booking.',
  'cockpitProxy.targetsEmpty':
    'This employee has no assigned bookable projects. Booking without a project is possible.',
  'cockpitProxy.retry': 'Reload',
  'cockpitProxy.targetInvalid':
    'Check current booking targets and select a valid service order.',
  'cockpitProxy.zone': 'Input in server time zone: {timeZone}',
  'cockpitProxy.clockInTime': 'Start',
  'cockpitProxy.clockOutTime': 'End',
  'cockpitProxy.occurrence': 'Instant for {field} (clock change)',
  'cockpitProxy.chooseOccurrence': 'Explicitly choose an instant',
  'cockpitProxy.gap':
    'Invalid local time or daylight-saving gap. Enter an existing time.',
  'cockpitProxy.fold':
    'This local time occurs twice. Choose the intended instant using the UTC offset and ISO timestamp.',
  'cockpitProxy.instant': 'Actual ISO instant: {iso}',
  'cockpitProxy.timeInvalid':
    'Resolve both instants. The end must be after the start and must not be in the future.',
  'cockpitProxy.kind': 'Absence kind',
  'cockpitProxy.type': 'Request type',
  'cockpitProxy.from': 'From (inclusive)',
  'cockpitProxy.to': 'To (inclusive)',
  'cockpitProxy.dateInvalid':
    'Enter valid dates; the end date must not precede the start date.',
  'cockpitProxy.vacationYear':
    'Vacation must be within one calendar year. Split it into two requests.',
  'cockpitProxy.halfDayStart': 'First day is a half day',
  'cockpitProxy.halfDayEnd': 'Last day is a half day',
  'cockpitProxy.substitute': 'Substitute (optional)',
  'cockpitProxy.noSubstitute': 'No substitute',
  'cockpitProxy.requestReason': 'Request reason (optional)',
  'cockpitProxy.invalid': 'Check all required fields and length limits.',
  'cockpitProxy.submit': 'Save for {name}',
  'cockpitProxy.saving': 'Saving …',
  'cockpitProxy.saved':
    'Recorded on behalf. The normal approval workflow is unchanged.',
  'cockpitProxy.failed':
    'Recording failed. Check the current state and your input, then try again.',
  'cockpitProxy.unavailable':
    'Recording on behalf is only available for other employees in the permitted team.',
  'cockpitProxy.offline': 'Offline: recording on behalf is disabled.',
};
