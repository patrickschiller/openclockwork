import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import { AdminEmployeesPage } from './AdminEmployeesPage';

const createEmployee = vi.fn();
const updateEmployee = vi.fn();
const employees = vi.fn();
vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  api: {
    employees: (...args: unknown[]) => employees(...args),
    workSchedules: async () => [],
    createEmployee: (...args: unknown[]) => createEmployee(...args),
    updateEmployee: (...args: unknown[]) => updateEmployee(...args),
  },
}));
vi.mock('../app/auth', () => ({ useCurrentUser: () => ({ role: 'HRAdmin' }) }));

const employee = {
  id: 'employee-1',
  personalNo: '1001',
  firstName: 'Alex',
  lastName: 'Example',
  email: 'alex@example.test',
  role: 'Employee',
  timeModel: 'Vollzeit',
  weeklyHours: 40,
  annualLeaveDays: 20,
  startDate: '2026-01-01',
  overtimeOpeningBalanceMinutes: 0,
  holidayCalendar: 'NONE',
  holidayDates: ['2026-07-01'],
  isActive: true,
  managerId: null,
  workScheduleId: null,
  allowDailyBlockBooking: false,
};

beforeEach(() => {
  employees.mockResolvedValue([]);
  createEmployee.mockReset().mockResolvedValue(employee);
  updateEmployee.mockReset().mockResolvedValue(employee);
});

it('creates an employee without a Germany-specific calendar and saves custom dates', async () => {
  renderWithProviders(<AdminEmployeesPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Neu anlegen' }));
  expect(
    (screen.getByLabelText('Feiertagskalender') as HTMLSelectElement).value,
  ).toBe('NONE');
  expect(
    (screen.getByLabelText('Jahresurlaub (Tage)') as HTMLInputElement).value,
  ).toBe('0');
  for (const [label, value] of [
    ['Personal-Nr', '1001'],
    ['Vorname', 'Alex'],
    ['Nachname', 'Example'],
    ['E-Mail', 'alex@example.test'],
    ['Initial-Passwort (≥ 8 Zeichen)', 'synthetic-password'],
  ]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  fireEvent.change(screen.getByLabelText('Zusätzliche Feiertage'), {
    target: { value: '2026-07-01, 2026-12-25\n2026-07-01' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
  await waitFor(() =>
    expect(createEmployee).toHaveBeenCalledWith(
      expect.objectContaining({
        holidayCalendar: 'NONE',
        holidayDates: ['2026-07-01', '2026-12-25'],
        annualLeaveDays: 0,
      }),
    ),
  );
});

it('updates both the preset calendar and custom dates instead of dropping calendar changes', async () => {
  employees.mockResolvedValue([employee]);
  renderWithProviders(<AdminEmployeesPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Bearbeiten' }));
  fireEvent.change(screen.getByLabelText('Feiertagskalender'), {
    target: { value: 'DE-BY' },
  });
  fireEvent.change(screen.getByLabelText('Zusätzliche Feiertage'), {
    target: { value: '2026-02-30' },
  });
  expect(
    screen.getByRole('button', { name: 'Speichern' }).hasAttribute('disabled'),
  ).toBe(true);
  fireEvent.change(screen.getByLabelText('Zusätzliche Feiertage'), {
    target: { value: '2026-08-08' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
  await waitFor(() =>
    expect(updateEmployee).toHaveBeenCalledWith(
      'employee-1',
      expect.objectContaining({
        holidayCalendar: 'DE-BY',
        holidayDates: ['2026-08-08'],
      }),
    ),
  );
});
