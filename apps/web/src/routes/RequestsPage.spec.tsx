import { beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('vacation substitute selection', () => {
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
});
