using BagChronos.Domain.Entities;
using BagChronos.Domain.Enums;

namespace BagChronos.Infrastructure.Notifications;

public interface IRequestNotificationService
{
    Task NotifySubmittedAsync(Request request, CancellationToken cancellationToken = default);

    Task NotifyDecidedAsync(Request request, CancellationToken cancellationToken = default);

    Task NotifyWorkflowTransitionAsync(Request request, RequestEventKind kind, CancellationToken cancellationToken = default);
}
