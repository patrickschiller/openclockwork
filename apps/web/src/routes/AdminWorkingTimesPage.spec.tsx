import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, vi } from 'vitest';
import type { WorkingTimeReportDto } from '../api/client';
import { renderWithProviders } from '../test-utils';

let selectedLocale = 'de';
const currentUser = vi.hoisted(() => ({
  id: 'hr-1',
  email: 'hr@test.local',
  firstName: 'Hannah',
  lastName: 'HR',
  role: 'HRAdmin' as 'HRAdmin' | 'Manager' | 'Employee',
  themePreference: 'System',
}));
const employeesMock = vi.fn();
const workingTimeReportMock = vi.fn();
const downloadAuthenticatedMock = vi.fn();

vi.mock('../api/client', () => ({
  downloadAuthenticated: (...args: unknown[]) =>
    downloadAuthenticatedMock(...args),
  api: {
    workingTimeReportEmployees: () => employeesMock(),
    workingTimeReport: (...args: unknown[]) => workingTimeReportMock(...args),
  },
}));

vi.mock('../app/auth', () => ({ useCurrentUser: () => currentUser }));

const report: WorkingTimeReportDto = {
  from: '2026-08-01',
  to: '2026-08-31',
  timeZone: 'Europe/Berlin',
  timeDefinition: 'net_working_time',
  excessThresholdMinutes: 600,
  comparisons: [
    {
      employeeId: 'employee-1',
      employeeName: 'Dora Direct',
      targetMinutes: 480,
      actualMinutes: 450,
      differenceMinutes: -30,
      targetStatus: 'Known',
      unknownDates: [],
      reason: null,
      indicator: 'Negative',
      openEntryCount: 0,
    },
  ],
  rows: [
    {
      id: 'entry-1',
      employeeId: 'employee-1',
      employeeName: 'Dora Direct',
      date: '2026-08-10',
      clockIn: '2026-08-10T07:00:00.000Z',
      clockOut: '2026-08-10T15:00:00.000Z',
      status: 'Approved',
      grossMinutes: 480,
      breakMinutes: 30,
      netMinutes: 450,
      clockInLocation: {
        label: 'Büro Würzburg',
        latitude: 49.791304,
        longitude: 9.953355,
        accuracyMeters: 12,
      },
      clockOutLocation: {
        label: null,
        latitude: 49.8,
        longitude: 9.94,
        accuracyMeters: 18.4,
      },
    },
  ],
  totals: { grossMinutes: 480, breakMinutes: 30, netMinutes: 450 },
};

