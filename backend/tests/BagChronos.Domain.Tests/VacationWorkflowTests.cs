using BagChronos.Domain.Entities;
using BagChronos.Domain.Enums;
using BagChronos.Domain.Services;
using FluentAssertions;
using Xunit;

namespace BagChronos.Domain.Tests;

public class VacationWorkflowTests
{
    private static readonly DateTimeOffset Now = new(2026, 4, 30, 9, 0, 0, TimeSpan.Zero);

    private static Request NewDraft(Guid? substituteId = null) => new()
    {
        EmployeeId = Guid.NewGuid(),
        Type = RequestType.Vacation,
        From = new DateTimeOffset(2026, 6, 1, 0, 0, 0, TimeSpan.Zero),
        To = new DateTimeOffset(2026, 6, 5, 0, 0, 0, TimeSpan.Zero),
        Status = RequestStatus.Submitted,
        WorkflowState = WorkflowState.Draft,
        SubstituteId = substituteId
    };

    [Fact]
    public void Submit_WithoutSubstitute_GoesToPendingManager()
    {
        var r = NewDraft();
        VacationWorkflow.Submit(r, r.EmployeeId, Now);
        r.WorkflowState.Should().Be(WorkflowState.PendingManager);
        r.Status.Should().Be(RequestStatus.Submitted);
    }

    [Fact]
    public void Submit_WithSubstitute_GoesToPendingSubstitute()
    {
        var r = NewDraft(Guid.NewGuid());
        VacationWorkflow.Submit(r, r.EmployeeId, Now);
        r.WorkflowState.Should().Be(WorkflowState.PendingSubstitute);
    }

    [Fact]
    public void AcceptSubstitute_AdvancesToPendingManager()
    {
        var subId = Guid.NewGuid();
        var r = NewDraft(subId);
        VacationWorkflow.Submit(r, r.EmployeeId, Now);

        VacationWorkflow.AcceptSubstitute(r, subId, Now.AddHours(1));

        r.WorkflowState.Should().Be(WorkflowState.PendingManager);
        r.SubstituteAcceptedAt.Should().Be(Now.AddHours(1));
    }

    [Fact]
    public void AcceptSubstitute_WrongActor_Throws()
    {
        var subId = Guid.NewGuid();
        var r = NewDraft(subId);
        VacationWorkflow.Submit(r, r.EmployeeId, Now);

        var act = () => VacationWorkflow.AcceptSubstitute(r, Guid.NewGuid(), Now);
        act.Should().Throw<InvalidOperationException>();
    }

    [Fact]
    public void DeclineSubstitute_RequiresNote_AndReturnsForRevision()
    {
        var subId = Guid.NewGuid();
        var r = NewDraft(subId);
        VacationWorkflow.Submit(r, r.EmployeeId, Now);

        var noNote = () => VacationWorkflow.DeclineSubstitute(r, subId, Now, "");
        noNote.Should().Throw<InvalidOperationException>();

        VacationWorkflow.DeclineSubstitute(r, subId, Now, "Habe Termin");
        r.WorkflowState.Should().Be(WorkflowState.ReturnedForRevision);
    }

    [Fact]
    public void ManagerApprove_WithoutHr_GoesApproved()
    {
        var r = NewDraft();
        VacationWorkflow.Submit(r, r.EmployeeId, Now);
        VacationWorkflow.ManagerApprove(r, Guid.NewGuid(), Now.AddHours(2), "ok");
        r.WorkflowState.Should().Be(WorkflowState.Approved);
        r.Status.Should().Be(RequestStatus.Approved);
    }

    [Fact]
    public void ManagerApprove_WithHrFlag_GoesPendingHr_ThenApprovedOnConfirm()
    {
        var r = NewDraft();
        VacationWorkflow.Submit(r, r.EmployeeId, Now);
        VacationWorkflow.ManagerApprove(r, Guid.NewGuid(), Now.AddHours(2), "ok", requiresHrConfirmation: true);
        r.WorkflowState.Should().Be(WorkflowState.PendingHr);

        VacationWorkflow.HrConfirm(r, Guid.NewGuid(), Now.AddHours(3));
        r.WorkflowState.Should().Be(WorkflowState.Approved);
        r.HrConfirmedAt.Should().Be(Now.AddHours(3));
    }

    [Fact]
    public void ManagerReject_GoesRejected()
    {
        var r = NewDraft();
        VacationWorkflow.Submit(r, r.EmployeeId, Now);
        VacationWorkflow.ManagerReject(r, Guid.NewGuid(), Now.AddHours(2), "team capacity");
        r.WorkflowState.Should().Be(WorkflowState.Rejected);
        r.Status.Should().Be(RequestStatus.Rejected);
    }

    [Fact]
    public void ReturnForRevision_RequiresNote_ResubmitWorks()
    {
        var r = NewDraft();
        VacationWorkflow.Submit(r, r.EmployeeId, Now);

        var noNote = () => VacationWorkflow.ReturnForRevision(r, Guid.NewGuid(), Now, "");
        noNote.Should().Throw<InvalidOperationException>();

        VacationWorkflow.ReturnForRevision(r, Guid.NewGuid(), Now, "Bitte präzisieren");
        r.WorkflowState.Should().Be(WorkflowState.ReturnedForRevision);

        VacationWorkflow.Submit(r, r.EmployeeId, Now.AddHours(1));
        r.WorkflowState.Should().Be(WorkflowState.PendingManager);
    }

    [Fact]
    public void Cancel_BeforeStart_Allowed_AfterStart_BlockedWhenApproved()
    {
        var r = NewDraft();
        VacationWorkflow.Submit(r, r.EmployeeId, Now);
        VacationWorkflow.ManagerApprove(r, Guid.NewGuid(), Now.AddHours(1));
        r.WorkflowState.Should().Be(WorkflowState.Approved);

        // Before start: allowed.
        VacationWorkflow.Cancel(r, r.EmployeeId, Now.AddHours(2));
        r.WorkflowState.Should().Be(WorkflowState.Cancelled);

        // Cancelling a Cancelled / Rejected request must fail.
        var act = () => VacationWorkflow.Cancel(r, r.EmployeeId, Now.AddHours(3));
        act.Should().Throw<InvalidOperationException>();
    }

    [Fact]
    public void Cancel_ApprovedAfterStart_Throws()
    {
        var r = NewDraft();
        VacationWorkflow.Submit(r, r.EmployeeId, Now);
        VacationWorkflow.ManagerApprove(r, Guid.NewGuid(), Now.AddHours(1));

        var afterStart = r.From.AddDays(1);
        var act = () => VacationWorkflow.Cancel(r, r.EmployeeId, afterStart);
        act.Should().Throw<InvalidOperationException>();
    }

    [Fact]
    public void IsOpen_ReturnsTrueForNonTerminalStates()
    {
        VacationWorkflow.IsOpen(WorkflowState.Draft).Should().BeTrue();
        VacationWorkflow.IsOpen(WorkflowState.PendingManager).Should().BeTrue();
        VacationWorkflow.IsOpen(WorkflowState.PendingHr).Should().BeTrue();
        VacationWorkflow.IsOpen(WorkflowState.ReturnedForRevision).Should().BeTrue();

        VacationWorkflow.IsOpen(WorkflowState.Approved).Should().BeFalse();
        VacationWorkflow.IsOpen(WorkflowState.Rejected).Should().BeFalse();
        VacationWorkflow.IsOpen(WorkflowState.Cancelled).Should().BeFalse();
    }
}
