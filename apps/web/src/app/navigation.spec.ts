import { visibleNavItems } from './navigation';

describe('role-aware navigation', () => {
  it('always exposes working-time reports to HR admins only', () => {
    expect(
      visibleNavItems('Manager').some(
        (item) => item.to === '/admin/working-times',
      ),
    ).toBe(false);
    expect(
      visibleNavItems('HRAdmin').some(
        (item) => item.to === '/admin/working-times',
      ),
    ).toBe(true);
  });

  it('exposes terminal setup to HR admins and scanning to every employee role', () => {
    for (const role of ['Employee', 'Manager', 'HRAdmin'] as const) {
      expect(
        visibleNavItems(role).some((item) => item.to === '/terminal'),
      ).toBe(true);
    }
    expect(
      visibleNavItems('Manager').some(
        (item) => item.to === '/admin/settings/terminals',
      ),
    ).toBe(false);
    expect(
      visibleNavItems('HRAdmin').some(
        (item) => item.to === '/admin/settings/terminals',
      ),
    ).toBe(true);
  });

  it('puts terminal scanning third in the mobile bar and moves the calendar to more', () => {
    const items = visibleNavItems('Employee');
    const mobileItems = items.filter((item) => item.showInBottomNav);

    expect(mobileItems.slice(0, 3).map((item) => item.to)).toEqual([
      '/',
      '/booking',
      '/terminal',
    ]);
    expect(items.find((item) => item.to === '/calendar')?.showInBottomNav).toBe(
      false,
    );
  });
});
