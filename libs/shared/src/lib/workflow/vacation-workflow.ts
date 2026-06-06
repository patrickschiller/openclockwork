export type WorkflowState =
  | 'Draft'
  | 'Submitted'
  | 'PendingSubstitute'
  | 'PendingManager'
  | 'PendingHr'
  | 'Approved'
  | 'Rejected'
  | 'Cancelled';

export type WorkflowEvent =
  | 'submit'
  | 'substitute_accept'
  | 'substitute_decline'
  | 'manager_approve'
  | 'manager_approve_with_hr'
  | 'manager_reject'
  | 'manager_return'
  | 'hr_confirm'
  | 'hr_reject'
  | 'cancel';

export class InvalidWorkflowTransitionError extends Error {
  readonly state: WorkflowState;
  readonly event: WorkflowEvent;
  constructor(state: WorkflowState, event: WorkflowEvent) {
    super(`Invalid workflow transition: cannot apply "${event}" in state "${state}"`);
    this.name = 'InvalidWorkflowTransitionError';
    this.state = state;
    this.event = event;
  }
}

export interface TransitionContext {
  hasSubstitute: boolean;
}

const FINAL_STATES: ReadonlySet<WorkflowState> = new Set(['Approved', 'Rejected', 'Cancelled']);

export function isFinal(state: WorkflowState): boolean {
  return FINAL_STATES.has(state);
}

export function nextState(
  state: WorkflowState,
  event: WorkflowEvent,
  ctx: TransitionContext = { hasSubstitute: false },
): WorkflowState {
  if (event === 'cancel') {
    if (isFinal(state)) throw new InvalidWorkflowTransitionError(state, event);
    return 'Cancelled';
  }

  switch (state) {
    case 'Draft':
    case 'Submitted':
      if (event === 'submit') {
        return ctx.hasSubstitute ? 'PendingSubstitute' : 'PendingManager';
      }
      break;
    case 'PendingSubstitute':
      if (event === 'substitute_accept') return 'PendingManager';
      if (event === 'substitute_decline') return 'Draft';
      break;
    case 'PendingManager':
      if (event === 'manager_approve') return 'Approved';
      if (event === 'manager_approve_with_hr') return 'PendingHr';
      if (event === 'manager_reject') return 'Rejected';
      if (event === 'manager_return') return 'Draft';
      break;
    case 'PendingHr':
      if (event === 'hr_confirm') return 'Approved';
      if (event === 'hr_reject') return 'Rejected';
      break;
    case 'Approved':
    case 'Rejected':
    case 'Cancelled':
      break;
  }
  throw new InvalidWorkflowTransitionError(state, event);
}

export type RequestStatus = 'Submitted' | 'Approved' | 'Rejected' | 'Cancelled';

export function deriveStatus(state: WorkflowState): RequestStatus {
  if (state === 'Approved') return 'Approved';
  if (state === 'Rejected') return 'Rejected';
  if (state === 'Cancelled') return 'Cancelled';
  return 'Submitted';
}
