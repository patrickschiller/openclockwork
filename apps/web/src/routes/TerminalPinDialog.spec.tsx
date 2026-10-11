import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { api, type EmployeeDto } from '../api/client';
import { renderWithProviders } from '../test-utils';
import { TerminalPinDialog } from './TerminalPinDialog';

const employee = {
  id: 'employee',
  firstName: 'Alex',
  lastName: 'Example',
  isActive: true,
} as EmployeeDto;
const status = {
  method: 'PIN' as const,
  isConfigured: true,
  enabled: true,
  lockedUntil: null,
  updatedAt: null,
};
beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(api, 'terminalCredentials').mockResolvedValue(status);
});
afterEach(() => vi.restoreAllMocks());

it('displays a generated PIN once without retaining it in React Query caches', async () => {
  vi.spyOn(api, 'resetTerminalPin').mockResolvedValue({
    pin: '00123456',
    credential: status,
  });
  const close = vi.fn();
  const rendered = renderWithProviders(
    <TerminalPinDialog employee={employee} onClose={close} />,
  );
  await screen.findByText('PIN aktiv');
  fireEvent.click(screen.getByRole('button', { name: 'Neuen PIN erzeugen' }));
  expect((await screen.findByLabelText('Neuer Terminal-PIN')).textContent).toBe(
    '00123456',
  );
  expect(rendered.queryClient.getMutationCache().getAll()).toHaveLength(0);
  expect(rendered.queryClient.getQueryCache().getAll()).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Schließen' }));
  expect(screen.queryByText('00123456')).toBeNull();
  expect(close).toHaveBeenCalledTimes(1);
});

it('does not redisplay a reset response that arrives after closing', async () => {
  let finish!: (value: { pin: string; credential: typeof status }) => void;
  vi.spyOn(api, 'resetTerminalPin').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const close = vi.fn();
  renderWithProviders(
    <TerminalPinDialog employee={employee} onClose={close} />,
  );
  await screen.findByText('PIN aktiv');
  fireEvent.click(screen.getByRole('button', { name: 'Neuen PIN erzeugen' }));
  await waitFor(() => expect(api.resetTerminalPin).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: 'Schließen' }));
  await act(async () => {
    finish({ pin: '00123456', credential: status });
  });
  expect(screen.queryByText('00123456')).toBeNull();
  expect(close).toHaveBeenCalledTimes(1);
});

it('reloads status after a lost reset response without automatically issuing another PIN', async () => {
  const reset = vi
    .spyOn(api, 'resetTerminalPin')
    .mockRejectedValue(new TypeError('connection lost'));
  renderWithProviders(
    <TerminalPinDialog employee={employee} onClose={vi.fn()} />,
  );
  await screen.findByText('PIN aktiv');
  fireEvent.click(screen.getByRole('button', { name: 'Neuen PIN erzeugen' }));
  await screen.findByText(
    /Der Terminal-Zugang konnte nicht aktualisiert werden/,
  );
  await waitFor(() => expect(api.terminalCredentials).toHaveBeenCalledTimes(2));
  expect(reset).toHaveBeenCalledTimes(1);
});
