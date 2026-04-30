using BagChronos.Domain.Entities;
using BagChronos.Domain.Enums;

namespace BagChronos.Domain.Services;

public record VacationBalance(
    int Year,
    decimal BaseDays,
    decimal CarryOverDays,
    decimal AdjustmentDays,
    decimal TotalEntitlement,
    decimal ApprovedDays,
    decimal PendingDays,
    decimal RemainingDays);

/// <summary>
/// Computes the vacation balance for a given year from raw inputs.
/// Pure (no I/O) so it can be unit-tested without EF.
/// </summary>
public static class VacationBalanceService
{
    public static VacationBalance Compute(
        int year,
        EmployeeLeaveAllowance? allowance,
        IEnumerable<Request> vacationRequests,
        IReadOnlySet<DateOnly>? holidays = null)
    {
        var baseDays = allowance?.BaseDays ?? 0m;
        var carryOver = allowance?.CarryOverDays ?? 0m;
        var adjustment = allowance?.AdjustmentDays ?? 0m;
        var total = baseDays + carryOver + adjustment;

        var approved = 0m;
        var pending = 0m;

        foreach (var r in vacationRequests)
        {
            if (r.Type != RequestType.Vacation) continue;

            var days = r.CalculatedDays > 0
                ? r.CalculatedDays
                : LeaveCalculator.CountWorkingDays(r.From, r.To, holidays);

            var clipped = ClipToYear(days, r.From, r.To, year, holidays);

            if (r.WorkflowState == WorkflowState.Approved)
            {
                approved += clipped;
            }
            else if (VacationWorkflow.IsOpen(r.WorkflowState))
            {
                pending += clipped;
            }
        }

        var remaining = total - approved - pending;
        return new VacationBalance(year, baseDays, carryOver, adjustment, total, approved, pending, remaining);
    }

    private static decimal ClipToYear(decimal precomputed, DateTimeOffset from, DateTimeOffset to, int year, IReadOnlySet<DateOnly>? holidays)
    {
        if (from.Year == year && to.Year == year)
        {
            return precomputed;
        }
        var yearStart = new DateOnly(year, 1, 1);
        var yearEnd = new DateOnly(year, 12, 31);
        var clipFrom = DateOnly.FromDateTime(from.UtcDateTime.Date);
        var clipTo = DateOnly.FromDateTime(to.UtcDateTime.Date);
        if (clipFrom < yearStart) clipFrom = yearStart;
        if (clipTo > yearEnd) clipTo = yearEnd;
        if (clipTo < clipFrom) return 0m;
        return LeaveCalculator.CountWorkingDays(clipFrom, clipTo, holidays);
    }
}
