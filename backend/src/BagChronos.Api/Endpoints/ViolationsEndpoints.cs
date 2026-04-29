using BagChronos.Domain.Services;
using BagChronos.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BagChronos.Api.Endpoints;

public static class ViolationsEndpoints
{
    public static IEndpointRouteBuilder MapViolationsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/violations").WithTags("Violations");

        group.MapGet("/", ListAsync).WithName("ListCoreTimeViolations").WithOpenApi();

        return app;
    }

    private static async Task<IResult> ListAsync(
        Guid employeeId,
        DateTimeOffset? from,
        DateTimeOffset? to,
        BagChronosDbContext db,
        CancellationToken cancellationToken)
    {
        var employee = await db.Employees
            .AsNoTracking()
            .FirstOrDefaultAsync(e => e.Id == employeeId, cancellationToken);

        if (employee is null)
        {
            return Results.NotFound(new { error = "Employee not found." });
        }

        var query = db.TimeEntries
            .AsNoTracking()
            .Where(t => t.EmployeeId == employeeId && t.ClockOut != null);

        if (from is not null) query = query.Where(t => t.ClockIn >= from);
        if (to is not null) query = query.Where(t => t.ClockIn < to);

        var entries = await query
            .OrderBy(t => t.ClockIn)
            .ToListAsync(cancellationToken);

        var violations = entries
            .SelectMany(e => CoreTimeViolationDetector.Detect(e, employee))
            .Select(v => new ViolationDto(
                v.TimeEntryId,
                v.EmployeeId,
                v.Kind.ToString(),
                v.Boundary,
                (int)v.Delta.TotalMinutes))
            .ToList();

        return Results.Ok(violations);
    }
}

public record ViolationDto(
    Guid TimeEntryId,
    Guid EmployeeId,
    string Kind,
    DateTimeOffset Boundary,
    int DeltaMinutes);
