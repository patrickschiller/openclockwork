import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import { AdminSchedulesPage } from './AdminSchedulesPage';

const createWorkSchedule = vi.fn();
const updateWorkSchedule = vi.fn();
const workSchedules = vi.fn();
const bulkAssignSchedule = vi.fn();
vi.mock('../api/client', () => ({
  api: {
    employees: async () => [],
    bulkAssignSchedule: (...args: unknown[]) => bulkAssignSchedule(...args),
    workSchedules: (...args: unknown[]) => workSchedules(...args),
    createWorkSchedule: (...args: unknown[]) => createWorkSchedule(...args),
    updateWorkSchedule: (...args: unknown[]) => updateWorkSchedule(...args),
  },
}));
vi.mock('../app/auth', () => ({ useCurrentUser: () => ({ role: 'HRAdmin' }) }));

beforeEach(() => {
  workSchedules.mockResolvedValue([]);
  bulkAssignSchedule.mockReset().mockResolvedValue({ assigned: 1, skipped: 0 });
  createWorkSchedule.mockReset().mockResolvedValue({});
  updateWorkSchedule.mockReset().mockResolvedValue({});
});

afterEach(() => vi.restoreAllMocks());

it('creates schedules with no mandatory automatic break policy', async () => {
  renderWithProviders(<AdminSchedulesPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Neuer Plan' }));
  fireEvent.change(screen.getByLabelText('Name'), {
    target: { value: 'Flexible schedule' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
  await waitFor(() =>
    expect(createWorkSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Flexible schedule', breakRules: [] }),
    ),
  );
});

it('preserves existing break rules when editing and allows adding a contract-specific rule', async () => {
  workSchedules.mockResolvedValue([
    {
      id: 'schedule-1',
      name: 'Custom schedule',
      frameStart: '08:00',
      frameEnd: '18:00',
      workingDays: 31,
      coreTimes: [],
      isDefault: false,
      employeeCount: 0,
      breakRules: [{ afterMinutes: 300, breakMinutes: 20 }],
    },
  ]);
  renderWithProviders(<AdminSchedulesPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Bearbeiten' }));
  expect(
    (screen.getByLabelText('Ab Anwesenheit (Minuten)') as HTMLInputElement)
      .value,
  ).toBe('300');
  fireEvent.click(
    screen.getByRole('button', { name: 'Pausenregel hinzufügen' }),
  );
  fireEvent.change(screen.getAllByLabelText('Ab Anwesenheit (Minuten)')[1], {
    target: { value: '600' },
  });
  fireEvent.change(screen.getAllByLabelText('Gesamtabzug (Minuten)')[1], {
    target: { value: '60' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
  await waitFor(() =>
    expect(updateWorkSchedule).toHaveBeenCalledWith(
      'schedule-1',
      expect.objectContaining({
        breakRules: [
          { afterMinutes: 300, breakMinutes: 20 },
          { afterMinutes: 600, breakMinutes: 60 },
        ],
      }),
    ),
  );
});

it('sends stable time model values when bulk-assigning in English', async () => {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-GB']);
  vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
    throw new Error('No test storage');
  });
  workSchedules.mockResolvedValue([
    {
      id: 'schedule-1',
      name: 'Custom schedule',
      frameStart: '08:00',
      frameEnd: '18:00',
      workingDays: 31,
      coreTimes: [],
      isDefault: false,
      employeeCount: 0,
      breakRules: [],
    },
  ]);
  renderWithProviders(<AdminSchedulesPage />);
  const select = await screen.findByLabelText('Time model');
  expect((select as HTMLSelectElement).value).toBe('Vollzeit');
  expect(
    (screen.getByRole('option', { name: 'Part-time' }) as HTMLOptionElement)
      .value,
  ).toBe('Teilzeit');
  fireEvent.change(select, { target: { value: 'Teilzeit' } });
  fireEvent.click(screen.getByRole('button', { name: 'Assign in bulk' }));
  await waitFor(() =>
    expect(bulkAssignSchedule).toHaveBeenCalledWith(
      'schedule-1',
      'Teilzeit',
      false,
    ),
  );
});

it('allows editing all valid API break policies while rejecting out-of-range thresholds', async () => {
  const breakRules = [
    { afterMinutes: 0, breakMinutes: 0 },
    { afterMinutes: 300, breakMinutes: 300 },
    { afterMinutes: 300, breakMinutes: 20 },
  ];
  workSchedules.mockResolvedValue([
    {
      id: 'schedule-1',
      name: 'Custom schedule',
      frameStart: '08:00',
      frameEnd: '18:00',
      workingDays: 0,
      coreTimes: [],
      isDefault: false,
      employeeCount: 0,
      breakRules,
    },
  ]);
  renderWithProviders(<AdminSchedulesPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Bearbeiten' }));
  fireEvent.change(screen.getByLabelText('Name'), {
    target: { value: 'Renamed schedule' },
  });
  const threshold = screen.getAllByLabelText('Ab Anwesenheit (Minuten)')[0];
  fireEvent.change(threshold, { target: { value: '1441' } });
  expect(
    screen.getByRole('button', { name: 'Speichern' }).hasAttribute('disabled'),
  ).toBe(true);
  fireEvent.change(threshold, { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
  await waitFor(() =>
    expect(updateWorkSchedule).toHaveBeenCalledWith(
      'schedule-1',
      expect.objectContaining({ name: 'Renamed schedule', breakRules }),
    ),
  );
});
