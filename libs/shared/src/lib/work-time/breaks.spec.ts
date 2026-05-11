import { describe, expect, it } from 'vitest';
import { calculateBreakMinutes, calculateNetMinutes, summarize } from './breaks.js';

describe('calculateBreakMinutes', () => {
  it('no break under 6 h', () => {
    expect(calculateBreakMinutes(5 * 60 + 59)).toBe(0);
  });
  it('30 min from 6 h', () => {
    expect(calculateBreakMinutes(6 * 60)).toBe(30);
  });
  it('30 min between 6 and 9 h', () => {
    expect(calculateBreakMinutes(8 * 60 + 59)).toBe(30);
  });
  it('45 min from 9 h', () => {
    expect(calculateBreakMinutes(9 * 60)).toBe(45);
    expect(calculateBreakMinutes(10 * 60)).toBe(45);
  });
});

describe('calculateNetMinutes', () => {
  it('returns 0 for non-positive', () => {
    expect(calculateNetMinutes(0)).toBe(0);
    expect(calculateNetMinutes(-30)).toBe(0);
  });
  it('subtracts the break', () => {
    expect(calculateNetMinutes(8 * 60)).toBe(8 * 60 - 30);
    expect(calculateNetMinutes(10 * 60)).toBe(10 * 60 - 45);
  });
});

describe('summarize', () => {
  it('returns zero when clockOut missing', () => {
    expect(summarize(new Date(), null)).toEqual({ grossMinutes: 0, breakMinutes: 0, netMinutes: 0 });
  });
  it('computes gross/break/net for a regular 8h day', () => {
    const start = new Date('2026-05-04T09:00:00Z');
    const end = new Date('2026-05-04T17:00:00Z');
    expect(summarize(start, end)).toEqual({ grossMinutes: 480, breakMinutes: 30, netMinutes: 450 });
  });
});
