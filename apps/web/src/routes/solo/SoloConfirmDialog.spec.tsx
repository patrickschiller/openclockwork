import { useState } from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';
import { ApiError } from '../../api/client';
import { renderWithProviders } from '../../test-utils';
import { SoloConfirmDialog } from './SoloUi';

function Harness({ operation }: { operation: () => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open confirmation</button>
      {open && (
        <SoloConfirmDialog
          title="Confirm this change"
          target="Example target"
          description="Review the selected record."
          onConfirm={operation}
          close={() => setOpen(false)}
        />
      )}
    </>
  );
}

beforeEach(() => {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value: true,
  });
});

describe('Solo destructive confirmation', () => {
  it('focuses cancel and sends no mutation when opening or cancelling', async () => {
    const operation = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<Harness operation={operation} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open confirmation' }));
    const dialog = screen.getByRole('dialog', { name: 'Confirm this change' });
    expect(within(dialog).getByText('Example target')).toBeDefined();
    const cancel = within(dialog).getByRole('button', { name: 'Abbrechen' });
    expect(document.activeElement).toBe(cancel);
    expect(operation).not.toHaveBeenCalled();
    fireEvent.click(cancel);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(operation).not.toHaveBeenCalled();
  });

  it('runs only on confirmation and prevents dismissal or repeated writes while pending', async () => {
    let finish: () => void = () => undefined;
    const response = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const operation = vi.fn(() => response);
    renderWithProviders(<Harness operation={operation} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open confirmation' }));
    const dialog = screen.getByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Bestätigen' });
    fireEvent.click(confirm);
    expect(operation).toHaveBeenCalledOnce();
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    const cancel = within(dialog).getByRole('button', { name: 'Abbrechen' });
    expect((cancel as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(confirm);
    fireEvent.click(cancel);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(operation).toHaveBeenCalledOnce();
    finish();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('keeps a failed confirmation and its translated error open for review or retry', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiError(409, 'Personal day changed; reload before cancelling'),
      )
      .mockResolvedValueOnce(undefined);
    renderWithProviders(<Harness operation={operation} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open confirmation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(
      await dialog.findByText(/Der Datensatz wurde inzwischen geändert/),
    ).toBeDefined();
    expect(dialog.getByText('Example target')).toBeDefined();
    expect(
      (dialog.getByRole('button', { name: 'Abbrechen' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    fireEvent.click(dialog.getByRole('button', { name: 'Bestätigen' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('allows escape before confirmation without writing', async () => {
    const operation = vi.fn();
    renderWithProviders(<Harness operation={operation} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open confirmation' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(operation).not.toHaveBeenCalled();
  });
});
