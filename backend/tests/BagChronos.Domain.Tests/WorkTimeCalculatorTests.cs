using BagChronos.Domain.Services;
using FluentAssertions;
using Xunit;

namespace BagChronos.Domain.Tests;

public class WorkTimeCalculatorTests
{
    [Theory]
    [InlineData(0, 0)]
    [InlineData(60, 0)]
    [InlineData(5 * 60, 0)]
    [InlineData(5 * 60 + 59, 0)]
    [InlineData(6 * 60, 30)]
    [InlineData(6 * 60 + 1, 30)]
    [InlineData(8 * 60, 30)]
    [InlineData(8 * 60 + 59, 30)]
    [InlineData(9 * 60, 45)]
    [InlineData(10 * 60, 45)]
    [InlineData(12 * 60, 45)]
    public void CalculateBreak_AppliesStatutoryThresholds(int grossMinutes, int expectedBreakMinutes)
    {
        var result = WorkTimeCalculator.CalculateBreak(TimeSpan.FromMinutes(grossMinutes));

        result.TotalMinutes.Should().Be(expectedBreakMinutes);
    }

    [Theory]
    [InlineData(8 * 60, 8 * 60 - 30)]
    [InlineData(9 * 60, 9 * 60 - 45)]
    [InlineData(5 * 60, 5 * 60)]
    public void CalculateNet_DeductsBreak(int grossMinutes, int expectedNetMinutes)
    {
        var net = WorkTimeCalculator.CalculateNet(TimeSpan.FromMinutes(grossMinutes));

        net.TotalMinutes.Should().Be(expectedNetMinutes);
    }

    [Fact]
    public void Summarize_ReturnsAllThreeValues()
    {
        var summary = WorkTimeCalculator.Summarize(TimeSpan.FromHours(9));

        summary.Gross.Should().Be(TimeSpan.FromHours(9));
        summary.Break.Should().Be(TimeSpan.FromMinutes(45));
        summary.Net.Should().Be(TimeSpan.FromMinutes(9 * 60 - 45));
    }

    [Fact]
    public void CalculateBreak_NegativeGross_Throws()
    {
        var act = () => WorkTimeCalculator.CalculateBreak(TimeSpan.FromMinutes(-1));

        act.Should().Throw<ArgumentOutOfRangeException>();
    }
}
