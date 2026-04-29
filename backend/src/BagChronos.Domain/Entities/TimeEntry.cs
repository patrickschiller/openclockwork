using BagChronos.Domain.Enums;

namespace BagChronos.Domain.Entities;

public class TimeEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid EmployeeId { get; set; }
    public Employee? Employee { get; set; }

    public DateTimeOffset ClockIn { get; set; }
    public DateTimeOffset? ClockOut { get; set; }

    public EntrySource Source { get; set; } = EntrySource.Pwa;
    public EntryStatus Status { get; set; } = EntryStatus.Open;

    public double? GeoLatitude { get; set; }
    public double? GeoLongitude { get; set; }
    public double? GeoAccuracyMeters { get; set; }

    public bool RequiresApproval { get; set; }
    public string? Note { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
