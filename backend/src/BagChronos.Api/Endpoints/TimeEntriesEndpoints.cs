using BagChronos.Domain.Entities;
using BagChronos.Domain.Enums;
using BagChronos.Domain.Services;
using BagChronos.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BagChronos.Api.Endpoints;

public static class TimeEntriesEndpoints
{
    public static IEndpointRouteBuilder MapTimeEntriesEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/timeentries").WithTags("TimeEntries");

        group.MapPost("/clock-in", ClockInAsync).WithName("ClockIn").WithOpenApi();
        group.MapPost("/clock-out", ClockOutAsync).WithName("ClockOut").WithOpenApi();
        group.MapGet("/", ListAsync).WithName("ListTimeEntries").WithOpenApi();

        return app;
    }

    private static async Task<IResult> ClockInAsync(
        ClockInRequest request,
        BagChronosDbContext db,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        var employee = await db.Employees
            .FirstOrDefaultAsync(e => e.Id == request.EmployeeId, cancellationToken);

        if (employee is null)
        {
            return Results.NotFound(new { error = "Employee not found." });
        }

        var hasOpen = await db.TimeEntries
            .AnyAsync(t => t.EmployeeId == request.EmployeeId && t.ClockOut == null, cancellationToken);

        if (hasOpen)
        {
            return Results.Conflict(new { error = "Employee already has an open time entry." });
        }

        var now = clock.GetUtcNow();
        var entry = new TimeEntry
        {
            EmployeeId = request.EmployeeId,
            ClockIn = now,
            Source = EntrySource.Pwa,
            Status = EntryStatus.Open,
            GeoLatitude = request.Latitude,
            GeoLongitude = request.Longitude,
            GeoAccuracyMeters = request.AccuracyMeters,
            RequiresApproval = now.TimeOfDay < RequestApprovalRules.EarliestRegularStart
        };

        db.TimeEntries.Add(entry);
        await db.SaveChangesAsync(cancellationToken);

        return Results.Created($"/api/timeentries/{entry.Id}", Map(entry));
    }

    private static async Task<IResult> ClockOutAsync(
        ClockOutRequest request,
        BagChronosDbContext db,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        var entry = await db.TimeEntries
            .Where(t => t.EmployeeId == request.EmployeeId && t.ClockOut == null)
            .OrderByDescending(t => t.ClockIn)
            .FirstOrDefaultAsync(cancellationToken);

        if (entry is null)
        {
            return Results.NotFound(new { error = "No open time entry to close." });
        }

        var now = clock.GetUtcNow();
        entry.ClockOut = now;
        entry.Status = EntryStatus.Pending;

        if (RequestApprovalRules.RequiresSpecialApproval(entry.ClockIn, now))
        {
            entry.RequiresApproval = true;
        }

        await db.SaveChangesAsync(cancellationToken);

        return Results.Ok(Map(entry));
    }

    private static async Task<IResult> ListAsync(
        Guid employeeId,
        DateTimeOffset? from,
        DateTimeOffset? to,
        BagChronosDbContext db,
        CancellationToken cancellationToken)
    {
        var query = db.TimeEntries.AsNoTracking().Where(t => t.EmployeeId == employeeId);

        if (from is not null) query = query.Where(t => t.ClockIn >= from);
        if (to is not null) query = query.Where(t => t.ClockIn < to);

        var entries = await query
            .OrderByDescending(t => t.ClockIn)
            .ToListAsync(cancellationToken);

        return Results.Ok(entries.Select(Map));
    }

    private static TimeEntryDto Map(TimeEntry t)
    {
        TimeSummaryDto? summary = null;
        if (t.ClockOut is not null)
        {
            var s = WorkTimeCalculator.Summarize(t.ClockOut.Value - t.ClockIn);
            summary = new TimeSummaryDto(
                (int)s.Gross.TotalMinutes,
                (int)s.Break.TotalMinutes,
                (int)s.Net.TotalMinutes);
        }

        return new TimeEntryDto(
            t.Id,
            t.EmployeeId,
            t.ClockIn,
            t.ClockOut,
            t.Source.ToString(),
            t.Status.ToString(),
            t.RequiresApproval,
            t.GeoLatitude,
            t.GeoLongitude,
            t.GeoAccuracyMeters,
            summary);
    }
}

public record ClockInRequest(Guid EmployeeId, double? Latitude, double? Longitude, double? AccuracyMeters);

public record ClockOutRequest(Guid EmployeeId);

public record TimeEntryDto(
    Guid Id,
    Guid EmployeeId,
    DateTimeOffset ClockIn,
    DateTimeOffset? ClockOut,
    string Source,
    string Status,
    bool RequiresApproval,
    double? Latitude,
    double? Longitude,
    double? AccuracyMeters,
    TimeSummaryDto? Summary);

public record TimeSummaryDto(int GrossMinutes, int BreakMinutes, int NetMinutes);
