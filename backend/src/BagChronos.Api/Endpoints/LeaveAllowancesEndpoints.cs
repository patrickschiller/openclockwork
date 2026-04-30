using BagChronos.Domain.Entities;
using BagChronos.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BagChronos.Api.Endpoints;

public static class LeaveAllowancesEndpoints
{
    public static IEndpointRouteBuilder MapLeaveAllowancesEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/employees/{employeeId:guid}/leave-allowances").WithTags("LeaveAllowances");

        group.MapGet("/", ListAsync).WithName("ListLeaveAllowances").WithOpenApi();
        group.MapGet("/{year:int}", GetAsync).WithName("GetLeaveAllowance").WithOpenApi();
        group.MapPut("/{year:int}", UpsertAsync).WithName("UpsertLeaveAllowance").WithOpenApi();

        return app;
    }

    private static async Task<IResult> ListAsync(
        Guid employeeId,
        BagChronosDbContext db,
        CancellationToken cancellationToken)
    {
        var employeeExists = await db.Employees.AnyAsync(e => e.Id == employeeId, cancellationToken);
        if (!employeeExists) return Results.NotFound();

        var rows = await db.EmployeeLeaveAllowances
            .AsNoTracking()
            .Where(a => a.EmployeeId == employeeId)
            .OrderByDescending(a => a.Year)
            .ToListAsync(cancellationToken);

        return Results.Ok(rows.Select(Map));
    }

    private static async Task<IResult> GetAsync(
        Guid employeeId,
        int year,
        BagChronosDbContext db,
        CancellationToken cancellationToken)
    {
        var allowance = await db.EmployeeLeaveAllowances
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.EmployeeId == employeeId && a.Year == year, cancellationToken);

        return allowance is null ? Results.NotFound() : Results.Ok(Map(allowance));
    }

    private static async Task<IResult> UpsertAsync(
        Guid employeeId,
        int year,
        UpsertLeaveAllowanceDto dto,
        BagChronosDbContext db,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        if (dto.BaseDays < 0 || dto.CarryOverDays < 0)
        {
            return Results.BadRequest(new { error = "BaseDays and CarryOverDays must be non-negative." });
        }

        var employee = await db.Employees.FirstOrDefaultAsync(e => e.Id == employeeId, cancellationToken);
        if (employee is null) return Results.NotFound(new { error = "Employee not found." });

        var allowance = await db.EmployeeLeaveAllowances
            .FirstOrDefaultAsync(a => a.EmployeeId == employeeId && a.Year == year, cancellationToken);

        var now = clock.GetUtcNow();
        if (allowance is null)
        {
            allowance = new EmployeeLeaveAllowance
            {
                EmployeeId = employeeId,
                Year = year,
                CreatedAt = now
            };
            db.EmployeeLeaveAllowances.Add(allowance);
        }

        allowance.BaseDays = dto.BaseDays;
        allowance.CarryOverDays = dto.CarryOverDays;
        allowance.CarryOverExpiresOn = dto.CarryOverExpiresOn;
        allowance.AdjustmentDays = dto.AdjustmentDays;
        allowance.AdjustmentReason = dto.AdjustmentReason;
        allowance.UpdatedAt = now;

        await db.SaveChangesAsync(cancellationToken);
        return Results.Ok(Map(allowance));
    }

    private static LeaveAllowanceDto Map(EmployeeLeaveAllowance a) => new(
        a.Id,
        a.EmployeeId,
        a.Year,
        a.BaseDays,
        a.CarryOverDays,
        a.CarryOverExpiresOn,
        a.AdjustmentDays,
        a.AdjustmentReason,
        a.BaseDays + a.CarryOverDays + a.AdjustmentDays,
        a.UpdatedAt);
}

public record UpsertLeaveAllowanceDto(
    decimal BaseDays,
    decimal CarryOverDays,
    DateTimeOffset? CarryOverExpiresOn,
    decimal AdjustmentDays,
    string? AdjustmentReason);

public record LeaveAllowanceDto(
    Guid Id,
    Guid EmployeeId,
    int Year,
    decimal BaseDays,
    decimal CarryOverDays,
    DateTimeOffset? CarryOverExpiresOn,
    decimal AdjustmentDays,
    string? AdjustmentReason,
    decimal TotalDays,
    DateTimeOffset UpdatedAt);
