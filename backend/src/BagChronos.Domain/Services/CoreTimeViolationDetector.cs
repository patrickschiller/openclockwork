using BagChronos.Domain.Entities;
using BagChronos.Domain.Enums;

namespace BagChronos.Domain.Services;

public sealed record CoreTimeRule(TimeOnly CoreStart, TimeOnly CoreEnd)
{
    public static readonly CoreTimeRule Default = new(new TimeOnly(9, 0), new TimeOnly(15, 0));
}

public enum CoreTimeViolationKind
{
    LateArrival,
    EarlyDeparture
}

public sealed record CoreTimeViolation(
    Guid TimeEntryId,
    Guid EmployeeId,
    CoreTimeViolationKind Kind,
    DateTimeOffset Boundary,
    TimeSpan Delta);

public static class CoreTimeViolationDetector
{
    public static IEnumerable<CoreTimeViolation> Detect(
        TimeEntry entry,
        Employee employee,
        CoreTimeRule? rule = null)
    {
        if (entry.ClockOut is null)
        {
            yield break;
        }

        if (employee.TimeModel == TimeModel.Vertrauensarbeitszeit)
        {
            yield break;
        }

        rule ??= CoreTimeRule.Default;

        var coreStart = new DateTimeOffset(
            entry.ClockIn.Date + rule.CoreStart.ToTimeSpan(),
            entry.ClockIn.Offset);

        var coreEnd = new DateTimeOffset(
            entry.ClockIn.Date + rule.CoreEnd.ToTimeSpan(),
            entry.ClockIn.Offset);

        if (entry.ClockIn > coreStart)
        {
            yield return new CoreTimeViolation(
                entry.Id,
                employee.Id,
                CoreTimeViolationKind.LateArrival,
                coreStart,
                entry.ClockIn - coreStart);
        }

        if (entry.ClockOut.Value < coreEnd)
        {
            yield return new CoreTimeViolation(
                entry.Id,
                employee.Id,
                CoreTimeViolationKind.EarlyDeparture,
                coreEnd,
                coreEnd - entry.ClockOut.Value);
        }
    }
}
