import { describe, expect, it } from 'vitest';
import {
  detectCoreTimeViolations,
  detectViolations,
  WEEKDAY_BITS,
  WEEKDAYS_MON_TO_FRI,
  type CoreTimeWindow,
} from './core-time.js';

function at(year: number, month: number, day: number, h: number, m = 0): Date {
  const d = new Date(year, month - 1, day, 0, 0, 0, 0);
  d.setHours(h, m, 0, 0);
  return d;
}

const MON_2026_05_04 = (h: number, m = 0) => at(2026, 5, 4, h, m);
const SAT_2026_05_02 = (h: number, m = 0) => at(2026, 5, 2, h, m);

describe('detectCoreTimeViolations — single window', () => {
  const window: CoreTimeWindow = {
    startHour: 9,
    startMinute: 0,
    endHour: 15,
    endMinute: 0,
    weekdays: WEEKDAYS_MON_TO_FRI,
    label: 'Kernzeit',
  };

  it('no violations when fully inside the window', () => {
    expect(detectCoreTimeViolations(MON_2026_05_04(8, 30), MON_2026_05_04(15, 30), [window])).toEqual([]);
  });
  it('LateArrival when clock-in after window-start', () => {
    const v = detectCoreTimeViolations(MON_2026_05_04(9, 30), MON_2026_05_04(17), [window]);
    expect(v).toEqual([
      { kind: 'LateArrival', boundary: '09:00', deltaMinutes: 30, windowLabel: 'Kernzeit' },
    ]);
  });
  it('EarlyDeparture when clock-out before window-end', () => {
    const v = detectCoreTimeViolations(MON_2026_05_04(8), MON_2026_05_04(14, 45), [window]);
    expect(v).toEqual([
      { kind: 'EarlyDeparture', boundary: '15:00', deltaMinutes: 15, windowLabel: 'Kernzeit' },
    ]);
  });
  it('skips windows for non-matching weekdays', () => {
    expect(detectCoreTimeViolations(SAT_2026_05_02(11), SAT_2026_05_02(12), [window])).toEqual([]);
  });
});

describe('detectCoreTimeViolations — multi window (10–11 + 14–15)', () => {
  const windows: CoreTimeWindow[] = [
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

  it('no violations when both windows fully covered', () => {
    expect(detectCoreTimeViolations(MON_2026_05_04(9), MON_2026_05_04(17), windows)).toEqual([]);
  });
  it('one LateArrival when arriving 10:30 (only morning window violated)', () => {
    const v = detectCoreTimeViolations(MON_2026_05_04(10, 30), MON_2026_05_04(17), windows);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ kind: 'LateArrival', windowLabel: 'Vormittag', deltaMinutes: 30 });
  });
  it('two violations when leaving early during the afternoon window', () => {
    const v = detectCoreTimeViolations(MON_2026_05_04(10, 15), MON_2026_05_04(14, 30), windows);
    expect(v).toHaveLength(2);
    expect(v.find((x) => x.windowLabel === 'Vormittag')?.kind).toBe('LateArrival');
    expect(v.find((x) => x.windowLabel === 'Nachmittag')?.kind).toBe('EarlyDeparture');
  });
});

describe('detectViolations (legacy single-rule wrapper)', () => {
  it('still works for the old default 09–15 window', () => {
    const v = detectViolations(MON_2026_05_04(9, 30), MON_2026_05_04(17));
    expect(v[0]).toMatchObject({ kind: 'LateArrival', boundary: '09:00', deltaMinutes: 30 });
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
