using BagChronos.Domain.Entities;
using BagChronos.Domain.Enums;
using Microsoft.Extensions.Logging;

namespace BagChronos.Infrastructure.Notifications;

public sealed class NoOpRequestNotificationService(ILogger<NoOpRequestNotificationService> logger)
    : IRequestNotificationService
{
    public Task NotifySubmittedAsync(Request request, CancellationToken cancellationToken = default)
    {
        logger.LogInformation(
            "Request submitted: {RequestId} ({Type}) for employee {EmployeeId}, requiresApproval={RequiresApproval}",
            request.Id, request.Type, request.EmployeeId, request.RequiresApproval);
        return Task.CompletedTask;
    }

    public Task NotifyDecidedAsync(Request request, CancellationToken cancellationToken = default)
    {
        logger.LogInformation(
            "Request decided: {RequestId} ({Type}) -> {Status} by {ApproverId}",
            request.Id, request.Type, request.Status, request.ApproverId);
        return Task.CompletedTask;
    }

    public Task NotifyWorkflowTransitionAsync(Request request, RequestEventKind kind, CancellationToken cancellationToken = default)
    {
        logger.LogInformation(
            "Workflow transition: {RequestId} ({Type}) -> {WorkflowState} via {Kind}",
            request.Id, request.Type, request.WorkflowState, kind);
        return Task.CompletedTask;
    }
}
