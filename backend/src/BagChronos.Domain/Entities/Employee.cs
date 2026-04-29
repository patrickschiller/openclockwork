using BagChronos.Domain.Enums;

namespace BagChronos.Domain.Entities;

public class Employee
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string PersonalNo { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public Role Role { get; set; } = Role.Employee;
    public TimeModel TimeModel { get; set; } = TimeModel.Vollzeit;

    public decimal WeeklyHours { get; set; } = 40m;
    public int AnnualLeaveDays { get; set; } = 30;

    public Guid? ManagerId { get; set; }
    public Employee? Manager { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public bool IsActive { get; set; } = true;
}
