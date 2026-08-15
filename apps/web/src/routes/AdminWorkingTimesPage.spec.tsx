import { screen } from '@testing-library/react';
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
  });

  it('creates an Excel-friendly CSV containing the filtered rows and totals', async () => {
    const { workingTimeReportToCsv } = await import('./AdminWorkingTimesPage');
    const csv = workingTimeReportToCsv(
      report,
      {
        date: 'Datum',
        employee: 'Mitarbeiter:in',
        start: 'Beginn',
        end: 'Ende',
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
});
