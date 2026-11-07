import { fireEvent, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test-utils';
import { catalogs, useI18n } from './i18n';
import { cockpitDe, cockpitEn } from './cockpit-i18n';
import { cockpitHistoryDe, cockpitHistoryEn } from './cockpit-history-i18n';
import { cockpitProxyDe, cockpitProxyEn } from './cockpit-proxy-i18n';
function Labels() {
  const { t, setLocale } = useI18n();
  return (
    <>
      <h1>{t('cockpit.title')}</h1>
      <p>{t('cockpit.status.PartialAbsenceUnknown')}</p>
      <p>{t('cockpit.status.UnknownContract')}</p>
      <p>{t('cockpitHistory.pendingHint')}</p>
      <p>{t('cockpitProxy.absenceHelp')}</p>
      <button onClick={() => setLocale('en')}>English</button>
    </>
  );
}
afterEach(() => vi.restoreAllMocks());
it('has all cockpit status, calendar, proxy and validation labels in both catalogues', () => {
  for (const [de, en] of [
    [cockpitDe, cockpitEn],
    [cockpitHistoryDe, cockpitHistoryEn],
    [cockpitProxyDe, cockpitProxyEn],
  ]) {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(de)) {
      expect(catalogs.de[key]).toBeTruthy();
      expect(catalogs.en[key]).toBeTruthy();
    }
  }
});
it('switches all safety-relevant domain explanations between German and English', () => {
  vi.spyOn(window, 'localStorage', 'get').mockReturnValue({
    getItem: () => 'de',
    setItem: vi.fn(),
  } as unknown as Storage);
  renderWithProviders(<Labels />);
  expect(screen.getByRole('heading').textContent).toBe('Team-Cockpit');
  expect(
    screen.getByText(cockpitDe['cockpit.status.PartialAbsenceUnknown']),
  ).toBeTruthy();
  expect(
    screen.getByText(cockpitProxyDe['cockpitProxy.absenceHelp']),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'English' }));
  expect(screen.getByRole('heading').textContent).toBe('Team cockpit');
  expect(
    screen.getByText(cockpitEn['cockpit.status.UnknownContract']),
  ).toBeTruthy();
  expect(
    screen.getByText(cockpitHistoryEn['cockpitHistory.pendingHint']),
  ).toBeTruthy();
  expect(
    screen.getByText(cockpitProxyEn['cockpitProxy.absenceHelp']),
  ).toBeTruthy();
});
