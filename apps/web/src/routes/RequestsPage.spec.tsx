import {
  afterAll,
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

vi.mock('../api/client', () => ({
  api: {
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
  beforeEach(() => {
    listRequestsMock.mockReset().mockResolvedValue([]);
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
});
