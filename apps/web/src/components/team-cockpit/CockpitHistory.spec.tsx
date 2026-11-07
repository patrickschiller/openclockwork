import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CockpitHistoryDto,
  CockpitHistoryItemDto,
  RequestDto,
} from '../../api/client';
import { renderWithProviders } from '../../test-utils';
import { CockpitHistory } from './CockpitHistory';
import {
  cockpitHistoryDe,
  cockpitHistoryEn,
} from '../../app/cockpit-history-i18n';

const mocks = vi.hoisted(() => ({
  history: vi.fn(),
  events: vi.fn(),
  audit: vi.fn(),
  approvals: vi.fn(),
  requestAudit: vi.fn(),
  report: vi.fn(),
}));
const user = vi.hoisted(() => ({ id: 'manager', role: 'Manager' }));
vi.mock('../../api/client', () => ({
  api: {
    teamCockpitHistory: (...args: unknown[]) => mocks.history(...args),
    getRequestEvents: (...args: unknown[]) => mocks.events(...args),
    requestTimeEntryAudit: (...args: unknown[]) => mocks.requestAudit(...args),
    timeEntryApprovalHistory: (...args: unknown[]) => mocks.approvals(...args),
    workingTimeReport: (...args: unknown[]) => mocks.report(...args),
  },
  request: (...args: unknown[]) => mocks.audit(...args),
}));
vi.mock('../../app/auth', () => ({ useCurrentUser: () => user }));
// Parent owns catalogue aggregation; use the actual provider with the contributed catalogue.
vi.mock('../../app/i18n', async (original) => {
  const actual = await original<typeof import('../../app/i18n')>();
  return {
    ...actual,
    useI18n: () => {
      const context = actual.useI18n();
      const entries =
        context.locale === 'en' ? cockpitHistoryEn : cockpitHistoryDe;
      return {
        ...context,
        t: (key: string, variables?: Record<string, string | number>) =>
          entries[key]?.replace(/\{(\w+)\}/g, (_, name: string) =>
            String(variables?.[name] ?? `{${name}}`),
          ) ?? context.t(key, variables),
      };
    },
  };
});
// The parent exports this existing report renderer; assert delegation, no fabricated totals.
vi.mock('../../routes/AdminWorkingTimesPage', () => ({
  ComparisonTable: ({
    report,
  }: {
    report: { from: string; to: string; comparisons: unknown[] };
  }) => (
    <div data-testid="comparison">
      {report.from} / {report.to} / {report.comparisons.length}
    </div>
  ),
}));
const baseItem: CockpitHistoryItemDto = {
  kind: 'Request',
  id: 'vacation',
  employeeId: 'employee',
  from: '2026-11-02',
  to: '2026-11-03',
  allDay: true,
  classification: 'Vacation',
  status: 'Submitted',
  workflowState: 'Draft',
  halfDayStart: false,
  halfDayEnd: false,
  projectName: null,
  serviceOrderTitle: null,
  grossMinutes: null,
  breakMinutes: null,
  netMinutes: null,
  requiresApproval: true,
  reason: null,
  request: null,
  proxyActions: [],
};
function item(
  overrides: Partial<CockpitHistoryItemDto> = {},
): CockpitHistoryItemDto {
  return { ...baseItem, ...overrides };
}
function page(
  items: CockpitHistoryItemDto[] = [],
  nextCursor: string | null = null,
  overrides: Partial<CockpitHistoryDto> = {},
): CockpitHistoryDto {
  return {
    employee: {
      id: 'employee',
      firstName: 'Demo',
      lastName: 'Person',
      isActive: true,
    },
    from: '2026-11-01',
    to: '2026-11-30',
    generatedAt: '2026-11-07T10:00:00Z',
    timeZone: 'Europe/Berlin',
    items,
    nextCursor,
    ...overrides,
  };
}
async function complete() {
  return screen.findByText(/Vollständiger Verlauf:/);
}
function customPeriod(from: string, to: string) {
  fireEvent.change(screen.getByLabelText('Verlauf von'), {
    target: { value: from },
  });
  fireEvent.change(screen.getByLabelText('Verlauf bis (einschließlich)'), {
    target: { value: to },
  });
}

