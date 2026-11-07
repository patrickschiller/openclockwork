import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  ApiError,
  type ContractPeriodDto,
  type EmployeeDto,
  type WorkScheduleDto,
} from '../api/client';
import { renderWithProviders } from '../test-utils';
import { ContractPeriodsPanel } from './ContractPeriodsPanel';

let selectedLocale = 'de';
afterEach(() => vi.restoreAllMocks());

const role = vi.hoisted(() => ({ value: 'HRAdmin' }));
const contractPeriods = vi.fn();
const createContractPeriod = vi.fn();
vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  api: {
    contractPeriods: (...args: unknown[]) => contractPeriods(...args),
    createContractPeriod: (...args: unknown[]) => createContractPeriod(...args),
  },
}));
vi.mock('../app/auth', () => ({
  useCurrentUser: () => ({ role: role.value }),
}));

const employee: EmployeeDto = {
  id: 'employee-1',
  personalNo: '1001',
  firstName: 'Alex',
  lastName: 'Example',
  email: 'alex@example.test',
  role: 'Employee',
  timeModel: 'Teilzeit',
  weeklyHours: 32,
  annualLeaveDays: 20,
  startDate: '2026-01-01',
  overtimeOpeningBalanceMinutes: 0,
  holidayCalendar: 'NONE',
  holidayDates: ['2026-07-01'],
  isActive: true,
  managerId: null,
  workScheduleId: 'schedule-1',
  workScheduleName: 'Current plan',
  allowDailyBlockBooking: false,
};
const schedule: WorkScheduleDto = {
  id: 'schedule-1',
  name: 'Current plan',
  description: null,
  frameStart: '07:00',
  frameEnd: '18:00',
  isDefault: false,
  workingDays: 15,
  breakRules: [],
  coreTimes: [],
  employeeCount: 1,
  updatedAt: '2026-01-01T00:00:00Z',
};
const period: ContractPeriodDto = {
  id: 'period-1',
  employeeId: employee.id,
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
  employmentStart: '2026-01-01',
  employmentEnd: null,
  weeklyHours: 20,
  timeModel: 'Teilzeit',
  workingDays: 31,
  holidayCalendar: 'DE-BY',
  holidayDates: ['2026-08-08'],
  scheduleLabel: 'Historical plan',
  confirmationNote: 'Verified synthetic agreement',
  confirmedById: 'hr-1',
  revision: 3,
  createdAt: '2026-02-01T12:00:00Z',
};

beforeEach(() => {
  role.value = 'HRAdmin';
  selectedLocale = 'de';
  vi.spyOn(window, 'localStorage', 'get').mockReturnValue({
    getItem: () => selectedLocale,
    setItem: () => undefined,
    clear: () => undefined,
    removeItem: () => undefined,
    key: () => null,
    length: 0,
  });
  contractPeriods.mockReset().mockResolvedValue([period]);
  createContractPeriod
    .mockReset()
    .mockResolvedValue({ ...period, id: 'period-2', revision: 1 });
});

async function openDraft() {
  await waitFor(() =>
    expect(contractPeriods).toHaveBeenCalledWith(employee.id),
  );
  fireEvent.click(
    screen.getByText('Neuen Vertragszeitraum bestätigen', {
      selector: 'summary',
    }),
  );
  await screen.findByRole('button', { name: 'Vertragszeitraum bestätigen' });
}

function fillRequired(from = '2026-08-01') {
  fireEvent.change(screen.getByLabelText('Vertrag gültig ab'), {
    target: { value: from },
  });
  fireEvent.change(screen.getByLabelText('Bestätigungsnotiz (Pflicht)'), {
    target: { value: '  Verified new synthetic agreement  ' },
  });
}
function confirm() {
  fireEvent.click(
    screen.getByRole('checkbox', { name: /Ich bestätige diese Vertragsdaten/ }),
  );
}

