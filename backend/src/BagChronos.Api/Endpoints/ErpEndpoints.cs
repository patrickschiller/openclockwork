using BagChronos.Api.Auth;
using BagChronos.Domain.Enums;
using BagChronos.Domain.Services;
using BagChronos.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;

namespace BagChronos.Api.Endpoints;

public static class ErpEndpoints
{
    public const int DefaultPageSize = 100;
    public const int MaxPageSize = 500;

    public static IEndpointRouteBuilder MapErpEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/erp")
            .WithTags("Erp")
            .RequireAuthorization(ErpAuthorizationPolicy);

        group.MapGet("/timeentries", ListApprovedAsync)
            .WithName("ErpListApprovedTimeEntries")
            .WithOpenApi();

        return app;
    }

    public const string ErpAuthorizationPolicy = "ErpClient";

    private static async Task<IResult> ListApprovedAsync(
        DateTimeOffset? from,
        DateTimeOffset? to,
        int? page,
        int? pageSize,
        BagChronosDbContext db,
        CancellationToken cancellationToken)
    {
        var requestedPage = Math.Max(page ?? 1, 1);
        var requestedSize = Math.Clamp(pageSize ?? DefaultPageSize, 1, MaxPageSize);

        var query = db.TimeEntries
            .AsNoTracking()
            .Where(t => t.Status == EntryStatus.Approved && t.ClockOut != null);

        if (from is not null)
        {
            query = query.Where(t => t.ClockIn >= from);
        }
        if (to is not null)
        {
            query = query.Where(t => t.ClockIn < to);
        }

        var total = await query.CountAsync(cancellationToken);

        var page1 = await query
            .OrderBy(t => t.ClockIn)
            .ThenBy(t => t.Id)
            .Skip((requestedPage - 1) * requestedSize)
            .Take(requestedSize)
            .Select(t => new
            {
                t.Id,
                t.EmployeeId,
                t.ClockIn,
                ClockOut = t.ClockOut!.Value
            })
            .ToListAsync(cancellationToken);

        var items = page1.Select(t =>
        {
            var summary = WorkTimeCalculator.Summarize(t.ClockOut - t.ClockIn);
            return new ErpTimeEntryDto(
                t.Id,
                t.EmployeeId,
                t.ClockIn,
                t.ClockOut,
                (int)summary.Gross.TotalMinutes,
                (int)summary.Break.TotalMinutes,
                (int)summary.Net.TotalMinutes);
        }).ToArray();

        return Results.Ok(new ErpPageDto<ErpTimeEntryDto>(
            Page: requestedPage,
            PageSize: requestedSize,
            Total: total,
            Items: items));
    }
}

public record ErpPageDto<T>(int Page, int PageSize, int Total, IReadOnlyCollection<T> Items);

public record ErpTimeEntryDto(
    Guid Id,
    Guid EmployeeId,
    DateTimeOffset ClockIn,
    DateTimeOffset ClockOut,
    int GrossMinutes,
    int BreakMinutes,
    int NetMinutes);