describe('CockpitHistory', () => {
  beforeEach(() => {
    user.id = 'manager';
    user.role = 'Manager';
    vi.spyOn(window, 'localStorage', 'get').mockReturnValue({
      getItem: () => 'de',
      setItem: () => undefined,
    } as unknown as Storage);
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.history.mockImplementation((_id, query) =>
      Promise.resolve(page([item()], null, { from: query.from, to: query.to })),
    );
    mocks.events.mockResolvedValue([]);
    mocks.audit.mockResolvedValue([]);
    mocks.approvals.mockResolvedValue([]);
    mocks.requestAudit.mockResolvedValue([]);
    mocks.report.mockImplementation((from, to) =>
      Promise.resolve({ from, to, comparisons: [] }),
    );
  });
  afterEach(() => vi.restoreAllMocks());

  it('automatically loads every page before rendering the complete calendar and deduplicates by kind/id', async () => {
    let finish!: (value: CockpitHistoryDto) => void;
    mocks.history
      .mockResolvedValueOnce(page([item()], 'next'))
      .mockReturnValueOnce(
        new Promise<CockpitHistoryDto>((resolve) => {
          finish = resolve;
        }),
      )
      .mockResolvedValueOnce(
        page([
          item({
            id: 'later',
            from: '2026-11-25',
            to: '2026-11-25',
            workflowState: 'Cancelled',
          }),
        ]),
      );
    const result = renderWithProviders(
      <CockpitHistory employeeId="employee" today="2026-11-07" />,
    );
    await waitFor(() => expect(mocks.history).toHaveBeenCalledTimes(2));
    expect(mocks.history.mock.calls[1]).toEqual([
      'employee',
      { from: '2026-11-01', to: '2026-11-30', limit: 200, cursor: 'next' },
    ]);
    expect(screen.getByRole('status').textContent).toContain(
      '1 Seiten, 1 eindeutige Einträge',
    );
    expect(
      screen.queryByRole('region', { name: 'Verlaufskalender' }),
    ).toBeNull();
    await act(async () =>
      finish(
        page(
          [
            item(),
            item({
              kind: 'Absence',
              classification: 'Training',
              workflowState: null,
              status: 'Recorded',
            }),
          ],
          'last',
        ),
      ),
    );
    expect((await complete()).textContent).toContain('3 Einträge auf 3 Seiten');
    expect(
      screen.getByRole('region', { name: 'Verlaufskalender' }),
    ).toBeTruthy();
    expect(
      within(
        screen.getByRole('region', { name: 'Verlaufseinträge' }),
      ).getAllByRole('listitem'),
    ).toHaveLength(3);
    expect(
      result.queryClient
        .getQueryCache()
        .getAll()
        .every(
          (query) =>
            query.queryKey.slice(0, 3).join('/') ===
            'team-cockpit/manager/Manager',
        ),
    ).toBe(true);
  });

  it('loads the full leap year and retains late-year data from subsequent pages', async () => {
    mocks.history.mockImplementation((_id, query) =>
      Promise.resolve(
        page(
          query.cursor
            ? [item({ id: 'december', from: '2024-12-31', to: '2024-12-31' })]
            : [],
          query.from === '2024-01-01' && !query.cursor ? 'DecemberPage' : null,
          { from: query.from, to: query.to },
        ),
      ),
    );
    renderWithProviders(
      <CockpitHistory employeeId="employee" today="2024-02-29" />,
    );
    await complete();
    fireEvent.change(screen.getByLabelText('Verlaufszeitraum'), {
      target: { value: 'year' },
    });
    await screen.findByRole('table', { name: 'Dezember 2024' });
    expect(mocks.history).toHaveBeenCalledWith(
      'employee',
      expect.objectContaining({
        from: '2024-01-01',
        to: '2024-12-31',
        cursor: 'DecemberPage',
      }),
    );
    expect(document.querySelectorAll('[data-history-date]')).toHaveLength(366);
    expect(
      document.querySelector('[data-history-date="2024-12-31"] a'),
    ).toBeTruthy();
    expect(
      screen.getByLabelText('Soll/Ist-Vergleich für diesen Zeitraum anzeigen'),
    ).toBeTruthy();
  });

  it('supports quarter selection and previous/next navigation from the declared today', async () => {
    renderWithProviders(
      <CockpitHistory employeeId="employee" today="2026-11-07" />,
    );
    await complete();
    fireEvent.change(screen.getByLabelText('Verlaufszeitraum'), {
      target: { value: 'quarter' },
    });
    await waitFor(() =>
      expect(mocks.history).toHaveBeenLastCalledWith(
        'employee',
        expect.objectContaining({ from: '2026-10-01', to: '2026-12-31' }),
      ),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Vorheriger Zeitraum' }),
    );
    await waitFor(() =>
      expect(mocks.history).toHaveBeenLastCalledWith(
        'employee',
        expect.objectContaining({ from: '2026-07-01', to: '2026-09-30' }),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Nächster Zeitraum' }));
    expect(
      (screen.getByLabelText('Verlauf von') as HTMLInputElement).value,
    ).toBe('2026-10-01');
  });

  it('shows every request state and recorded absence kind with text, half-day uncertainty, and no medical reason', async () => {
    const states = [
      'Draft',
      'PendingSubstitute',
      'PendingManager',
      'PendingHr',
      'Approved',
      'Rejected',
      'Cancelled',
    ];
    mocks.history.mockResolvedValue(
      page([
        ...states.map((workflowState) =>
          item({ id: workflowState, workflowState }),
        ),
        ...['Sickness', 'Training', 'Flextime'].map((classification) =>
          item({
            id: classification,
            kind: 'Absence',
            classification,
            status: 'Recorded',
            workflowState: null,
            reason: 'NEVER SHOW MEDICAL NOTE',
          }),
        ),
        item({ id: 'half', halfDayStart: true, halfDayEnd: true }),
      ]),
    );
    renderWithProviders(
      <CockpitHistory employeeId="employee" today="2026-11-07" />,
    );
    await complete();
    const records = within(
      screen.getByRole('region', { name: 'Verlaufseinträge' }),
    );
    for (const state of states)
      expect(
        records.getAllByText(
          cockpitHistoryDe[`cockpitHistory.status.${state}`],
        ),
      ).toHaveLength(state === 'Draft' ? 2 : 1);
    expect(
      records.getAllByText('Erfasst (ohne Genehmigungsworkflow)'),
    ).toHaveLength(3);
    expect(
      records.getByText(
        'Erster Tag: halber Tag — vormittags/nachmittags nicht festgelegt',
      ),
    ).toBeTruthy();
    expect(
      records.getByText(
        'Letzter Tag: halber Tag — vormittags/nachmittags nicht festgelegt',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('NEVER SHOW MEDICAL NOTE')).toBeNull();
    expect(screen.getByText(/keine genehmigte Verfügbarkeit/)).toBeTruthy();
  });

  it('maps cross-month instant entries, exclusive midnight and open entries only through the snapshot', async () => {
    mocks.history.mockImplementation((_id, query) =>
      Promise.resolve(
        page(
          [
            item({
              id: 'cross',
              kind: 'TimeEntry',
              from: '2026-10-31T22:00:00Z',
              to: '2026-11-01T01:00:00Z',
              allDay: false,
              classification: 'CrossMonth',
              workflowState: null,
              status: 'Approved',
            }),
            item({
              id: 'midnight',
              kind: 'TimeEntry',
              from: '2026-11-01T18:00:00Z',
              to: '2026-11-01T23:00:00Z',
              allDay: false,
              classification: 'ExclusiveMidnight',
              workflowState: null,
              status: 'Approved',
            }),
            item({
              id: 'open',
              kind: 'TimeEntry',
              from: '2026-11-06T22:00:00Z',
              to: null,
              allDay: false,
              classification: 'Running',
              workflowState: null,
              status: 'Open',
            }),
          ],
          null,
          { from: query.from, to: query.to },
        ),
      ),
    );
    renderWithProviders(
      <CockpitHistory employeeId="employee" today="2026-11-07" />,
    );
    customPeriod('2026-10-01', '2026-11-30');
    await complete();
    const cell = (date: string) => {
      const element = document.querySelector(`[data-history-date="${date}"]`);
      if (!element) throw new Error('Expected calendar date cell');
      return element.textContent;
    };
    expect(cell('2026-10-31')).toContain('CrossMonth');
    expect(cell('2026-11-01')).toContain('CrossMonth');
    expect(cell('2026-11-01')).toContain('ExclusiveMidnight');
    expect(cell('2026-11-02')).not.toContain('ExclusiveMidnight');
    expect(cell('2026-11-07')).toContain('Running');
    expect(cell('2026-11-08')).not.toContain('Running');
  });

  it('keeps an incomplete failed page hidden and retries that page automatically to completion', async () => {
    mocks.history
      .mockResolvedValueOnce(page([item()], 'next'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(page([item({ id: 'last' })]));
    renderWithProviders(
      <CockpitHistory employeeId="employee" today="2026-11-07" />,
    );
    expect((await screen.findByRole('alert')).textContent).toContain(
      'nicht vollständig geladen',
    );
    expect(
      screen.queryByRole('region', { name: 'Verlaufskalender' }),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect((await complete()).textContent).toContain('2 Einträge auf 2 Seiten');
    expect(mocks.history.mock.calls[2][1].cursor).toBe('next');
  });

  it('reports repeated cursors as failure instead of spinning or showing a partial calendar', async () => {
    mocks.history.mockResolvedValue(page([item()], 'same'));
    renderWithProviders(
      <CockpitHistory employeeId="employee" today="2026-11-07" />,
    );
    expect((await screen.findByRole('alert')).textContent).toContain(
      'nicht vollständig geladen',
    );
    expect(mocks.history).toHaveBeenCalledTimes(2);
    expect(
      screen.queryByRole('region', { name: 'Verlaufskalender' }),
    ).toBeNull();
  });

  it('rejects invalid/reversed/overlong custom periods without fetching or showing stale data', async () => {
    renderWithProviders(
      <CockpitHistory employeeId="employee" today="2026-11-07" />,
    );
    await complete();
    const calls = mocks.history.mock.calls.length;
    customPeriod('2027-11-01', '2026-11-30');
    expect(screen.getByRole('alert').textContent).toContain(
      'höchstens 1.830 Tage',
    );
    expect(
      screen.queryByRole('region', { name: 'Verlaufskalender' }),
    ).toBeNull();
    expect(mocks.history).toHaveBeenCalledTimes(calls);
    customPeriod('2020-01-01', '2026-11-30');
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(mocks.history).toHaveBeenCalledTimes(calls);
  });

  it('shows readable proxy actor/time/reason, request events, and the trusted before/proposed correction diff', async () => {
    const request = {
      id: 'correction',
      type: 'TimeAdjustment',
      from: '2026-11-02T08:00:00Z',
      to: '2026-11-02T16:00:00Z',
      targetTimeEntryId: 'target',
      expectedTargetRevision: 2,
      targetTimeEntryBefore: {
        clockIn: '2026-11-02T09:00:00Z',
        clockOut: '2026-11-02T16:00:00Z',
      },
    } as RequestDto;
    mocks.history.mockResolvedValue(
      page([
        item({
          id: 'correction',
          request,
          classification: 'TimeAdjustment',
          proxyActions: [
            {
              id: 'proxy',
              action: 'ProxyRequest',
              actorId: 'hr',
              actorName: 'Synthetic HR',
              at: '2026-11-02T12:00:00Z',
              reason: 'Operational reason',
            },
          ],
        }),
      ]),
    );
    mocks.events.mockResolvedValue([
      {
        id: 'event',
        kind: 'ManagerApproved',
        actorId: 'approving-manager',
        at: '2026-11-03T12:00:00Z',
        note: 'Workflow note',
      },
    ]);
    mocks.requestAudit.mockResolvedValue([
      {
        id: 'applied',
        action: 'FrameRequestCorrected',
        actorId: 'hr',
        actorName: 'Synthetic HR',
        timeEntryId: 'target',
        requestId: 'correction',
        occurredAt: '2026-11-04T12:00:00Z',
        reason: 'Applied reason',
        before: request.targetTimeEntryBefore,
        after: { clockIn: request.from, clockOut: request.to },
      },
    ]);
    const result = renderWithProviders(
      <CockpitHistory employeeId="employee" today="2026-11-07" />,
    );
    await complete();
    expect(screen.getByText('Vorher:')).toBeTruthy();
    expect(screen.getByText('Vorgeschlagen:')).toBeTruthy();
    expect(screen.getByText('Handelnde Person: Synthetic HR')).toBeTruthy();
    expect(screen.getByText('Operational reason')).toBeTruthy();
    expect(mocks.events).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Auditdetails' }));
    expect(await screen.findByText('Workflow note')).toBeTruthy();
    expect(await screen.findByText('Applied reason')).toBeTruthy();
    expect(
      screen.getByText('Handelnde Person: approving-manager'),
    ).toBeTruthy();
    expect(mocks.events).toHaveBeenCalledWith('correction');
    expect(mocks.requestAudit).toHaveBeenCalledWith('correction');
    expect(
      result.queryClient
        .getQueryCache()
        .getAll()
        .every((query) => query.queryKey[0] === 'team-cockpit'),
    ).toBe(true);
  });

  it('loads time-entry audit and approval events on demand, not absence details', async () => {
    mocks.history.mockResolvedValue(
      page([
        item({
          kind: 'TimeEntry',
          id: 'entry',
          allDay: false,
          from: '2026-11-02T08:00:00Z',
          to: '2026-11-02T16:00:00Z',
          workflowState: null,
          status: 'Pending',
          classification: 'Work',
        }),
      ]),
    );
    mocks.audit.mockResolvedValue([
      {
        id: 'change',
        timeEntryId: 'entry',
        action: 'FrameRequestCorrected',
        actorName: 'Synthetic Manager',
        actorId: 'manager',
        occurredAt: '2026-11-03T10:00:00Z',
        reason: 'Entry changed',
        before: {
          clockIn: '2026-11-02T09:00:00Z',
          clockOut: '2026-11-02T16:00:00Z',
          revision: 1,
        },
        after: {
          clockIn: '2026-11-02T08:00:00Z',
          clockOut: '2026-11-02T16:00:00Z',
          revision: 2,
        },
      },
    ]);
    mocks.approvals.mockResolvedValue([
      {
        id: 'approval',
        action: 'FrameManagerApproved',
        actorName: 'Approver',
        actorId: 'approver',
        occurredAt: '2026-11-03T11:00:00Z',
        reason: 'Reviewed',
      },
    ]);
    renderWithProviders(
      <CockpitHistory employeeId="employee" today="2026-11-07" />,
    );
    await complete();
    fireEvent.click(screen.getByRole('button', { name: 'Auditdetails' }));
    expect(await screen.findByText('Entry changed')).toBeTruthy();
    expect(await screen.findByText('Reviewed')).toBeTruthy();
    expect(mocks.audit).toHaveBeenCalledWith('/api/timeentries/entry/audit');
    expect(mocks.approvals).toHaveBeenCalledWith('entry');
    expect(screen.getByText('Revision: 1')).toBeTruthy();
    expect(screen.getByText('Revision: 2')).toBeTruthy();
    expect(mocks.events).not.toHaveBeenCalled();
  });

  it('delegates comparison to the existing report renderer for the same employee/range, never beyond 366 days', async () => {
    renderWithProviders(
      <CockpitHistory employeeId="employee" today="2026-11-07" />,
    );
    await complete();
    expect(mocks.report).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByLabelText('Soll/Ist-Vergleich für diesen Zeitraum anzeigen'),
    );
    expect((await screen.findByTestId('comparison')).textContent).toContain(
      '2026-11-01 / 2026-11-30 / 0',
    );
    expect(mocks.report).toHaveBeenCalledWith(
      '2026-11-01',
      '2026-11-30',
      'employee',
    );
    const calls = mocks.report.mock.calls.length;
    customPeriod('2025-11-01', '2026-11-30');
    expect(
      screen.getByText(/Soll\/Ist-Vergleich unterstützt höchstens 366 Tage/),
    ).toBeTruthy();
    expect(screen.queryByTestId('comparison')).toBeNull();
    expect(mocks.report).toHaveBeenCalledTimes(calls);
  });

  it('isolates histories by actor role and employee, and never queries for ordinary employees', async () => {
    user.role = 'Employee';
    renderWithProviders(
      <CockpitHistory employeeId="employee" today="2026-11-07" />,
    );
    expect(screen.getByRole('alert').textContent).toContain(
      'Führungskräften und HR-Admins vorbehalten',
    );
    expect(mocks.history).not.toHaveBeenCalled();
  });

  it('supports English history controls and keeps catalogue key parity', async () => {
    vi.spyOn(window, 'localStorage', 'get').mockReturnValue({
      getItem: () => 'en',
      setItem: () => undefined,
    } as unknown as Storage);
    renderWithProviders(
      <CockpitHistory employeeId="employee" today="2026-11-07" />,
    );
    expect(await screen.findByText(/Complete history: 1 records/)).toBeTruthy();
    expect(screen.getByRole('table', { name: 'November 2026' })).toBeTruthy();
    expect(screen.getByText(/history, not approved availability/)).toBeTruthy();
    expect(Object.keys(cockpitHistoryDe).sort()).toEqual(
      Object.keys(cockpitHistoryEn).sort(),
    );
  });
});
