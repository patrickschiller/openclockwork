import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatLocalDateTime,
  localDateTimeCandidates,
  utcOffsetLabel,
} from './local-date-time';

describe('local date/time resolution', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('preserves seconds and enumerates both Berlin autumn occurrences chronologically', () => {
    vi.stubEnv('TZ', 'Europe/Berlin');
    expect(formatLocalDateTime('2026-10-25T01:30:12.345Z')).toBe(
      '2026-10-25T02:30:12.345',
    );
    expect(localDateTimeCandidates('2026-10-25T02:30:12.345')).toEqual([
      '2026-10-25T00:30:12.345Z',
      '2026-10-25T01:30:12.345Z',
    ]);
    expect(utcOffsetLabel('2026-10-25T00:30:00.000Z')).toBe('UTC+02:00');
    expect(utcOffsetLabel('2026-10-25T01:30:00.000Z')).toBe('UTC+01:00');
  });

  it.each(['2026-03-29T02:30', '2026-02-30T12:00', '', 'not a date'])(
    'rejects nonexistent or invalid local time %s',
    (value) => {
      vi.stubEnv('TZ', 'Europe/Berlin');
      expect(localDateTimeCandidates(value)).toEqual([]);
    },
  );

  it('accepts minute, second and fractional precision without rounding', () => {
    vi.stubEnv('TZ', 'Europe/Berlin');
    expect(localDateTimeCandidates('2026-06-15T08:10')).toEqual([
      '2026-06-15T06:10:00.000Z',
    ]);
    expect(localDateTimeCandidates('2026-06-15T08:10:23')).toEqual([
      '2026-06-15T06:10:23.000Z',
    ]);
    expect(localDateTimeCandidates('2026-06-15T08:10:23.4')).toEqual([
      '2026-06-15T06:10:23.400Z',
    ]);
  });

  it('also resolves non-hour folds and gaps', () => {
    vi.stubEnv('TZ', 'Australia/Lord_Howe');
    expect(localDateTimeCandidates('2026-04-05T01:45')).toEqual([
      '2026-04-04T14:45:00.000Z',
      '2026-04-04T15:15:00.000Z',
    ]);
    expect(localDateTimeCandidates('2026-10-04T02:15')).toEqual([]);
  });

  it('does not invent ambiguity in UTC and supports negative UTC offsets', () => {
    vi.stubEnv('TZ', 'UTC');
    expect(localDateTimeCandidates('2026-10-25T02:30')).toEqual([
      '2026-10-25T02:30:00.000Z',
    ]);
    vi.stubEnv('TZ', 'America/New_York');
    expect(localDateTimeCandidates('2026-11-01T01:30')).toEqual([
      '2026-11-01T05:30:00.000Z',
      '2026-11-01T06:30:00.000Z',
    ]);
    expect(utcOffsetLabel('2026-11-01T06:30:00.000Z')).toBe('UTC-05:00');
  });
});