it('shows immutable confirmed facts independently of current profile and schedule values', async () => {
  const { rerender } = renderWithProviders(
    <ContractPeriodsPanel employee={employee} schedules={[schedule]} />,
  );
  const summary = await screen.findByText(
    /1.1.2026 – unbefristet · Revision 3/,
    { selector: 'summary' },
  );
  fireEvent.click(summary);
  const history = within(summary.closest('details') ?? summary);
  expect(history.getByText('20')).toBeTruthy();
  expect(history.getByText('Historical plan')).toBeTruthy();
  expect(history.getByText('Verified synthetic agreement')).toBeTruthy();
  expect(history.getByText('hr-1')).toBeTruthy();
  expect(history.queryByRole('textbox')).toBeNull();
  expect(history.queryByRole('button')).toBeNull();
  rerender(
    <ContractPeriodsPanel
      employee={{ ...employee, weeklyHours: 40 }}
      schedules={[{ ...schedule, name: 'Edited live plan', workingDays: 127 }]}
    />,
  );
  expect(history.getByText('20')).toBeTruthy();
  expect(history.getByText('Historical plan')).toBeTruthy();
  expect(
    screen.getByText(
      /Spätere Profil- oder Planänderungen ändern die bestätigte Historie nicht/,
    ),
  ).toBeTruthy();
  expect(
    screen.getByText(/Ohne Bestätigung bleiben auch bekannte Altdaten/),
  ).toBeTruthy();
  expect(createContractPeriod).not.toHaveBeenCalled();
});

