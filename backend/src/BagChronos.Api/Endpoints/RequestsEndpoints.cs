using BagChronos.Domain.Entities;
using BagChronos.Domain.Enums;
using BagChronos.Domain.Services;
using BagChronos.Infrastructure.Notifications;
using BagChronos.Infrastructure.Persistence;
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
        group.MapGet("/{id:guid}", GetAsync).WithName("GetRequest").WithOpenApi();
        group.MapGet("/{id:guid}/events", GetEventsAsync).WithName("GetRequestEvents").WithOpenApi();

        // Legacy single-step approve/reject (Epic 2 contract).
        group.MapPost("/{id:guid}/approve", ApproveAsync).WithName("ApproveRequest").WithOpenApi();
        group.MapPost("/{id:guid}/reject", RejectAsync).WithName("RejectRequest").WithOpenApi();

        // Epic 4 vacation workflow.
        group.MapPost("/vacation", CreateVacationAsync).WithName("CreateVacationRequest").WithOpenApi();
        group.MapPost("/{id:guid}/submit", SubmitAsync).WithName("SubmitRequest").WithOpenApi();
        group.MapPost("/{id:guid}/substitute/accept", SubstituteAcceptAsync).WithName("SubstituteAccept").WithOpenApi();
        group.MapPost("/{id:guid}/substitute/decline", SubstituteDeclineAsync).WithName("SubstituteDecline").WithOpenApi();
        group.MapPost("/{id:guid}/manager-approve", ManagerApproveAsync).WithName("ManagerApproveRequest").WithOpenApi();
        group.MapPost("/{id:guid}/manager-reject", ManagerRejectAsync).WithName("ManagerRejectRequest").WithOpenApi();
        group.MapPost("/{id:guid}/return", ReturnAsync).WithName("ReturnRequest").WithOpenApi();
        group.MapPost("/{id:guid}/hr-confirm", HrConfirmAsync).WithName("HrConfirmRequest").WithOpenApi();
        group.MapPost("/{id:guid}/hr-reject", HrRejectAsync).WithName("HrRejectRequest").WithOpenApi();
        group.MapPost("/{id:guid}/cancel", CancelAsync).WithName("CancelRequest").WithOpenApi();

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

        var now = clock.GetUtcNow();
        var request = new Request
        {
            EmployeeId = dto.EmployeeId,
            Type = type,
            Status = RequestStatus.Submitted,
            WorkflowState = WorkflowState.PendingManager,
            From = dto.From,
            To = dto.To,
            Reason = dto.Reason,
            RequiresApproval = RequestRules.RequiresSpecialApproval(type, dto.From, dto.To),
            CreatedAt = now
        };

        await SetRoutingAsync(request, db, cancellationToken);
        db.Requests.Add(request);
        AddEvent(db, request, request.EmployeeId, RequestEventKind.Submitted, now, dto.Reason);
        await db.SaveChangesAsync(cancellationToken);

        await notifications.NotifySubmittedAsync(request, cancellationToken);

        return Results.Created($"/api/requests/{request.Id}", Map(request));
    }

    private static async Task<IResult> CreateVacationAsync(
        CreateVacationRequestDto dto,
        BagChronosDbContext db,
        IRequestNotificationService notifications,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        if (dto.To < dto.From)
        {
            return Results.BadRequest(new { error = "'to' must not be before 'from'." });
        }

        var employee = await db.Employees.FirstOrDefaultAsync(e => e.Id == dto.EmployeeId, cancellationToken);
        if (employee is null) return Results.NotFound(new { error = "Employee not found." });

        if (dto.SubstituteId is not null)
        {
            var subExists = await db.Employees.AnyAsync(e => e.Id == dto.SubstituteId.Value, cancellationToken);
            if (!subExists) return Results.BadRequest(new { error = "Substitute not found." });
            if (dto.SubstituteId == dto.EmployeeId)
            {
                return Results.BadRequest(new { error = "Substitute must be a different employee." });
            }
        }

        var now = clock.GetUtcNow();
        var holidays = LeaveCalculator.GermanHolidaysNrw(now.Year);
        var calculated = LeaveCalculator.CountWorkingDays(dto.From, dto.To, holidays);

        var balanceYear = dto.From.Year;
        var allowance = await db.EmployeeLeaveAllowances
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.EmployeeId == dto.EmployeeId && a.Year == balanceYear, cancellationToken);

        var existing = await db.Requests
            .AsNoTracking()
            .Where(r => r.EmployeeId == dto.EmployeeId && r.Type == RequestType.Vacation)
            .ToListAsync(cancellationToken);

        var balance = VacationBalanceService.Compute(balanceYear, allowance, existing, holidays);
        if (calculated > balance.RemainingDays)
        {
            return Results.BadRequest(new
            {
                error = "Insufficient vacation days remaining.",
                remaining = balance.RemainingDays,
                requested = calculated
            });
        }

        var request = new Request
        {
            EmployeeId = dto.EmployeeId,
            Type = RequestType.Vacation,
            Status = RequestStatus.Submitted,
            WorkflowState = WorkflowState.Draft,
            From = dto.From,
            To = dto.To,
            Reason = dto.Reason,
            SubstituteId = dto.SubstituteId,
            CalculatedDays = calculated,
            RequiresApproval = RequestRules.RequiresSpecialApproval(RequestType.Vacation, dto.From, dto.To),
            CreatedAt = now
        };

        VacationWorkflow.Submit(request, dto.EmployeeId, now);
        await SetRoutingAsync(request, db, cancellationToken);

        db.Requests.Add(request);
        AddEvent(db, request, dto.EmployeeId, RequestEventKind.Submitted, now, dto.Reason);
        await db.SaveChangesAsync(cancellationToken);

        await notifications.NotifySubmittedAsync(request, cancellationToken);
        await notifications.NotifyWorkflowTransitionAsync(request, RequestEventKind.Submitted, cancellationToken);

        return Results.Created($"/api/requests/{request.Id}", Map(request));
    }

    private static async Task<IResult> SubmitAsync(
        Guid id,
        ActorDto dto,
        BagChronosDbContext db,
        IRequestNotificationService notifications,
        TimeProvider clock,
        CancellationToken cancellationToken)
        => await TransitionAsync(id, db, notifications, clock, cancellationToken,
            (r, now) =>
            {
                VacationWorkflow.Submit(r, dto.ActorId, now);
                return RequestEventKind.Resubmitted;
            },
            note: dto.Note,
            actorId: dto.ActorId);

    private static async Task<IResult> SubstituteAcceptAsync(
        Guid id,
        ActorDto dto,
        BagChronosDbContext db,
        IRequestNotificationService notifications,
        TimeProvider clock,
        CancellationToken cancellationToken)
        => await TransitionAsync(id, db, notifications, clock, cancellationToken,
            (r, now) =>
            {
                VacationWorkflow.AcceptSubstitute(r, dto.ActorId, now);
                return RequestEventKind.SubstituteAccepted;
            },
            note: dto.Note,
            actorId: dto.ActorId);

    private static async Task<IResult> SubstituteDeclineAsync(
        Guid id,
        ActorWithNoteDto dto,
        BagChronosDbContext db,
        IRequestNotificationService notifications,
        TimeProvider clock,
        CancellationToken cancellationToken)
        => await TransitionAsync(id, db, notifications, clock, cancellationToken,
            (r, now) =>
            {
                VacationWorkflow.DeclineSubstitute(r, dto.ActorId, now, dto.Note);
                return RequestEventKind.SubstituteDeclined;
            },
            note: dto.Note,
            actorId: dto.ActorId);

    private static async Task<IResult> ManagerApproveAsync(
        Guid id,
        ManagerDecisionDto dto,
        BagChronosDbContext db,
        IRequestNotificationService notifications,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        var actor = await db.Employees.FirstOrDefaultAsync(e => e.Id == dto.ActorId, cancellationToken);
        if (actor is null || (actor.Role != Role.Manager && actor.Role != Role.HRAdmin))
        {
            return Results.Json(new { error = "Approver must be a Manager or HRAdmin." },
                statusCode: StatusCodes.Status403Forbidden);
        }

        return await TransitionAsync(id, db, notifications, clock, cancellationToken,
            (r, now) =>
            {
                VacationWorkflow.ManagerApprove(r, dto.ActorId, now, dto.Note, dto.RequiresHrConfirmation);
                return RequestEventKind.ManagerApproved;
            },
            note: dto.Note,
            actorId: dto.ActorId);
    }

    private static async Task<IResult> ManagerRejectAsync(
        Guid id,
        ManagerDecisionDto dto,
        BagChronosDbContext db,
        IRequestNotificationService notifications,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        var actor = await db.Employees.FirstOrDefaultAsync(e => e.Id == dto.ActorId, cancellationToken);
        if (actor is null || (actor.Role != Role.Manager && actor.Role != Role.HRAdmin))
        {
            return Results.Json(new { error = "Approver must be a Manager or HRAdmin." },
                statusCode: StatusCodes.Status403Forbidden);
        }

        return await TransitionAsync(id, db, notifications, clock, cancellationToken,
            (r, now) =>
            {
                VacationWorkflow.ManagerReject(r, dto.ActorId, now, dto.Note);
                return RequestEventKind.ManagerRejected;
            },
            note: dto.Note,
            actorId: dto.ActorId);
    }

    private static async Task<IResult> ReturnAsync(
        Guid id,
        ActorWithNoteDto dto,
        BagChronosDbContext db,
        IRequestNotificationService notifications,
        TimeProvider clock,
        CancellationToken cancellationToken)
        => await TransitionAsync(id, db, notifications, clock, cancellationToken,
            (r, now) =>
            {
                VacationWorkflow.ReturnForRevision(r, dto.ActorId, now, dto.Note);
                return RequestEventKind.ReturnedForRevision;
            },
            note: dto.Note,
            actorId: dto.ActorId);

    private static async Task<IResult> HrConfirmAsync(
        Guid id,
        ActorDto dto,
        BagChronosDbContext db,
        IRequestNotificationService notifications,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        var actor = await db.Employees.FirstOrDefaultAsync(e => e.Id == dto.ActorId, cancellationToken);
        if (actor is null || actor.Role != Role.HRAdmin)
        {
            return Results.Json(new { error = "Only HRAdmin can confirm." },
                statusCode: StatusCodes.Status403Forbidden);
        }

        return await TransitionAsync(id, db, notifications, clock, cancellationToken,
            (r, now) =>
            {
                VacationWorkflow.HrConfirm(r, dto.ActorId, now, dto.Note);
                return RequestEventKind.HrConfirmed;
            },
            note: dto.Note,
            actorId: dto.ActorId);
    }

    private static async Task<IResult> HrRejectAsync(
        Guid id,
        ActorWithNoteDto dto,
        BagChronosDbContext db,
        IRequestNotificationService notifications,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        var actor = await db.Employees.FirstOrDefaultAsync(e => e.Id == dto.ActorId, cancellationToken);
        if (actor is null || actor.Role != Role.HRAdmin)
        {
            return Results.Json(new { error = "Only HRAdmin can reject at HR stage." },
                statusCode: StatusCodes.Status403Forbidden);
        }

        return await TransitionAsync(id, db, notifications, clock, cancellationToken,
            (r, now) =>
            {
                VacationWorkflow.HrReject(r, dto.ActorId, now, dto.Note);
                return RequestEventKind.HrRejected;
            },
            note: dto.Note,
            actorId: dto.ActorId);
    }

    private static async Task<IResult> CancelAsync(
        Guid id,
        ActorDto dto,
        BagChronosDbContext db,
        IRequestNotificationService notifications,
        TimeProvider clock,
        CancellationToken cancellationToken)
        => await TransitionAsync(id, db, notifications, clock, cancellationToken,
            (r, now) =>
            {
                VacationWorkflow.Cancel(r, dto.ActorId, now, dto.Note);
                return RequestEventKind.Cancelled;
            },
            note: dto.Note,
            actorId: dto.ActorId);

    private static async Task<IResult> TransitionAsync(
        Guid id,
        BagChronosDbContext db,
        IRequestNotificationService notifications,
        TimeProvider clock,
        CancellationToken cancellationToken,
        Func<Request, DateTimeOffset, RequestEventKind> action,
        string? note,
        Guid actorId)
    {
        var request = await db.Requests.FirstOrDefaultAsync(r => r.Id == id, cancellationToken);
        if (request is null) return Results.NotFound(new { error = "Request not found." });

        var now = clock.GetUtcNow();
        RequestEventKind kind;
        try
        {
            kind = action(request, now);
        }
        catch (InvalidOperationException ex)
        {
            return Results.Conflict(new { error = ex.Message });
        }

        await SetRoutingAsync(request, db, cancellationToken);
        AddEvent(db, request, actorId, kind, now, note);
        await db.SaveChangesAsync(cancellationToken);

        await notifications.NotifyWorkflowTransitionAsync(request, kind, cancellationToken);
        if (request.WorkflowState is WorkflowState.Approved or WorkflowState.Rejected or WorkflowState.Cancelled)
        {
            await notifications.NotifyDecidedAsync(request, cancellationToken);
        }

        return Results.Ok(Map(request));
    }

    private static async Task<IResult> GetAsync(
        Guid id,
        BagChronosDbContext db,
        CancellationToken cancellationToken)
    {
        var r = await db.Requests.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
        return r is null ? Results.NotFound() : Results.Ok(Map(r));
    }

    private static async Task<IResult> GetEventsAsync(
        Guid id,
        BagChronosDbContext db,
        CancellationToken cancellationToken)
    {
        var exists = await db.Requests.AnyAsync(r => r.Id == id, cancellationToken);
        if (!exists) return Results.NotFound();

        var events = await db.RequestEvents
            .AsNoTracking()
            .Where(e => e.RequestId == id)
            .OrderBy(e => e.At)
            .Select(e => new RequestEventDto(e.Id, e.RequestId, e.At, e.ActorId, e.Kind.ToString(), e.Note))
            .ToListAsync(cancellationToken);

        return Results.Ok(events);
    }

    private static async Task<IResult> ListAsync(
        BagChronosDbContext db,
        CancellationToken cancellationToken,
        [FromQuery] Guid? employeeId = null,
        [FromQuery] string? status = null,
        [FromQuery] string? workflowState = null,
        [FromQuery] Guid? approverId = null,
        [FromQuery] Guid? currentApproverId = null,
        [FromQuery] Guid? substituteId = null)
    {
        var query = db.Requests.AsNoTracking().AsQueryable();

        if (employeeId is not null) query = query.Where(r => r.EmployeeId == employeeId);
        if (approverId is not null) query = query.Where(r => r.ApproverId == approverId);
        if (currentApproverId is not null) query = query.Where(r => r.CurrentApproverId == currentApproverId);
        if (substituteId is not null) query = query.Where(r => r.SubstituteId == substituteId);

        if (status is not null)
        {
            if (!Enum.TryParse<RequestStatus>(status, ignoreCase: true, out var parsed))
            {
                return Results.BadRequest(new { error = $"Unknown status '{status}'." });
            }
            query = query.Where(r => r.Status == parsed);
        }

        if (workflowState is not null)
        {
            if (!Enum.TryParse<WorkflowState>(workflowState, ignoreCase: true, out var parsed))
            {
                return Results.BadRequest(new { error = $"Unknown workflowState '{workflowState}'." });
            }
            query = query.Where(r => r.WorkflowState == parsed);
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

        var now = clock.GetUtcNow();
        try
        {
            // Route through the workflow when the request is in a workflow state, else fall back to legacy logic.
            if (request.WorkflowState == WorkflowState.PendingManager)
            {
                if (decision) VacationWorkflow.ManagerApprove(request, dto.ApproverId, now, dto.Note);
                else VacationWorkflow.ManagerReject(request, dto.ApproverId, now, dto.Note);
            }
            else if (request.WorkflowState == WorkflowState.PendingHr)
            {
                if (approver.Role != Role.HRAdmin)
                {
                    return Results.Json(new { error = "Only HRAdmin can decide at HR stage." },
                        statusCode: StatusCodes.Status403Forbidden);
                }
                if (decision) VacationWorkflow.HrConfirm(request, dto.ApproverId, now, dto.Note);
                else VacationWorkflow.HrReject(request, dto.ApproverId, now, dto.Note);
            }
            else
            {
                if (decision) RequestStateMachine.Approve(request, dto.ApproverId, now, dto.Note);
                else RequestStateMachine.Reject(request, dto.ApproverId, now, dto.Note);
            }
        }
        catch (InvalidOperationException ex)
        {
            return Results.Conflict(new { error = ex.Message });
        }

        await SetRoutingAsync(request, db, cancellationToken);
        var kind = decision ? RequestEventKind.ManagerApproved : RequestEventKind.ManagerRejected;
        AddEvent(db, request, dto.ApproverId, kind, now, dto.Note);
        await db.SaveChangesAsync(cancellationToken);

        await notifications.NotifyWorkflowTransitionAsync(request, kind, cancellationToken);
        await notifications.NotifyDecidedAsync(request, cancellationToken);

        return Results.Ok(Map(request));
    }

    private static async Task SetRoutingAsync(Request request, BagChronosDbContext db, CancellationToken cancellationToken)
    {
        request.CurrentApproverId = request.WorkflowState switch
        {
            WorkflowState.PendingSubstitute => request.SubstituteId,
            WorkflowState.PendingManager => await ResolveManagerIdAsync(request.EmployeeId, db, cancellationToken),
            WorkflowState.PendingHr => await ResolveHrAdminIdAsync(db, cancellationToken),
            _ => null
        };
    }

    private static async Task<Guid?> ResolveManagerIdAsync(Guid employeeId, BagChronosDbContext db, CancellationToken cancellationToken)
    {
        var managerId = await db.Employees
            .Where(e => e.Id == employeeId)
            .Select(e => e.ManagerId)
            .FirstOrDefaultAsync(cancellationToken);
        if (managerId is not null) return managerId;

        // Fallback: any active manager.
        return await db.Employees
            .Where(e => e.Role == Role.Manager && e.IsActive)
            .Select(e => (Guid?)e.Id)
            .FirstOrDefaultAsync(cancellationToken);
    }

    private static async Task<Guid?> ResolveHrAdminIdAsync(BagChronosDbContext db, CancellationToken cancellationToken)
        => await db.Employees
            .Where(e => e.Role == Role.HRAdmin && e.IsActive)
            .Select(e => (Guid?)e.Id)
            .FirstOrDefaultAsync(cancellationToken);

    private static void AddEvent(BagChronosDbContext db, Request request, Guid actorId, RequestEventKind kind, DateTimeOffset at, string? note)
    {
        db.RequestEvents.Add(new RequestEvent
        {
            RequestId = request.Id,
            ActorId = actorId,
            Kind = kind,
            At = at,
            Note = note
        });
    }

    private static RequestDto Map(Request r) => new(
        r.Id,
        r.EmployeeId,
        r.Type.ToString(),
        r.Status.ToString(),
        r.WorkflowState.ToString(),
        r.From,
        r.To,
        r.Reason,
        r.RequiresApproval,
        r.ApproverId,
        r.CurrentApproverId,
        r.SubstituteId,
        r.SubstituteAcceptedAt,
        r.HrConfirmedAt,
        r.CancelledAt,
        r.CalculatedDays,
        r.DecidedAt,
        r.DecisionNote,
        r.CreatedAt);
}

