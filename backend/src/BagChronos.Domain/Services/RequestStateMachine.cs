using BagChronos.Domain.Entities;
using BagChronos.Domain.Enums;

namespace BagChronos.Domain.Services;

public static class RequestStateMachine
{
    public static void Approve(Request request, Guid approverId, DateTimeOffset decidedAt, string? note = null)
    {
        EnsureCanDecide(request);
        request.Status = RequestStatus.Approved;
        request.ApproverId = approverId;
        request.DecidedAt = decidedAt;
        request.DecisionNote = note;
    }

    public static void Reject(Request request, Guid approverId, DateTimeOffset decidedAt, string? note = null)
    {
        EnsureCanDecide(request);
        request.Status = RequestStatus.Rejected;
        request.ApproverId = approverId;
        request.DecidedAt = decidedAt;
        request.DecisionNote = note;
    }

    private static void EnsureCanDecide(Request request)
    {
        if (request.Status != RequestStatus.Submitted)
        {
            throw new InvalidOperationException(
                $"Request {request.Id} is in status '{request.Status}'. Only 'Submitted' requests can be decided.");
        }
    }
}
