using BagChronos.Domain.Entities;
using BagChronos.Domain.Enums;
using BagChronos.Domain.Services;
using FluentAssertions;
using Xunit;

namespace BagChronos.Domain.Tests;

public class RequestStateMachineTests
{
    private static Request NewSubmitted() => new()
    {
        EmployeeId = Guid.NewGuid(),
        Type = RequestType.Vacation,
        From = new DateTimeOffset(2026, 5, 4, 0, 0, 0, TimeSpan.Zero),
        To = new DateTimeOffset(2026, 5, 8, 0, 0, 0, TimeSpan.Zero),
        Status = RequestStatus.Submitted
    };

    [Fact]
    public void Approve_SetsStatusAndDecisionFields()
    {
        var request = NewSubmitted();
        var approverId = Guid.NewGuid();
        var decidedAt = new DateTimeOffset(2026, 4, 30, 10, 0, 0, TimeSpan.Zero);

        RequestStateMachine.Approve(request, approverId, decidedAt, "ok");

        request.Status.Should().Be(RequestStatus.Approved);
        request.ApproverId.Should().Be(approverId);
        request.DecidedAt.Should().Be(decidedAt);
        request.DecisionNote.Should().Be("ok");
    }

    [Fact]
    public void Reject_SetsStatusAndDecisionFields()
    {
        var request = NewSubmitted();
        var approverId = Guid.NewGuid();
        var decidedAt = new DateTimeOffset(2026, 4, 30, 10, 0, 0, TimeSpan.Zero);

        RequestStateMachine.Reject(request, approverId, decidedAt, "team capacity");

        request.Status.Should().Be(RequestStatus.Rejected);
        request.ApproverId.Should().Be(approverId);
        request.DecidedAt.Should().Be(decidedAt);
        request.DecisionNote.Should().Be("team capacity");
    }

    [Fact]
    public void Approve_OnAlreadyApproved_Throws()
    {
        var request = NewSubmitted();
        request.Status = RequestStatus.Approved;

        var act = () => RequestStateMachine.Approve(request, Guid.NewGuid(), DateTimeOffset.UtcNow);

        act.Should().Throw<InvalidOperationException>();
    }

    [Fact]
    public void Reject_OnRejected_Throws()
    {
        var request = NewSubmitted();
        request.Status = RequestStatus.Rejected;

        var act = () => RequestStateMachine.Reject(request, Guid.NewGuid(), DateTimeOffset.UtcNow);

        act.Should().Throw<InvalidOperationException>();
    }

    [Fact]
    public void Approve_AfterReject_Throws()
    {
        var request = NewSubmitted();
        request.Status = RequestStatus.Rejected;

        var act = () => RequestStateMachine.Approve(request, Guid.NewGuid(), DateTimeOffset.UtcNow);

        act.Should().Throw<InvalidOperationException>();
    }
}
