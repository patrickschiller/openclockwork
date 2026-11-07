import type { QueryClient } from '@tanstack/react-query';

/** Refresh personal and reviewer views after every proxy action or decision. */
export async function refreshTeamCockpit(qc: QueryClient) {
  await Promise.all(
    [
      'team-cockpit',
      'requests',
      'request',
      'request-events',
      'request-time-entry-audit',
      'time-entries',
      'time-adjustment-targets',
      'time-entry-approvals',
      'time-entry-approval-history',
      'account',
      'vacation-balance',
      'absences',
      'violations',
      'working-time-report',
      'project-report',
    ].map((key) => qc.invalidateQueries({ queryKey: [key] })),
  );
}
