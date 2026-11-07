import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatZonedDateTime,
  zonedDateTimeCandidates,
  zonedUtcOffsetLabel,
} from './iana-date-time';

describe('declared IANA zone datetime-local resolution', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('uses the server zone independently of the browser zone and preserves exact precision', () => {
    vi.stubEnv('TZ', 'America/Los_Angeles');
    expect(
      zonedDateTimeCandidates('2026-06-15T08:10:23.4', 'Europe/Berlin'),
    ).toEqual(['2026-06-15T06:10:23.400Z']);
    expect(
      formatZonedDateTime('2026-06-15T06:10:23.400Z', 'Europe/Berlin'),
    ).toBe('2026-06-15T08:10:23.400');
    expect(
      zonedUtcOffsetLabel('2026-06-15T06:10:23.400Z', 'Europe/Berlin'),
    ).toBe('UTC+02:00');
    expect(
      zonedDateTimeCandidates('2026-06-15T08:10', 'Asia/Kathmandu'),
    ).toEqual(['2026-06-15T02:25:00.000Z']);
  });

  it('enumerates both chronological fold instants without an implicit preference', () => {
    vi.stubEnv('TZ', 'UTC');
    expect(
      zonedDateTimeCandidates('2026-10-25T02:30:12.345', 'Europe/Berlin'),
    ).toEqual(['2026-10-25T00:30:12.345Z', '2026-10-25T01:30:12.345Z']);
    expect(
      zonedDateTimeCandidates('2026-11-01T01:30', 'America/New_York'),
    ).toEqual(['2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z']);
    expect(
      zonedUtcOffsetLabel('2026-11-01T06:30:00.000Z', 'America/New_York'),
    ).toBe('UTC-05:00');
  });

  it.each([
    '2026-03-29T02:30',
    '2026-02-30T12:00',
    '2026-13-01T10:00',
    '2026-01-01T24:00',
    '',
    'invalid',
    '0000-01-01T00:00',
  ])('rejects malformed input or gaps: %s', (value) => {
    expect(zonedDateTimeCandidates(value, 'Europe/Berlin')).toEqual([]);
  });

  it('handles half-hour transitions and a skipped calendar date', () => {
    expect(
      zonedDateTimeCandidates('2026-04-05T01:45', 'Australia/Lord_Howe'),
    ).toEqual(['2026-04-04T14:45:00.000Z', '2026-04-04T15:15:00.000Z']);
    expect(
      zonedDateTimeCandidates('2026-10-04T02:15', 'Australia/Lord_Howe'),
    ).toEqual([]);
    expect(zonedDateTimeCandidates('2011-12-30T12:00', 'Pacific/Apia')).toEqual(
      [],
    );
  });

  it('validates leap days and invalid zones; UTC has no invented fold', () => {
    expect(zonedDateTimeCandidates('2024-02-29T12:00', 'UTC')).toEqual([
      '2024-02-29T12:00:00.000Z',
    ]);
    expect(zonedDateTimeCandidates('2026-02-29T12:00', 'UTC')).toEqual([]);
    expect(zonedDateTimeCandidates('2026-10-25T02:30', 'UTC')).toEqual([
      '2026-10-25T02:30:00.000Z',
    ]);
    expect(zonedDateTimeCandidates('2026-10-25T02:30', 'not/a/zone')).toEqual(
      [],
    );
  });
});
