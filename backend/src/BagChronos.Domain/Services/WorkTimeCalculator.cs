namespace BagChronos.Domain.Services;

/// <summary>
/// Implementiert die gesetzliche Pausenregelung aus US 2.2:
/// 30 min Pause ab 6 h Bruttoarbeit, weitere 15 min ab 9 h (insgesamt 45 min).
/// </summary>
public static class WorkTimeCalculator
{
    private static readonly TimeSpan FirstThreshold = TimeSpan.FromHours(6);
    private static readonly TimeSpan SecondThreshold = TimeSpan.FromHours(9);
    private static readonly TimeSpan FirstBreak = TimeSpan.FromMinutes(30);
    private static readonly TimeSpan SecondBreak = TimeSpan.FromMinutes(45);

    public static TimeSpan CalculateBreak(TimeSpan gross)
    {
        if (gross < TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(nameof(gross), "Gross duration cannot be negative.");
        }

        if (gross >= SecondThreshold) return SecondBreak;
        if (gross >= FirstThreshold) return FirstBreak;
        return TimeSpan.Zero;
    }

    public static TimeSpan CalculateNet(TimeSpan gross) => gross - CalculateBreak(gross);

    public static TimeSummary Summarize(TimeSpan gross)
    {
        var breakSpan = CalculateBreak(gross);
        return new TimeSummary(gross, breakSpan, gross - breakSpan);
    }
}

public record TimeSummary(TimeSpan Gross, TimeSpan Break, TimeSpan Net);
