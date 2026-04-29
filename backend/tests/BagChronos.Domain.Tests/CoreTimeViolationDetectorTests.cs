using BagChronos.Domain.Entities;
using BagChronos.Domain.Enums;
using BagChronos.Domain.Services;
using FluentAssertions;
using Xunit;

namespace BagChronos.Domain.Tests;

public class CoreTimeViolationDetectorTests
{
    private static readonly TimeSpan BerlinSummer = TimeSpan.FromHours(2);

    private static Employee NewEmployee(TimeModel model = TimeModel.Gleitzeit) => new()
    {
        Id = Guid.NewGuid(),
        PersonalNo = "P-9999",
        FirstName = "Test",
        LastName = "User",
        Email = "test@bagchronos.local",
        Role = Role.Employee,
        TimeModel = model,
        WeeklyHours = 40m,
        AnnualLeaveDays = 30
    };

    private static TimeEntry Entry(int dayHourIn, int minIn, int dayHourOut, int minOut)
        => new()
        {
            Id = Guid.NewGuid(),
            EmployeeId = Guid.NewGuid(),
            ClockIn = new DateTimeOffset(2026, 5, 4, dayHourIn, minIn, 0, BerlinSummer),
            ClockOut = new DateTimeOffset(2026, 5, 4, dayHourOut, minOut, 0, BerlinSummer),
            Source = EntrySource.Pwa,
            Status = EntryStatus.Pending
        };

    [Fact]
    public void OpenEntry_ProducesNothing()
    {
        var entry = Entry(9, 0, 17, 0);
        entry.ClockOut = null;

        CoreTimeViolationDetector.Detect(entry, NewEmployee()).Should().BeEmpty();
    }

    [Fact]
    public void Vertrauensarbeitszeit_IsExempt()
    {
        var entry = Entry(11, 0, 13, 0);

        CoreTimeViolationDetector.Detect(entry, NewEmployee(TimeModel.Vertrauensarbeitszeit))
            .Should().BeEmpty();
    }

    [Fact]
    public void InsideCoreTime_NoViolation()
    {
        var entry = Entry(9, 0, 15, 0);

        CoreTimeViolationDetector.Detect(entry, NewEmployee()).Should().BeEmpty();
    }

    [Fact]
    public void EarlierStartAndLaterEnd_NoViolation()
    {
        var entry = Entry(8, 0, 17, 0);

        CoreTimeViolationDetector.Detect(entry, NewEmployee()).Should().BeEmpty();
    }

    [Fact]
    public void LateArrival_Flagged()
    {
        var entry = Entry(9, 30, 17, 0);

        var violations = CoreTimeViolationDetector.Detect(entry, NewEmployee()).ToList();

        violations.Should().HaveCount(1);
        violations[0].Kind.Should().Be(CoreTimeViolationKind.LateArrival);
        violations[0].Delta.Should().Be(TimeSpan.FromMinutes(30));
    }

    [Fact]
    public void EarlyDeparture_Flagged()
    {
        var entry = Entry(8, 0, 14, 30);

        var violations = CoreTimeViolationDetector.Detect(entry, NewEmployee()).ToList();

        violations.Should().HaveCount(1);
        violations[0].Kind.Should().Be(CoreTimeViolationKind.EarlyDeparture);
        violations[0].Delta.Should().Be(TimeSpan.FromMinutes(30));
    }

    [Fact]
    public void LateAndEarly_BothFlagged()
    {
        var entry = Entry(10, 0, 14, 0);

        var violations = CoreTimeViolationDetector.Detect(entry, NewEmployee()).ToList();

        violations.Should().HaveCount(2);
        violations.Select(v => v.Kind).Should().BeEquivalentTo(new[]
        {
            CoreTimeViolationKind.LateArrival,
            CoreTimeViolationKind.EarlyDeparture
        });
    }

    [Fact]
    public void CustomRule_Honored()
    {
        var entry = Entry(9, 30, 17, 0);
        var rule = new CoreTimeRule(new TimeOnly(10, 0), new TimeOnly(16, 0));

        var violations = CoreTimeViolationDetector.Detect(entry, NewEmployee(), rule).ToList();

        violations.Should().BeEmpty();
    }

    [Fact]
    public void Boundary_StartExact_NotLate()
    {
        var entry = Entry(9, 0, 16, 0);

        CoreTimeViolationDetector.Detect(entry, NewEmployee())
            .Where(v => v.Kind == CoreTimeViolationKind.LateArrival)
            .Should().BeEmpty();
    }

    [Fact]
    public void Boundary_EndExact_NotEarly()
    {
        var entry = Entry(8, 0, 15, 0);

        CoreTimeViolationDetector.Detect(entry, NewEmployee())
            .Where(v => v.Kind == CoreTimeViolationKind.EarlyDeparture)
            .Should().BeEmpty();
    }
}
