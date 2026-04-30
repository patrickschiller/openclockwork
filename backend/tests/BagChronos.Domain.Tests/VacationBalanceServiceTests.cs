using BagChronos.Domain.Entities;
using BagChronos.Domain.Enums;
using BagChronos.Domain.Services;
using FluentAssertions;
using Xunit;

namespace BagChronos.Domain.Tests;

public class VacationBalanceServiceTests
{
    private static EmployeeLeaveAllowance Allowance(int year, decimal baseDays, decimal carry = 0, decimal adj = 0) => new()
    {
        EmployeeId = Guid.NewGuid(),
        Year = year,
        BaseDays = baseDays,
        CarryOverDays = carry,
        AdjustmentDays = adj
    };

    private static Request VacationReq(DateTimeOffset from, DateTimeOffset to, WorkflowState state, decimal? calculated = null) => new()
    {
        EmployeeId = Guid.NewGuid(),
        Type = RequestType.Vacation,
        From = from,
        To = to,
        WorkflowState = state,
        Status = state == WorkflowState.Approved ? RequestStatus.Approved
              : state == WorkflowState.Rejected ? RequestStatus.Rejected
              : RequestStatus.Submitted,
        CalculatedDays = calculated ?? 0m
    };

    [Fact]
    public void Compute_NoRequests_RemainingEqualsTotal()
    {
        var allowance = Allowance(2026, 30);
        var balance = VacationBalanceService.Compute(2026, allowance, Array.Empty<Request>());

        balance.TotalEntitlement.Should().Be(30);
        balance.ApprovedDays.Should().Be(0);
        balance.PendingDays.Should().Be(0);
        balance.RemainingDays.Should().Be(30);
    }

    [Fact]
    public void Compute_ApprovedAndPending_AreSeparated()
    {
        var allowance = Allowance(2026, 30, carry: 5);
        var holidays = LeaveCalculator.GermanHolidaysNrw(2026);

        var approved = VacationReq(
            new DateTimeOffset(2026, 6, 1, 0, 0, 0, TimeSpan.Zero),
            new DateTimeOffset(2026, 6, 5, 0, 0, 0, TimeSpan.Zero),
            WorkflowState.Approved,
            calculated: 5m);

        var pending = VacationReq(
            new DateTimeOffset(2026, 7, 6, 0, 0, 0, TimeSpan.Zero),
            new DateTimeOffset(2026, 7, 10, 0, 0, 0, TimeSpan.Zero),
            WorkflowState.PendingManager,
            calculated: 5m);

        var rejected = VacationReq(
            new DateTimeOffset(2026, 8, 3, 0, 0, 0, TimeSpan.Zero),
            new DateTimeOffset(2026, 8, 7, 0, 0, 0, TimeSpan.Zero),
            WorkflowState.Rejected,
            calculated: 5m);

        var balance = VacationBalanceService.Compute(2026, allowance, new[] { approved, pending, rejected }, holidays);

        balance.TotalEntitlement.Should().Be(35);
        balance.ApprovedDays.Should().Be(5);
        balance.PendingDays.Should().Be(5);
        balance.RemainingDays.Should().Be(25);
    }

    [Fact]
    public void Compute_NonVacationRequests_AreIgnored()
    {
        var allowance = Allowance(2026, 30);
        var homeOffice = new Request
        {
            EmployeeId = Guid.NewGuid(),
            Type = RequestType.HomeOffice,
            From = new DateTimeOffset(2026, 6, 1, 0, 0, 0, TimeSpan.Zero),
            To = new DateTimeOffset(2026, 6, 5, 0, 0, 0, TimeSpan.Zero),
            WorkflowState = WorkflowState.Approved,
            CalculatedDays = 5m
        };

        var balance = VacationBalanceService.Compute(2026, allowance, new[] { homeOffice });
        balance.ApprovedDays.Should().Be(0);
        balance.RemainingDays.Should().Be(30);
    }

    [Fact]
    public void Compute_RequestSpanningYearBoundary_ClipsToYear()
    {
        var allowance = Allowance(2026, 30);
        // Mon 2025-12-29..Fri 2026-01-02 → working days 2025: Dec 29,30,31 = 3; 2026: Jan 2 = 1 (Jan 1 is Neujahr).
        var spanning = VacationReq(
            new DateTimeOffset(2025, 12, 29, 0, 0, 0, TimeSpan.Zero),
            new DateTimeOffset(2026, 1, 2, 0, 0, 0, TimeSpan.Zero),
            WorkflowState.Approved);

        var holidays = LeaveCalculator.GermanHolidaysNrw(2026);
        var balance = VacationBalanceService.Compute(2026, allowance, new[] { spanning }, holidays);

        balance.ApprovedDays.Should().Be(1);
        balance.RemainingDays.Should().Be(29);
    }

    [Fact]
    public void Compute_NoAllowance_TreatsTotalAsZero()
    {
        var balance = VacationBalanceService.Compute(2026, allowance: null, Array.Empty<Request>());
        balance.TotalEntitlement.Should().Be(0);
        balance.RemainingDays.Should().Be(0);
    }

    [Fact]
    public void Compute_FallsBackToWorkingDays_WhenCalculatedDaysIsZero()
    {
        var allowance = Allowance(2026, 30);
        // Mon 2026-06-01 .. Fri 2026-06-05 = 5 working days, no holidays.
        var req = VacationReq(
            new DateTimeOffset(2026, 6, 1, 0, 0, 0, TimeSpan.Zero),
            new DateTimeOffset(2026, 6, 5, 0, 0, 0, TimeSpan.Zero),
            WorkflowState.Approved,
            calculated: 0m);

        var balance = VacationBalanceService.Compute(2026, allowance, new[] { req });
        balance.ApprovedDays.Should().Be(5);
    }
}
