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
});
