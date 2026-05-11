import { describe, expect, it } from 'vitest';
import { requiresSpecialApproval } from './request-rules.js';

function at(h: number, m = 0): Date {
  const d = new Date('2026-05-04T00:00:00');
  d.setHours(h, m, 0, 0);
  return d;
}

describe('requiresSpecialApproval', () => {
  it('false for normal hours', () => {
    expect(requiresSpecialApproval(at(8), at(17))).toBe(false);
  });
  it('true when start is before 07:00', () => {
    expect(requiresSpecialApproval(at(6, 30), at(15))).toBe(true);
  });
  it('true when end is at/after 23:00', () => {
    expect(requiresSpecialApproval(at(20), at(23))).toBe(true);
  });
  it('true when crossing midnight', () => {
    const start = new Date('2026-05-04T22:00:00');
    const end = new Date('2026-05-05T01:00:00');
    expect(requiresSpecialApproval(start, end)).toBe(true);
  });
});
