import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import { RequestsPage } from './RequestsPage';

const listRequestsMock = vi.fn();
const getRequestMock = vi.fn();
const getRequestEventsMock = vi.fn();
const updateDraftRequestMock = vi.fn();
const resubmitRequestMock = vi.fn();
const employeeDirectoryMock = vi.fn();
const employeesMock = vi.fn();
const createVacationRequestMock = vi.fn();
const createRequestMock = vi.fn();
const targetsMock = vi.fn();
const requestAuditMock = vi.fn();
const cancelRequestMock = vi.fn();

vi.mock('../api/client', () => ({
  api: {
    createRequest: (...args: unknown[]) => createRequestMock(...args),
    timeAdjustmentTargets: (...args: unknown[]) => targetsMock(...args),
    requestTimeEntryAudit: (...args: unknown[]) => requestAuditMock(...args),
    cancelRequest: (...args: unknown[]) => cancelRequestMock(...args),
    listRequests: (...args: unknown[]) => listRequestsMock(...args),
    getRequest: (...args: unknown[]) => getRequestMock(...args),
    getRequestEvents: (...args: unknown[]) => getRequestEventsMock(...args),
    updateDraftRequest: (...args: unknown[]) => updateDraftRequestMock(...args),
    resubmitRequest: (...args: unknown[]) => resubmitRequestMock(...args),
    employeeDirectory: (...args: unknown[]) => employeeDirectoryMock(...args),
    employees: (...args: unknown[]) => employeesMock(...args),
    vacationBalance: vi.fn().mockResolvedValue({
      remainingDays: 30,
      totalEntitlement: 30,
      approvedDays: 0,
      pendingDays: 0,
    }),
    createVacationRequest: (...args: unknown[]) =>
      createVacationRequestMock(...args),
  },
}));

vi.mock('../app/auth', () => ({
  useCurrentUser: () => ({
    id: 'requester',
    firstName: 'Anna',
    lastName: 'Example',
    role: 'Employee',
  }),
}));

