using BagChronos.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BagChronos.Infrastructure.Persistence.Configurations;

public class EmployeeLeaveAllowanceConfiguration : IEntityTypeConfiguration<EmployeeLeaveAllowance>
{
    public void Configure(EntityTypeBuilder<EmployeeLeaveAllowance> builder)
    {
        builder.ToTable("EmployeeLeaveAllowances");

        builder.HasKey(a => a.Id);

        builder.Property(a => a.BaseDays).HasPrecision(5, 2);
        builder.Property(a => a.CarryOverDays).HasPrecision(5, 2);
        builder.Property(a => a.AdjustmentDays).HasPrecision(5, 2);
        builder.Property(a => a.AdjustmentReason).HasMaxLength(500);
        builder.Ignore(a => a.TotalDays);

        builder.HasOne(a => a.Employee)
            .WithMany()
            .HasForeignKey(a => a.EmployeeId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(a => new { a.EmployeeId, a.Year }).IsUnique();
    }
}