it('requires a note and explicit HR confirmation and posts self-contained facts, not actor or live references', async () => {
  renderWithProviders(
    <ContractPeriodsPanel employee={employee} schedules={[schedule]} />,
  );
  await openDraft();
  const save = screen.getByRole('button', {
    name: 'Vertragszeitraum bestätigen',
  });
  expect(screen.getByText(/UNBESTÄTIGTER ENTWURF/)).toBeTruthy();
  expect(
    (screen.getByLabelText('Vertrags-Wochenstunden') as HTMLInputElement).value,
  ).toBe('32');
  expect(
    (screen.getByRole('checkbox', { name: 'Freitag' }) as HTMLInputElement)
      .checked,
  ).toBe(false);
  expect(save.hasAttribute('disabled')).toBe(true);
  confirm();
  expect(save.hasAttribute('disabled')).toBe(true);
  fillRequired();
  expect(save.hasAttribute('disabled')).toBe(true);
  fireEvent.change(screen.getByLabelText('Bestätigungsnotiz (Pflicht)'), {
    target: { value: 'x' },
  });
  confirm();
  expect(save.hasAttribute('disabled')).toBe(true);
  fillRequired();
  fireEvent.change(
    screen.getByLabelText('Vertrag gültig bis (optional, einschließlich)'),
    { target: { value: '2026-12-31' } },
  );
  fireEvent.change(
    screen.getByLabelText('Vertragliches Beschäftigungsende (optional)'),
    { target: { value: '2027-01-31' } },
  );
  fireEvent.change(screen.getByLabelText('Vertraglicher Feiertagskalender'), {
    target: { value: 'DE-BW' },
  });
  fireEvent.change(
    screen.getByLabelText('Vertragliche zusätzliche Feiertage'),
    { target: { value: '2026-12-25, 2026-08-08\n2026-08-08' } },
  );
  fireEvent.click(screen.getByRole('checkbox', { name: 'Dienstag' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Freitag' }));
  confirm();
  fireEvent.click(save);
  await waitFor(() => expect(createContractPeriod).toHaveBeenCalledOnce());
  expect(createContractPeriod).toHaveBeenCalledWith(employee.id, {
    effectiveFrom: '2026-08-01',
    effectiveTo: '2026-12-31',
    employmentStart: '2026-01-01',
    employmentEnd: '2027-01-31',
    weeklyHours: 32,
    timeModel: 'Teilzeit',
    workingDays: 29,
    holidayCalendar: 'DE-BW',
    holidayDates: ['2026-08-08', '2026-12-25'],
    scheduleLabel: 'Current plan',
    confirmed: true,
    confirmationNote: 'Verified new synthetic agreement',
  });
  expect(
    await screen.findByText(
      'Vertragszeitraum bestätigt. Die Auswertung wird aktualisiert.',
    ),
  ).toBeTruthy();
  expect(
    (
      screen.getByRole('checkbox', {
        name: /Ich bestätige diese Vertragsdaten/,
      }) as HTMLInputElement
    ).checked,
  ).toBe(false);
  expect(contractPeriods.mock.calls.length).toBeGreaterThan(1);
});

it('sends both supersession ID and selected revision, only for a later start', async () => {
  const { queryClient } = renderWithProviders(
    <ContractPeriodsPanel employee={employee} schedules={[schedule]} />,
  );
  await openDraft();
  fillRequired('2026-01-01');
  fireEvent.change(
    screen.getByLabelText('Bisherigen Zeitraum ablösen (optional)'),
    { target: { value: period.id } },
  );
  confirm();
  const save = screen.getByRole('button', {
    name: 'Vertragszeitraum bestätigen',
  });
  expect(save.hasAttribute('disabled')).toBe(true);
  expect(
    screen.getByText(/Eine Ablösung beendet nur den ausgewählten/),
  ).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Vertrag gültig ab'), {
    target: { value: '2026-08-01' },
  });
  // A background refresh must not silently replace the explicitly selected CAS revision.
  await act(async () =>
    queryClient.setQueryData(
      ['contract-periods', employee.id],
      [{ ...period, revision: 4 }],
    ),
  );
  confirm();
  fireEvent.click(save);
  await waitFor(() =>
    expect(createContractPeriod).toHaveBeenCalledWith(
      employee.id,
      expect.objectContaining({
        supersedesPeriodId: period.id,
        expectedRevision: 3,
        effectiveFrom: '2026-08-01',
        effectiveTo: null,
        employmentEnd: null,
      }),
    ),
  );
});

it('handles concurrent/overlap conflicts without claiming the facts were saved', async () => {
  createContractPeriod.mockRejectedValue(
    new ApiError(409, 'CONTRACT_PERIOD_OVERLAP'),
  );
  renderWithProviders(
    <ContractPeriodsPanel employee={employee} schedules={[schedule]} />,
  );
  await openDraft();
  fillRequired();
  confirm();
  fireEvent.click(
    screen.getByRole('button', { name: 'Vertragszeitraum bestätigen' }),
  );
  expect(
    await screen.findByText(
      /Die Vertragshistorie wurde geändert oder der Zeitraum überschneidet sich/,
    ),
  ).toBeTruthy();
  expect(
    screen.queryByText(
      'Vertragszeitraum bestätigt. Die Auswertung wird aktualisiert.',
    ),
  ).toBeNull();
  fireEvent.click(
    screen.getByRole('button', { name: 'Vertragshistorie aktualisieren' }),
  );
  await waitFor(() => expect(contractPeriods).toHaveBeenCalledTimes(2));
  expect(
    (
      screen.getByRole('checkbox', {
        name: /Ich bestätige diese Vertragsdaten/,
      }) as HTMLInputElement
    ).checked,
  ).toBe(false);
});

it('validates holiday dates, interval ordering and the self-contained weekday selection', async () => {
  renderWithProviders(
    <ContractPeriodsPanel employee={employee} schedules={[schedule]} />,
  );
  await openDraft();
  fillRequired();
  fireEvent.change(
    screen.getByLabelText('Vertragliche zusätzliche Feiertage'),
    { target: { value: '2026-02-30' } },
  );
  confirm();
  const save = screen.getByRole('button', {
    name: 'Vertragszeitraum bestätigen',
  });
  expect(save.hasAttribute('disabled')).toBe(true);
  fireEvent.change(
    screen.getByLabelText('Vertragliche zusätzliche Feiertage'),
    { target: { value: '' } },
  );
  fireEvent.change(
    screen.getByLabelText('Vertrag gültig bis (optional, einschließlich)'),
    { target: { value: '2026-07-31' } },
  );
  confirm();
  expect(save.hasAttribute('disabled')).toBe(true);
  fireEvent.change(
    screen.getByLabelText('Vertrag gültig bis (optional, einschließlich)'),
    { target: { value: '' } },
  );
  for (const day of ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag'])
    fireEvent.click(screen.getByRole('checkbox', { name: day }));
  confirm();
  expect(save.hasAttribute('disabled')).toBe(true);
  expect(createContractPeriod).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Vertrags-Wochenstunden'), {
    target: { value: '0' },
  });
  confirm();
  expect(save.hasAttribute('disabled')).toBe(false);
});

