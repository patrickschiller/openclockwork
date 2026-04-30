namespace BagChronos.Domain.Services;

public static class LeaveCalculator
{
    public static decimal CountWorkingDays(DateOnly from, DateOnly to, IReadOnlySet<DateOnly>? holidays = null)
    {
        if (to < from)
        {
            throw new ArgumentException("'to' must not be before 'from'.", nameof(to));
        }

        var days = 0m;
        for (var d = from; d <= to; d = d.AddDays(1))
        {
            if (d.DayOfWeek == DayOfWeek.Saturday || d.DayOfWeek == DayOfWeek.Sunday) continue;
            if (holidays is not null && holidays.Contains(d)) continue;
            days += 1m;
        }
        return days;
    }

    public static decimal CountWorkingDays(DateTimeOffset from, DateTimeOffset to, IReadOnlySet<DateOnly>? holidays = null)
        => CountWorkingDays(DateOnly.FromDateTime(from.UtcDateTime.Date), DateOnly.FromDateTime(to.UtcDateTime.Date), holidays);

    public static IReadOnlySet<DateOnly> GermanHolidaysNrw(int year)
    {
        var easter = EasterSunday(year);
        return new HashSet<DateOnly>
        {
            new(year, 1, 1),                              // Neujahr
            new(year, 5, 1),                              // Tag der Arbeit
            new(year, 10, 3),                             // Tag der Deutschen Einheit
            new(year, 11, 1),                             // Allerheiligen (NRW)
            new(year, 12, 25),                            // 1. Weihnachtstag
            new(year, 12, 26),                            // 2. Weihnachtstag
            DateOnly.FromDateTime(easter.AddDays(-2)),    // Karfreitag
            DateOnly.FromDateTime(easter.AddDays(1)),     // Ostermontag
            DateOnly.FromDateTime(easter.AddDays(39)),    // Christi Himmelfahrt
            DateOnly.FromDateTime(easter.AddDays(50)),    // Pfingstmontag
            DateOnly.FromDateTime(easter.AddDays(60))     // Fronleichnam (NRW)
        };
    }

    private static DateTime EasterSunday(int year)
    {
        var a = year % 19;
        var b = year / 100;
        var c = year % 100;
        var d = b / 4;
        var e = b % 4;
        var f = (b + 8) / 25;
        var g = (b - f + 1) / 3;
        var h = (19 * a + b - d - g + 15) % 30;
        var i = c / 4;
        var k = c % 4;
        var l = (32 + 2 * e + 2 * i - h - k) % 7;
        var m = (a + 11 * h + 22 * l) / 451;
        var month = (h + l - 7 * m + 114) / 31;
        var day = ((h + l - 7 * m + 114) % 31) + 1;
        return new DateTime(year, month, day);
    }
}
