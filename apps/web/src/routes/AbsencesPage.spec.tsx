import { fireEvent, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { renderWithProviders } from '../test-utils';
import { AbsencesPage, toLocalDateInputValue } from './AbsencesPage';

const { longNote } = vi.hoisted(() => ({
  longNote: `Außendienst-${'sehrlang'.repeat(30)}`,
}));

vi.mock('../api/client', () => ({
  api: {
    employees: vi.fn().mockResolvedValue([]),
    absences: vi.fn().mockResolvedValue([
      {
        id: 'absence-1',
        employeeId: 'employee-1',
        kind: 'Sickness',
        from: '2026-08-24',
        to: '2026-08-25',
        certified: false,
        note: longNote,
      },
    ]),
    createAbsence: vi.fn(),
    deleteAbsence: vi.fn(),
  },
}));

vi.mock('../app/auth', () => ({
  useCurrentUser: () => ({
    id: 'employee-1',
    email: 'employee@example.test',
    firstName: 'Erika',
    lastName: 'Musterfrau',
    role: 'Manager',
    themePreference: 'System',
  }),
}));

describe('AbsencesPage responsive layout', () => {
  it('derives date-input defaults from the local calendar date', () => {
    const date = new Date('2026-01-15T23:30:00.000Z');
    vi.spyOn(date, 'getFullYear').mockReturnValue(2026);
    vi.spyOn(date, 'getMonth').mockReturnValue(0);
    vi.spyOn(date, 'getDate').mockReturnValue(16);

    expect(toLocalDateInputValue(date)).toBe('2026-01-16');
  });

  it('wraps page controls and long absence content on narrow screens', async () => {
    const { container } = renderWithProviders(<AbsencesPage />);

    expect(container.firstElementChild?.className).toContain('min-w-0');
    const createButton = screen.getByRole('button', {
      name: 'Abwesenheit eintragen',
    });
    expect(createButton.parentElement?.className).toContain('flex-col');

    const note = await screen.findByText(longNote);
    expect(note.className).toContain('[overflow-wrap:anywhere]');
    expect(note.closest('li')?.className).toContain('flex-col');
    expect(
      screen.getByRole('combobox', {
        name: 'Abwesenheiten nach Mitarbeiter:in filtern',
      }),
    ).toBeDefined();
  });

  it('stacks date controls in the create dialog until the small breakpoint', () => {
    renderWithProviders(<AbsencesPage />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Abwesenheit eintragen' }),
    );

    const from = screen.getByLabelText('Von');
    const dateGrid = from.parentElement?.parentElement;
    expect(dateGrid?.className).toContain('sm:grid-cols-2');
    expect(dateGrid?.className.split(' ')).not.toContain('grid-cols-2');
  });
});
