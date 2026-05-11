import { describe, expect, it } from 'vitest';
import { calculateWorkingDays, isWeekend } from './leave-calculator.js';
import { nrwHolidays, NrwHolidayProvider } from './holidays.js';

describe('isWeekend', () => {
  it('Saturday and Sunday', () => {
    expect(isWeekend(new Date('2026-05-02T00:00:00Z'))).toBe(true); // Sat
    expect(isWeekend(new Date('2026-05-03T00:00:00Z'))).toBe(true); // Sun
  });
  it('Weekday', () => {
    expect(isWeekend(new Date('2026-05-04T00:00:00Z'))).toBe(false); // Mon
  });
});

describe('calculateWorkingDays', () => {
  it('5 weekdays in a normal week', () => {
    const from = new Date(Date.UTC(2026, 4, 4)); // Mon
    const to = new Date(Date.UTC(2026, 4, 10)); // Sun
    expect(calculateWorkingDays(from, to)).toBe(5);
  });
  it('skips a holiday (Tag der Arbeit 2026-05-01 is a Friday)', () => {
    const from = new Date(Date.UTC(2026, 3, 27)); // Mon
    const to = new Date(Date.UTC(2026, 4, 1));    // Fri (holiday)
    expect(calculateWorkingDays(from, to)).toBe(4);
  });
  it('returns 0 when range is inverted', () => {
    expect(calculateWorkingDays(new Date('2026-06-01'), new Date('2026-05-01'))).toBe(0);
  });
  it('single weekday range counts 1', () => {
    const d = new Date(Date.UTC(2026, 4, 4));
    expect(calculateWorkingDays(d, d)).toBe(1);
  });
});

describe('NRW holiday provider', () => {
  it('lists 11 holidays for 2026', () => {
    expect(nrwHolidays(2026)).toHaveLength(11);
  });
  it('recognises Karfreitag 2026 (April 3)', () => {
    expect(NrwHolidayProvider.isHoliday(new Date(Date.UTC(2026, 3, 3)))).toBe(true);
  });
  it('does not flag a normal weekday', () => {
    expect(NrwHolidayProvider.isHoliday(new Date(Date.UTC(2026, 4, 4)))).toBe(false);
  });
});
