using BagChronos.Domain.Enums;

namespace BagChronos.Domain.Entities;

public class Request
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid EmployeeId { get; set; }
    public Employee? Employee { get; set; }

    public RequestType Type { get; set; }
    public RequestStatus Status { get; set; } = RequestStatus.Submitted;
    public WorkflowState WorkflowState { get; set; } = WorkflowState.Submitted;

    public DateTimeOffset From { get; set; }
    public DateTimeOffset To { get; set; }

    public string? Reason { get; set; }
    public bool RequiresApproval { get; set; }

    public Guid? CurrentApproverId { get; set; }
    public Employee? CurrentApprover { get; set; }

    public Guid? SubstituteId { get; set; }
    public Employee? Substitute { get; set; }
    public DateTimeOffset? SubstituteAcceptedAt { get; set; }

    public DateTimeOffset? HrConfirmedAt { get; set; }
    public DateTimeOffset? CancelledAt { get; set; }

    public decimal CalculatedDays { get; set; }

    public Guid? ApproverId { get; set; }
    public Employee? Approver { get; set; }
    public DateTimeOffset? DecidedAt { get; set; }
    public string? DecisionNote { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
