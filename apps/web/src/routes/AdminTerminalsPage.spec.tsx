import { fireEvent, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { renderWithProviders } from '../test-utils';
import { AdminTerminalsPage } from './AdminTerminalsPage';

const terminalsMock = vi.fn();
const createTerminalMock = vi.fn();
const terminalSupportPromptMock = vi.fn();
const dismissTerminalSupportPromptMock = vi.fn();
const revokeTerminalDeviceMock = vi.fn();
const deleteTerminalPermanentlyMock = vi.fn();

vi.mock('../api/client', () => ({
  api: {
    terminals: (...args: unknown[]) => terminalsMock(...args),
    createTerminal: (...args: unknown[]) => createTerminalMock(...args),
    updateTerminal: vi.fn(),
    deactivateTerminal: vi.fn(),
    deleteTerminalPermanently: (...args: unknown[]) =>
      deleteTerminalPermanentlyMock(...args),
    createTerminalPairing: vi.fn(),
    revokeTerminalDevice: (...args: unknown[]) =>
      revokeTerminalDeviceMock(...args),
    terminalSupportPrompt: (...args: unknown[]) =>
      terminalSupportPromptMock(...args),
    dismissTerminalSupportPrompt: (...args: unknown[]) =>
      dismissTerminalSupportPromptMock(...args),
  },
}));

vi.mock('../app/auth', () => ({
  useCurrentUser: () => ({
    id: 'hr-1',
    email: 'hr@example.test',
    firstName: 'Hannah',
    lastName: 'Roth',
    role: 'HRAdmin',
    themePreference: 'System',
  }),
}));

describe('AdminTerminalsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    terminalsMock.mockResolvedValue([]);
    createTerminalMock.mockResolvedValue({ id: 'terminal-1' });
    terminalSupportPromptMock.mockResolvedValue({ shownAt: null });
    dismissTerminalSupportPromptMock.mockResolvedValue(undefined);
    revokeTerminalDeviceMock.mockResolvedValue(undefined);
    deleteTerminalPermanentlyMock.mockResolvedValue(undefined);
  });

  it('activates a terminal before offering entirely optional support', async () => {
    renderWithProviders(<AdminTerminalsPage />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Terminal einrichten' }),
    );
    fireEvent.change(screen.getByLabelText('Interner Name'), {
      target: { value: 'Empfang' },
    });
    fireEvent.change(screen.getByLabelText('Angezeigter Ort'), {
      target: { value: 'Würzburg' },
    });
    fireEvent.change(screen.getByLabelText('Anzeigetext'), {
      target: { value: 'Willkommen' },
    });
    fireEvent.click(screen.getByLabelText('GPS-Standort beim Scannen prüfen'));
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(createTerminalMock).toHaveBeenCalledTimes(1));
    expect(createTerminalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        enforceGeofence: false,
        latitude: null,
        longitude: null,
        radiusMeters: null,
        maxAccuracyMeters: null,
      }),
    );
    expect(
      await screen.findByRole('heading', {
        name: 'OpenClockwork unterstützen?',
      }),
    ).toBeDefined();
    expect(
      screen.getByRole('button', { name: 'Ohne Unterstützung fortfahren' }),
    ).toBeDefined();
    expect(dismissTerminalSupportPromptMock).toHaveBeenCalledTimes(1);
  });

  it('rejects oversized logos before they can be submitted', async () => {
    renderWithProviders(<AdminTerminalsPage />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Terminal einrichten' }),
    );

    const file = new File([new Uint8Array(60 * 1024 + 1)], 'logo.png', {
      type: 'image/png',
    });
    fireEvent.change(screen.getByLabelText(/Logo \(PNG/), {
      target: { files: [file] },
    });

    expect(
      await screen.findByText('Das Logo darf höchstens 60 KiB groß sein.'),
    ).toBeDefined();
  });

  it('offers time zones exclusively through a native select', async () => {
    renderWithProviders(<AdminTerminalsPage />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Terminal einrichten' }),
    );

    const timeZone = screen.getByRole('combobox', {
      name: 'IANA-Zeitzone',
    });
    expect(timeZone).toBeInstanceOf(HTMLSelectElement);
    expect(screen.queryByRole('textbox', { name: 'IANA-Zeitzone' })).toBeNull();
    expect(screen.getByRole('option', { name: 'Europe/Berlin' })).toBeDefined();
    expect(screen.getByRole('option', { name: 'UTC' })).toBeDefined();
  });

  it('permanently deletes a terminal only after explicit confirmation', async () => {
    terminalsMock.mockResolvedValue([
      {
        id: 'terminal-1',
        name: 'Empfang',
        displayText: 'Willkommen',
        locationLabel: 'Würzburg',
        logoUrl: null,
        timeZone: 'Europe/Berlin',
        enforceGeofence: false,
        latitude: null,
        longitude: null,
        radiusMeters: null,
        maxAccuracyMeters: null,
        isActive: false,
        isPaired: false,
        deviceCount: 0,
        activatedAt: null,
        lastSeenAt: null,
        devices: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderWithProviders(<AdminTerminalsPage />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Dauerhaft löschen' }),
    );

    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining('Terminal „Empfang“ dauerhaft löschen?'),
    );
    await waitFor(() =>
      expect(deleteTerminalPermanentlyMock).toHaveBeenCalledWith('terminal-1'),
    );
  });

  it('can immediately revoke a lost paired device', async () => {
    terminalsMock.mockResolvedValue([
      {
        id: 'terminal-1',
        name: 'Empfang',
        displayText: 'Willkommen',
        locationLabel: 'Würzburg',
        logoUrl: null,
        timeZone: 'Europe/Berlin',
        enforceGeofence: true,
        latitude: 49.7913,
        longitude: 9.9534,
        radiusMeters: 100,
        maxAccuracyMeters: 75,
        isActive: true,
        isPaired: true,
        deviceCount: 1,
        activatedAt: new Date().toISOString(),
        lastSeenAt: null,
        devices: [
          {
            id: 'device-1',
            name: 'iPad Empfang',
            createdAt: new Date().toISOString(),
            lastSeenAt: null,
            revokedAt: null,
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderWithProviders(<AdminTerminalsPage />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Gerät widerrufen' }),
    );

    await waitFor(() =>
      expect(revokeTerminalDeviceMock).toHaveBeenCalledWith(
        'terminal-1',
        'device-1',
      ),
    );
  });
});
