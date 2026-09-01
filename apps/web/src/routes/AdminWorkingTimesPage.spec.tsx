import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, vi } from 'vitest';
import type { WorkingTimeReportDto } from '../api/client';
import { renderWithProviders } from '../test-utils';

const employeesMock = vi.fn();
const workingTimeReportMock = vi.fn();

vi.mock('../api/client', () => ({
  api: {
    workingTimeReportEmployees: () => employeesMock(),
    workingTimeReport: (...args: unknown[]) => workingTimeReportMock(...args),
  },
}));

vi.mock('../app/auth', () => ({
  useCurrentUser: () => ({
    id: 'hr-1',
    email: 'hr@test.local',
    firstName: 'Hannah',
    lastName: 'HR',
    role: 'HRAdmin',
    themePreference: 'System',
  }),
}));

const report: WorkingTimeReportDto = {
  from: '2026-08-01',
  to: '2026-08-31',
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
    employeesMock.mockReset().mockResolvedValue([
      {
        id: 'employee-1',
        firstName: 'Dora',
        lastName: 'Direct',
      },
    ]);
    workingTimeReportMock.mockReset().mockResolvedValue(report);
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
});
