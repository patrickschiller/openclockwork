using BagChronos.Domain.Enums;

namespace BagChronos.Domain.Entities;

public class Request
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid EmployeeId { get; set; }
    public Employee? Employee { get; set; }

    public RequestType Type { get; set; }
    public RequestStatus Status { get; set; } = RequestStatus.Submitted;

    public DateTimeOffset From { get; set; }
    public DateTimeOffset To { get; set; }

    public string? Reason { get; set; }
    public bool RequiresApproval { get; set; }

    public Guid? ApproverId { get; set; }
    public Employee? Approver { get; set; }
    public DateTimeOffset? DecidedAt { get; set; }
    public string? DecisionNote { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
