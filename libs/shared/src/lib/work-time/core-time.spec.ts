import { describe, expect, it } from 'vitest';
import {
  detectCoreTimeViolationsForDay,
  WEEKDAY_BITS,
  WEEKDAYS_MON_TO_FRI,
  type CoreTimeWindow,
} from './core-time.js';

function at(year: number, month: number, day: number, h: number, m = 0): Date {
  const d = new Date(year, month - 1, day, 0, 0, 0, 0);
  d.setHours(h, m, 0, 0);
  return d;
}

const MON = (h: number, m = 0) => at(2026, 5, 4, h, m); // Monday
const SAT = (h: number, m = 0) => at(2026, 5, 2, h, m); // Saturday

const SINGLE: CoreTimeWindow = {
  startHour: 9,
  startMinute: 0,
  endHour: 15,
  endMinute: 0,
  weekdays: WEEKDAYS_MON_TO_FRI,
  label: 'Kernzeit',
};

const DOUBLE: CoreTimeWindow[] = [
  {
    startHour: 10,
    startMinute: 0,
    endHour: 11,
    endMinute: 0,
    weekdays: WEEKDAYS_MON_TO_FRI,
    label: 'Vormittag',
  },
  {
    startHour: 14,
    startMinute: 0,
    endHour: 15,
    endMinute: 0,
    weekdays: WEEKDAYS_MON_TO_FRI,
    label: 'Nachmittag',
  },
];

describe('detectCoreTimeViolationsForDay — single window', () => {
  it('no entries → no violation (employee was off)', () => {
    expect(detectCoreTimeViolationsForDay([], [SINGLE], MON(0))).toEqual([]);
  });

  it('fully inside the window → no violation', () => {
    const entries = [{ clockIn: MON(8, 30), clockOut: MON(15, 30) }];
    expect(detectCoreTimeViolationsForDay(entries, [SINGLE], MON(0))).toEqual([]);
  });

  it('late arrival → LateArrival of the leading gap', () => {
    const entries = [{ clockIn: MON(9, 30), clockOut: MON(17) }];
    const v = detectCoreTimeViolationsForDay(entries, [SINGLE], MON(0));
    expect(v).toEqual([
      {
        kind: 'LateArrival',
        boundary: '09:00–15:00',
        deltaMinutes: 30,
        windowLabel: 'Kernzeit',
      },
    ]);
  });

  it('early departure → EarlyDeparture of the trailing gap', () => {
    const entries = [{ clockIn: MON(8), clockOut: MON(14, 45) }];
    const v = detectCoreTimeViolationsForDay(entries, [SINGLE], MON(0));
    expect(v).toEqual([
      {
        kind: 'EarlyDeparture',
        boundary: '09:00–15:00',
        deltaMinutes: 15,
        windowLabel: 'Kernzeit',
      },
    ]);
  });

  it('mid-day break splits the window → MidDayGap', () => {
    const entries = [
      { clockIn: MON(8), clockOut: MON(11, 30) },
      { clockIn: MON(13), clockOut: MON(17) },
    ];
    const v = detectCoreTimeViolationsForDay(entries, [SINGLE], MON(0));
    expect(v).toEqual([
      {
        kind: 'MidDayGap',
        boundary: '09:00–15:00',
        deltaMinutes: 90, // 11:30 → 13:00
        windowLabel: 'Kernzeit',
      },
    ]);
  });

  it('skips windows for non-matching weekdays', () => {
    const entries = [{ clockIn: SAT(10), clockOut: SAT(16) }];
    expect(detectCoreTimeViolationsForDay(entries, [SINGLE], SAT(0))).toEqual([]);
  });

  it('open entry (no clock-out) is ignored — violation surfaces once stamped out', () => {
    const entries = [{ clockIn: MON(8), clockOut: null }];
    expect(detectCoreTimeViolationsForDay(entries, [SINGLE], MON(0))).toEqual([]);
  });

  it('multiple entries fully covering the window → no violation', () => {
    const entries = [
      { clockIn: MON(8, 30), clockOut: MON(12) },
      { clockIn: MON(12), clockOut: MON(15, 30) },
    ];
    expect(detectCoreTimeViolationsForDay(entries, [SINGLE], MON(0))).toEqual([]);
  });
});

describe('detectCoreTimeViolationsForDay — double window (10–11 + 14–15)', () => {
  it('present 09:00–17:00 → both windows covered, no violation', () => {
    const entries = [{ clockIn: MON(9), clockOut: MON(17) }];
    expect(detectCoreTimeViolationsForDay(entries, DOUBLE, MON(0))).toEqual([]);
  });

  it('late by 30 min → only the morning window is violated', () => {
    const entries = [{ clockIn: MON(10, 30), clockOut: MON(17) }];
    const v = detectCoreTimeViolationsForDay(entries, DOUBLE, MON(0));
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({
      kind: 'LateArrival',
      windowLabel: 'Vormittag',
      deltaMinutes: 30,
    });
  });

  it('two-entry day with afternoon gap → only the afternoon window is violated', () => {
    const entries = [
      { clockIn: MON(9, 30), clockOut: MON(12) },
      { clockIn: MON(14, 30), clockOut: MON(17) },
    ];
    const v = detectCoreTimeViolationsForDay(entries, DOUBLE, MON(0));
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({
      kind: 'LateArrival',
      windowLabel: 'Nachmittag',
      deltaMinutes: 30,
    });
  });

  it('only morning attendance → afternoon window completely uncovered', () => {
    const entries = [{ clockIn: MON(9), clockOut: MON(12) }];
    const v = detectCoreTimeViolationsForDay(entries, DOUBLE, MON(0));
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({
      kind: 'LateArrival',
      windowLabel: 'Nachmittag',
      deltaMinutes: 60,
    });
  });

  it('present only outside both windows → both windows violated', () => {
    const entries = [
      { clockIn: MON(7), clockOut: MON(9, 30) },
      { clockIn: MON(15, 30), clockOut: MON(18) },
    ];
    const v = detectCoreTimeViolationsForDay(entries, DOUBLE, MON(0));
    expect(v).toHaveLength(2);
    expect(v.map((x) => x.windowLabel).sort()).toEqual(['Nachmittag', 'Vormittag']);
  });
});

describe('weekday bits', () => {
  it('Mon..Fri mask is 31', () => {
    expect(WEEKDAYS_MON_TO_FRI).toBe(31);
    expect(
      WEEKDAY_BITS.Mon | WEEKDAY_BITS.Tue | WEEKDAY_BITS.Wed | WEEKDAY_BITS.Thu | WEEKDAY_BITS.Fri,
    ).toBe(31);
  });
});
