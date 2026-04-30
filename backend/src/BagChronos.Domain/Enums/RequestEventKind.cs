namespace BagChronos.Domain.Enums;

public enum RequestEventKind
{
    Submitted = 0,
    SubstituteAccepted = 1,
    SubstituteDeclined = 2,
    ManagerApproved = 3,
    ManagerRejected = 4,
    HrConfirmed = 5,
    HrRejected = 6,
    ReturnedForRevision = 7,
    Cancelled = 8,
    Resubmitted = 9
}