it('shows loading, error and an empty historical target state', async () => {
  let reject!: (error: Error) => void;
  contractPeriods.mockReturnValueOnce(
    new Promise((_resolve, rejectPromise) => {
      reject = rejectPromise;
    }),
  );
  renderWithProviders(
    <ContractPeriodsPanel employee={employee} schedules={[]} />,
  );
  expect(screen.getByRole('status')).toBeTruthy();
  await act(async () => reject(new Error('Unavailable')));
  expect(
    await screen.findByText(
      'Die Vertragshistorie konnte nicht geladen werden.',
    ),
  ).toBeTruthy();
  contractPeriods.mockResolvedValueOnce([]);
  fireEvent.click(
    screen.getByRole('button', { name: 'Vertragshistorie aktualisieren' }),
  );
  expect(
    await screen.findByText(
      'Noch keine bestätigten Vertragszeiträume. Das historische Soll ist unbekannt.',
    ),
  ).toBeTruthy();
});

it.each(['Manager', 'Employee'])(
  'does not expose or fetch HR contract history for %s',
  (value) => {
    role.value = value;
    const { container } = renderWithProviders(
      <ContractPeriodsPanel employee={employee} schedules={[]} />,
    );
    expect(container.textContent).toBe('');
    expect(contractPeriods).not.toHaveBeenCalled();
  },
);

it('explains unconfirmed legacy facts and immutable snapshots in English', async () => {
  selectedLocale = 'en';
  contractPeriods.mockResolvedValue([]);
  renderWithProviders(
    <ContractPeriodsPanel employee={employee} schedules={[schedule]} />,
  );
  expect(
    await screen.findByText(
      'No confirmed contract periods yet. Historical targets are unknown.',
    ),
  ).toBeTruthy();
  fireEvent.click(
    screen.getByText('Confirm a new contract period', { selector: 'summary' }),
  );
  expect(screen.getByText(/UNCONFIRMED DRAFT/)).toBeTruthy();
  expect(
    screen.getByText(/Even known legacy data remains unknown/),
  ).toBeTruthy();
  expect(screen.getByText(/not a live schedule reference/)).toBeTruthy();
  expect(screen.getByRole('checkbox', { name: 'Monday' })).toBeTruthy();
  expect(
    screen
      .getByRole('button', { name: 'Confirm contract period' })
      .hasAttribute('disabled'),
  ).toBe(true);
});

it('serializes GET/POST through the employee-scoped contract API without modifying payload facts', async () => {
  const { api } =
    await vi.importActual<typeof import('../api/client')>('../api/client');
  const fetchMock = vi.fn().mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify(period), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  try {
    await api.contractPeriods(employee.id);
    const {
      id: _id,
      employeeId: _employeeId,
      confirmedById: _actor,
      revision: _revision,
      createdAt: _createdAt,
      ...facts
    } = period;
    const payload = {
      ...facts,
      confirmed: true as const,
      supersedesPeriodId: period.id,
      expectedRevision: period.revision,
    };
    await api.createContractPeriod(employee.id, payload);
    expect(fetchMock.mock.calls[0][0]).toBe(
      `/api/employees/${employee.id}/contract-periods`,
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      `/api/employees/${employee.id}/contract-periods`,
    );
    expect(fetchMock.mock.calls[1][1].method).toBe('POST');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual(payload);
  } finally {
    vi.unstubAllGlobals();
  }
});
