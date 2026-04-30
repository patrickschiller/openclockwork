using BagChronos.Domain.Services;
using FluentAssertions;
using Xunit;

namespace BagChronos.Domain.Tests;

public class LeaveCalculatorTests
{
    [Fact]
    public void CountWorkingDays_FullWorkWeek_Returns5()
    {
        var from = new DateOnly(2026, 5, 4);  // Monday
        var to = new DateOnly(2026, 5, 8);    // Friday

        LeaveCalculator.CountWorkingDays(from, to).Should().Be(5m);
    }

    [Fact]
    public void CountWorkingDays_RangeIncludingWeekend_SkipsSatSun()
    {
        var from = new DateOnly(2026, 5, 4);  // Monday
        var to = new DateOnly(2026, 5, 11);   // next Monday (8 calendar days, but Sat+Sun excluded)

        LeaveCalculator.CountWorkingDays(from, to).Should().Be(6m);
    }

    [Fact]
    public void CountWorkingDays_ExcludesHolidays()
    {
        // 2026-05-01 is Friday (Tag der Arbeit). Range Mon..Fri without filter = 5; with NRW holidays = 4.
        var from = new DateOnly(2026, 4, 27);
        var to = new DateOnly(2026, 5, 1);

        var holidays = LeaveCalculator.GermanHolidaysNrw(2026);

        LeaveCalculator.CountWorkingDays(from, to, holidays).Should().Be(4m);
    }

    [Fact]
    public void CountWorkingDays_SingleWeekendDay_ReturnsZero()
    {
        var sat = new DateOnly(2026, 5, 9);
        LeaveCalculator.CountWorkingDays(sat, sat).Should().Be(0m);
    }

    [Fact]
    public void CountWorkingDays_ToBeforeFrom_Throws()
    {
        var from = new DateOnly(2026, 5, 8);
        var to = new DateOnly(2026, 5, 4);

        var act = () => LeaveCalculator.CountWorkingDays(from, to);
        act.Should().Throw<ArgumentException>();
    }

    [Fact]
    public void GermanHolidaysNrw_2026_ContainsKnownHolidays()
    {
        var holidays = LeaveCalculator.GermanHolidaysNrw(2026);

        holidays.Should().Contain(new DateOnly(2026, 1, 1));   // Neujahr
        holidays.Should().Contain(new DateOnly(2026, 5, 1));   // Tag der Arbeit
        holidays.Should().Contain(new DateOnly(2026, 10, 3));  // Tag der Deutschen Einheit
        holidays.Should().Contain(new DateOnly(2026, 12, 25));
        holidays.Should().Contain(new DateOnly(2026, 12, 26));
        // Easter Sunday 2026 = April 5; Karfreitag = April 3, Ostermontag = April 6.
        holidays.Should().Contain(new DateOnly(2026, 4, 3));
        holidays.Should().Contain(new DateOnly(2026, 4, 6));
    }
}
