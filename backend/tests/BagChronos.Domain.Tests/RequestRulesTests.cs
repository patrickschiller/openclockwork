using BagChronos.Domain.Enums;
using BagChronos.Domain.Services;
using FluentAssertions;
using Xunit;

namespace BagChronos.Domain.Tests;

public class RequestRulesTests
{
    private static DateTimeOffset At(int hour, int minute = 0, int day = 15)
        => new(2026, 5, day, hour, minute, 0, TimeSpan.Zero);

    [Fact]
    public void TimeCorrection_OutsideWindow_RequiresApproval()
    {
        RequestRules.RequiresSpecialApproval(RequestType.TimeCorrection, At(6, 30), At(15))
            .Should().BeTrue();
    }

    [Fact]
    public void TimeCorrection_InsideWindow_DoesNotRequireApproval()
    {
        RequestRules.RequiresSpecialApproval(RequestType.TimeCorrection, At(9), At(17))
            .Should().BeFalse();
    }

    [Theory]
    [InlineData(RequestType.Vacation)]
    [InlineData(RequestType.HomeOffice)]
    [InlineData(RequestType.SpecialLeave)]
    public void NonTimeCorrection_DoesNotTriggerSpecialApproval(RequestType type)
    {
        RequestRules.RequiresSpecialApproval(type, At(2), At(23, 30))
            .Should().BeFalse();
    }

    [Fact]
    public void NegativeRange_Throws()
    {
        var act = () => RequestRules.RequiresSpecialApproval(RequestType.TimeCorrection, At(10), At(9));
        act.Should().Throw<ArgumentException>();
    }
}
