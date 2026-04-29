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

public sealed class ErpEndpointsTests : IClassFixture<BagChronosWebApplicationFactory>
{
    private readonly BagChronosWebApplicationFactory _factory;

    public ErpEndpointsTests(BagChronosWebApplicationFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Returns_401_without_api_key()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/erp/timeentries");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Returns_401_with_wrong_api_key()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Api-Key", "totally-wrong");

        var response = await client.GetAsync("/api/erp/timeentries");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Returns_only_approved_entries()
    {
        await SeedAsync();

        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Api-Key", BagChronosWebApplicationFactory.TestApiKey);

        var page = await client.GetFromJsonAsync<ErpPageDto<ErpTimeEntryDto>>(
            "/api/erp/timeentries?from=2026-01-01&to=2027-01-01");

        page.Should().NotBeNull();
        page!.Total.Should().Be(2);
        page.Items.Should().HaveCount(2);
        page.Items.Should().OnlyContain(i => i.NetMinutes > 0);
    }

    [Fact]
    public async Task Pagination_metadata_is_correct()
    {
        await SeedAsync();

        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Api-Key", BagChronosWebApplicationFactory.TestApiKey);

        var page1 = await client.GetFromJsonAsync<ErpPageDto<ErpTimeEntryDto>>(
            "/api/erp/timeentries?pageSize=1&page=1");
        var page2 = await client.GetFromJsonAsync<ErpPageDto<ErpTimeEntryDto>>(
            "/api/erp/timeentries?pageSize=1&page=2");

        page1!.Page.Should().Be(1);
        page1.PageSize.Should().Be(1);
        page1.Total.Should().Be(2);
        page1.Items.Should().HaveCount(1);

        page2!.Page.Should().Be(2);
        page2.Items.Should().HaveCount(1);
        page2.Items.First().Id.Should().NotBe(page1.Items.First().Id);
    }

    [Fact]
    public async Task Time_window_filter_excludes_entries_outside_range()
    {
        await SeedAsync();

        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Api-Key", BagChronosWebApplicationFactory.TestApiKey);

        var page = await client.GetFromJsonAsync<ErpPageDto<ErpTimeEntryDto>>(
            "/api/erp/timeentries?from=2027-01-01");

        page!.Total.Should().Be(0);
        page.Items.Should().BeEmpty();
    }

    private async Task SeedAsync()
    {
        await using var db = _factory.CreateDbContext();
        await db.Database.EnsureCreatedAsync();

        if (await db.Employees.AnyAsync())
        {
            return;
        }

        var employee = new Employee
        {
            PersonalNo = "E-001",
            FirstName = "Erp",
            LastName = "Test",
            Email = "erp.test@example.com",
            TimeModel = TimeModel.Vollzeit,
            WeeklyHours = 40,
            AnnualLeaveDays = 30,
            Role = Role.Employee
        };
        db.Employees.Add(employee);

        var baseDay = new DateTimeOffset(2026, 6, 1, 8, 0, 0, TimeSpan.Zero);

        db.TimeEntries.AddRange(
            new TimeEntry
            {
                EmployeeId = employee.Id,
                ClockIn = baseDay,
                ClockOut = baseDay.AddHours(8),
                Source = EntrySource.Pwa,
                Status = EntryStatus.Approved
            },
            new TimeEntry
            {
                EmployeeId = employee.Id,
                ClockIn = baseDay.AddDays(1),
                ClockOut = baseDay.AddDays(1).AddHours(8),
                Source = EntrySource.Pwa,
                Status = EntryStatus.Approved
            },
            new TimeEntry
            {
                EmployeeId = employee.Id,
                ClockIn = baseDay.AddDays(2),
                ClockOut = baseDay.AddDays(2).AddHours(8),
                Source = EntrySource.Pwa,
                Status = EntryStatus.Pending
            },
            new TimeEntry
            {
                EmployeeId = employee.Id,
                ClockIn = baseDay.AddDays(3),
                ClockOut = null,
                Source = EntrySource.Pwa,
                Status = EntryStatus.Open
            });

        await db.SaveChangesAsync();
    }
}
