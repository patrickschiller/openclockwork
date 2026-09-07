import type { RequestDto } from '../api/client';
import { selectUpcomingVacations } from './upcoming-vacations';

function vacation(
  from: string,
  to: string,
  workflowState: RequestDto['workflowState'] = 'Approved',
) {
  return {
    from: `${from}T00:00:00.000Z`,
    to: `${to}T00:00:00.000Z`,
    workflowState,
  };
}

describe('upcoming vacation calendar boundaries', () => {
  it('includes leave through its final calendar day, even west of UTC', () => {
    const endsToday = vacation('2026-06-08', '2026-06-12');
    const endedYesterday = vacation('2026-06-08', '2026-06-11');
    // The server's end timestamp is June 11 in New York, but it represents
    // the June 12 calendar day and must remain visible all of that day.
    expect(
      new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York' }).format(
        new Date(endsToday.to),
      ),
    ).toBe('6/11/2026');
    expect(
      selectUpcomingVacations([endedYesterday, endsToday], 2026, '2026-06-12'),
    ).toEqual([endsToday]);
  });

  it('uses the calendar year at January 1, without shifting it into the previous year', () => {
    const nextYear = vacation('2027-01-01', '2027-01-03');
    const outsideWindow = vacation('2028-01-01', '2028-01-03');
    expect(
      selectUpcomingVacations([outsideWindow, nextYear], 2026, '2026-12-31'),
    ).toEqual([nextYear]);
  });

  it('retains rejection filtering, chronological ordering and the four-item limit', () => {
    const requests = [6, 5, 4, 3, 2, 1].map((day) =>
      vacation(`2026-07-0${day}`, `2026-07-0${day}`),
    );
    requests.push(vacation('2026-06-12', '2026-06-13', 'Cancelled'));
    requests.push(vacation('2026-06-12', '2026-06-13', 'Rejected'));
    expect(
      selectUpcomingVacations(requests, 2026, '2026-06-12').map((request) =>
        request.from.slice(0, 10),
      ),
    ).toEqual(['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04']);
  });
});