describe('AdminWorkingTimesPage', () => {
  beforeEach(() => {
    currentUser.role = 'HRAdmin';
    selectedLocale = 'de';
    vi.spyOn(window, 'localStorage', 'get').mockReturnValue({
      getItem: () => selectedLocale,
      setItem: () => undefined,
      clear: () => undefined,
      removeItem: () => undefined,
      key: () => null,
      length: 0,
    });
    employeesMock.mockReset().mockResolvedValue([
      {
        id: 'employee-1',
        firstName: 'Dora',
        lastName: 'Direct',
      },
      {
        id: 'employee-2',
        firstName: 'Erich',
        lastName: 'Example',
      },
    ]);
    workingTimeReportMock.mockReset().mockResolvedValue(report);
    downloadAuthenticatedMock.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders start, end, break and duration without project data', async () => {
    const { AdminWorkingTimesPage } = await import('./AdminWorkingTimesPage');
    renderWithProviders(<AdminWorkingTimesPage />);

    expect((await screen.findAllByText('Dora Direct')).length).toBeGreaterThan(
      1,
    );
    expect(screen.getAllByText('0:30').length).toBeGreaterThan(0);
    expect(screen.getAllByText('7:30').length).toBeGreaterThan(0);
    expect(screen.queryByRole('columnheader', { name: 'Projekt' })).toBeNull();
    expect(
      screen.queryByRole('columnheader', { name: 'Stempelort Beginn' }),
    ).toBeNull();
  });

  it('loads and shows clock-in and clock-out locations on demand', async () => {
    const { AdminWorkingTimesPage } = await import('./AdminWorkingTimesPage');
    renderWithProviders(<AdminWorkingTimesPage />);
    await screen.findAllByText('Dora Direct');

    fireEvent.click(screen.getByLabelText('Stempelorte einbeziehen'));

    await waitFor(() => {
      expect(workingTimeReportMock.mock.calls.at(-1)?.[3]).toBe(true);
    });
    expect(
      await screen.findByRole('columnheader', { name: 'Stempelort Beginn' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('columnheader', { name: 'Stempelort Ende' }),
    ).toBeTruthy();
    expect(
      await screen.findByText('Büro Würzburg · 49.791304, 9.953355 · ±12 m'),
    ).toBeTruthy();
    expect(screen.getByText('49.800000, 9.940000 · ±18 m')).toBeTruthy();
  });

  it('downloads all employees as an authenticated PDF without location data', async () => {
    const { AdminWorkingTimesPage } = await import('./AdminWorkingTimesPage');
    renderWithProviders(<AdminWorkingTimesPage />);
    const pdfButton = await screen.findByRole('button', {
      name: 'PDF herunterladen',
    });
    await waitFor(() =>
      expect((pdfButton as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(screen.getByLabelText('Stempelorte einbeziehen'));
    await waitFor(() =>
      expect((pdfButton as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(pdfButton);

    await waitFor(() =>
      expect(downloadAuthenticatedMock).toHaveBeenCalledOnce(),
    );
    const [path, filename] = downloadAuthenticatedMock.mock.calls[0];
    const from = (screen.getByLabelText('Von') as HTMLInputElement).value;
    const to = (screen.getByLabelText('Bis') as HTMLInputElement).value;
    const url = new URL(path, 'https://openclockwork.test');
    expect(url.pathname).toBe('/api/reports/working-times.pdf');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      from,
      to,
      locale: 'de',
    });
    expect(filename).toBe(`arbeitszeiten-${from}-${to}.pdf`);
  });

  it('keeps the single employee filter for report and PDF downloads', async () => {
    const { AdminWorkingTimesPage } = await import('./AdminWorkingTimesPage');
    renderWithProviders(<AdminWorkingTimesPage />);
    await screen.findAllByText('Dora Direct');
    fireEvent.change(screen.getByLabelText('Mitarbeiter:in'), {
      target: { value: 'employee-1' },
    });
    const pdfButton = screen.getByRole('button', { name: 'PDF herunterladen' });
    await waitFor(() =>
      expect((pdfButton as HTMLButtonElement).disabled).toBe(false),
    );
    expect(workingTimeReportMock.mock.calls.at(-1)?.slice(2)).toEqual([
      'employee-1',
      false,
      undefined,
    ]);
    fireEvent.click(pdfButton);
    await waitFor(() =>
      expect(downloadAuthenticatedMock).toHaveBeenCalledOnce(),
    );
    const url = new URL(
      downloadAuthenticatedMock.mock.calls[0][0],
      'https://openclockwork.test',
    );
    expect(url.searchParams.get('employeeId')).toBe('employee-1');
    expect(url.searchParams.has('employeeIds')).toBe(false);
  });

  it('uses a selected employee subset for PDF and CSV and can return to all employees', async () => {
    const { AdminWorkingTimesPage } = await import('./AdminWorkingTimesPage');
    const selectedReport = {
      ...report,
      rows: [
        ...report.rows,
        {
          ...report.rows[0],
          id: 'entry-2',
          employeeId: 'employee-2',
          employeeName: 'Erich Example',
        },
      ],
    };
    workingTimeReportMock.mockImplementation(
      (from, to, _employeeId, _includeLocations, employeeIds) =>
        Promise.resolve({
          ...(employeeIds?.length === 2 ? selectedReport : report),
          from,
          to,
        }),
    );
    const createObjectURL = vi.fn<(blob: Blob) => string>(
      () => 'blob:working-time-csv',
    );
    const revokeObjectURL = vi.fn();
    vi.stubGlobal(
      'URL',
      class extends URL {
        static override createObjectURL = createObjectURL;
        static override revokeObjectURL = revokeObjectURL;
      },
    );
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    renderWithProviders(<AdminWorkingTimesPage />);
    await screen.findAllByText('Dora Direct');

    fireEvent.change(screen.getByLabelText('Mitarbeiter:in'), {
      target: { value: '__multiple__' },
    });
    expect(screen.getByText('Wähle mindestens eine Person aus.')).toBeTruthy();
    expect(
      (
        screen.getByRole('button', {
          name: 'CSV herunterladen',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole('button', {
          name: 'PDF herunterladen',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Dora Direct' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Erich Example' }));
    await waitFor(() =>
      expect(
        (
          screen.getByRole('button', {
            name: 'CSV herunterladen',
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    expect(workingTimeReportMock.mock.calls.at(-1)?.slice(2)).toEqual([
      undefined,
      false,
      ['employee-1', 'employee-2'],
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'CSV herunterladen' }));
    expect(anchorClick).toHaveBeenCalledOnce();
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    const csv = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsText(blob);
    });
    expect(csv).toContain('Dora Direct');
    expect(csv).toContain('Erich Example');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:working-time-csv');

    fireEvent.click(screen.getByRole('button', { name: 'PDF herunterladen' }));
    await waitFor(() =>
      expect(downloadAuthenticatedMock).toHaveBeenCalledOnce(),
    );
    const url = new URL(
      downloadAuthenticatedMock.mock.calls[0][0],
      'https://openclockwork.test',
    );
    expect(url.searchParams.getAll('employeeIds')).toEqual([
      'employee-1',
      'employee-2',
    ]);
    expect(url.searchParams.has('employeeId')).toBe(false);
    await waitFor(() =>
      expect(
        (screen.getByLabelText('Mitarbeiter:in') as HTMLSelectElement).disabled,
      ).toBe(false),
    );
    fireEvent.change(screen.getByLabelText('Mitarbeiter:in'), {
      target: { value: '' },
    });
    await waitFor(() =>
      expect(workingTimeReportMock.mock.calls.at(-1)?.slice(2)).toEqual([
        undefined,
        false,
        undefined,
      ]),
    );
  });

  it('shows pending PDF creation and allows retry after download errors', async () => {
    const { AdminWorkingTimesPage } = await import('./AdminWorkingTimesPage');
    let rejectDownload!: (error: Error) => void;
    downloadAuthenticatedMock.mockReturnValueOnce(
      new Promise<void>((_resolve, reject) => {
        rejectDownload = reject;
      }),
    );
    renderWithProviders(<AdminWorkingTimesPage />);
    const pdfButton = screen.getByRole('button', { name: 'PDF herunterladen' });
    await waitFor(() =>
      expect((pdfButton as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(pdfButton);
    expect(
      screen
        .getByRole('button', { name: 'PDF wird erstellt …' })
        .getAttribute('aria-busy'),
    ).toBe('true');
    expect((screen.getByLabelText('Von') as HTMLInputElement).disabled).toBe(
      true,
    );
    expect(
      (
        screen.getByRole('button', {
          name: 'CSV herunterladen',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    await act(async () => rejectDownload(new Error('Download failed (500)')));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(
      screen.getByText('PDF konnte nicht heruntergeladen werden'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'PDF herunterladen' }));
    await waitFor(() =>
      expect(downloadAuthenticatedMock).toHaveBeenCalledTimes(2),
    );
    expect(
      screen.queryByText('PDF konnte nicht heruntergeladen werden'),
    ).toBeNull();
  });

  it('blocks exports while updated filters load or fail, including an invalid date range', async () => {
    const { AdminWorkingTimesPage } = await import('./AdminWorkingTimesPage');
    renderWithProviders(<AdminWorkingTimesPage />);
    const csvButton = screen.getByRole('button', { name: 'CSV herunterladen' });
    const pdfButton = screen.getByRole('button', { name: 'PDF herunterladen' });
    await waitFor(() =>
      expect((csvButton as HTMLButtonElement).disabled).toBe(false),
    );
    let rejectReport!: (error: Error) => void;
    workingTimeReportMock.mockReturnValueOnce(
      new Promise<WorkingTimeReportDto>((_resolve, reject) => {
        rejectReport = reject;
      }),
    );
    fireEvent.change(screen.getByLabelText('Mitarbeiter:in'), {
      target: { value: 'employee-2' },
    });
    expect((csvButton as HTMLButtonElement).disabled).toBe(true);
    expect((pdfButton as HTMLButtonElement).disabled).toBe(true);
    await act(async () => rejectReport(new Error('Report unavailable')));
    await screen.findByText('Arbeitszeiten konnten nicht geladen werden');
    expect((csvButton as HTMLButtonElement).disabled).toBe(true);
    expect((pdfButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Von'), {
      target: { value: '2099-01-01' },
    });
    expect(
      screen.getByText('Das Von-Datum muss vor oder am Bis-Datum liegen.'),
    ).toBeTruthy();
    expect((csvButton as HTMLButtonElement).disabled).toBe(true);
    expect((pdfButton as HTMLButtonElement).disabled).toBe(true);
    expect(downloadAuthenticatedMock).not.toHaveBeenCalled();
  });

  it('serializes selected employee IDs as repeated JSON report query parameters', async () => {
    const { api } =
      await vi.importActual<typeof import('../api/client')>('../api/client');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(report), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await api.workingTimeReport('2026-08-01', '2026-08-31', undefined, true, [
      'employee-1',
      'employee-2',
    ]);

    const url = new URL(
      fetchMock.mock.calls[0][0],
      'https://openclockwork.test',
    );
    expect(url.pathname).toBe('/api/reports/working-times');
    expect(url.searchParams.getAll('employeeIds')).toEqual([
      'employee-1',
      'employee-2',
    ]);
    expect(url.searchParams.has('employeeId')).toBe(false);
    expect(url.searchParams.get('includeLocations')).toBe('true');
  });

  it('shows all textual comparison states, locale hours, missing history and zero-actual employees', async () => {
    const { AdminWorkingTimesPage } = await import('./AdminWorkingTimesPage');
    workingTimeReportMock.mockResolvedValue({
      ...report,
      comparisons: [
        report.comparisons[0],
        {
          ...report.comparisons[0],
          employeeId: 'zero',
          employeeName: 'Zero Actual',
          actualMinutes: 0,
          targetMinutes: 0,
          differenceMinutes: 0,
          indicator: 'Balanced',
        },
        {
          ...report.comparisons[0],
          employeeId: 'positive',
          employeeName: 'Positive Actual',
          differenceMinutes: 30,
          indicator: 'Positive',
        },
        {
          ...report.comparisons[0],
          employeeId: 'excess',
          employeeName: 'Excess Actual',
          differenceMinutes: 600,
          indicator: 'Excess',
        },
        {
          ...report.comparisons[0],
          employeeId: 'gap',
          employeeName: 'History Gap',
          targetStatus: 'Unknown',
          targetMinutes: null,
          differenceMinutes: null,
          actualMinutes: 0,
          indicator: 'Unknown',
          unknownDates: ['2026-08-12'],
          reason: 'CONTRACT_HISTORY_GAP',
          openEntryCount: 2,
        },
      ],
    });
    renderWithProviders(<AdminWorkingTimesPage />);
    const table = within(
      await screen.findByRole('table', { name: 'Soll/Ist-Vergleich' }),
    );
    expect(table.getByText('-0,5 h')).toBeTruthy();
    expect(table.getByText('+0,5 h')).toBeTruthy();
    expect(table.getByText('+10 h')).toBeTruthy();
    for (const label of [
      'Unter Soll',
      'Ausgeglichen',
      'Über Soll',
      'Prüfung empfohlen (ab +10 h)',
      'Unbekannt',
    ]) {
      expect(table.getByText(label)).toBeTruthy();
    }
    const zero = within(table.getByRole('row', { name: /Zero Actual/ }));
    expect(zero.getAllByText('0 h')).toHaveLength(2);
    const unknown = within(table.getByRole('row', { name: /History Gap/ }));
    expect(unknown.getAllByText('—')).toHaveLength(2);
    expect(unknown.getByText('0 h')).toBeTruthy();
    expect(unknown.getByText(/Bestätigte Vertragshistorie fehlt/)).toBeTruthy();
    expect(unknown.getByText(/12.8.2026/)).toBeTruthy();
    expect(unknown.getByText('2')).toBeTruthy();
    expect(screen.getByText(/Zeitzone: Europe\/Berlin/)).toBeTruthy();
    expect(
      screen.getByText(/Abgeschlossene Buchungen mit Status/),
    ).toBeTruthy();
    expect(
      screen.getByText(/kein fortgeschriebenes Überstundenkonto/),
    ).toBeTruthy();
    expect(screen.getByText(/weder eine gesetzliche Grenze/)).toBeTruthy();
  });

  it('uses server-scoped team endpoints for Managers and hides HR-only PDF controls', async () => {
    const { AdminWorkingTimesPage } = await import('./AdminWorkingTimesPage');
    currentUser.role = 'Manager';
    renderWithProviders(<AdminWorkingTimesPage />);
    await screen.findByRole('table', { name: 'Soll/Ist-Vergleich' });
    expect(employeesMock).toHaveBeenCalledOnce();
    expect(workingTimeReportMock).toHaveBeenCalled();
    expect(screen.getByText(/Server begrenzt die Auswahl/)).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'PDF herunterladen' }),
    ).toBeNull();
    expect(
      screen.getByRole('button', { name: 'CSV herunterladen' }),
    ).toBeTruthy();
    expect(downloadAuthenticatedMock).not.toHaveBeenCalled();
  });

  it('denies ordinary employees before loading any report or employee choices', async () => {
    const { AdminWorkingTimesPage } = await import('./AdminWorkingTimesPage');
    currentUser.role = 'Employee';
    renderWithProviders(<AdminWorkingTimesPage />);
    expect(
      screen.getByText(/Führungskräften und HR-Admins vorbehalten/),
    ).toBeTruthy();
    expect(employeesMock).not.toHaveBeenCalled();
    expect(workingTimeReportMock).not.toHaveBeenCalled();
  });

  it('keeps week, month and custom periods consistent between comparison and detail queries', async () => {
    const { AdminWorkingTimesPage } = await import('./AdminWorkingTimesPage');
    workingTimeReportMock.mockImplementation((from, to) =>
      Promise.resolve({ ...report, from, to }),
    );
    renderWithProviders(<AdminWorkingTimesPage />);
    await screen.findByRole('table', { name: 'Soll/Ist-Vergleich' });
    fireEvent.change(screen.getByLabelText('Zeitraum'), {
      target: { value: 'week' },
    });
    await waitFor(() =>
      expect(
        (screen.getByLabelText('Zeitraum') as HTMLSelectElement).value,
      ).toBe('week'),
    );
    const from = (screen.getByLabelText('Von') as HTMLInputElement).value;
    const to = (screen.getByLabelText('Bis') as HTMLInputElement).value;
    expect(new Date(from + 'T00:00:00Z').getUTCDay()).toBe(1);
    expect((Date.parse(to) - Date.parse(from)) / 86400000).toBe(6);
    await waitFor(() =>
      expect(workingTimeReportMock.mock.calls.at(-1)?.slice(0, 2)).toEqual([
        from,
        to,
      ]),
    );
    fireEvent.change(screen.getByLabelText('Zeitraum'), {
      target: { value: 'month' },
    });
    expect((screen.getByLabelText('Von') as HTMLInputElement).value).toMatch(
      /-01$/,
    );
    fireEvent.change(screen.getByLabelText('Von'), {
      target: { value: '2026-08-01' },
    });
    fireEvent.change(screen.getByLabelText('Bis'), {
      target: { value: '2026-08-31' },
    });
    await waitFor(() =>
      expect(workingTimeReportMock.mock.calls.at(-1)?.slice(0, 2)).toEqual([
        '2026-08-01',
        '2026-08-31',
      ]),
    );
    expect((screen.getByLabelText('Zeitraum') as HTMLSelectElement).value).toBe(
      'custom',
    );
    expect(await screen.findByText(/1.8.2026 – 31.8.2026/)).toBeTruthy();
  });

  it('shows empty comparisons and retains the existing empty-entry state', async () => {
    const { AdminWorkingTimesPage } = await import('./AdminWorkingTimesPage');
    workingTimeReportMock.mockResolvedValue({
      ...report,
      rows: [],
      comparisons: [],
    });
    renderWithProviders(<AdminWorkingTimesPage />);
    expect(
      await screen.findByText(
        'Keine Mitarbeiter:innen für die gewählte Auswahl vorhanden.',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText('Keine Buchungen im gewählten Zeitraum.'),
    ).toBeTruthy();
  });

  it('renders the comparison and unknown explanation in English', async () => {
    const { AdminWorkingTimesPage } = await import('./AdminWorkingTimesPage');
    selectedLocale = 'en';
    workingTimeReportMock.mockResolvedValue({
      ...report,
      comparisons: [
        {
          ...report.comparisons[0],
          indicator: 'Unknown',
          targetStatus: 'Unknown',
          targetMinutes: null,
          differenceMinutes: null,
          reason: 'CONTRACT_HISTORY_GAP',
          unknownDates: ['2026-08-12'],
        },
      ],
    });
    renderWithProviders(<AdminWorkingTimesPage />);
    const table = within(
      await screen.findByRole('table', { name: 'Target/actual comparison' }),
    );
    expect(table.getByText('7.5 h')).toBeTruthy();
    expect(table.getByText('Unknown')).toBeTruthy();
    expect(
      table.getByText(/Confirmed contract history is missing/),
    ).toBeTruthy();
    expect(
      screen.getByText(/not a carried-forward overtime account/),
    ).toBeTruthy();
    expect(screen.getByText(/neither a statutory limit/)).toBeTruthy();
  });

  it('renders and exports clock times in the declared report timezone, independent of the viewer timezone', async () => {
    const previousZone = process.env.TZ;
    process.env.TZ = 'America/New_York';
    try {
      const { AdminWorkingTimesPage } = await import('./AdminWorkingTimesPage');
      renderWithProviders(<AdminWorkingTimesPage />);
      expect(await screen.findByText('09:00')).toBeTruthy();
      expect(screen.getByText('17:00')).toBeTruthy();
      const { workingTimeReportToCsv } =
        await import('./AdminWorkingTimesPage');
      const csv = workingTimeReportToCsv(
        report,
        {
          date: 'Date',
          employee: 'Employee',
          start: 'Start',
          clockInLocation: 'In location',
          end: 'End',
          clockOutLocation: 'Out location',
          gross: 'Gross',
          break: 'Break',
          net: 'Net',
          status: 'Status',
          total: 'Total',
        },
        'de-DE',
        (status) => status,
      );
      expect(csv).toContain('2026-08-10;Dora Direct;09:00;17:00;');
      expect(screen.queryByText('03:00')).toBeNull();
    } finally {
      if (previousZone === undefined) delete process.env.TZ;
      else process.env.TZ = previousZone;
    }
  });
  it('creates an Excel-friendly CSV containing the filtered rows and totals', async () => {
    const { workingTimeReportToCsv } = await import('./AdminWorkingTimesPage');
    const csv = workingTimeReportToCsv(
      report,
      {
        date: 'Datum',
        employee: 'Mitarbeiter:in',
        start: 'Beginn',
        clockInLocation: 'Stempelort Beginn',
        end: 'Ende',
        clockOutLocation: 'Stempelort Ende',
        gross: 'Brutto',
        break: 'Pause',
        net: 'Netto',
        status: 'Status',
        total: 'Gesamt',
      },
      'de-DE',
      (status) => status,
    );

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain(
      'Datum;Mitarbeiter:in;Beginn;Ende;Brutto;Pause;Netto;Status',
    );
    expect(csv).toContain('2026-08-10;Dora Direct;');
    expect(csv).toContain(';8:00;0:30;7:30;Approved');
    expect(csv).toContain('Gesamt;;;;8:00;0:30;7:30;');
  });

  it('adds clocking locations to the CSV only when requested', async () => {
    const { workingTimeReportToCsv } = await import('./AdminWorkingTimesPage');
    const csv = workingTimeReportToCsv(
      report,
      {
        date: 'Datum',
        employee: 'Mitarbeiter:in',
        start: 'Beginn',
        clockInLocation: 'Stempelort Beginn',
        end: 'Ende',
        clockOutLocation: 'Stempelort Ende',
        gross: 'Brutto',
        break: 'Pause',
        net: 'Netto',
        status: 'Status',
        total: 'Gesamt',
      },
      'de-DE',
      (status) => status,
      true,
    );

    expect(csv).toContain(
      'Datum;Mitarbeiter:in;Beginn;Stempelort Beginn;Ende;Stempelort Ende;Brutto;Pause;Netto;Status',
    );
    expect(csv).toContain('Büro Würzburg · 49.791304, 9.953355 · ±12 m');
    expect(csv).toContain('Gesamt;;;;;;8:00;0:30;7:30;');
  });

  it('preserves duration seconds and neutralizes employee names interpreted as spreadsheet formulas', async () => {
    const { workingTimeReportToCsv } = await import('./AdminWorkingTimesPage');
    const csv = workingTimeReportToCsv(
      {
        ...report,
        rows: ['=1+1', ' +1', '\t-1', '  @SUM(A1)'].map(
          (employeeName, index) => ({
            ...report.rows[0],
            id: `entry-${index}`,
            employeeName,
            grossMinutes: 240.5,
            breakMinutes: 15,
            netMinutes: 225.5,
          }),
        ),
        totals: { grossMinutes: 962, breakMinutes: 60, netMinutes: 902 },
      },
      {
        date: 'Datum',
        employee: 'Mitarbeiter:in',
        start: 'Beginn',
        clockInLocation: 'Stempelort Beginn',
        end: 'Ende',
        clockOutLocation: 'Stempelort Ende',
        gross: 'Brutto',
        break: 'Pause',
        net: 'Netto',
        status: 'Status',
        total: 'Gesamt',
      },
      'de-DE',
      (status) => status,
    );

    expect(csv).toContain(";'=1+1;");
    expect(csv).toContain(";' +1;");
    expect(csv).toContain(";'\t-1;");
    expect(csv).toContain(";'  @SUM(A1);");
    expect(csv).toContain(';4:00:30;0:15;3:45:30;Approved');
    expect(csv).toContain('Gesamt;;;;16:02;1:00;15:02;');
  });
});
