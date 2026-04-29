using BagChronos.Domain.Enums;
using BagChronos.Domain.Services;
using BagChronos.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BagChronos.Api.Endpoints;

public static class AccountsEndpoints
{
    public static IEndpointRouteBuilder MapAccountsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/accounts").WithTags("Accounts");

        group.MapGet("/{employeeId:guid}", GetAsync).WithName("GetAccount").WithOpenApi();

        return app;
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
