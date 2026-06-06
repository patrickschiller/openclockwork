import { describe, expect, it } from 'vitest';
import { calculateVacationDays, calculateWorkingDays, isWeekend } from './leave-calculator.js';
import {
  BUNDESLAENDER,
  holidayProviderFor,
  holidaysFor,
  nrwHolidays,
  NrwHolidayProvider,
} from './holidays.js';
import { WEEKDAY_BITS } from '../work-time/core-time.js';

describe('isWeekend', () => {
  it('Saturday and Sunday', () => {
    expect(isWeekend(new Date('2026-05-02T00:00:00Z'))).toBe(true);
    expect(isWeekend(new Date('2026-05-03T00:00:00Z'))).toBe(true);
  });
  it('Weekday', () => {
    expect(isWeekend(new Date('2026-05-04T00:00:00Z'))).toBe(false);
  });
});

describe('calculateWorkingDays — defaults (NRW + Mo–Fr)', () => {
  it('5 weekdays in a normal week', () => {
    const from = new Date(Date.UTC(2026, 4, 4));
    const to = new Date(Date.UTC(2026, 4, 10));
    expect(calculateWorkingDays(from, to)).toBe(5);
  });
  it('skips Tag der Arbeit 2026-05-01 (Friday)', () => {
    const from = new Date(Date.UTC(2026, 3, 27));
    const to = new Date(Date.UTC(2026, 4, 1));
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

describe('calculateWorkingDays — custom workingDays bitmask', () => {
  const SAT = new Date(Date.UTC(2026, 4, 2));
  const SUN = new Date(Date.UTC(2026, 4, 3));

  it('Saturday counted when schedule includes it', () => {
    expect(calculateWorkingDays(SAT, SAT, { workingDays: 31 })).toBe(0);
    expect(calculateWorkingDays(SAT, SAT, { workingDays: 31 | WEEKDAY_BITS.Sat })).toBe(1);
  });
  it('Sunday remains a non-working day for a Mo–Sat schedule', () => {
    expect(
      calculateWorkingDays(SUN, SUN, { workingDays: 31 | WEEKDAY_BITS.Sat }),
    ).toBe(0);
  });
  it('Tue+Thu-only schedule yields 2 working days per Mo–Sun span', () => {
    const monToSun = [
      new Date(Date.UTC(2026, 4, 4)),
      new Date(Date.UTC(2026, 4, 10)),
    ];
    const mask = WEEKDAY_BITS.Tue | WEEKDAY_BITS.Thu;
    expect(calculateWorkingDays(monToSun[0], monToSun[1], { workingDays: mask })).toBe(2);
  });
});

describe('per-state holiday providers', () => {
  it('NRW provider lists 11 holidays for 2026', () => {
    expect(nrwHolidays(2026)).toHaveLength(11);
  });
  it('Karfreitag 2026 (April 3) is everywhere', () => {
    for (const code of BUNDESLAENDER) {
      expect(holidayProviderFor(code).isHoliday(new Date(Date.UTC(2026, 3, 3)))).toBe(true);
    }
  });
  it('Fronleichnam 2026 (June 4) is observed in BY but not in NI', () => {
    const fronleichnam = new Date(Date.UTC(2026, 5, 4));
    expect(holidayProviderFor('BY').isHoliday(fronleichnam)).toBe(true);
    expect(holidayProviderFor('NI').isHoliday(fronleichnam)).toBe(false);
  });
  it('Heilige Drei Könige (Jan 6) is observed in BW, BY, ST only', () => {
    const epiphany = new Date(Date.UTC(2026, 0, 6));
    expect(holidayProviderFor('BW').isHoliday(epiphany)).toBe(true);
    expect(holidayProviderFor('BY').isHoliday(epiphany)).toBe(true);
    expect(holidayProviderFor('ST').isHoliday(epiphany)).toBe(true);
    expect(holidayProviderFor('NW').isHoliday(epiphany)).toBe(false);
    expect(holidayProviderFor('BE').isHoliday(epiphany)).toBe(false);
  });
  it('Reformationstag (Oct 31) is observed in 9 states', () => {
    const ref = new Date(Date.UTC(2026, 9, 31));
    expect(holidayProviderFor('SN').isHoliday(ref)).toBe(true);
    expect(holidayProviderFor('NI').isHoliday(ref)).toBe(true);
    expect(holidayProviderFor('HE').isHoliday(ref)).toBe(false);
    expect(holidayProviderFor('NW').isHoliday(ref)).toBe(false);
  });
  it('Bayern has more public holidays than Niedersachsen', () => {
    expect(holidaysFor('BY', 2026).length).toBeGreaterThan(holidaysFor('NI', 2026).length);
  });
  it('default NrwHolidayProvider is equivalent to NW', () => {
    const sample = new Date(Date.UTC(2026, 5, 4));
    expect(NrwHolidayProvider.isHoliday(sample)).toBe(holidayProviderFor('NW').isHoliday(sample));
  });
});

describe('calculateWorkingDays — per-state', () => {
  it('Fronleichnam reduces NW working days vs NI for that week', () => {
    const from = new Date(Date.UTC(2026, 5, 1));
    const to = new Date(Date.UTC(2026, 5, 5));
    const nw = calculateWorkingDays(from, to, { holidayProvider: holidayProviderFor('NW') });
    const ni = calculateWorkingDays(from, to, { holidayProvider: holidayProviderFor('NI') });
    expect(ni - nw).toBe(1);
  });
});

describe('calculateVacationDays — Halbtage', () => {
  // Mon 2026-05-04 to Fri 2026-05-08 = 5 full workdays in NRW (no holiday).
  const monday = new Date(Date.UTC(2026, 4, 4));
  const friday = new Date(Date.UTC(2026, 4, 8));

  it('no flags → identical to calculateWorkingDays', () => {
    expect(calculateVacationDays(monday, friday)).toBe(5);
  });

  it('halfDayStart subtracts 0.5 from the first day', () => {
    expect(calculateVacationDays(monday, friday, { halfDayStart: true })).toBe(4.5);
  });

  it('halfDayEnd subtracts 0.5 from the last day', () => {
    expect(calculateVacationDays(monday, friday, { halfDayEnd: true })).toBe(4.5);
  });

  it('both halves on a multi-day range → -1.0', () => {
    expect(calculateVacationDays(monday, friday, { halfDayStart: true, halfDayEnd: true })).toBe(4);
  });

  it('single-day range with halfDayStart → 0.5', () => {
    expect(calculateVacationDays(monday, monday, { halfDayStart: true })).toBe(0.5);
  });

  it('single-day range with halfDayEnd → 0.5', () => {
    expect(calculateVacationDays(monday, monday, { halfDayEnd: true })).toBe(0.5);
  });

  it('single-day range with both flags → still 0.5 (can\'t take two halves of one day)', () => {
    expect(calculateVacationDays(monday, monday, { halfDayStart: true, halfDayEnd: true })).toBe(0.5);
  });

  it('halfDayStart on a holiday/weekend has no effect (day was already 0)', () => {
    // Sat 2026-05-02 is a weekend; halving doesn't subtract from 0.
    const sat = new Date(Date.UTC(2026, 4, 2));
    const fri = new Date(Date.UTC(2026, 4, 8));
    const noHalf = calculateVacationDays(sat, fri); // 5 workdays Mon–Fri
    expect(calculateVacationDays(sat, fri, { halfDayStart: true })).toBe(noHalf);
  });
});
