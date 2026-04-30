using System.Net;
using System.Net.Http.Json;
using BagChronos.Api.Endpoints;
using BagChronos.Api.Tests.Infrastructure;
using BagChronos.Domain.Entities;
using BagChronos.Domain.Enums;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace BagChronos.Api.Tests.Endpoints;

public sealed class VacationWorkflowFlowTests : IClassFixture<BagChronosWebApplicationFactory>
{
    private readonly BagChronosWebApplicationFactory _factory;

    public VacationWorkflowFlowTests(BagChronosWebApplicationFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Full_flow_Submit_SubstituteAccept_ManagerApprove_HrConfirm()
    {
        var (employeeId, managerId, hrId, substituteId) = await SeedOrganizationAsync();
        await SeedAllowanceAsync(employeeId, year: 2026, baseDays: 30m);

        var client = _factory.CreateClient();

        // 1. Employee creates a vacation request that names a substitute.
        var create = await client.PostAsJsonAsync("/api/requests/vacation", new
        {
            employeeId,
            from = "2026-06-08T00:00:00Z",
            to = "2026-06-12T00:00:00Z",
            substituteId,
            reason = "Holiday"
        });
        create.StatusCode.Should().Be(HttpStatusCode.Created);
        var created = await create.Content.ReadFromJsonAsync<RequestDto>();
        created!.WorkflowState.Should().Be("PendingSubstitute");
        created.SubstituteId.Should().Be(substituteId);
        created.CalculatedDays.Should().Be(5m);
        created.CurrentApproverId.Should().Be(substituteId);

        // 2. Substitute accepts.
        var accept = await client.PostAsJsonAsync(
            $"/api/requests/{created.Id}/substitute/accept",
            new { actorId = substituteId, note = (string?)null });
        accept.EnsureSuccessStatusCode();
        var afterAccept = await accept.Content.ReadFromJsonAsync<RequestDto>();
        afterAccept!.WorkflowState.Should().Be("PendingManager");
        afterAccept.CurrentApproverId.Should().Be(managerId);
        afterAccept.SubstituteAcceptedAt.Should().NotBeNull();

        // 3. Manager approves but flags for HR confirmation.
        var managerApprove = await client.PostAsJsonAsync(
            $"/api/requests/{created.Id}/manager-approve",
            new { actorId = managerId, note = "Looks good", requiresHrConfirmation = true });
        managerApprove.EnsureSuccessStatusCode();
        var afterManager = await managerApprove.Content.ReadFromJsonAsync<RequestDto>();
        afterManager!.WorkflowState.Should().Be("PendingHr");
        afterManager.CurrentApproverId.Should().Be(hrId);

        // 4. HR confirms.
        var hr = await client.PostAsJsonAsync(
            $"/api/requests/{created.Id}/hr-confirm",
            new { actorId = hrId, note = "Confirmed" });
        hr.EnsureSuccessStatusCode();
        var afterHr = await hr.Content.ReadFromJsonAsync<RequestDto>();
        afterHr!.WorkflowState.Should().Be("Approved");
        afterHr.CurrentApproverId.Should().BeNull();
        afterHr.HrConfirmedAt.Should().NotBeNull();

        // 5. Audit trail contains all transitions in order.
        var events = await client.GetFromJsonAsync<List<RequestEventDto>>(
            $"/api/requests/{created.Id}/events");
        events.Should().NotBeNull();
        events!.Select(e => e.Kind).Should().ContainInOrder(
            "Submitted",
            "SubstituteAccepted",
            "ManagerApproved",
            "HrConfirmed");

        // 6. Vacation balance reflects the approved 5 working days.
        var balance = await client.GetFromJsonAsync<VacationBalanceDto>(
            $"/api/accounts/{employeeId}/vacation?year=2026");
        balance!.ApprovedDays.Should().Be(5m);
        balance.PendingDays.Should().Be(0m);
        balance.RemainingDays.Should().Be(25m);
    }

    [Fact]
    public async Task Insufficient_balance_returns_400()
    {
        var (employeeId, _, _, _) = await SeedOrganizationAsync();
        await SeedAllowanceAsync(employeeId, year: 2026, baseDays: 1m);

        var client = _factory.CreateClient();

        var resp = await client.PostAsJsonAsync("/api/requests/vacation", new
        {
            employeeId,
            from = "2026-07-06T00:00:00Z",
            to = "2026-07-10T00:00:00Z",
            substituteId = (Guid?)null,
            reason = "Too long"
        });

        resp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    private async Task<(Guid employeeId, Guid managerId, Guid hrId, Guid substituteId)> SeedOrganizationAsync()
    {
        await using var db = _factory.CreateDbContext();
        await db.Database.EnsureCreatedAsync();

        // Wipe any state left from earlier tests in the same fixture.
        db.RequestEvents.RemoveRange(db.RequestEvents);
        db.Requests.RemoveRange(db.Requests);
        db.EmployeeLeaveAllowances.RemoveRange(db.EmployeeLeaveAllowances);
        db.TimeEntries.RemoveRange(db.TimeEntries);
        db.Employees.RemoveRange(db.Employees);
        await db.SaveChangesAsync();

        var hr = new Employee
        {
            PersonalNo = "P-0001",
            FirstName = "Anna",
            LastName = "Müller",
            Email = "anna.mueller@example.com",
            Role = Role.HRAdmin,
            TimeModel = TimeModel.Vollzeit,
            WeeklyHours = 40,
            AnnualLeaveDays = 30
        };
        var manager = new Employee
        {
            PersonalNo = "P-0002",
            FirstName = "Thomas",
            LastName = "Schmidt",
            Email = "thomas.schmidt@example.com",
            Role = Role.Manager,
            TimeModel = TimeModel.Vollzeit,
            WeeklyHours = 40,
            AnnualLeaveDays = 30
        };
        var substitute = new Employee
        {
            PersonalNo = "P-1001",
            FirstName = "Lisa",
            LastName = "Bauer",
            Email = "lisa.bauer@example.com",
            Role = Role.Employee,
            TimeModel = TimeModel.Vollzeit,
            WeeklyHours = 40,
            AnnualLeaveDays = 30,
            ManagerId = manager.Id
        };
        var employee = new Employee
        {
            PersonalNo = "P-1002",
            FirstName = "Max",
            LastName = "Müller",
            Email = "max.mueller@example.com",
            Role = Role.Employee,
            TimeModel = TimeModel.Vollzeit,
            WeeklyHours = 40,
            AnnualLeaveDays = 30,
            ManagerId = manager.Id
        };

        db.Employees.AddRange(hr, manager, substitute, employee);
        await db.SaveChangesAsync();

        return (employee.Id, manager.Id, hr.Id, substitute.Id);
    }

    private async Task SeedAllowanceAsync(Guid employeeId, int year, decimal baseDays)
    {
        await using var db = _factory.CreateDbContext();
        var existing = await db.EmployeeLeaveAllowances
            .FirstOrDefaultAsync(a => a.EmployeeId == employeeId && a.Year == year);
        if (existing is null)
        {
            db.EmployeeLeaveAllowances.Add(new EmployeeLeaveAllowance
            {
                EmployeeId = employeeId,
                Year = year,
                BaseDays = baseDays
            });
        }
        else
        {
            existing.BaseDays = baseDays;
        }
        await db.SaveChangesAsync();
    }
}
