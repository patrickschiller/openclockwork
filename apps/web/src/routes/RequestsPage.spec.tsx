import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import { RequestsPage } from './RequestsPage';

const employeeDirectoryMock = vi.fn();
const employeesMock = vi.fn();
const createVacationRequestMock = vi.fn();

vi.mock('../api/client', () => ({
  api: {
    listRequests: vi.fn().mockResolvedValue([]),
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
});
