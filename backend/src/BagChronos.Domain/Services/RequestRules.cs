using BagChronos.Domain.Enums;

namespace BagChronos.Domain.Services;

public static class RequestRules
{
    public static bool RequiresSpecialApproval(RequestType type, DateTimeOffset from, DateTimeOffset to)
    {
        if (to < from)
        {
            throw new ArgumentException("'to' must not be before 'from'.", nameof(to));
        }

        return type == RequestType.TimeCorrection
               && RequestApprovalRules.RequiresSpecialApproval(from, to);
    }
}
