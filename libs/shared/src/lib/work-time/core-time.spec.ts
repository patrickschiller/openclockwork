import { describe, expect, it } from 'vitest';
import { detectViolations } from './core-time.js';

function at(h: number, m = 0): Date {
  const d = new Date('2026-05-04T00:00:00');
  d.setHours(h, m, 0, 0);
  return d;
}

describe('detectViolations', () => {
  it('no violations when fully within core time', () => {
    expect(detectViolations(at(8, 30), at(15, 30))).toEqual([]);
  });
  it('LateArrival when clock-in after 09:00', () => {
    const v = detectViolations(at(9, 30), at(17));
    expect(v).toEqual([{ kind: 'LateArrival', boundary: '09:00', deltaMinutes: 30 }]);
  });
  it('EarlyDeparture when clock-out before 15:00', () => {
    const v = detectViolations(at(8), at(14, 45));
    expect(v).toEqual([{ kind: 'EarlyDeparture', boundary: '15:00', deltaMinutes: 15 }]);
  });
  it('both when applicable', () => {
    const v = detectViolations(at(10), at(14));
    expect(v).toHaveLength(2);
  });
});
