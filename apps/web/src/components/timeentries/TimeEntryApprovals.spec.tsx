import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test-utils';
import type { TimeEntryApprovalDto, TimeEntryDto } from '../../api/client';
import { TimeEntryApprovals } from './TimeEntryApprovals';

const mocks = vi.hoisted(() => ({
  user: { id: 'manager-1', role: 'Manager' },
  list: vi.fn(),
  decide: vi.fn(),
  history: vi.fn(),
}));
vi.mock('../../api/client', () => ({
  api: {
    timeEntryApprovals: mocks.list,
    decideTimeEntryApproval: mocks.decide,
    timeEntryApprovalHistory: mocks.history,
  },
}));
vi.mock('../../app/auth', () => ({ useCurrentUser: () => mocks.user }));

const entry: TimeEntryDto = {
  id: 'entry-1',
  employeeId: 'employee-1',
  clockIn: '2026-05-04T05:00:00Z',
  clockOut: '2026-05-04T17:00:00Z',
  source: 'web',
  status: 'Pending',
  requiresApproval: true,
  latitude: null,
  longitude: null,
  accuracyMeters: null,
  terminalDistanceMeters: null,
  terminalRadiusMeters: null,
  terminalMaxAccuracyMeters: null,
  positionTimestamp: null,
  clockOutLatitude: null,
  clockOutLongitude: null,
  clockOutAccuracyMeters: null,
  clockOutTerminalDistanceMeters: null,
  clockOutTerminalRadiusMeters: null,
  clockOutTerminalMaxAccuracyMeters: null,
  clockOutPositionTimestamp: null,
  terminalId: null,
  clockOutTerminalId: null,
  clockInChallengeId: null,
  clockOutChallengeId: null,
  projectId: null,
  projectCode: null,
  projectName: null,
  serviceOrderId: null,
  serviceOrderNo: null,
  serviceOrderTitle: null,
  activity: null,
  summary: { grossMinutes: 720, breakMinutes: 45, netMinutes: 675 },
};
function approval(
  overrides: Partial<TimeEntryApprovalDto> = {},
): TimeEntryApprovalDto {
  return {
    entry,
    revision: 7,
    employeeName: 'Anna Example',
    managerId: 'manager-1',
    managerName: 'Marc Manager',
    state: 'PendingManager',
    canDecide: true,
    ...overrides,
  };
}
function renderPanel(scope: 'own' | 'review' = 'review') {
  return renderWithProviders(<TimeEntryApprovals scope={scope} />);
}

let storedLocale: string | null;
beforeEach(() => {
  storedLocale = 'de';
  vi.spyOn(window, 'localStorage', 'get').mockReturnValue({
    length: 1,
    clear: () => {
      storedLocale = null;
    },
    key: () => 'openclockwork.locale',
    removeItem: () => {
      storedLocale = null;
    },
    getItem: () => storedLocale,
    setItem: (_key: string, value: string) => {
      storedLocale = value;
    },
  });
  mocks.user.id = 'manager-1';
  mocks.user.role = 'Manager';
  mocks.list.mockReset().mockResolvedValue([approval()]);
  mocks.decide
    .mockReset()
    .mockResolvedValue(approval({ state: 'PendingHr', canDecide: false }));
  mocks.history.mockReset().mockResolvedValue([]);
});

afterEach(() => vi.restoreAllMocks());

