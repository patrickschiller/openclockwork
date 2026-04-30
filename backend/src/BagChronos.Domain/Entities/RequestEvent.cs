using BagChronos.Domain.Enums;

namespace BagChronos.Domain.Entities;

public class RequestEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid RequestId { get; set; }
    public Request? Request { get; set; }

    public DateTimeOffset At { get; set; } = DateTimeOffset.UtcNow;
    public Guid ActorId { get; set; }
    public RequestEventKind Kind { get; set; }
    public string? Note { get; set; }
}
