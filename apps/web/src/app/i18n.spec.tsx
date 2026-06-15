import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider, useI18n } from './i18n';

function Probe() {
  const { locale, setLocale, enumLabel } = useI18n();
  return (
    <div>
      <span>{locale}</span>
      <span>{enumLabel('Approved')}</span>
      <span>{enumLabel('Pending')}</span>
      <span>{enumLabel('PendingManager')}</span>
      <span>{enumLabel('TimeApproval')}</span>
      <button onClick={() => setLocale('en')}>English</button>
    </div>
  );
}

describe('I18nProvider', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'English' }));

    expect(screen.getByText('Approved')).toBeDefined();
    expect(screen.getByText('Pending')).toBeDefined();
    expect(screen.getByText('Pending manager')).toBeDefined();
    expect(screen.getByText('Time approval')).toBeDefined();
    await waitFor(() => expect(document.documentElement.lang).toBe('en'));
  });
});