describe('out-of-frame time entry approvals', () => {
  it('shows the manager the correct stage, sends the revision and refetches lists, history and totals', async () => {
    const { queryClient } = renderPanel();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    expect(await screen.findByText('Wartet auf Führungskraft')).toBeDefined();
    expect(
      screen.getByText(/Nächster Schritt: Marc Manager/).textContent,
    ).toContain('Genehmigungen → Zeitbuchungen');
    expect(mocks.list).toHaveBeenCalledWith('review');
    expect(
      screen.queryByRole('button', { name: 'Als HR bestätigen' }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Genehmigungsverlauf' }),
    );
    await screen.findByText(
      'Noch keine Entscheidungen oder Änderungen vorhanden.',
    );
    mocks.list.mockResolvedValue([
      approval({ state: 'PendingHr', canDecide: false }),
    ]);
    fireEvent.click(
      screen.getByRole('button', { name: 'Als Führungskraft genehmigen' }),
    );
    await waitFor(() =>
      expect(mocks.decide).toHaveBeenCalledWith('entry-1', {
        revision: 7,
        stage: 'Manager',
        outcome: 'Approve',
      }),
    );
    expect(await screen.findByText('Wartet auf HR')).toBeDefined();
    expect(screen.getByRole('status').textContent).toContain(
      'Als Nächstes bestätigt HR',
    );
    expect(
      screen.queryByRole('button', { name: 'Als Führungskraft genehmigen' }),
    ).toBeNull();
    expect(mocks.list.mock.calls.length).toBeGreaterThan(1);
    expect(mocks.history.mock.calls.length).toBeGreaterThan(1);
    for (const key of [
      'time-entry-approvals',
      'time-entry-approval-history',
      'time-entries',
      'account',
      'violations',
      'working-time-report',
      'project-report',
    ]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: [key] });
    }
  });

  it.each([
    {
      role: 'Manager',
      id: 'manager-1',
      state: 'PendingManager' as const,
      stage: 'Manager',
      label: 'Als Führungskraft ablehnen',
    },
    {
      role: 'HRAdmin',
      id: 'hr-1',
      state: 'PendingHr' as const,
      stage: 'HR',
      label: 'Als HR ablehnen',
    },
  ])(
    'requires a nonblank reason when $role rejects',
    async ({ role, id, state, stage, label }) => {
      mocks.user.role = role;
      mocks.user.id = id;
      mocks.list.mockResolvedValue([approval({ state })]);
      renderPanel();
      const reject = await screen.findByRole('button', { name: label });
      expect(reject.hasAttribute('disabled')).toBe(true);
      const note = screen.getByLabelText('Notiz (bei Ablehnung erforderlich)');
      fireEvent.change(note, { target: { value: '   ' } });
      expect(reject.hasAttribute('disabled')).toBe(true);
      fireEvent.click(reject);
      expect(mocks.decide).not.toHaveBeenCalled();
      fireEvent.change(note, {
        target: { value: '  Bitte Zeitraum prüfen  ' },
      });
      mocks.list.mockResolvedValue([
        approval({ state: 'Rejected', canDecide: false }),
      ]);
      fireEvent.click(reject);
      await waitFor(() =>
        expect(mocks.decide).toHaveBeenCalledWith('entry-1', {
          revision: 7,
          stage,
          outcome: 'Reject',
          note: 'Bitte Zeitraum prüfen',
        }),
      );
      expect(
        await screen.findByText('Ablehnung mit Begründung gespeichert.'),
      ).toBeDefined();
    },
  );

  it('lets HR confirm only the HR stage with the current revision', async () => {
    mocks.user.role = 'HRAdmin';
    mocks.user.id = 'hr-1';
    mocks.list.mockResolvedValue([
      approval({ state: 'PendingHr', revision: 12 }),
    ]);
    renderPanel();
    const confirm = await screen.findByRole('button', {
      name: 'Als HR bestätigen',
    });
    expect(
      screen.queryByRole('button', { name: 'Als Führungskraft genehmigen' }),
    ).toBeNull();
    fireEvent.change(
      screen.getByLabelText('Notiz (bei Ablehnung erforderlich)'),
      { target: { value: 'Geprüft' } },
    );
    mocks.list.mockResolvedValue([
      approval({ state: 'Approved', canDecide: false }),
    ]);
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(mocks.decide).toHaveBeenCalledWith('entry-1', {
        revision: 12,
        stage: 'HR',
        outcome: 'Approve',
        note: 'Geprüft',
      }),
    );
    expect(await screen.findByText('Genehmigt')).toBeDefined();
  });

  it('does not let HR bypass the assigned manager', async () => {
    mocks.user.role = 'HRAdmin';
    mocks.user.id = 'hr-1';
    renderPanel();
    await screen.findByText('Wartet auf Führungskraft');
    expect(
      screen.queryByLabelText('Notiz (bei Ablehnung erforderlich)'),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Als HR bestätigen' }),
    ).toBeNull();
  });

  it.each([
    'Open',
    'BlockedManager',
    'Approved',
    'Rejected',
    'Voided',
    'PendingHr',
  ] as const)(
    'shows %s without manager actions even with an inconsistent canDecide flag',
    async (state) => {
      mocks.list.mockResolvedValue([approval({ state })]);
      renderPanel();
      await screen.findByText(/Anna Example/);
      expect(
        screen.queryByLabelText('Notiz (bei Ablehnung erforderlich)'),
      ).toBeNull();
      expect(
        screen.getByRole('button', { name: 'Genehmigungsverlauf' }),
      ).toBeDefined();
    },
  );

  it('respects server permissions and manager assignment', async () => {
    mocks.list.mockResolvedValue([
      approval({ canDecide: false }),
      approval({
        entry: { ...entry, id: 'entry-2' },
        managerId: 'other-manager',
      }),
    ]);
    renderPanel();
    await screen.findAllByText('Wartet auf Führungskraft');
    expect(
      screen.queryByLabelText('Notiz (bei Ablehnung erforderlich)'),
    ).toBeNull();
  });

  it.each(['Employee', 'Manager', 'HRAdmin'])(
    'shows own status/history but no decisions for an owner with role %s',
    async (role) => {
      mocks.user.role = role;
      mocks.user.id = entry.employeeId;
      mocks.list.mockResolvedValue([approval({ managerId: entry.employeeId })]);
      renderPanel('own');
      await screen.findByText('Wartet auf Führungskraft');
      expect(
        screen.getByText('Rahmenzeit-Genehmigungen für meine Zeitbuchungen'),
      ).toBeDefined();
      expect(mocks.list).toHaveBeenCalledWith('own');
      expect(
        screen.queryByLabelText('Notiz (bei Ablehnung erforderlich)'),
      ).toBeNull();
      fireEvent.click(
        screen.getByRole('button', { name: 'Genehmigungsverlauf' }),
      );
      expect(
        await screen.findByText(
          'Noch keine Entscheidungen oder Änderungen vorhanden.',
        ),
      ).toBeDefined();
    },
  );

  it('never offers manager-stage actions to HR even with an inconsistent server flag and assignment', async () => {
    mocks.user.role = 'HRAdmin';
    mocks.list.mockResolvedValue([
      approval({ managerId: mocks.user.id, canDecide: true }),
    ]);
    renderPanel();
    await screen.findByText('Wartet auf Führungskraft');
    expect(
      screen.queryByLabelText('Notiz (bei Ablehnung erforderlich)'),
    ).toBeNull();
  });

  it('prevents self-approval even in a broad reviewer role', async () => {
    mocks.user.role = 'HRAdmin';
    mocks.user.id = entry.employeeId;
    mocks.list.mockResolvedValue([approval({ state: 'PendingHr' })]);
    renderPanel();
    await screen.findByText('Wartet auf HR');
    expect(
      screen.queryByLabelText('Notiz (bei Ablehnung erforderlich)'),
    ).toBeNull();
  });

  it('does not query the reviewer list for an employee', async () => {
    mocks.user.role = 'Employee';
    renderPanel();
    expect(mocks.list).not.toHaveBeenCalled();
    expect(screen.queryByText('Zeitbuchungen')).toBeNull();
  });

  it('keeps stale errors and the entered reason visible, then uses the refreshed revision', async () => {
    mocks.decide.mockRejectedValueOnce(
      new Error('Stale revision: entry changed'),
    );
    renderPanel();
    const reject = await screen.findByRole('button', {
      name: 'Als Führungskraft ablehnen',
    });
    const note = screen.getByLabelText(
      'Notiz (bei Ablehnung erforderlich)',
    ) as HTMLInputElement;
    fireEvent.change(note, { target: { value: 'Zeitraum falsch' } });
    fireEvent.click(reject);
    expect(await screen.findByRole('alert')).toBeDefined();
    expect(screen.getByRole('alert').textContent).toContain(
      'Stale revision: entry changed',
    );
    expect(note.value).toBe('Zeitraum falsch');
    mocks.list.mockResolvedValue([approval({ revision: 9 })]);
    fireEvent.click(
      screen.getByRole('button', { name: 'Genehmigungen aktualisieren' }),
    );
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', { name: 'Genehmigungen aktualisieren' })
          .hasAttribute('disabled'),
      ).toBe(false),
    );
    expect(screen.getByRole('alert').textContent).toContain(
      'Stale revision: entry changed',
    );
    mocks.decide.mockResolvedValueOnce(
      approval({ state: 'Rejected', canDecide: false }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Als Führungskraft ablehnen' }),
    );
    await waitFor(() =>
      expect(mocks.decide).toHaveBeenLastCalledWith('entry-1', {
        revision: 9,
        stage: 'Manager',
        outcome: 'Reject',
        note: 'Zeitraum falsch',
      }),
    );
  });

  it('renders every decision and invalidation with actor, timestamp and reason', async () => {
    mocks.history.mockResolvedValue([
      {
        id: '1',
        actorId: 'manager-1',
        actorName: 'Marc Manager',
        action: 'FrameManagerApproved',
        reason: 'Kundentermin',
        occurredAt: '2026-05-04T17:30:00Z',
      },
      {
        id: '2',
        actorId: 'hr-1',
        actorName: 'Hannah HR',
        action: 'FrameHrConfirmed',
        reason: null,
        occurredAt: '2026-05-04T18:00:00Z',
      },
      {
        id: '3',
        actorId: null,
        actorName: null,
        action: 'FrameApprovalInvalidated',
        reason: 'Führungskraft geändert',
        occurredAt: '2026-05-05T08:00:00Z',
      },
      {
        id: '4',
        actorId: 'manager-2',
        actorName: 'New Manager',
        action: 'FrameManagerRejected',
        reason: 'Unklarer Zeitraum',
        occurredAt: '2026-05-05T09:00:00Z',
      },
      {
        id: '5',
        actorId: 'hr-1',
        actorName: 'Hannah HR',
        action: 'FrameHrRejected',
        reason: 'Fehlender Nachweis',
        occurredAt: '2026-05-05T10:00:00Z',
      },
      {
        id: '6',
        actorId: 'owner-1',
        actorName: 'Anna Example',
        action: 'FrameSegmentCreated',
        reason: null,
        occurredAt: '2026-05-05T11:00:00Z',
      },
    ]);
    const { container } = renderPanel('own');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Genehmigungsverlauf' }),
    );
    expect(await screen.findByText('Kundentermin')).toBeDefined();
    for (const label of [
      'Von Führungskraft genehmigt',
      'Von HR bestätigt',
      'Bisherige Genehmigung durch Änderung aufgehoben',
      'Von Führungskraft abgelehnt',
      'Von HR abgelehnt',
      'Buchungssegment nach Änderung neu angelegt',
      'Führungskraft geändert',
      'Unklarer Zeitraum',
      'Fehlender Nachweis',
    ]) {
      expect(screen.getByText(label)).toBeDefined();
    }
    expect(screen.getByText(/Marc Manager ·/)).toBeDefined();
    expect(screen.getByText(/System ·/)).toBeDefined();
    expect(container.querySelector('time')?.getAttribute('datetime')).toBe(
      '2026-05-04T17:30:00Z',
    );
  });

  it('shows loading, query errors and recoverable empty states', async () => {
    let rejectList!: (reason: Error) => void;
    mocks.list.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectList = reject;
        }),
    );
    renderPanel();
    expect(screen.getByRole('status').textContent).toBe('Lädt …');
    rejectList(new Error('Service unavailable'));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Service unavailable',
    );
    mocks.list.mockResolvedValue([]);
    fireEvent.click(
      screen.getByRole('button', { name: 'Genehmigungen aktualisieren' }),
    );
    expect(
      await screen.findByText(
        'Keine genehmigungspflichtigen Zeitbuchungen vorhanden.',
      ),
    ).toBeDefined();
  });

  it('surfaces history errors and allows retry', async () => {
    mocks.history.mockRejectedValueOnce(new Error('History unavailable'));
    renderPanel('own');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Genehmigungsverlauf' }),
    );
    expect((await screen.findByRole('alert')).textContent).toContain(
      'History unavailable',
    );
    mocks.history.mockResolvedValue([]);
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Genehmigungen aktualisieren' })[1],
    );
    expect(
      await screen.findByText(
        'Noch keine Entscheidungen oder Änderungen vorhanden.',
      ),
    ).toBeDefined();
  });

  it.each([
    {
      locale: 'de',
      title: 'Zeitbuchungen',
      state: 'Blockiert – Führungskraft fehlt',
      manager: 'aktive Führungskraft zuzuweisen',
      where: 'Genehmigungen → Zeitbuchungen',
    },
    {
      locale: 'en',
      title: 'Time entries',
      state: 'Blocked – no active manager',
      manager: 'assign an active manager',
      where: 'Approvals → Time entries',
    },
  ])(
    'explains the chain and missing-manager recovery in $locale',
    async ({ locale, title, state, manager, where }) => {
      storedLocale = locale;
      mocks.list.mockResolvedValue([
        approval({
          state: 'BlockedManager',
          managerId: null,
          managerName: null,
          canDecide: false,
        }),
      ]);
      renderPanel();
      expect(await screen.findByText(state)).toBeDefined();
      expect(screen.getByText(title)).toBeDefined();
      const help = screen.getByText(new RegExp(manager));
      expect(help.textContent).toContain(where);
      expect(screen.queryByLabelText(/Note|Notiz/)).toBeNull();
    },
  );

  it('provides English actions, error guidance and history labels', async () => {
    storedLocale = 'en';
    mocks.user.role = 'HRAdmin';
    mocks.user.id = 'hr-1';
    mocks.list.mockResolvedValue([approval({ state: 'PendingHr' })]);
    mocks.decide.mockRejectedValueOnce(new Error('Revision conflict'));
    mocks.history.mockResolvedValue([
      {
        id: '1',
        actorId: 'manager-1',
        actorName: 'Marc Manager',
        action: 'FrameManagerApproved',
        reason: 'Client visit',
        occurredAt: '2026-05-04T17:30:00Z',
      },
    ]);
    renderPanel();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Confirm as HR' }),
    );
    expect((await screen.findByRole('alert')).textContent).toContain(
      'The decision was not saved.',
    );
    expect(screen.getByRole('alert').textContent).toContain(
      'Refresh and check the current status',
    );
    expect(
      screen.getByLabelText('Note (required for rejection)'),
    ).toBeDefined();
    expect(
      screen
        .getByRole('button', { name: 'Reject as HR' })
        .hasAttribute('disabled'),
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Approval history' }));
    expect(await screen.findByText('Approved by manager')).toBeDefined();
    expect(screen.getByText('Client visit')).toBeDefined();
  });
  it.each([
    [
      'de',
      'Durch Korrekturantrag geändert',
      'Zugehöriger Antrag: correction-request',
    ],
    [
      'en',
      'Changed by correction request',
      'Related request: correction-request',
    ],
  ])(
    'labels linked request corrections without presenting them as an old approval (%s)',
    async (locale, label, reference) => {
      storedLocale = locale;
      mocks.history.mockResolvedValue([
        {
          id: 'correction-event',
          actorId: 'hr',
          actorName: 'HR Example',
          action: 'FrameRequestCorrected',
          reason: 'Changed booking',
          occurredAt: '2026-05-05T12:00:00Z',
          requestId: 'correction-request',
        },
      ]);
      renderPanel();
      fireEvent.click(
        await screen.findByRole('button', {
          name: locale === 'de' ? 'Genehmigungsverlauf' : 'Approval history',
        }),
      );
      expect(await screen.findByText(label)).toBeDefined();
      expect(screen.getByText(reference)).toBeDefined();
    },
  );
});

