import { ApiError } from '../api/client';
import { formatSoloActionError } from './solo-errors';
import { soloDe, soloEn } from './solo-i18n';

describe.each([
  ['de', soloDe],
  ['en', soloEn],
] as const)('Solo action errors (%s)', (_locale, catalogue) => {
  const t = (key: string) => catalogue[key] ?? key;

  it.each([
    [
      409,
      'Finish or reassign the running timer before archiving this customer',
      'activeTimerArchive',
    ],
    [
      409,
      'Finish or reassign the running timer before archiving this project',
      'activeTimerArchive',
    ],
    [
      409,
      'Finish or reassign the running timer before archiving this service order',
      'activeTimerArchive',
    ],
    [409, 'Time interval overlaps an existing entry', 'timeOverlap'],
    [400, 'clockOut must be after clockIn', 'invalidEnd'],
    [400, 'Clock-out must be after clock-in', 'invalidEnd'],
    [409, 'Time entry changed; reload before editing', 'staleRevision'],
    [409, 'Settings changed; reload before saving', 'staleRevision'],
    [
      409,
      'Today already has recorded work; choose a future effective date',
      'todayRecordedFutureDate',
    ],
    [404, 'No open time entry to close', 'timerAlreadyStopped'],
    [409, 'Time entry was already closed', 'timerAlreadyStopped'],
  ] as const)('translates %s: %s', (status, message, suffix) => {
    const key = `solo.error.${suffix}`;
    const result = formatSoloActionError(new ApiError(status, message), t);
    expect(catalogue[key]).toBeTruthy();
    expect(result).toBe(catalogue[key]);
    expect(result).not.toContain(message);
  });

  it('uses a stable error code even when the API detail changes', () => {
    expect(
      formatSoloActionError(
        new ApiError(409, 'Server detail', 'DAILY_BLOCK_TIME_ENTRY_CONFLICT'),
        t,
      ),
    ).toBe(catalogue['solo.error.dailyBlockTimeConflict']);
  });

  it('preserves unknown conflicts without guessing that entries overlap', () => {
    const detail = 'Unrecognized server constraint';
    expect(
      formatSoloActionError(new ApiError(409, detail, 'FUTURE_CONSTRAINT'), t),
    ).toBe(`${catalogue['solo.error']} ${detail}`);
  });

  it('preserves non-API error details and handles unstructured errors', () => {
    expect(formatSoloActionError(new Error('Connection closed'), t)).toBe(
      `${catalogue['solo.error']} Connection closed`,
    );
    expect(formatSoloActionError(null, t)).toBe(catalogue['solo.error']);
  });
});
