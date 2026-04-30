using BagChronos.Domain.Enums;
using BagChronos.Domain.Services;
using BagChronos.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BagChronos.Api.Endpoints;

public static class AccountsEndpoints
{
    public static IEndpointRouteBuilder MapAccountsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/accounts").WithTags("Accounts");

        group.MapGet("/{employeeId:guid}", GetAsync).WithName("GetAccount").WithOpenApi();
        group.MapGet("/{employeeId:guid}/vacation", GetVacationAsync).WithName("GetVacationBalance").WithOpenApi();

        return app;
    }

    private static async Task<IResult> GetVacationAsync(
        Guid employeeId,
        BagChronosDbContext db,
        TimeProvider clock,
        CancellationToken cancellationToken,
        [FromQuery] int? year = null)
    {
        var employeeExists = await db.Employees.AnyAsync(e => e.Id == employeeId, cancellationToken);
        if (!employeeExists) return Results.NotFound();

        var targetYear = year ?? clock.GetUtcNow().Year;

        var allowance = await db.EmployeeLeaveAllowances
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.EmployeeId == employeeId && a.Year == targetYear, cancellationToken);

        var yearStart = new DateTimeOffset(targetYear, 1, 1, 0, 0, 0, TimeSpan.Zero);
        var yearEnd = new DateTimeOffset(targetYear, 12, 31, 23, 59, 59, TimeSpan.Zero);

        var requests = await db.Requests
            .AsNoTracking()
            .Where(r => r.EmployeeId == employeeId
                        && r.Type == RequestType.Vacation
                        && r.From <= yearEnd
                        && r.To >= yearStart)
            .ToListAsync(cancellationToken);

        var balance = VacationBalanceService.Compute(
            targetYear,
            allowance,
            requests,
            LeaveCalculator.GermanHolidaysNrw(targetYear));

        return Results.Ok(new VacationBalanceDto(
            employeeId,
            balance.Year,
            balance.BaseDays,
            balance.CarryOverDays,
            balance.AdjustmentDays,
            balance.TotalEntitlement,
            balance.ApprovedDays,
            balance.PendingDays,
            balance.RemainingDays,
            allowance?.CarryOverExpiresOn,
            allowance?.AdjustmentReason));
    }

    private static async Task<IResult> GetAsync(
        Guid employeeId,
        BagChronosDbContext db,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        var employee = await db.Employees
            .AsNoTracking()
            .FirstOrDefaultAsync(e => e.Id == employeeId, cancellationToken);

        if (employee is null)
        {
            return Results.NotFound();
        }

        var now = clock.GetUtcNow();
        var yearStart = new DateTimeOffset(now.Year, 1, 1, 0, 0, 0, TimeSpan.Zero);

        var closedEntries = await db.TimeEntries
            .AsNoTracking()
            .Where(t => t.EmployeeId == employeeId && t.ClockOut != null && t.ClockIn >= yearStart)
            .Select(t => new { t.ClockIn, ClockOut = t.ClockOut!.Value })
            .ToListAsync(cancellationToken);

        var netMinutes = closedEntries
            .Select(e => WorkTimeCalculator.CalculateNet(e.ClockOut - e.ClockIn).TotalMinutes)
            .Sum();

        var workingDaysToToday = CountWorkingDays(yearStart, now);
        var dailyTargetMinutes = (double)employee.WeeklyHours / 5d * 60d;
        var targetMinutes = workingDaysToToday * dailyTargetMinutes;
        var overtimeMinutes = (int)Math.Round(netMinutes - targetMinutes);

        var approvedVacations = await db.Requests
            .AsNoTracking()
            .Where(r => r.EmployeeId == employeeId
                        && r.Type == RequestType.Vacation
                        && r.Status == RequestStatus.Approved
                        && r.From >= yearStart)
            .Select(r => new { r.From, r.To })
            .ToListAsync(cancellationToken);

        var approvedVacationDays = approvedVacations
            .Sum(r => (int)(r.To.Date - r.From.Date).TotalDays + 1);

        var vacationRemaining = employee.AnnualLeaveDays - approvedVacationDays;

        return Results.Ok(new AccountDto(
            EmployeeId: employeeId,
            OvertimeMinutes: overtimeMinutes,
            VacationDaysTotal: employee.AnnualLeaveDays,
            VacationDaysUsed: approvedVacationDays,
            VacationDaysRemaining: vacationRemaining,
            AsOf: now));
    }

    private static int CountWorkingDays(DateTimeOffset from, DateTimeOffset to)
    {
        var days = 0;
        for (var d = from.Date; d < to.Date; d = d.AddDays(1))
        {
            if (d.DayOfWeek != DayOfWeek.Saturday && d.DayOfWeek != DayOfWeek.Sunday)
            {
                days++;
            }
        }
        return days;
    }
}

public record AccountDto(
    Guid EmployeeId,
    int OvertimeMinutes,
    int VacationDaysTotal,
    int VacationDaysUsed,
    int VacationDaysRemaining,
    DateTimeOffset AsOf);

public record VacationBalanceDto(
    Guid EmployeeId,
    int Year,
    decimal BaseDays,
    decimal CarryOverDays,
    decimal AdjustmentDays,
    decimal TotalEntitlement,
    decimal ApprovedDays,
    decimal PendingDays,
    decimal RemainingDays,
    DateTimeOffset? CarryOverExpiresOn,
    string? AdjustmentReason);
