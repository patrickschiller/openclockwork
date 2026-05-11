import { describe, expect, it } from 'vitest';
import { requiresSpecialApproval } from './request-rules.js';
import type { FrameTimeRule } from '../work-time/core-time.js';

function at(h: number, m = 0): Date {
  const d = new Date('2026-05-04T00:00:00');
  d.setHours(h, m, 0, 0);
  return d;
}

describe('requiresSpecialApproval (default frame 07–23)', () => {
  it('false for normal hours', () => {
    expect(requiresSpecialApproval(at(8), at(17))).toBe(false);
  });
  it('true when start is before 07:00', () => {
    expect(requiresSpecialApproval(at(6, 30), at(15))).toBe(true);
  });
  it('true when end is after 23:00', () => {
    expect(requiresSpecialApproval(at(20), at(23, 30))).toBe(true);
  });
  it('false when end is exactly at 23:00', () => {
    expect(requiresSpecialApproval(at(20), at(23, 0))).toBe(false);
  });
  it('true when crossing midnight', () => {
    const start = new Date('2026-05-04T22:00:00');
    const end = new Date('2026-05-05T01:00:00');
    expect(requiresSpecialApproval(start, end)).toBe(true);
  });
});

describe('requiresSpecialApproval (custom frame 06–20)', () => {
  const frame: FrameTimeRule = { startHour: 6, startMinute: 0, endHour: 20, endMinute: 0 };
  it('06:30 start within frame is fine', () => {
    expect(requiresSpecialApproval(at(6, 30), at(15), frame)).toBe(false);
  });
  it('20:30 end is outside frame', () => {
    expect(requiresSpecialApproval(at(15), at(20, 30), frame)).toBe(true);
  });
  it('05:30 start is outside frame', () => {
    expect(requiresSpecialApproval(at(5, 30), at(10), frame)).toBe(true);
  });
});
