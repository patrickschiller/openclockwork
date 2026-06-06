import { describe, expect, it } from 'vitest';
import {
  deriveStatus,
  InvalidWorkflowTransitionError,
  isFinal,
  nextState,
} from './vacation-workflow.js';

describe('vacation workflow', () => {
  it('Submit without substitute → PendingManager', () => {
    expect(nextState('Submitted', 'submit', { hasSubstitute: false })).toBe('PendingManager');
  });
  it('Submit with substitute → PendingSubstitute', () => {
    expect(nextState('Submitted', 'submit', { hasSubstitute: true })).toBe('PendingSubstitute');
  });
  it('Substitute accept → PendingManager', () => {
    expect(nextState('PendingSubstitute', 'substitute_accept')).toBe('PendingManager');
  });
  it('Substitute decline → Draft', () => {
    expect(nextState('PendingSubstitute', 'substitute_decline')).toBe('Draft');
  });
  it('Manager approve (no HR) → Approved', () => {
    expect(nextState('PendingManager', 'manager_approve')).toBe('Approved');
  });
  it('Manager approve (with HR) → PendingHr', () => {
    expect(nextState('PendingManager', 'manager_approve_with_hr')).toBe('PendingHr');
  });
  it('HR confirm → Approved', () => {
    expect(nextState('PendingHr', 'hr_confirm')).toBe('Approved');
  });
  it('HR reject → Rejected', () => {
    expect(nextState('PendingHr', 'hr_reject')).toBe('Rejected');
  });
  it('Cancel from PendingManager → Cancelled', () => {
    expect(nextState('PendingManager', 'cancel')).toBe('Cancelled');
  });
  it('Cannot cancel a final state', () => {
    expect(() => nextState('Approved', 'cancel')).toThrow(InvalidWorkflowTransitionError);
  });
  it('Invalid transitions throw', () => {
    expect(() => nextState('PendingManager', 'substitute_accept')).toThrow(InvalidWorkflowTransitionError);
  });
  it('isFinal recognises terminal states', () => {
    expect(isFinal('Approved')).toBe(true);
    expect(isFinal('Rejected')).toBe(true);
    expect(isFinal('Cancelled')).toBe(true);
    expect(isFinal('PendingManager')).toBe(false);
  });
  it('deriveStatus collapses to display status', () => {
    expect(deriveStatus('PendingManager')).toBe('Submitted');
    expect(deriveStatus('Approved')).toBe('Approved');
    expect(deriveStatus('Rejected')).toBe('Rejected');
    expect(deriveStatus('Cancelled')).toBe('Cancelled');
  });
});