public record CreateRequestDto(Guid EmployeeId, string Type, DateTimeOffset From, DateTimeOffset To, string? Reason);

public record CreateVacationRequestDto(
    Guid EmployeeId,
    DateTimeOffset From,
    DateTimeOffset To,
    Guid? SubstituteId,
    string? Reason);

public record DecideRequestDto(Guid ApproverId, string? Note);

public record ActorDto(Guid ActorId, string? Note);

public record ActorWithNoteDto(Guid ActorId, string Note);

public record ManagerDecisionDto(Guid ActorId, string? Note, bool RequiresHrConfirmation = false);

public record RequestDto(
    Guid Id,
    Guid EmployeeId,
    string Type,
    string Status,
    string WorkflowState,
    DateTimeOffset From,
    DateTimeOffset To,
    string? Reason,
    bool RequiresApproval,
    Guid? ApproverId,
    Guid? CurrentApproverId,
    Guid? SubstituteId,
    DateTimeOffset? SubstituteAcceptedAt,
    DateTimeOffset? HrConfirmedAt,
    DateTimeOffset? CancelledAt,
    decimal CalculatedDays,
    DateTimeOffset? DecidedAt,
    string? DecisionNote,
    DateTimeOffset CreatedAt);

public record RequestEventDto(
    Guid Id,
    Guid RequestId,
    DateTimeOffset At,
    Guid ActorId,
    string Kind,
    string? Note);
