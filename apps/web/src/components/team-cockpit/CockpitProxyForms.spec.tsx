import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { renderWithProviders } from '../../test-utils';
import { cockpitProxyDe, cockpitProxyEn } from '../../app/cockpit-proxy-i18n';
import { CockpitProxyForms } from './CockpitProxyForms';

const directory = vi.fn();
const targets = vi.fn();
const clockIn = vi.fn();
const manual = vi.fn();
const absence = vi.fn();
const request = vi.fn();
let online = true;
let actor = { id: 'manager', role: 'Manager' };
vi.mock('../../app/auth', () => ({ useCurrentUser: () => actor }));
vi.mock('../../app/use-online', () => ({ useOnline: () => online }));
vi.mock('../../api/client', () => ({
  api: {
    employeeDirectory: (...args: unknown[]) => directory(...args),
    teamCockpitBookingTargets: (...args: unknown[]) => targets(...args),
    teamCockpitClockIn: (...args: unknown[]) => clockIn(...args),
    teamCockpitManual: (...args: unknown[]) => manual(...args),
    teamCockpitRecordAbsence: (...args: unknown[]) => absence(...args),
    teamCockpitRequestAbsence: (...args: unknown[]) => request(...args),
  },
}));
const employee = { id: 'employee', firstName: 'Ada', lastName: 'Example' };
const colleague = { id: 'colleague', firstName: 'Sam', lastName: 'Other' };
const props = {
  employee,
  employees: [employee, colleague],
  timeZone: 'Europe/Berlin',
};
const projects = [
  {
    id: 'project',
    code: 'P1',
    name: 'Team project',
    serviceOrders: [{ id: 'order', orderNo: 'SO1', title: 'Delivery' }],
  },
];
function change(label: string | RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
function reason(value = 'Administrative support') {
  change('Betriebliche Begründung für die Stellvertretung', value);
}
function submit() {
  fireEvent.submit(screen.getByRole('form', { name: 'Im Auftrag erfassen' }));
}
function mode(value: string) {
  change('Aktion', value);
}
function dates(from = '2026-06-01', to = '2026-06-02') {
  change('Von (einschließlich)', from);
  change('Bis (einschließlich)', to);
}
async function ready() {
  await waitFor(() => expect(targets).toHaveBeenCalledWith(employee.id));
  await waitFor(() =>
    expect(
      screen.getByLabelText('Projekt (optional)').hasAttribute('disabled'),
    ).toBe(false),
  );
}

beforeEach(() => {
  vi.spyOn(window, 'localStorage', 'get').mockReturnValue({
    length: 0,
    clear: vi.fn(),
    key: () => null,
    removeItem: vi.fn(),
    getItem: () => null,
    setItem: vi.fn(),
  });
  vi.spyOn(Date, 'now').mockReturnValue(
    new Date('2026-11-07T12:00:00Z').getTime(),
  );
  actor = { id: 'manager', role: 'Manager' };
  online = true;
  directory
    .mockReset()
    .mockResolvedValue([
      employee,
      colleague,
      { id: 'outside-team', firstName: 'Outside', lastName: 'Colleague' },
    ]);
  targets.mockReset().mockResolvedValue(projects);
  for (const call of [clockIn, manual, absence, request])
    call.mockReset().mockResolvedValue({});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('Team Cockpit proxy forms', () => {
  it('fetches selected employee booking targets with actor/role scoped keys and sends only allowed clock-in metadata', async () => {
    const { queryClient } = renderWithProviders(
      <CockpitProxyForms {...props} />,
    );
    await ready();
    expect(
      queryClient
        .getQueryCache()
        .findAll()
        .map((query) => query.queryKey),
    ).toContainEqual([
      'team-cockpit',
      'manager',
      'Manager',
      'booking-targets',
      employee.id,
    ]);
    change('Projekt (optional)', 'project');
    reason('  Administrative support  ');
    submit();
    expect(clockIn).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain(
      'gültigen Service-Auftrag',
    );
    change('Service-Auftrag (erforderlich)', 'order');
    change('Tätigkeit (optional)', 'Delivery help');
    change('Buchungsnotiz (optional)', 'Operational booking note');
    fireEvent.click(screen.getByLabelText('Abrechenbar'));
    submit();
    await waitFor(() =>
      expect(clockIn).toHaveBeenCalledWith('employee', {
        reason: 'Administrative support',
        projectId: 'project',
        serviceOrderId: 'order',
        activity: 'Delivery help',
        billable: false,
        note: 'Operational booking note',
      }),
    );
    expect(
      await screen.findByText(/Erfassung im Auftrag gespeichert/),
    ).toBeDefined();
    expect(
      (
        screen.getByLabelText(
          'Betriebliche Begründung für die Stellvertretung',
        ) as HTMLTextAreaElement
      ).value,
    ).toBe('');
  });

  it('accepts no-project bookings only after a successful empty booking-targets response', async () => {
    targets.mockResolvedValue([]);
    renderWithProviders(<CockpitProxyForms {...props} />);
    await ready();
    expect(screen.getByText(/keine buchbaren Projekte/)).toBeDefined();
    reason();
    submit();
    await waitFor(() =>
      expect(clockIn).toHaveBeenCalledWith(
        employee.id,
        expect.objectContaining({ projectId: null, serviceOrderId: null }),
      ),
    );
  });

  it('blocks loading/error targets and provides a retry, without falling back to own projects', async () => {
    targets.mockRejectedValue(new Error('Target access revoked'));
    renderWithProviders(<CockpitProxyForms {...props} />);
    expect(screen.getByText(/Buchungsziele werden/)).toBeDefined();
    reason();
    submit();
    expect(clockIn).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/Buchungsziele konnten nicht geladen/),
    ).toBeDefined();
    submit();
    expect(clockIn).not.toHaveBeenCalled();
    targets.mockResolvedValue([]);
    fireEvent.click(screen.getByRole('button', { name: 'Erneut laden' }));
    await ready();
    submit();
    await waitFor(() => expect(clockIn).toHaveBeenCalledTimes(1));
    expect(targets.mock.calls.every((args) => args[0] === employee.id)).toBe(
      true,
    );
  });

  it('rejects a project removed from the latest target query rather than submitting stale assignments', async () => {
    const { queryClient } = renderWithProviders(
      <CockpitProxyForms {...props} />,
    );
    await ready();
    change('Projekt (optional)', 'project');
    change('Service-Auftrag (erforderlich)', 'order');
    reason();
    act(() => {
      queryClient.setQueryData(
        ['team-cockpit', actor.id, actor.role, 'booking-targets', employee.id],
        [],
      );
      // Submit before the observer notification: the live cache is already newer.
      submit();
    });
    expect(clockIn).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain(
      'aktuellen Buchungsziele',
    );
  });

  it('resolves manual times in the declared zone, preserves milliseconds, and exposes actual ISO instants', async () => {
    vi.stubEnv('TZ', 'UTC');
    renderWithProviders(
      <CockpitProxyForms {...props} timeZone="America/New_York" />,
    );
    await ready();
    mode('manual');
    expect(
      screen.getByText('Eingaben in Server-Zeitzone: America/New_York'),
    ).toBeDefined();
    change('Beginn', '2026-06-01T08:00:12.345');
    change('Ende', '2026-06-01T09:00:13.456');
    reason();
    expect(
      screen.getByText('Tatsächlicher ISO-Zeitpunkt: 2026-06-01T12:00:12.345Z'),
    ).toBeDefined();
    submit();
    await waitFor(() =>
      expect(manual).toHaveBeenCalledWith(employee.id, {
        reason: 'Administrative support',
        projectId: null,
        serviceOrderId: null,
        activity: null,
        note: null,
        billable: true,
        clockIn: '2026-06-01T12:00:12.345Z',
        clockOut: '2026-06-01T13:00:13.456Z',
      }),
    );
    expect(screen.queryByLabelText(/Pause/)).toBeNull();
  });

  it('requires an explicit fold choice and clears that choice whenever wall time changes', async () => {
    renderWithProviders(<CockpitProxyForms {...props} />);
    await ready();
    mode('manual');
    change('Beginn', '2026-10-25T02:30:12.345');
    change('Ende', '2026-10-25T04:00');
    reason();
    submit();
    expect(manual).not.toHaveBeenCalled();
    const choice = screen.getByLabelText(
      'Zeitpunkt für Beginn (Zeitumstellung)',
    );
    expect((choice as HTMLSelectElement).value).toBe('');
    expect(
      within(choice).getByRole('option', {
        name: 'UTC+01:00 · 2026-10-25T01:30:12.345Z',
      }),
    ).toBeDefined();
    fireEvent.change(choice, { target: { value: '2026-10-25T01:30:12.345Z' } });
    change('Beginn', '2026-10-25T02:31:12.345');
    expect(
      (
        screen.getByLabelText(
          'Zeitpunkt für Beginn (Zeitumstellung)',
        ) as HTMLSelectElement
      ).value,
    ).toBe('');
    submit();
    expect(manual).not.toHaveBeenCalled();
    change('Zeitpunkt für Beginn (Zeitumstellung)', '2026-10-25T01:31:12.345Z');
    submit();
    await waitFor(() =>
      expect(manual).toHaveBeenCalledWith(
        employee.id,
        expect.objectContaining({ clockIn: '2026-10-25T01:31:12.345Z' }),
      ),
    );
  });

  it.each([
    ['2026-03-29T02:30', '2026-03-29T04:00'],
    ['2026-06-01T10:00', '2026-06-01T09:00'],
    ['2026-06-01T10:00', '2026-06-01T10:00'],
    ['2027-01-01T10:00', '2027-01-01T11:00'],
  ])(
    'rejects gaps, reversed/equal or future manual periods (%s)',
    async (start, end) => {
      renderWithProviders(<CockpitProxyForms {...props} />);
      await ready();
      mode('manual');
      change('Beginn', start);
      change('Ende', end);
      reason();
      submit();
      expect(manual).not.toHaveBeenCalled();
      expect(
        screen
          .getAllByRole('alert')
          .some((alert) => alert.textContent?.includes('Beginn und Ende')),
      ).toBe(true);
    },
  );

  it.each(['Sickness', 'Training', 'Flextime'])(
    'records %s as inclusive dates with only operational reason, no medical data',
    async (kind) => {
      renderWithProviders(<CockpitProxyForms {...props} />);
      mode('absence');
      change('Abwesenheitsart', kind);
      dates();
      reason();
      expect(
        screen.getByText(/Keine Diagnosen, medizinischen Details/),
      ).toBeDefined();
      expect(
        screen.queryByLabelText(/Notiz|Diagnose|Bescheinigung/),
      ).toBeNull();
      submit();
      await waitFor(() =>
        expect(absence).toHaveBeenCalledWith(employee.id, {
          kind,
          from: '2026-06-01',
          to: '2026-06-02',
          proxyReason: 'Administrative support',
        }),
      );
      expect(request).not.toHaveBeenCalled();
    },
  );

  it('submits a vacation request with half days, a different substitute and separate request/proxy reasons, without approval fields', async () => {
    renderWithProviders(<CockpitProxyForms {...props} />);
    mode('request');
    dates();
    const substitute = screen.getByLabelText('Vertretung (optional)');
    expect(
      within(substitute).queryByRole('option', { name: 'Ada Example' }),
    ).toBeNull();
    change('Vertretung (optional)', colleague.id);
    fireEvent.click(screen.getByLabelText('Erster Tag halb'));
    fireEvent.click(screen.getByLabelText('Letzter Tag halb'));
    change('Antragsbegründung (optional)', '  Planned leave  ');
    reason();
    expect(
      screen.getByText(/Diese Erfassung ist keine Genehmigung/),
    ).toBeDefined();
    submit();
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(employee.id, {
        type: 'Vacation',
        from: '2026-06-01',
        to: '2026-06-02',
        halfDayStart: true,
        halfDayEnd: true,
        substituteId: colleague.id,
        reason: 'Planned leave',
        proxyReason: 'Administrative support',
      }),
    );
    expect(absence).not.toHaveBeenCalled();
  });

  it.each(['HomeOffice', 'SpecialLeave'])(
    'keeps %s in the normal request flow without stale vacation-only fields',
    async (type) => {
      renderWithProviders(<CockpitProxyForms {...props} />);
      mode('request');
      dates();
      change('Vertretung (optional)', colleague.id);
      fireEvent.click(screen.getByLabelText('Erster Tag halb'));
      change('Antragsart', type);
      reason();
      expect(screen.queryByLabelText('Vertretung (optional)')).toBeNull();
      expect(screen.queryByLabelText('Erster Tag halb')).toBeNull();
      submit();
      await waitFor(() =>
        expect(request).toHaveBeenCalledWith(employee.id, {
          type,
          from: '2026-06-01',
          to: '2026-06-02',
          halfDayStart: false,
          halfDayEnd: false,
          substituteId: null,
          reason: null,
          proxyReason: 'Administrative support',
        }),
      );
    },
  );

  it('rejects invalid date ranges and cross-year vacations before submitting', () => {
    renderWithProviders(<CockpitProxyForms {...props} />);
    mode('request');
    reason();
    dates('2026-06-02', '2026-06-01');
    submit();
    expect(request).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('Enddatum');
    dates('2026-12-31', '2027-01-01');
    submit();
    expect(request).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('Kalenderjahres');
  });

  it.each(['    ', 'four', 'x'.repeat(1001)])(
    'rejects missing/short/overlong operational reasons',
    async (value) => {
      renderWithProviders(<CockpitProxyForms {...props} />);
      await ready();
      reason(value);
      submit();
      expect(clockIn).not.toHaveBeenCalled();
      expect(screen.getByRole('alert').textContent).toContain('5–1000');
    },
  );

  it('prevents synchronous double submission and refreshes cockpit and related personal/workflow caches', async () => {
    let resolve!: (value: unknown) => void;
    clockIn.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { queryClient } = renderWithProviders(
      <CockpitProxyForms {...props} />,
    );
    await ready();
    reason();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    submit();
    submit();
    await waitFor(() => expect(clockIn).toHaveBeenCalledTimes(1));
    expect(
      screen
        .getByRole('button', { name: 'Wird gespeichert …' })
        .matches(':disabled'),
    ).toBe(true);
    await act(async () => resolve({}));
    await screen.findByText(/Erfassung im Auftrag gespeichert/);
    for (const key of [
      'team-cockpit',
      'requests',
      'time-entries',
      'time-entry-approvals',
      'account',
      'working-time-report',
      'absences',
    ]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: [key] });
    }
  });

  it('clears beneficiary-specific values on selection change and never shows the old in-flight success for the new person', async () => {
    let resolve!: (value: unknown) => void;
    clockIn.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { rerender } = renderWithProviders(<CockpitProxyForms {...props} />);
    await ready();
    change('Projekt (optional)', 'project');
    change('Service-Auftrag (erforderlich)', 'order');
    reason();
    submit();
    await waitFor(() => expect(clockIn).toHaveBeenCalledTimes(1));
    rerender(<CockpitProxyForms {...props} employee={colleague} />);
    await waitFor(() => expect(targets).toHaveBeenCalledWith(colleague.id));
    expect(
      (
        screen.getByLabelText(
          'Betriebliche Begründung für die Stellvertretung',
        ) as HTMLTextAreaElement
      ).value,
    ).toBe('');
    expect(
      (screen.getByLabelText('Projekt (optional)') as HTMLSelectElement).value,
    ).toBe('');
    await act(async () => resolve({}));
    expect(screen.queryByText(/Erfassung im Auftrag gespeichert/)).toBeNull();
    expect(clockIn.mock.calls[0][0]).toBe(employee.id);
    expect(screen.getByText('Für Sam Other')).toBeDefined();
  });

  it('surfaces server errors, refreshes revoked/conflicting state and permits a corrected retry', async () => {
    clockIn.mockRejectedValueOnce(new Error('409 Conflict'));
    const { queryClient } = renderWithProviders(
      <CockpitProxyForms {...props} />,
    );
    await ready();
    reason();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    submit();
    expect(await screen.findByText(/Erfassung fehlgeschlagen/)).toBeDefined();
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['team-cockpit'] }),
    );
    await waitFor(() =>
      expect(
        screen.getByLabelText('Projekt (optional)').hasAttribute('disabled'),
      ).toBe(false),
    );
    submit();
    await waitFor(() => expect(clockIn).toHaveBeenCalledTimes(2));
  });

  it('blocks offline and self/employee-role actions without loading targets', () => {
    online = false;
    const { rerender } = renderWithProviders(<CockpitProxyForms {...props} />);
    expect(screen.getByText(/Offline: Stellvertretende/)).toBeDefined();
    reason();
    submit();
    expect(clockIn).not.toHaveBeenCalled();
    expect(targets).not.toHaveBeenCalled();
    online = true;
    rerender(
      <CockpitProxyForms {...props} employee={{ ...employee, id: actor.id }} />,
    );
    expect(screen.queryByRole('form')).toBeNull();
    expect(targets).not.toHaveBeenCalled();
    actor = { ...actor, role: 'Employee' };
    rerender(<CockpitProxyForms {...props} />);
    expect(screen.queryByRole('form')).toBeNull();
    expect(targets).not.toHaveBeenCalled();
  });

  it('exports complete DE/EN catalogues and renders English without untranslated keys', async () => {
    expect(Object.keys(cockpitProxyDe).sort()).toEqual(
      Object.keys(cockpitProxyEn).sort(),
    );
    vi.spyOn(window, 'localStorage', 'get').mockReturnValue({
      length: 1,
      clear: vi.fn(),
      key: () => null,
      removeItem: vi.fn(),
      getItem: () => 'en',
      setItem: vi.fn(),
    });
    renderWithProviders(<CockpitProxyForms {...props} />);
    expect(
      screen.getByRole('heading', { name: 'Record on behalf' }),
    ).toBeDefined();
    expect(
      screen.getByLabelText('Operational reason for acting on behalf'),
    ).toBeDefined();
    expect(
      await screen.findByRole('option', { name: 'P1 · Team project' }),
    ).toBeDefined();
  });
});

it('permits an eligible substitute outside the beneficiary team through the normal directory, without widening proxy target scope', async () => {
  renderWithProviders(<CockpitProxyForms {...props} />);
  await ready();
  mode('request');
  await screen.findByRole('option', { name: 'Outside Colleague' });
  change('Vertretung (optional)', 'outside-team');
  dates();
  reason();
  submit();
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      'employee',
      expect.objectContaining({
        type: 'Vacation',
        substituteId: 'outside-team',
      }),
    ),
  );
});
