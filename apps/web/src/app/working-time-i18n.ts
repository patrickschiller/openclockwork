export const workingTimeDe: Record<string, string> = {
  'reports.accessDenied':
    'Diese Seite ist Führungskräften und HR-Admins vorbehalten.',
  'reports.scope.Manager':
    'Eigene Teammitglieder – der Server begrenzt die Auswahl und Auswertung auf dein zugewiesenes Team.',
  'reports.scope.HRAdmin':
    'Alle Mitarbeiter:innen – HR kann organisationsweit auswerten.',
  'reports.period': 'Zeitraum',
  'reports.week': 'Woche',
  'reports.month': 'Monat',
  'reports.custom': 'Benutzerdefiniert',
  'reports.employeesFailed':
    'Die Mitarbeiter-Auswahl konnte nicht geladen werden.',
  'comparison.title': 'Soll/Ist-Vergleich',
  'comparison.description':
    'Vertragliches Soll und erfasste Netto-Arbeitszeit für denselben gewählten Zeitraum – auch für Personen ohne Buchungen.',
  'comparison.target': 'Soll',
  'comparison.actual': 'Ist (vorläufig)',
  'comparison.difference': 'Differenz (Ist − Soll)',
  'comparison.indicator': 'Einordnung',
  'comparison.openEntries': 'Offene Buchungen (nicht enthalten)',
  'comparison.hours': '{hours} h',
  'comparison.period':
    '{from} – {to} · Zeitzone: {timeZone} · Netto-Arbeitszeit',
  'comparison.provisional':
    'Vorläufiges Ist: Abgeschlossene Buchungen mit Status „Ausstehend“ oder „Genehmigt“ zählen nach Pausenabzug. Offene, abgelehnte und ungültige Buchungen zählen nicht.',
  'comparison.notAccount':
    'Die Differenz gilt nur für diesen Zeitraum. Sie ist kein fortgeschriebenes Überstundenkonto und enthält keinen Eröffnungssaldo.',
  'comparison.reviewHint':
    'Ab +{hours} h Differenz wird eine Prüfung des gewählten Zeitraums empfohlen. Dies ist weder eine gesetzliche Grenze noch eine rechtliche Bewertung.',
  'comparison.empty':
    'Keine Mitarbeiter:innen für die gewählte Auswahl vorhanden.',
  'comparison.historyGap':
    'Soll unbekannt: Bestätigte Vertragshistorie fehlt. HR muss die Vertragsdaten für diese Tage bestätigen.',
  'comparison.unknownDates': 'Tage ohne bestätigte Vertragsdaten: {dates}',
  'comparison.indicator.Unknown': 'Unbekannt',
  'comparison.indicator.Negative': 'Unter Soll',
  'comparison.indicator.Balanced': 'Ausgeglichen',
  'comparison.indicator.Positive': 'Über Soll',
  'comparison.indicator.Excess': 'Prüfung empfohlen (ab +10 h)',
  'contracts.title': 'Bestätigte Vertragszeiträume',
  'contracts.description':
    'Nur HR bestätigt historische Vertragsdaten. Ohne Bestätigung bleiben auch bekannte Altdaten für den Soll-Vergleich unbekannt.',
  'contracts.snapshotHint':
    'Jeder bestätigte Zeitraum speichert eigene Vertrags-, Arbeitstage- und Feiertagsdaten, keinen Live-Verweis auf einen Arbeitszeitplan. Spätere Profil- oder Planänderungen ändern die bestätigte Historie nicht. HR muss dafür einen neuen wirksamen Zeitraum hinzufügen.',
  'contracts.empty':
    'Noch keine bestätigten Vertragszeiträume. Das historische Soll ist unbekannt.',
  'contracts.loadFailed': 'Die Vertragshistorie konnte nicht geladen werden.',
  'contracts.refresh': 'Vertragshistorie aktualisieren',
  'contracts.history': 'Bestätigte Historie (nur lesbar)',
  'contracts.new': 'Neuen Vertragszeitraum bestätigen',
  'contracts.unconfirmed':
    'UNBESTÄTIGTER ENTWURF: Die vorausgefüllten aktuellen Stammdaten und Planwerte sind nur ein Vorschlag, kein Nachweis für historische Vertragsdaten. Bitte alle Angaben für den wirksamen Zeitraum prüfen.',
  'contracts.effectiveFrom': 'Vertrag gültig ab',
  'contracts.effectiveTo': 'Vertrag gültig bis (optional, einschließlich)',
  'contracts.employmentStart': 'Vertraglicher Beschäftigungsbeginn',
  'contracts.employmentEnd': 'Vertragliches Beschäftigungsende (optional)',
  'contracts.weeklyHours': 'Vertrags-Wochenstunden',
  'contracts.timeModel': 'Vertrags-Zeitmodell',
  'contracts.workingDays': 'Vertragliche Arbeitstage',
  'contracts.scheduleLabel': 'Planbezeichnung als Momentaufnahme (optional)',
  'contracts.holidayCalendar': 'Vertraglicher Feiertagskalender',
  'contracts.holidayDates': 'Vertragliche zusätzliche Feiertage',
  'contracts.confirmationNote': 'Bestätigungsnotiz (Pflicht)',
  'contracts.noteHint':
    '5–1000 Zeichen: Quelle und Prüfung der Vertragsdaten dokumentieren.',
  'contracts.confirm':
    'Ich bestätige diese Vertragsdaten für den angegebenen Zeitraum ausdrücklich als HR.',
  'contracts.save': 'Vertragszeitraum bestätigen',
  'contracts.saved':
    'Vertragszeitraum bestätigt. Die Auswertung wird aktualisiert.',
  'contracts.saveFailed': 'Der Vertragszeitraum konnte nicht bestätigt werden.',
  'contracts.conflict':
    'Die Vertragshistorie wurde geändert oder der Zeitraum überschneidet sich. Bitte die Historie aktualisieren, den Zeitraum prüfen und gegebenenfalls die Ablösung erneut auswählen.',
  'contracts.supersedes': 'Bisherigen Zeitraum ablösen (optional)',
  'contracts.noSupersession':
    'Eigenständigen, nicht überlappenden Zeitraum hinzufügen',
  'contracts.supersessionHint':
    'Eine Ablösung beendet nur den ausgewählten bisherigen Zeitraum am Tag vor dem neuen Beginn (einschließlich). Der neue Beginn muss später als dessen Beginn und noch innerhalb des bisherigen Zeitraums liegen. Andere Überschneidungen sind nicht zulässig; bestätigte Fakten können nicht überschrieben oder gelöscht werden.',
  'contracts.invalid':
    'Bitte gültige Datumsgrenzen, Wochenstunden (0–168, höchstens 2 Nachkommastellen) und eine Bestätigungsnotiz angeben. Positive Wochenstunden benötigen Arbeitstage mit höchstens 24 Stunden je Tag. Bei einer Ablösung muss der neue Beginn nach dem bisherigen Beginn liegen.',
  'contracts.openEnded': 'unbefristet',
  'contracts.confirmedBy': 'Bestätigt von',
  'contracts.actorUnavailable': 'Person nicht mehr verfügbar',
  'contracts.revision': 'Revision',
  'contracts.createdAt': 'Erstellt am',
};

