import { describe, expect, it } from 'vitest';
import {
  calculateBreakMinutes,
  calculateGrossMinutesForNet,
  calculateNetMinutes,
  summarize,
  LEGACY_BREAK_RULES,
  parseBreakRules,
} from './breaks.js';

describe('calculateBreakMinutes', () => {
  it('no break under 6 h', () => {
    expect(calculateBreakMinutes(5 * 60 + 59, LEGACY_BREAK_RULES)).toBe(0);
  });
  it('30 min from 6 h', () => {
    expect(calculateBreakMinutes(6 * 60, LEGACY_BREAK_RULES)).toBe(30);
  });
  it('30 min between 6 and 9 h', () => {
    expect(calculateBreakMinutes(8 * 60 + 59, LEGACY_BREAK_RULES)).toBe(30);
  });
  it('45 min from 9 h', () => {
    expect(calculateBreakMinutes(9 * 60, LEGACY_BREAK_RULES)).toBe(45);
    expect(calculateBreakMinutes(10 * 60, LEGACY_BREAK_RULES)).toBe(45);
  });
});

describe('calculateNetMinutes', () => {
  it('returns 0 for non-positive', () => {
    expect(calculateNetMinutes(0, LEGACY_BREAK_RULES)).toBe(0);
    expect(calculateNetMinutes(-30, LEGACY_BREAK_RULES)).toBe(0);
  });
  it('subtracts the break', () => {
    expect(calculateNetMinutes(8 * 60, LEGACY_BREAK_RULES)).toBe(8 * 60 - 30);
    expect(calculateNetMinutes(10 * 60, LEGACY_BREAK_RULES)).toBe(10 * 60 - 45);
  });
});

describe('calculateGrossMinutesForNet', () => {
  it('adds the automatic break needed for an 8:15 net working day', () => {
    expect(calculateGrossMinutesForNet(495, LEGACY_BREAK_RULES)).toBe(525);
    expect(calculateNetMinutes(525, LEGACY_BREAK_RULES)).toBe(495);
  });

  it('uses the smallest matching gross duration at break thresholds', () => {
    expect(calculateGrossMinutesForNet(330, LEGACY_BREAK_RULES)).toBe(330);
    expect(calculateGrossMinutesForNet(360, LEGACY_BREAK_RULES)).toBe(390);
    expect(calculateGrossMinutesForNet(510, LEGACY_BREAK_RULES)).toBe(555);
  });
});

describe('summarize', () => {
  it('returns zero when clockOut missing', () => {
    expect(summarize(new Date(), null)).toEqual({
      grossMinutes: 0,
      breakMinutes: 0,
      netMinutes: 0,
    });
  });
  it('computes gross/break/net for a regular 8h day', () => {
    const start = new Date('2026-05-04T09:00:00Z');
    const end = new Date('2026-05-04T17:00:00Z');
    expect(summarize(start, end, LEGACY_BREAK_RULES)).toEqual({
      grossMinutes: 480,
      breakMinutes: 30,
      netMinutes: 450,
    });
  });
});

describe('configurable break policies', () => {
  it('makes no automatic deduction without an explicit policy', () => {
    expect(calculateBreakMinutes(600)).toBe(0);
    expect(calculateNetMinutes(600)).toBe(600);
    expect(calculateGrossMinutesForNet(495)).toBe(495);
    expect(
      summarize(
        new Date('2026-05-04T09:00:00Z'),
        new Date('2026-05-04T17:00:00Z'),
      ).netMinutes,
    ).toBe(480);
  });

  it('uses arbitrary thresholds and the largest matching total independent of order', () => {
    const policy = [
      { afterMinutes: 600, breakMinutes: 60 },
      { afterMinutes: 300, breakMinutes: 20 },
    ];
    expect(calculateBreakMinutes(299, policy)).toBe(0);
    expect(calculateBreakMinutes(300, policy)).toBe(20);
    expect(calculateBreakMinutes(600, policy)).toBe(60);
    expect(calculateGrossMinutesForNet(560, policy)).toBe(580);
    expect(
      calculateNetMinutes(calculateGrossMinutesForNet(600, policy), policy),
    ).toBe(600);
  });

  it('validates persisted rules and copies the policy snapshot', () => {
    for (const value of [
      null,
      {},
      [{ afterMinutes: -1, breakMinutes: 0 }],
      [{ afterMinutes: 60, breakMinutes: 61 }],
      [{ afterMinutes: 360.5, breakMinutes: 30 }],
    ]) {
      expect(() => parseBreakRules(value)).toThrow('Invalid break rules');
    }
    const schedule = [{ afterMinutes: 300, breakMinutes: 20 }];
    const snapshot = parseBreakRules(schedule);
    schedule[0].breakMinutes = 40;
    expect(calculateBreakMinutes(480, snapshot)).toBe(20);
  });
});