describe('request creation and draft revision', () => {
  const originalTimezone = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'Europe/Berlin';
  });
  afterAll(() => {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  });
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => {
    // Persisted locale wins over navigator.languages. Isolate it on Node 20
    // (jsdom storage) as well as newer Node versions (native localStorage).
    vi.spyOn(window, 'localStorage', 'get').mockReturnValue({
      length: 0,
      clear: vi.fn(),
      key: () => null,
      removeItem: vi.fn(),
      getItem: () => null,
      setItem: vi.fn(),
    });
    listRequestsMock.mockReset().mockResolvedValue([]);
    createRequestMock.mockReset().mockResolvedValue({});
    targetsMock.mockReset().mockResolvedValue([]);
    requestAuditMock.mockReset().mockResolvedValue([]);
    cancelRequestMock.mockReset().mockResolvedValue({});
    getRequestMock.mockReset();
    getRequestEventsMock.mockReset().mockResolvedValue([]);
    updateDraftRequestMock.mockReset().mockResolvedValue({});
    resubmitRequestMock.mockReset().mockResolvedValue({});
    employeesMock.mockClear();
    employeeDirectoryMock.mockClear().mockResolvedValue([
      { id: 'requester', firstName: 'Anna', lastName: 'Example' },
      { id: 'substitute', firstName: 'Bernd', lastName: 'Example' },
    ]);
    createVacationRequestMock.mockClear().mockResolvedValue({});
  });

  it('lets an employee select a colleague and submit without reading personnel records', async () => {
    renderWithProviders(<RequestsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Neuer Antrag' }));

    const selection = await screen.findByLabelText('Vertretung (optional)');
    expect(
      await within(selection).findByRole('option', {
        name: 'Bernd Example',
      }),
    ).toBeDefined();
    expect(
      within(selection).queryByRole('option', {
        name: 'Anna Example',
      }),
    ).toBeNull();
    expect(employeeDirectoryMock).toHaveBeenCalled();
    expect(employeesMock).not.toHaveBeenCalled();

    fireEvent.change(selection, { target: { value: 'substitute' } });
    fireEvent.click(screen.getByRole('button', { name: 'Antrag stellen' }));

    await waitFor(() => {
      expect(createVacationRequestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          employeeId: 'requester',
          substituteId: 'substitute',
        }),
      );
    });
  });
  const draft = {
    id: 'same-request',
    employeeId: 'requester',
    employeeName: 'Anna Example',
    type: 'Vacation',
    workflowState: 'Draft',
    status: 'Submitted',
    from: '2026-05-04T00:00:00.000Z',
    to: '2026-05-08T00:00:00.000Z',
    reason: 'Original reason',
    decisionNote: 'Bitte kürzen',
    substituteId: 'substitute',
    halfDayStart: true,
    halfDayEnd: false,
    calculatedDays: 4.5,
    updatedAt: '2026-05-01T12:00:00.001Z',
  };

  it('opens a draft by keyboard-accessible action with current values/name/reason and resubmits the same ID', async () => {
    listRequestsMock.mockResolvedValue([draft]);
    getRequestMock.mockResolvedValue(draft);
    renderWithProviders(<RequestsPage />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Entwurf · Antrag bearbeiten',
      }),
    );
    expect(
      await screen.findByText('Rückgabegrund: Bitte kürzen'),
    ).toBeDefined();
    expect(screen.getByText('Mitarbeiter/in: Anna Example')).toBeDefined();
    expect((screen.getByLabelText('Von') as HTMLInputElement).value).toBe(
      '2026-05-04',
    );
    expect((screen.getByLabelText('Bis') as HTMLInputElement).value).toBe(
      '2026-05-08',
    );
    expect(
      (
        (await screen.findByLabelText(
          'Vertretung (optional)',
        )) as HTMLSelectElement
      ).value,
    ).toBe('substitute');
    expect(
      (screen.getByLabelText('Erster Tag halb') as HTMLInputElement).checked,
    ).toBe(true);
    fireEvent.change(screen.getByLabelText('Bis'), {
      target: { value: '2026-05-07' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Erneut einreichen' }));
    await waitFor(() =>
      expect(resubmitRequestMock).toHaveBeenCalledWith(
        'same-request',
        expect.objectContaining({
          expectedUpdatedAt: draft.updatedAt,
          reason: 'Original reason',
          to: '2026-05-07T00:00:00.000Z',
          substituteId: 'substitute',
          halfDayStart: true,
        }),
      ),
    );
    expect(createVacationRequestMock).not.toHaveBeenCalled();
  });

  it('keeps stale/failed edits visible and never creates a replacement request', async () => {
    listRequestsMock.mockResolvedValue([draft]);
    getRequestMock.mockResolvedValue(draft);
    resubmitRequestMock.mockRejectedValue(
      new Error('Request changed; reload before continuing'),
    );
    renderWithProviders(<RequestsPage />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Entwurf · Antrag bearbeiten',
      }),
    );
    await screen.findByText('Rückgabegrund: Bitte kürzen');
    fireEvent.click(screen.getByRole('button', { name: 'Erneut einreichen' }));
    expect(
      await screen.findByText('Request changed; reload before continuing'),
    ).toBeDefined();
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(createVacationRequestMock).not.toHaveBeenCalled();
  });

  it('can save a draft without submission and reads legacy decline reasons from the retained history', async () => {
    listRequestsMock.mockResolvedValue([draft]);
    getRequestMock.mockResolvedValue({ ...draft, decisionNote: null });
    getRequestEventsMock.mockResolvedValue([
      { kind: 'SubstituteDeclined', note: 'Bin selbst weg' },
    ]);
    renderWithProviders(<RequestsPage />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Entwurf · Antrag bearbeiten',
      }),
    );
    expect(
      await screen.findByText('Rückgabegrund: Bin selbst weg'),
    ).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Entwurf speichern' }));
    await waitFor(() =>
      expect(updateDraftRequestMock).toHaveBeenCalledWith(
        'same-request',
        expect.objectContaining({ expectedUpdatedAt: draft.updatedAt }),
      ),
    );
    expect(resubmitRequestMock).not.toHaveBeenCalled();
  });

  it('does not offer editing for pending requests', async () => {
    listRequestsMock.mockResolvedValue([
      { ...draft, workflowState: 'PendingManager' },
    ]);
    renderWithProviders(<RequestsPage />);
    await screen.findByText(/Anna Example · Urlaub/);
    expect(
      screen.queryByRole('button', { name: /Antrag bearbeiten/ }),
    ).toBeNull();
  });
  async function openTimeDraft(from: string, to: string) {
    const correction = { ...draft, type: 'TimeAdjustment', from, to };
    listRequestsMock.mockResolvedValue([correction]);
    getRequestMock.mockResolvedValue(correction);
    renderWithProviders(<RequestsPage />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Entwurf · Antrag bearbeiten',
      }),
    );
    await screen.findByLabelText('Von');
    return correction;
  }

  it.each([
    ['summer seconds', '2026-06-15T06:10:23.456Z', '2026-06-15T07:20:45.789Z'],
    [
      'first autumn occurrence',
      '2026-10-25T00:10:23.456Z',
      '2026-10-25T00:30:45.789Z',
    ],
    [
      'second autumn occurrence',
      '2026-10-25T01:10:23.456Z',
      '2026-10-25T01:30:45.789Z',
    ],
    [
      'fold crossing with locally earlier end',
      '2026-10-25T00:50:23.456Z',
      '2026-10-25T01:10:45.789Z',
    ],
  ])(
    'preserves exact instants on reason-only save and resubmit: %s',
    async (_name, from, to) => {
      const correction = await openTimeDraft(from, to);
      fireEvent.change(screen.getByLabelText('Begründung (optional)'), {
        target: { value: 'Reason only' },
      });
      const saved = {
        ...correction,
        reason: 'Reason only',
        updatedAt: '2026-05-01T12:00:00.002Z',
      };
      updateDraftRequestMock.mockResolvedValue(saved);
      getRequestMock.mockResolvedValue(saved);
      const save = screen.getByRole('button', { name: 'Entwurf speichern' });
      expect((save as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(save);
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(updateDraftRequestMock).toHaveBeenCalledWith(
        'same-request',
        expect.objectContaining({ from, to, reason: 'Reason only' }),
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'Entwurf · Antrag bearbeiten' }),
      );
      await screen.findByLabelText('Von');
      const submit = screen.getByRole('button', { name: 'Erneut einreichen' });
      expect((submit as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(submit);
      await waitFor(() =>
        expect(resubmitRequestMock).toHaveBeenCalledWith(
          'same-request',
          expect.objectContaining({
            from,
            to,
            reason: 'Reason only',
            expectedUpdatedAt: saved.updatedAt,
          }),
        ),
      );
    },
  );

  it('shows seconds and the saved occurrence, and changing one field preserves the other', async () => {
    await openTimeDraft('2026-10-25T01:10:23.456Z', '2026-10-25T02:30:45.789Z');
    expect((screen.getByLabelText('Von') as HTMLInputElement).value).toBe(
      '2026-10-25T02:10:23.456',
    );
    expect(
      (screen.getByLabelText('Von – Vorkommen') as HTMLSelectElement).value,
    ).toBe('2026-10-25T01:10:23.456Z');
    fireEvent.change(screen.getByLabelText('Bis'), {
      target: { value: '2026-10-25T03:45' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Erneut einreichen' }));
    await waitFor(() =>
      expect(resubmitRequestMock).toHaveBeenCalledWith(
        'same-request',
        expect.objectContaining({
          from: '2026-10-25T01:10:23.456Z',
          to: '2026-10-25T02:45:00.000Z',
        }),
      ),
    );
  });

  it.each([
    ['2026-10-25T00:30:00.000Z', '1. Vorkommen (UTC+02:00)'],
    ['2026-10-25T01:30:00.000Z', '2. Vorkommen (UTC+01:00)'],
  ])(
    'requires an explicit occurrence for a changed ambiguous time: %s',
    async (from, label) => {
      await openTimeDraft(
        '2026-10-25T00:10:23.456Z',
        '2026-10-25T02:30:45.789Z',
      );
      fireEvent.change(screen.getByLabelText('Von'), {
        target: { value: '2026-10-25T02:30' },
      });
      const select = screen.getByLabelText('Von – Vorkommen');
      expect((select as HTMLSelectElement).value).toBe('');
      expect(
        screen.getByText(
          /Diese Ortszeit kommt bei der Zeitumstellung in Europe\/Berlin/,
        ),
      ).toBeDefined();
      for (const name of ['Entwurf speichern', 'Erneut einreichen']) {
        const button = screen.getByRole('button', { name });
        expect((button as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(button);
      }
      expect(updateDraftRequestMock).not.toHaveBeenCalled();
      expect(resubmitRequestMock).not.toHaveBeenCalled();
      expect(within(select).getByRole('option', { name: label })).toBeDefined();
      fireEvent.change(select, { target: { value: from } });
      fireEvent.click(
        screen.getByRole('button', { name: 'Erneut einreichen' }),
      );
      await waitFor(() =>
        expect(resubmitRequestMock).toHaveBeenCalledWith(
          'same-request',
          expect.objectContaining({ from, to: '2026-10-25T02:30:45.789Z' }),
        ),
      );
    },
  );

  it('validates the chosen instants, allows a fold crossing and resets a stale occurrence after another edit', async () => {
    await openTimeDraft('2026-10-25T00:30:00.000Z', '2026-10-25T01:40:00.000Z');
    fireEvent.change(screen.getByLabelText('Von'), {
      target: { value: '2026-10-25T02:50' },
    });
    fireEvent.change(screen.getByLabelText('Von – Vorkommen'), {
      target: { value: '2026-10-25T01:50:00.000Z' },
    });
    const submit = screen.getByRole('button', { name: 'Erneut einreichen' });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    // End 02:40 CET is after start 02:50 CEST, although the wall clock is earlier.
    fireEvent.change(screen.getByLabelText('Von – Vorkommen'), {
      target: { value: '2026-10-25T00:50:00.000Z' },
    });
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    fireEvent.change(screen.getByLabelText('Von'), {
      target: { value: '2026-10-25T02:55' },
    });
    expect(
      (screen.getByLabelText('Von – Vorkommen') as HTMLSelectElement).value,
    ).toBe('');
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Von – Vorkommen'), {
      target: { value: '2026-10-25T00:55:00.000Z' },
    });
    fireEvent.click(submit);
    await waitFor(() =>
      expect(resubmitRequestMock).toHaveBeenCalledWith(
        'same-request',
        expect.objectContaining({
          from: '2026-10-25T00:55:00.000Z',
          to: '2026-10-25T01:40:00.000Z',
        }),
      ),
    );
  });

  it('rejects nonexistent spring-forward and empty times without a request', async () => {
    await openTimeDraft('2026-03-29T00:10:23.456Z', '2026-03-29T02:30:45.789Z');
    for (const value of ['2026-03-29T02:30', '']) {
      fireEvent.change(screen.getByLabelText('Bis'), { target: { value } });
      expect(
        screen.getByText(/Bitte eine gültige Ortszeit eingeben/),
      ).toBeDefined();
      const save = screen.getByRole('button', { name: 'Entwurf speichern' });
      const submit = screen.getByRole('button', { name: 'Erneut einreichen' });
      expect((save as HTMLButtonElement).disabled).toBe(true);
      expect((submit as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(save);
      fireEvent.click(submit);
    }
    expect(updateDraftRequestMock).not.toHaveBeenCalled();
    expect(resubmitRequestMock).not.toHaveBeenCalled();
  });
  it('offers an accessible English occurrence choice for a changed end time and saves the chosen instant', async () => {
    const languageSpy = vi
      .spyOn(navigator, 'languages', 'get')
      .mockReturnValue(['en-GB']);
    try {
      const correction = {
        ...draft,
        type: 'TimeAdjustment',
        from: '2026-10-25T00:50:23.456Z',
        to: '2026-10-25T02:30:45.789Z',
      };
      listRequestsMock.mockResolvedValue([correction]);
      getRequestMock.mockResolvedValue(correction);
      renderWithProviders(<RequestsPage />);
      fireEvent.click(
        await screen.findByRole('button', { name: 'Draft · Edit request' }),
      );
      fireEvent.change(await screen.findByLabelText('To'), {
        target: { value: '2026-10-25T02:10' },
      });
      expect(screen.getAllByText(/This local time occurs twice/)).toHaveLength(
        2,
      );
      const select = screen.getByRole('combobox', { name: 'To – occurrence' });
      expect(
        within(select).getByRole('option', { name: 'Choose occurrence' }),
      ).toBeDefined();
      expect(
        within(select).getByRole('option', {
          name: 'Occurrence 1 (UTC+02:00)',
        }),
      ).toBeDefined();
      expect(
        within(select).getByRole('option', {
          name: 'Occurrence 2 (UTC+01:00)',
        }),
      ).toBeDefined();
      const save = screen.getByRole('button', { name: 'Save draft' });
      expect((save as HTMLButtonElement).disabled).toBe(true);
      fireEvent.change(select, {
        target: { value: '2026-10-25T01:10:00.000Z' },
      });
      expect((save as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(save);
      await waitFor(() =>
        expect(updateDraftRequestMock).toHaveBeenCalledWith(
          'same-request',
          expect.objectContaining({
            from: correction.from,
            to: '2026-10-25T01:10:00.000Z',
          }),
        ),
      );
    } finally {
      languageSpy.mockRestore();
    }
  });
  const target = {
    id: 'entry-to-correct',
    employeeId: 'requester',
    revision: 7,
    clockIn: '2026-10-25T00:50:23.456Z',
    clockOut: '2026-10-25T01:10:45.789Z',
    status: 'Approved',
    approvalMode: 'Team',
  };

  async function openNewCorrection() {
    renderWithProviders(<RequestsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Neuer Antrag' }));
    fireEvent.change(screen.getByLabelText('Typ'), {
      target: { value: 'TimeAdjustment' },
    });
    fireEvent.change(screen.getByLabelText('Art der Zeitkorrektur'), {
      target: { value: 'correction' },
    });
    return screen.findByLabelText('Zu korrigierende Buchung');
  }

  it('requires a selected target, prefills exact fold-crossing instants, shows the gross diff, and sends only target ID/revision plus proposed times', async () => {
    targetsMock.mockResolvedValue([target]);
    const select = await openNewCorrection();
    await within(select).findByRole('option', { name: /entry-to-correct/ });
    // A valid proposal alone must not allow an untargeted correction.
    fireEvent.change(screen.getByLabelText('Von'), {
      target: { value: '2026-06-15T08:00:00.000' },
    });
    fireEvent.change(screen.getByLabelText('Bis'), {
      target: { value: '2026-06-15T09:00:00.000' },
    });
    expect(
      (
        screen.getByRole('button', {
          name: 'Antrag stellen',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.change(select, { target: { value: target.id } });
    expect((screen.getByLabelText('Von') as HTMLInputElement).value).toBe(
      '2026-10-25T02:50:23.456',
    );
    expect(
      (screen.getByLabelText('Von – Vorkommen') as HTMLSelectElement).value,
    ).toBe(target.clockIn);
    expect(
      (screen.getByLabelText('Bis – Vorkommen') as HTMLSelectElement).value,
    ).toBe(target.clockOut);
    fireEvent.change(screen.getByLabelText('Bis'), {
      target: { value: '2026-10-25T03:10:45.789' },
    });
    expect(
      screen.getByText('Bruttodauer: 1.222,333 s → 4.822,333 s (Δ 3.600 s)'),
    ).toBeDefined();
    expect(
      screen.getByText(/Es entsteht keine doppelte Buchung/),
    ).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Antrag stellen' }));
    await waitFor(() =>
      expect(createRequestMock).toHaveBeenCalledWith({
        employeeId: 'requester',
        type: 'TimeAdjustment',
        from: target.clockIn,
        to: '2026-10-25T02:10:45.789Z',
        reason: null,
        targetTimeEntryId: target.id,
        expectedTargetRevision: 7,
      }),
    );
    expect(targetsMock).toHaveBeenCalledWith();
  });

  it('resets both values and occurrence choices when selecting another target', async () => {
    const later = {
      ...target,
      id: 'later',
      revision: 9,
      clockIn: '2026-10-25T01:20:11.123Z',
      clockOut: '2026-10-25T02:40:55.987Z',
    };
    targetsMock.mockResolvedValue([target, later]);
    const select = await openNewCorrection();
    await within(select).findByRole('option', { name: /entry-to-correct/ });
    fireEvent.change(select, { target: { value: target.id } });
    fireEvent.change(select, { target: { value: later.id } });
    expect(
      (screen.getByLabelText('Von – Vorkommen') as HTMLSelectElement).value,
    ).toBe(later.clockIn);
    expect((screen.getByLabelText('Bis') as HTMLInputElement).value).toBe(
      '2026-10-25T03:40:55.987',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Antrag stellen' }));
    await waitFor(() =>
      expect(createRequestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          from: later.clockIn,
          to: later.clockOut,
          targetTimeEntryId: later.id,
          expectedTargetRevision: 9,
        }),
      ),
    );
  });

  it('leaves missing-booking creation independent from target eligibility and omits target fields', async () => {
    renderWithProviders(<RequestsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Neuer Antrag' }));
    fireEvent.change(screen.getByLabelText('Typ'), {
      target: { value: 'TimeAdjustment' },
    });
    expect(
      (screen.getByLabelText('Art der Zeitkorrektur') as HTMLSelectElement)
        .value,
    ).toBe('missing');
    fireEvent.change(screen.getByLabelText('Von'), {
      target: { value: '2026-06-15T08:10:23.456' },
    });
    fireEvent.change(screen.getByLabelText('Bis'), {
      target: { value: '2026-06-15T09:20:45.789' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Antrag stellen' }));
    await waitFor(() =>
      expect(createRequestMock).toHaveBeenCalledWith({
        employeeId: 'requester',
        type: 'TimeAdjustment',
        from: '2026-06-15T06:10:23.456Z',
        to: '2026-06-15T07:20:45.789Z',
        reason: null,
      }),
    );
    expect(targetsMock).not.toHaveBeenCalled();
  });

  it('shows target loading and does not permit correction submission while eligibility is unknown', async () => {
    targetsMock.mockReturnValue(new Promise(() => undefined));
    await openNewCorrection();
    expect(screen.getByRole('status').textContent).toBe('Lädt …');
    expect(
      (screen.getByLabelText('Zu korrigierende Buchung') as HTMLSelectElement)
        .disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole('button', {
          name: 'Antrag stellen',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it.each(['empty', 'error'] as const)(
    'shows actionable target loading outcomes and prevents untargeted correction: %s',
    async (outcome) => {
      if (outcome === 'error')
        targetsMock.mockRejectedValue(new Error('Unavailable'));
      await openNewCorrection();
      await screen.findByText(
        outcome === 'empty'
          ? 'Keine abgeschlossenen Team-Buchungen für eine Korrektur verfügbar.'
          : 'Buchungen konnten nicht geladen werden.',
      );
      if (outcome === 'error')
        expect(
          screen.getByRole('button', { name: 'Erneut laden' }),
        ).toBeDefined();
      expect(
        (
          screen.getByRole('button', {
            name: 'Antrag stellen',
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
      expect(createRequestMock).not.toHaveBeenCalled();
    },
  );

  it('retains immutable draft target/revision and before snapshot even with newer cached target data, and offers cancellation after a stale rejection', async () => {
    const correction = {
      ...draft,
      type: 'TimeAdjustment',
      from: target.clockIn,
      to: target.clockOut,
      targetTimeEntryId: target.id,
      expectedTargetRevision: target.revision,
      targetTimeEntryBefore: target,
    };
    listRequestsMock.mockResolvedValue([correction]);
    getRequestMock.mockResolvedValue(correction);
    resubmitRequestMock.mockRejectedValue(
      new Error('Target time entry has changed'),
    );
    const { queryClient } = renderWithProviders(<RequestsPage />);
    queryClient.setQueryData(
      ['time-adjustment-targets'],
      [{ ...target, revision: 8, clockIn: '2026-10-25T01:00:00.000Z' }],
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Entwurf · Antrag bearbeiten',
      }),
    );
    await screen.findByLabelText('Art der Zeitkorrektur');
    expect(
      (screen.getByLabelText('Art der Zeitkorrektur') as HTMLSelectElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByLabelText('Zu korrigierende Buchung') as HTMLSelectElement)
        .disabled,
    ).toBe(true);
    fireEvent.change(screen.getByLabelText('Begründung (optional)'), {
      target: { value: 'Reason only' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Erneut einreichen' }));
    await screen.findByText('Target time entry has changed');
    expect(resubmitRequestMock).toHaveBeenCalledWith(
      draft.id,
      expect.objectContaining({
        from: target.clockIn,
        to: target.clockOut,
        reason: 'Reason only',
        targetTimeEntryId: target.id,
        expectedTargetRevision: 7,
      }),
    );
    expect(
      within(screen.getByRole('dialog')).getByText(
        /Ziel und Revision dieses Entwurfs bleiben unverändert/,
      ),
    ).toBeDefined();
    expect(targetsMock).not.toHaveBeenCalled();
    expect(createRequestMock).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Diesen Antrag stornieren' }),
    );
    await waitFor(() =>
      expect(cancelRequestMock).toHaveBeenCalledWith(draft.id, 'requester'),
    );
  });

  it('saves the persisted targeted draft revision with the unchanged exact proposal', async () => {
    const correction = {
      ...draft,
      type: 'TimeAdjustment',
      from: target.clockIn,
      to: target.clockOut,
      targetTimeEntryId: target.id,
      expectedTargetRevision: 7,
      targetTimeEntryBefore: target,
    };
    listRequestsMock.mockResolvedValue([correction]);
    getRequestMock.mockResolvedValue(correction);
    renderWithProviders(<RequestsPage />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Entwurf · Antrag bearbeiten',
      }),
    );
    await screen.findByLabelText('Von');
    fireEvent.click(screen.getByRole('button', { name: 'Entwurf speichern' }));
    await waitFor(() =>
      expect(updateDraftRequestMock).toHaveBeenCalledWith(
        draft.id,
        expect.objectContaining({
          from: target.clockIn,
          to: target.clockOut,
          targetTimeEntryId: target.id,
          expectedTargetRevision: 7,
        }),
      ),
    );
  });

  it('shows employee before/proposed and request-scoped applied audit after final approval', async () => {
    listRequestsMock.mockResolvedValue([
      {
        ...draft,
        type: 'TimeAdjustment',
        workflowState: 'Approved',
        from: target.clockIn,
        to: '2026-10-25T02:10:45.789Z',
        targetTimeEntryId: target.id,
        expectedTargetRevision: 7,
        targetTimeEntryBefore: target,
      },
    ]);
    requestAuditMock.mockResolvedValue([
      {
        id: 'audit',
        requestId: draft.id,
        timeEntryId: target.id,
        action: 'FrameRequestCorrected',
        before: target,
        after: { ...target, clockOut: '2026-10-25T02:10:45.789Z' },
        occurredAt: '2026-10-26T12:00:00.000Z',
        reason: 'Corrected',
      },
    ]);
    renderWithProviders(<RequestsPage />);
    expect(
      await screen.findByText(
        'Bruttodauer: 1.222,333 s → 4.822,333 s (Δ 3.600 s)',
      ),
    ).toBeDefined();
    fireEvent.click(
      screen.getByRole('button', { name: 'Buchungsänderung im Verlauf' }),
    );
    expect(
      await screen.findByText(
        'Buchung entry-to-correct durch Antrag same-request korrigiert',
      ),
    ).toBeDefined();
    expect(requestAuditMock).toHaveBeenCalledWith(draft.id);
  });

  it('translates correction selection and exact before/proposed diff into English', async () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-GB']);
    targetsMock.mockResolvedValue([target]);
    renderWithProviders(<RequestsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'New request' }));
    fireEvent.change(screen.getByLabelText('Type'), {
      target: { value: 'TimeAdjustment' },
    });
    fireEvent.change(screen.getByLabelText('Time adjustment mode'), {
      target: { value: 'correction' },
    });
    const select = await screen.findByLabelText('Booking to correct');
    await within(select).findByRole('option', { name: /entry-to-correct/ });
    fireEvent.change(select, { target: { value: target.id } });
    expect(screen.getByText('Before:')).toBeDefined();
    expect(screen.getByText('Proposed:')).toBeDefined();
    expect(
      screen.getByText('Gross duration: 1,222.333 s → 1,222.333 s (Δ 0 s)'),
    ).toBeDefined();
  });
});
