import { render, screen } from '@testing-library/react';
import { I18nProvider } from './i18n';
import { LanguageToggle } from './LanguageToggle';

describe('LanguageToggle', () => {
  it('uses the theme foreground color instead of inheriting its surroundings', () => {
    render(
      <I18nProvider>
        <div className="bg-slate-950 text-white">
          <LanguageToggle />
        </div>
      </I18nProvider>,
    );

    const trigger = screen.getByRole('button', { name: 'Sprache ändern' });

    expect(trigger.classList.contains('bg-background')).toBe(true);
    expect(trigger.classList.contains('text-foreground')).toBe(true);
  });
});
