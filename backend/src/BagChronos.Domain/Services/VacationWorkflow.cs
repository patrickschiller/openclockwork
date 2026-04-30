using BagChronos.Domain.Entities;
using BagChronos.Domain.Enums;

namespace BagChronos.Domain.Services;

/// <summary>
/// State machine for vacation (and other Epic-4 workflowed) requests.
/// Allowed transitions:
///   Draft               → Submitted | Cancelled
///   Submitted           → PendingSubstitute | PendingManager | Cancelled
///   PendingSubstitute   → PendingManager | ReturnedForRevision | Cancelled
///   PendingManager      → PendingHr | Approved | Rejected | ReturnedForRevision
///   PendingHr           → Approved | Rejected
///   ReturnedForRevision → Submitted (resubmit) | Cancelled
///   Approved | Rejected | Cancelled → terminal (Approved/Cancelled may transition to Cancelled if before start)
/// </summary>
public static class VacationWorkflow
{
    public static void Submit(Request request, Guid actorId, DateTimeOffset at)
    {
        EnsureState(request, WorkflowState.Draft, WorkflowState.ReturnedForRevision);
        request.WorkflowState = request.SubstituteId is not null
            ? WorkflowState.PendingSubstitute
            : WorkflowState.PendingManager;
        request.Status = RequestStatus.Submitted;
        SyncDerived(request, at);
    }

    public static void AcceptSubstitute(Request request, Guid actorId, DateTimeOffset at)
    {
        EnsureState(request, WorkflowState.PendingSubstitute);
        EnsureActor(request.SubstituteId, actorId, "substitute");
        request.SubstituteAcceptedAt = at;
        request.WorkflowState = WorkflowState.PendingManager;
        SyncDerived(request, at);
    }

    public static void DeclineSubstitute(Request request, Guid actorId, DateTimeOffset at, string note)
    {
        EnsureState(request, WorkflowState.PendingSubstitute);
        EnsureActor(request.SubstituteId, actorId, "substitute");
        if (string.IsNullOrWhiteSpace(note))
        {
            throw new InvalidOperationException("A note is required when a substitute declines.");
        }
        request.WorkflowState = WorkflowState.ReturnedForRevision;
        request.Status = RequestStatus.Submitted;
        request.DecisionNote = note;
        SyncDerived(request, at);
    }

    public static void ManagerApprove(Request request, Guid managerId, DateTimeOffset at, string? note = null, bool requiresHrConfirmation = false)
    {
        EnsureState(request, WorkflowState.PendingManager);
        request.ApproverId = managerId;
        request.DecisionNote = note;
        request.DecidedAt = at;
        if (requiresHrConfirmation)
        {
            request.WorkflowState = WorkflowState.PendingHr;
            request.Status = RequestStatus.Submitted;
        }
        else
        {
            request.WorkflowState = WorkflowState.Approved;
            request.Status = RequestStatus.Approved;
        }
        SyncDerived(request, at);
    }

    public static void ManagerReject(Request request, Guid managerId, DateTimeOffset at, string? note = null)
    {
        EnsureState(request, WorkflowState.PendingManager);
        request.ApproverId = managerId;
        request.DecisionNote = note;
        request.DecidedAt = at;
        request.WorkflowState = WorkflowState.Rejected;
        request.Status = RequestStatus.Rejected;
        SyncDerived(request, at);
    }

    public static void HrConfirm(Request request, Guid hrAdminId, DateTimeOffset at, string? note = null)
    {
        EnsureState(request, WorkflowState.PendingHr);
        request.HrConfirmedAt = at;
        request.DecisionNote = note ?? request.DecisionNote;
        request.WorkflowState = WorkflowState.Approved;
        request.Status = RequestStatus.Approved;
        SyncDerived(request, at);
    }

    public static void HrReject(Request request, Guid hrAdminId, DateTimeOffset at, string? note = null)
    {
        EnsureState(request, WorkflowState.PendingHr);
        request.ApproverId = hrAdminId;
        request.DecisionNote = note;
        request.DecidedAt = at;
        request.WorkflowState = WorkflowState.Rejected;
        request.Status = RequestStatus.Rejected;
        SyncDerived(request, at);
    }

    public static void ReturnForRevision(Request request, Guid managerId, DateTimeOffset at, string note)
    {
        EnsureState(request, WorkflowState.PendingManager, WorkflowState.PendingSubstitute);
        if (string.IsNullOrWhiteSpace(note))
        {
            throw new InvalidOperationException("A note is required when returning a request for revision.");
        }
        request.WorkflowState = WorkflowState.ReturnedForRevision;
        request.Status = RequestStatus.Submitted;
        request.DecisionNote = note;
        SyncDerived(request, at);
    }

    public static void Cancel(Request request, Guid actorId, DateTimeOffset at, string? note = null)
    {
        if (request.WorkflowState is WorkflowState.Cancelled or WorkflowState.Rejected)
        {
            throw new InvalidOperationException(
                $"Request {request.Id} is in terminal state '{request.WorkflowState}' and cannot be cancelled.");
        }
        if (request.WorkflowState == WorkflowState.Approved && request.From <= at)
        {
            throw new InvalidOperationException(
                "Approved requests cannot be cancelled after the start date has passed.");
        }
        request.WorkflowState = WorkflowState.Cancelled;
        request.Status = RequestStatus.Rejected;
        request.CancelledAt = at;
        request.DecisionNote = note ?? request.DecisionNote;
        SyncDerived(request, at);
    }

    public static bool IsOpen(WorkflowState state) => state is
        WorkflowState.Draft or
        WorkflowState.Submitted or
        WorkflowState.PendingSubstitute or
        WorkflowState.PendingManager or
        WorkflowState.PendingHr or
        WorkflowState.ReturnedForRevision;

    private static void EnsureState(Request request, params WorkflowState[] allowed)
    {
        if (!allowed.Contains(request.WorkflowState))
        {
            throw new InvalidOperationException(
                $"Request {request.Id} is in workflow state '{request.WorkflowState}'. Allowed: {string.Join(", ", allowed)}.");
        }
    }

    private static void EnsureActor(Guid? expectedId, Guid actorId, string role)
    {
        if (expectedId is null || expectedId.Value != actorId)
        {
            throw new InvalidOperationException($"Actor {actorId} is not the {role} for this request.");
        }
    }

    private static void SyncDerived(Request request, DateTimeOffset at)
    {
        // CurrentApproverId is purely informational (UI routing); persistence layer fills it.
        if (request.WorkflowState is WorkflowState.Approved or WorkflowState.Rejected or WorkflowState.Cancelled)
        {
            request.CurrentApproverId = null;
        }
    }
}
