import type { RequestDto } from '../api/client';

type VacationRange = Pick<RequestDto, 'from' | 'to' | 'workflowState'>;

/** Leave ranges are calendar dates even when transported as midnight-UTC ISO. */
export function selectUpcomingVacations<T extends VacationRange>(
  requests: T[],
  year: number,
  today: string,
): T[] {
  return requests
    .filter(
      (request) =>
        request.workflowState !== 'Rejected' &&
        request.workflowState !== 'Cancelled' &&
        request.to.slice(0, 10) >= today &&
        Number(request.from.slice(0, 4)) <= year + 1,
    )
    .sort((a, b) => a.from.localeCompare(b.from))
    .slice(0, 4);
}
