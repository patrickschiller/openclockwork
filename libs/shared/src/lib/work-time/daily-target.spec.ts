import { describe, expect, it } from 'vitest';
import {
  calculateDailyTargetMinutes,
  countWorkingDays,
} from './daily-target.js';

describe('daily work target', () => {
  it('counts configured weekdays in the schedule mask', () => {
    expect(countWorkingDays(31)).toBe(5);
    expect(countWorkingDays(15)).toBe(4);
    expect(countWorkingDays(127)).toBe(7);
  });

  it('derives 8:15 per day for 33 weekly hours on Monday through Thursday', () => {
    expect(calculateDailyTargetMinutes(33, 15)).toBe(495);
  });

  it('returns zero when no workday or no weekly hours are configured', () => {
    expect(calculateDailyTargetMinutes(40, 0)).toBe(0);
    expect(calculateDailyTargetMinutes(0, 31)).toBe(0);
  });
});
