import { describe, expect, it } from 'vitest';
import { calculateOvertimeMinutes } from './overtime.js';

const VOLLZEIT_DAILY_MIN = (40 / 5) * 60; // 480 min/day

function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

describe('calculateOvertimeMinutes', () => {
  it('full year, no opening balance, exactly Soll-Stunden gebucht → 0', () => {
    const year = 2026;
    // Mon 2026-05-04 — 88 working days from Jan 1 to May 4 (NRW holidays excluded).
    const now = utc(2026, 5, 4);
    const sollFromCandidate = utc(2026, 1, 1);
    // We don't recompute by hand; we just feed the same period twice and
    // expect a zero balance.
    const partial = calculateOvertimeMinutes({
      startDate: sollFromCandidate,
      year,
      now,
      weeklyHours: 40,
      netMinutesYtd: 0, // no entries yet
      openingBalanceMinutes: 0,
    });
    // The 88-day Soll is whatever the calculator says; net = 0 ⇒ overtime = -soll.
    expect(partial.overtimeMinutes).toBe(-partial.sollMinutes);

    const onTarget = calculateOvertimeMinutes({
      startDate: sollFromCandidate,
      year,
      now,
      weeklyHours: 40,
      netMinutesYtd: partial.sollMinutes,
      openingBalanceMinutes: 0,
    });
    expect(onTarget.overtimeMinutes).toBe(0);
  });

  it('mid-year hire is not penalised for months before startDate', () => {
    const year = 2026;
    const now = utc(2026, 5, 4); // today
    const earlyHire = calculateOvertimeMinutes({
      startDate: utc(2026, 1, 1), // hired at year start
      year,
      now,
      weeklyHours: 40,
      netMinutesYtd: 0,
      openingBalanceMinutes: 0,
    });
    const midYearHire = calculateOvertimeMinutes({
      startDate: utc(2026, 4, 15), // hired mid-April
      year,
      now,
      weeklyHours: 40,
      netMinutesYtd: 0,
      openingBalanceMinutes: 0,
    });
    expect(midYearHire.sollMinutes).toBeLessThan(earlyHire.sollMinutes);
    // Mid-year hire's Soll covers ~13 working days, not ~88
    expect(midYearHire.sollMinutes).toBeLessThan(13 * VOLLZEIT_DAILY_MIN + 1);
  });

  it('opening balance is added on top of YTD calc', () => {
    const baseline = calculateOvertimeMinutes({
      startDate: utc(2026, 1, 1),
      year: 2026,
      now: utc(2026, 5, 4),
      weeklyHours: 40,
      netMinutesYtd: 1000,
      openingBalanceMinutes: 0,
    });
    const withCarryover = calculateOvertimeMinutes({
      startDate: utc(2026, 1, 1),
      year: 2026,
      now: utc(2026, 5, 4),
      weeklyHours: 40,
      netMinutesYtd: 1000,
      openingBalanceMinutes: 600,
    });
    expect(withCarryover.overtimeMinutes - baseline.overtimeMinutes).toBe(600);
  });

  it('negative opening balance subtracts (e.g. migrated employee with deficit)', () => {
    const r = calculateOvertimeMinutes({
      startDate: utc(2026, 1, 1),
      year: 2026,
      now: utc(2026, 5, 4),
      weeklyHours: 40,
      netMinutesYtd: 0,
      openingBalanceMinutes: -300,
    });
    expect(r.overtimeMinutes).toBe(-r.sollMinutes - 300);
  });

  it('future startDate ⇒ no Soll, balance reduces to the opening carry-over', () => {
    const r = calculateOvertimeMinutes({
      startDate: utc(2026, 8, 1), // hires in August
      year: 2026,
      now: utc(2026, 5, 4),       // today is May
      weeklyHours: 40,
      netMinutesYtd: 0,
      openingBalanceMinutes: 250,
    });
    expect(r.sollMinutes).toBe(0);
    expect(r.overtimeMinutes).toBe(250);
  });

  it('excusedDays reduces Soll one-for-one — vacation/sickness should not penalise overtime', () => {
    const noAbsence = calculateOvertimeMinutes({
      startDate: utc(2026, 1, 1),
      year: 2026,
      now: utc(2026, 5, 4),
      weeklyHours: 40,
      netMinutesYtd: 0,
      openingBalanceMinutes: 0,
    });
    const fiveDayVacation = calculateOvertimeMinutes({
      startDate: utc(2026, 1, 1),
      year: 2026,
      now: utc(2026, 5, 4),
      weeklyHours: 40,
      netMinutesYtd: 0,
      openingBalanceMinutes: 0,
      excusedDays: 5,
    });
    expect(noAbsence.sollMinutes - fiveDayVacation.sollMinutes).toBe(5 * VOLLZEIT_DAILY_MIN);
    // No Ist means overtime mirrors -Soll; with five excused days the
    // employee is 5 * 480 = 2400 min "less negative".
    expect(fiveDayVacation.overtimeMinutes - noAbsence.overtimeMinutes).toBe(5 * VOLLZEIT_DAILY_MIN);
    expect(fiveDayVacation.excusedDays).toBe(5);
  });

  it('Gleittag is NOT excused — it drains the overtime account by the daily Soll', () => {
    // A Gleittag is "I use overtime to take a day off". The employee
    // doesn't book a TimeEntry that day (netMinutesYtd unchanged) and the
    // Soll is NOT reduced (excusedDays does not include Flextime). So the
    // result is overtimeMinutes -= dailyMinutes, which is what we want.
    const baseline = calculateOvertimeMinutes({
      startDate: utc(2026, 1, 1),
      year: 2026,
      now: utc(2026, 5, 4),
      weeklyHours: 40,
      netMinutesYtd: 1000,
      openingBalanceMinutes: 5000,
      excusedDays: 0,
    });
    const afterGleittag = calculateOvertimeMinutes({
      startDate: utc(2026, 1, 1),
      year: 2026,
      now: utc(2026, 5, 4),
      weeklyHours: 40,
      netMinutesYtd: 1000, // same — no booking on the Gleittag
      openingBalanceMinutes: 5000,
      excusedDays: 0, // explicitly: not excused
    });
    expect(afterGleittag.overtimeMinutes).toBe(baseline.overtimeMinutes);
  });

  it('excusedDays is capped at the working-day count — never makes Soll go negative', () => {
    const r = calculateOvertimeMinutes({
      startDate: utc(2026, 1, 1),
      year: 2026,
      now: utc(2026, 1, 9), // ~5-6 working days
      weeklyHours: 40,
      netMinutesYtd: 0,
      openingBalanceMinutes: 0,
      excusedDays: 9999,
    });
    expect(r.sollMinutes).toBe(0);
    expect(r.overtimeMinutes).toBe(0);
  });

  it('Teilzeit (20h/week) gets half the daily Soll', () => {
    const full = calculateOvertimeMinutes({
      startDate: utc(2026, 1, 1),
      year: 2026,
      now: utc(2026, 5, 4),
      weeklyHours: 40,
      netMinutesYtd: 0,
      openingBalanceMinutes: 0,
    });
    const half = calculateOvertimeMinutes({
      startDate: utc(2026, 1, 1),
      year: 2026,
      now: utc(2026, 5, 4),
      weeklyHours: 20,
      netMinutesYtd: 0,
      openingBalanceMinutes: 0,
    });
    expect(half.sollMinutes).toBe(Math.round(full.sollMinutes / 2));
  });
});
