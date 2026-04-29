namespace BagChronos.Domain.Services;

/// <summary>
/// Implementiert die Sonderregel aus US 2.4 / US 3.2:
/// Buchungen und Zeitanträge mit Zeiten vor 07:00 oder nach 23:00 sind genehmigungspflichtig.
/// </summary>
public static class RequestApprovalRules
{
    public static readonly TimeSpan EarliestRegularStart = new(7, 0, 0);
    public static readonly TimeSpan LatestRegularEnd = new(23, 0, 0);

    public static bool RequiresSpecialApproval(DateTimeOffset from, DateTimeOffset to)
    {
        if (to < from)
        {
            throw new ArgumentException("End must be at or after start.", nameof(to));
        }

        if (to.Date > from.Date)
        {
            return true;
        }

        if (from.TimeOfDay < EarliestRegularStart)
        {
            return true;
        }

        if (to.TimeOfDay > LatestRegularEnd)
        {
            return true;
        }

        return false;
    }
}
