using BagChronos.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BagChronos.Infrastructure.Persistence.Configurations;

public class RequestConfiguration : IEntityTypeConfiguration<Request>
{
    public void Configure(EntityTypeBuilder<Request> builder)
    {
        builder.ToTable("Requests");

        builder.HasKey(r => r.Id);

        builder.Property(r => r.Type).HasConversion<int>();
        builder.Property(r => r.Status).HasConversion<int>();
        builder.Property(r => r.WorkflowState).HasConversion<int>();
        builder.Property(r => r.Reason).HasMaxLength(1000);
        builder.Property(r => r.DecisionNote).HasMaxLength(1000);
        builder.Property(r => r.CalculatedDays).HasPrecision(6, 2);

        builder.HasOne(r => r.Employee)
            .WithMany()
            .HasForeignKey(r => r.EmployeeId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(r => r.Approver)
            .WithMany()
            .HasForeignKey(r => r.ApproverId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(r => r.CurrentApprover)
            .WithMany()
            .HasForeignKey(r => r.CurrentApproverId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(r => r.Substitute)
            .WithMany()
            .HasForeignKey(r => r.SubstituteId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(r => new { r.EmployeeId, r.Status });
        builder.HasIndex(r => new { r.Status, r.From });
        builder.HasIndex(r => new { r.WorkflowState, r.CurrentApproverId });
    }
}