export const workingTimeEn: Record<string, string> = {
  'reports.accessDenied': 'This page is reserved for managers and HR admins.',
  'reports.scope.Manager':
    'Your team members – the server restricts the selection and report to your assigned team.',
  'reports.scope.HRAdmin':
    'All employees – HR can report across the organisation.',
  'reports.period': 'Period',
  'reports.week': 'Week',
  'reports.month': 'Month',
  'reports.custom': 'Custom',
  'reports.employeesFailed': 'The employee selection could not be loaded.',
  'comparison.title': 'Target/actual comparison',
  'comparison.description':
    'Contractual target and recorded net working time for the same selected period, including employees without entries.',
  'comparison.target': 'Target',
  'comparison.actual': 'Actual (provisional)',
  'comparison.difference': 'Difference (actual − target)',
  'comparison.indicator': 'Indicator',
  'comparison.openEntries': 'Open entries (excluded)',
  'comparison.hours': '{hours} h',
  'comparison.period':
    '{from} – {to} · Time zone: {timeZone} · Net working time',
  'comparison.provisional':
    'Provisional actual: Closed entries with status “Pending” or “Approved” count after break deduction. Open, rejected and voided entries are excluded.',
  'comparison.notAccount':
    'The difference applies only to this period. It is not a carried-forward overtime account and includes no opening balance.',
  'comparison.reviewHint':
    'A difference of +{hours} h or more flags the selected period for review. This is neither a statutory limit nor a legal assessment.',
  'comparison.empty': 'No employees for the selected filters.',
  'comparison.historyGap':
    'Target unknown: Confirmed contract history is missing. HR must confirm the contract facts for these dates.',
  'comparison.unknownDates': 'Dates without confirmed contract facts: {dates}',
  'comparison.indicator.Unknown': 'Unknown',
  'comparison.indicator.Negative': 'Below target',
  'comparison.indicator.Balanced': 'Balanced',
  'comparison.indicator.Positive': 'Above target',
  'comparison.indicator.Excess': 'Review recommended (from +10 h)',
  'contracts.title': 'Confirmed contract periods',
  'contracts.description':
    'Only HR confirms historical contract facts. Even known legacy data remains unknown for target comparisons until confirmed.',
  'contracts.snapshotHint':
    'Each confirmed period stores its own contract, working-day and holiday facts, not a live schedule reference. Later profile or schedule edits do not change confirmed history. HR must add a new effective period for changes.',
  'contracts.empty':
    'No confirmed contract periods yet. Historical targets are unknown.',
  'contracts.loadFailed': 'Contract history could not be loaded.',
  'contracts.refresh': 'Refresh contract history',
  'contracts.history': 'Confirmed history (read-only)',
  'contracts.new': 'Confirm a new contract period',
  'contracts.unconfirmed':
    'UNCONFIRMED DRAFT: Prefilled current profile and schedule values are suggestions only, not evidence of historical contract facts. Check every fact for the effective period.',
  'contracts.effectiveFrom': 'Contract effective from',
  'contracts.effectiveTo': 'Contract effective to (optional, inclusive)',
  'contracts.employmentStart': 'Contractual employment start',
  'contracts.employmentEnd': 'Contractual employment end (optional)',
  'contracts.weeklyHours': 'Contract weekly hours',
  'contracts.timeModel': 'Contract time model',
  'contracts.workingDays': 'Contract working days',
  'contracts.scheduleLabel': 'Schedule label snapshot (optional)',
  'contracts.holidayCalendar': 'Contract holiday calendar',
  'contracts.holidayDates': 'Contract additional holidays',
  'contracts.confirmationNote': 'Confirmation note (required)',
  'contracts.noteHint':
    '5–1000 characters: Document the source and verification of the contract facts.',
  'contracts.confirm':
    'As HR, I explicitly confirm these contract facts for the stated period.',
  'contracts.save': 'Confirm contract period',
  'contracts.saved':
    'Contract period confirmed. The report is being refreshed.',
  'contracts.saveFailed': 'The contract period could not be confirmed.',
  'contracts.conflict':
    'Contract history changed or the period overlaps. Refresh history, check the dates and reselect the period to supersede if needed.',
  'contracts.supersedes': 'Supersede an existing period (optional)',
  'contracts.noSupersession': 'Add an independent, non-overlapping period',
  'contracts.supersessionHint':
    'Superseding only ends the selected old period on the day before the new start (inclusive). The new start must be later than its start and still within the existing period. Other overlaps are not allowed; confirmed facts cannot be rewritten or deleted.',
  'contracts.invalid':
    'Enter valid date boundaries, weekly hours (0–168, at most 2 decimal places) and a confirmation note. Positive weekly hours require working days with at most 24 hours per day. When superseding, the new start must be later than the old start.',
  'contracts.openEnded': 'open-ended',
  'contracts.confirmedBy': 'Confirmed by',
  'contracts.actorUnavailable': 'Person no longer available',
  'contracts.revision': 'Revision',
  'contracts.createdAt': 'Created at',
};
