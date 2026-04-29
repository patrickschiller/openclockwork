using BagChronos.Domain.Entities;

namespace BagChronos.Infrastructure.Notifications;

public interface IRequestNotificationService
{
    Task NotifySubmittedAsync(Request request, CancellationToken cancellationToken = default);

    Task NotifyDecidedAsync(Request request, CancellationToken cancellationToken = default);
}
