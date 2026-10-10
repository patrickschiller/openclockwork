import { localCandidates, offsetLabel, zonedInput } from './solo-time';

describe('installation-zone wall time input', () => {
  it('converts Berlin wall time independently of the browser zone', () => {
    expect(localCandidates('2026-09-08T10:30', 'Europe/Berlin')).toEqual([
      '2026-09-08T08:30:00.000Z',
    ]);
    expect(zonedInput('2026-09-08T08:30:00Z', 'Europe/Berlin')).toBe(
      '2026-09-08T10:30',
    );
  });
  it('rejects the nonexistent spring DST hour', () => {
    expect(localCandidates('2026-03-29T02:30', 'Europe/Berlin')).toEqual([]);
  });
  it('offers both concrete instants for the repeated autumn hour', () => {
    expect(localCandidates('2026-10-25T02:30', 'Europe/Berlin')).toEqual([
      '2026-10-25T00:30:00.000Z',
      '2026-10-25T01:30:00.000Z',
    ]);
    expect(offsetLabel('2026-10-25T00:30:00.000Z', '2026-10-25T02:30')).toBe(
      'UTC+02:00',
    );
    expect(offsetLabel('2026-10-25T01:30:00.000Z', '2026-10-25T02:30')).toBe(
      'UTC+01:00',
    );
  });
  it('supports quarter-hour offsets and calendar boundaries', () => {
    expect(localCandidates('2026-09-08T00:15', 'Asia/Kathmandu')).toEqual([
      '2026-09-07T18:30:00.000Z',
    ]);
  });
  it('rejects invalid calendar dates instead of normalizing them', () => {
    expect(localCandidates('2026-02-30T10:00', 'UTC')).toEqual([]);
  });
});
