namespace BagChronos.Domain.Entities;

public class EmployeeLeaveAllowance
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid EmployeeId { get; set; }
    public Employee? Employee { get; set; }

    public int Year { get; set; }

    public decimal BaseDays { get; set; }
    public decimal CarryOverDays { get; set; }
    public DateTimeOffset? CarryOverExpiresOn { get; set; }
    public decimal AdjustmentDays { get; set; }
    public string? AdjustmentReason { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public decimal TotalDays => BaseDays + CarryOverDays + AdjustmentDays;
}
