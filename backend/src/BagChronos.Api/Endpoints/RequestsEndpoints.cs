using BagChronos.Domain.Entities;
using BagChronos.Domain.Enums;
using BagChronos.Domain.Services;
using BagChronos.Infrastructure.Notifications;
using BagChronos.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BagChronos.Api.Endpoints;

public static class RequestsEndpoints
{
    public static IEndpointRouteBuilder MapRequestsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/requests").WithTags("Requests");

        group.MapPost("/", CreateAsync).WithName("CreateRequest").WithOpenApi();
        group.MapGet("/", ListAsync).WithName("ListRequests").WithOpenApi();
        group.MapPost("/{id:guid}/approve", ApproveAsync).WithName("ApproveRequest").WithOpenApi();
        group.MapPost("/{id:guid}/reject", RejectAsync).WithName("RejectRequest").WithOpenApi();

        return app;
    }

    private static async Task<IResult> CreateAsync(
        CreateRequestDto dto,
        BagChronosDbContext db,
        IRequestNotificationService notifications,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        if (!Enum.TryParse<RequestType>(dto.Type, ignoreCase: true, out var type))
        {
            return Results.BadRequest(new { error = $"Unknown request type '{dto.Type}'." });
        }

        if (dto.To < dto.From)
        {
            return Results.BadRequest(new { error = "'to' must not be before 'from'." });
        }

        var employeeExists = await db.Employees
            .AnyAsync(e => e.Id == dto.EmployeeId, cancellationToken);

        if (!employeeExists)
        {
            return Results.NotFound(new { error = "Employee not found." });
        }

        var request = new Request
        {
            EmployeeId = dto.EmployeeId,
            Type = type,
            Status = RequestStatus.Submitted,
            From = dto.From,
            To = dto.To,
            Reason = dto.Reason,
            RequiresApproval = RequestRules.RequiresSpecialApproval(type, dto.From, dto.To),
            CreatedAt = clock.GetUtcNow()
        };

        db.Requests.Add(request);
        await db.SaveChangesAsync(cancellationToken);

        await notifications.NotifySubmittedAsync(request, cancellationToken);

        return Results.Created($"/api/requests/{request.Id}", Map(request));
    }

    private static async Task<IResult> ListAsync(
        BagChronosDbContext db,
        CancellationToken cancellationToken,
        [FromQuery] Guid? employeeId = null,
        [FromQuery] string? status = null,
        [FromQuery] Guid? approverId = null)
    {
        var query = db.Requests.AsNoTracking().AsQueryable();

        if (employeeId is not null) query = query.Where(r => r.EmployeeId == employeeId);
        if (approverId is not null) query = query.Where(r => r.ApproverId == approverId);

        if (status is not null)
        {
            if (!Enum.TryParse<RequestStatus>(status, ignoreCase: true, out var parsed))
            {
                return Results.BadRequest(new { error = $"Unknown status '{status}'." });
            }
            query = query.Where(r => r.Status == parsed);
        }

        var rows = await query
            .OrderByDescending(r => r.CreatedAt)
            .ToListAsync(cancellationToken);

        return Results.Ok(rows.Select(Map));
    }

    private static async Task<IResult> ApproveAsync(
        Guid id,
        DecideRequestDto dto,
        BagChronosDbContext db,
        IRequestNotificationService notifications,
        TimeProvider clock,
        CancellationToken cancellationToken)
        => await DecideAsync(id, dto, decision: true, db, notifications, clock, cancellationToken);

    private static async Task<IResult> RejectAsync(
        Guid id,
        DecideRequestDto dto,
        BagChronosDbContext db,
        IRequestNotificationService notifications,
        TimeProvider clock,
        CancellationToken cancellationToken)
        => await DecideAsync(id, dto, decision: false, db, notifications, clock, cancellationToken);

    private static async Task<IResult> DecideAsync(
        Guid id,
        DecideRequestDto dto,
        bool decision,
        BagChronosDbContext db,
        IRequestNotificationService notifications,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        var request = await db.Requests
            .FirstOrDefaultAsync(r => r.Id == id, cancellationToken);

        if (request is null)
        {
            return Results.NotFound(new { error = "Request not found." });
        }

        var approver = await db.Employees
            .FirstOrDefaultAsync(e => e.Id == dto.ApproverId, cancellationToken);

        if (approver is null)
        {
            return Results.BadRequest(new { error = "Approver not found." });
        }

        if (approver.Role != Role.Manager && approver.Role != Role.HRAdmin)
        {
            return Results.Json(
                new { error = "Approver must be a Manager or HRAdmin." },
                statusCode: StatusCodes.Status403Forbidden);
        }

        try
        {
            if (decision)
            {
                RequestStateMachine.Approve(request, dto.ApproverId, clock.GetUtcNow(), dto.Note);
            }
            else
            {
                RequestStateMachine.Reject(request, dto.ApproverId, clock.GetUtcNow(), dto.Note);
            }
        }
        catch (InvalidOperationException ex)
        {
            return Results.Conflict(new { error = ex.Message });
        }

        await db.SaveChangesAsync(cancellationToken);
        await notifications.NotifyDecidedAsync(request, cancellationToken);

        return Results.Ok(Map(request));
    }

    private static RequestDto Map(Request r) => new(
        r.Id,
        r.EmployeeId,
        r.Type.ToString(),
        r.Status.ToString(),
        r.From,
        r.To,
        r.Reason,
        r.RequiresApproval,
        r.ApproverId,
        r.DecidedAt,
        r.DecisionNote,
        r.CreatedAt);
}

public record CreateRequestDto(Guid EmployeeId, string Type, DateTimeOffset From, DateTimeOffset To, string? Reason);

public record DecideRequestDto(Guid ApproverId, string? Note);

public record RequestDto(
    Guid Id,
    Guid EmployeeId,
    string Type,
    string Status,
    DateTimeOffset From,
    DateTimeOffset To,
    string? Reason,
    bool RequiresApproval,
    Guid? ApproverId,
    DateTimeOffset? DecidedAt,
    string? DecisionNote,
    DateTimeOffset CreatedAt);
