import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, vi } from 'vitest';
import { I18nProvider, useI18n, catalogs } from './i18n';

function Probe() {
  const { locale, languageTag, setLocale, t, enumLabel, formatDate } =
    useI18n();
  return (
    <div>
      <span>{locale}</span>
      <span data-testid="language-tag">{languageTag}</span>
      <span data-testid="date">{formatDate('2026-06-12')}</span>
      <span>{enumLabel('Approved')}</span>
      <span>{enumLabel('Pending')}</span>
      <span>{enumLabel('PendingManager')}</span>
      <span>{enumLabel('TimeApproval')}</span>
      <span>{t('shell.adminVersion', { version: '9.8.7' })}</span>
      <button onClick={() => setLocale('en')}>English</button>
    </div>
  );
}

describe('I18nProvider', () => {
  let stored: string | null;
  beforeEach(() => {
    stored = null;
    vi.spyOn(window, 'localStorage', 'get').mockReturnValue({
      length: 0,
      clear: () => {
        stored = null;
      },
      key: () => null,
      removeItem: () => {
        stored = null;
      },
      getItem: () => stored,
      setItem: (_key: string, value: string) => {
        stored = value;
      },
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('provides every label in both language catalogs', () => {
    expect(Object.keys(catalogs.en).sort()).toEqual(
      Object.keys(catalogs.de).sort(),
    );
    expect(catalogs.en['employees.holidayCalendar']).toBe('Holiday calendar');
    expect(catalogs.en['schedules.breakRules']).toBe(
      'Automatic break deduction',
    );
  });

  it('uses English for unsupported browser languages', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['fr-CA', 'fr']);
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByText('Approved')).toBeDefined();
    expect(document.documentElement.lang).toBe('en');
  });

  it('keeps a saved language and the matching regional date conventions', () => {
    stored = 'en';
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['de-CH', 'en-GB']);
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByText('Approved')).toBeDefined();
    expect(screen.getByTestId('language-tag').textContent).toBe('en-GB');
    expect(screen.getByTestId('date').textContent).toBe('12/06/2026');
  });

  it('selects a supported browser language without assuming Germany', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['de-CH']);
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByText('Genehmigt')).toBeDefined();
    expect(screen.getByTestId('language-tag').textContent).toBe('de-CH');
  });

  it('works when browser storage is unavailable', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('Unavailable');
    });
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-NZ']);
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByText('Approved')).toBeDefined();
    expect(screen.getByTestId('language-tag').textContent).toBe('en-NZ');
  });

  it('translates workflow values and switches languages centrally', async () => {
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );

    expect(screen.getByText('Genehmigt')).toBeDefined();
    expect(screen.getByText('Ausstehend')).toBeDefined();
    expect(screen.getByText('Wartet auf Vorgesetzte:n')).toBeDefined();
    expect(screen.getByText('Zeitgenehmigung')).toBeDefined();
    expect(screen.getByText('OpenClockwork-Version 9.8.7')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'English' }));

    expect(screen.getByText('Approved')).toBeDefined();
    expect(screen.getByText('Pending')).toBeDefined();
    expect(screen.getByText('Pending manager')).toBeDefined();
    expect(screen.getByText('Time approval')).toBeDefined();
    expect(screen.getByText('OpenClockwork version 9.8.7')).toBeDefined();
    await waitFor(() => expect(document.documentElement.lang).toBe('en'));
  });
});
