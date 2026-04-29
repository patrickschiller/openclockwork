using BagChronos.Domain.Services;
using FluentAssertions;
using Xunit;

namespace BagChronos.Domain.Tests;

public class RequestApprovalRulesTests
{
    private static DateTimeOffset At(int hour, int minute = 0, int day = 15)
        => new(2026, 4, day, hour, minute, 0, TimeSpan.Zero);

    [Fact]
    public void RegularBusinessHours_DoNotRequireApproval()
    {
        RequestApprovalRules.RequiresSpecialApproval(At(9), At(17)).Should().BeFalse();
    }

    [Fact]
    public void StartBeforeSeven_RequiresApproval()
    {
        RequestApprovalRules.RequiresSpecialApproval(At(6, 59), At(15)).Should().BeTrue();
    }

    [Fact]
    public void EndAfterTwentyThree_RequiresApproval()
    {
        RequestApprovalRules.RequiresSpecialApproval(At(20), At(23, 30)).Should().BeTrue();
    }

    [Fact]
    public void StartAtSevenAndEndAtTwentyThree_DoNotRequireApproval()
    {
        RequestApprovalRules.RequiresSpecialApproval(At(7), At(23)).Should().BeFalse();
    }

    [Fact]
    public void CrossingMidnight_RequiresApproval()
    {
        var from = At(22, 0, 15);
        var to = At(2, 0, 16);

        RequestApprovalRules.RequiresSpecialApproval(from, to).Should().BeTrue();
    }

    [Fact]
    public void NegativeRange_Throws()
    {
        var act = () => RequestApprovalRules.RequiresSpecialApproval(At(10), At(9));

        act.Should().Throw<ArgumentException>();
    }
}
