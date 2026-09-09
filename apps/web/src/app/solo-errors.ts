import { ApiError } from '../api/client';

// Exact API messages are used until each endpoint exposes a stable error code.
// Unknown errors retain their original detail instead of guessing a cause.
const messageKeys: Record<string, string> = {
  'Finish or reassign the running timer before archiving this customer':
    'solo.error.activeTimerArchive',
  'Finish or reassign the running timer before archiving this project':
    'solo.error.activeTimerArchive',
  'Finish or reassign the running timer before archiving this service order':
    'solo.error.activeTimerArchive',
  'Time interval overlaps an existing entry': 'solo.error.timeOverlap',
  'clockOut must be after clockIn': 'solo.error.invalidEnd',
  'Clock-out must be after clock-in': 'solo.error.invalidEnd',
  'from must be before to': 'solo.error.invalidEnd',
  'Time entry changed; reload before editing': 'solo.error.staleRevision',
  'Settings changed; reload before saving': 'solo.error.staleRevision',
  'Settings changed; reload before switching mode': 'solo.error.staleRevision',
  'Installation changed concurrently; reload before switching mode':
    'solo.error.staleRevision',
  'Personal day changed; reload before editing': 'solo.error.staleRevision',
  'Personal day changed; reload before cancelling': 'solo.error.staleRevision',
  'The running timer changed; reload before stopping':
    'solo.error.staleRevision',
  'Operating mode changed; reload before booking': 'solo.error.staleRevision',
  'Personal rules changed; reload before booking': 'solo.error.staleRevision',
  'Project customer changed; reload before booking': 'solo.error.staleRevision',
  'Time entries changed; reload before booking the range':
    'solo.error.staleRevision',
  'Today already has recorded work; choose a future effective date':
    'solo.error.todayRecordedFutureDate',
  'No open time entry to close': 'solo.error.timerAlreadyStopped',
  'Time entry was already closed': 'solo.error.timerAlreadyStopped',
  'There is already an open time entry — clock out first':
    'solo.error.timerAlreadyRunning',
  'Working time cannot be booked in the future': 'solo.error.futureTime',
  'Policies cannot be changed retroactively': 'solo.error.retroactivePolicy',
  'Personal days must not overlap': 'solo.error.dayOverlap',
  'This range overlaps existing historical time off': 'solo.error.dayOverlap',
  'Invalid personal day range': 'solo.error.invalidDayRange',
  'Invalid calendar date': 'solo.error.invalidDate',
  'A booked project cannot change customer; create a new project instead':
    'solo.error.bookedProjectCustomer',
  'Customer has projects and cannot be deleted; archive it instead':
    'solo.error.referencedRecord',
  'Customer is referenced and cannot be deleted; archive it instead':
    'solo.error.referencedRecord',
  'Project has booked time entries and cannot be deleted — deactivate it instead':
    'solo.error.referencedRecord',
  'Service order has booked time entries and cannot be deleted — deactivate it instead':
    'solo.error.referencedRecord',
  'A customer with this code already exists':
    'solo.error.duplicateCustomerCode',
  'The project customer is archived': 'solo.error.archivedTarget',
  'The customer is archived': 'solo.error.archivedTarget',
  'Project or customer was archived; select an active booking target':
    'solo.error.archivedTarget',
  'Service order is no longer bookable': 'solo.error.archivedTarget',
  'A voided time entry cannot be changed': 'solo.error.voidedEntry',
  'Current password is incorrect': 'solo.error.currentPassword',
  'Password already changed; sign in again': 'solo.error.passwordChanged',
  'Email is already in use': 'solo.error.emailUsed',
};
const codeKeys: Record<string, string> = {
  DAILY_BLOCK_TIME_ENTRY_CONFLICT: 'solo.error.dailyBlockTimeConflict',
  DAILY_BLOCK_ABSENCE_CONFLICT: 'solo.error.dayOverlap',
  DAILY_BLOCK_DISABLED: 'solo.error.dailyBlockDisabled',
  DAILY_BLOCK_INVALID_DATE_TIME: 'solo.invalidTime',
  DAILY_BLOCK_AMBIGUOUS_DATE_TIME: 'solo.error.dailyBlockAmbiguous',
};

export function formatSoloActionError(
  error: unknown,
  t: (key: string) => string,
): string {
  if (error instanceof ApiError) {
    const key =
      (error.code && codeKeys[error.code]) || messageKeys[error.message];
    if (key) return t(key);
  }
  return `${t('solo.error')}${error instanceof Error && error.message ? ` ${error.message}` : ''}`;
}
