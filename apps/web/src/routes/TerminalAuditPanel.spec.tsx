import { fireEvent, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { api } from '../api/client';
import { renderWithProviders } from '../test-utils';
import { TerminalAuditPanel } from './TerminalAuditPanel';

afterEach(() => vi.restoreAllMocks());

it('loads only on request and resets cursor pagination when changing the method filter', async () => {
  const load = vi
    .spyOn(api, 'terminalAuditEvents')
    .mockResolvedValueOnce({ items: [], nextCursor: '12' })
    .mockResolvedValue({ items: [], nextCursor: null });
  renderWithProviders(<TerminalAuditPanel />);
  expect(load).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Protokoll laden' }));
  await screen.findByText('Keine passenden Ereignisse.');
  fireEvent.click(screen.getByRole('button', { name: 'Nächste Seite' }));
  await waitFor(() =>
    expect(load).toHaveBeenLastCalledWith(
      { method: undefined, cursor: '12' },
      expect.any(AbortSignal),
    ),
  );
  fireEvent.change(screen.getByLabelText('Methode'), {
    target: { value: 'PIN' },
  });
  await waitFor(() =>
    expect(load).toHaveBeenLastCalledWith(
      { method: 'PIN', cursor: undefined },
      expect.any(AbortSignal),
    ),
  );
});
