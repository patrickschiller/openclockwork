using BagChronos.Domain.Entities;
using BagChronos.Domain.Enums;
using BagChronos.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BagChronos.Api.Endpoints;

public static class EmployeesEndpoints
{
    public static IEndpointRouteBuilder MapEmployeesEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/employees").WithTags("Employees");

        group.MapGet("/", ListAsync).WithName("ListEmployees").WithOpenApi();
        group.MapGet("/{id:guid}", GetByIdAsync).WithName("GetEmployee").WithOpenApi();

        return app;
    }

    private static async Task<IResult> ListAsync(
        BagChronosDbContext db,
        CancellationToken cancellationToken)
    {
        var employees = await db.Employees
            .AsNoTracking()
            .OrderBy(e => e.LastName)
            .ThenBy(e => e.FirstName)
            .Select(e => Map(e))
            .ToListAsync(cancellationToken);

        return Results.Ok(employees);
    }

    private static async Task<IResult> GetByIdAsync(
        Guid id,
        BagChronosDbContext db,
        CancellationToken cancellationToken)
    {
        var employee = await db.Employees
            .AsNoTracking()
            .FirstOrDefaultAsync(e => e.Id == id, cancellationToken);

        return employee is null ? Results.NotFound() : Results.Ok(Map(employee));
    }

    private static EmployeeDto Map(Employee e) => new(
        e.Id,
        e.PersonalNo,
        e.FirstName,
        e.LastName,
        e.Email,
        e.Role.ToString(),
        e.TimeModel.ToString(),
        e.WeeklyHours,
        e.AnnualLeaveDays,
        e.ManagerId,
        e.IsActive);
}

public record EmployeeDto(
    Guid Id,
    string PersonalNo,
    string FirstName,
    string LastName,
    string Email,
    string Role,
    string TimeModel,
    decimal WeeklyHours,
    int AnnualLeaveDays,
    Guid? ManagerId,
    bool IsActive);
