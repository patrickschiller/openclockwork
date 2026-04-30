namespace BagChronos.Domain.Enums;

public enum WorkflowState
{
    Draft = 0,
    Submitted = 1,
    PendingSubstitute = 2,
    PendingManager = 3,
    PendingHr = 4,
    Approved = 5,
    Rejected = 6,
    ReturnedForRevision = 7,
    Cancelled = 8
}