it('filters completed decisions only when the cockpit explicitly requests pending-only approvals', async () => {
  mocks.list.mockResolvedValue([
    approval(),
    approval({
      entry: { ...entry, id: 'done' },
      state: 'Approved',
      canDecide: false,
    }),
    approval({
      entry: { ...entry, id: 'voided' },
      state: 'Voided',
      canDecide: false,
    }),
  ]);
  renderWithProviders(<TimeEntryApprovals scope="review" pendingOnly />);
  await screen.findByText('Wartet auf Führungskraft');
  expect(screen.queryByText('Genehmigt')).toBeNull();
  expect(screen.queryByText('Ungültig')).toBeNull();
});

it('automatically refreshes cockpit approvals after a stale decision instead of keeping an actionable old stage', async () => {
  mocks.decide.mockRejectedValue(new Error('409 revision changed'));
  renderWithProviders(<TimeEntryApprovals scope="review" pendingOnly />);
  const approve = await screen.findByRole('button', {
    name: 'Als Führungskraft genehmigen',
  });
  mocks.list.mockResolvedValue([
    approval({ state: 'PendingHr', revision: 8, canDecide: false }),
  ]);
  fireEvent.click(approve);
  expect(await screen.findByText('Wartet auf HR')).toBeTruthy();
  expect(
    screen.queryByRole('button', { name: 'Als Führungskraft genehmigen' }),
  ).toBeNull();
  expect(screen.getByRole('alert').textContent).toContain(
    '409 revision changed',
  );
  expect(mocks.list.mock.calls.length).toBeGreaterThan(1);
});

it('uses the declared cockpit timezone for the ordinary approval interval, independently of the viewer zone', async () => {
  renderWithProviders(
    <TimeEntryApprovals scope="review" timeZone="Asia/Kathmandu" />,
  );
  expect(
    await screen.findByText(/Anna Example · .*10:45:00.*22:45:00/),
  ).toBeTruthy();
});
