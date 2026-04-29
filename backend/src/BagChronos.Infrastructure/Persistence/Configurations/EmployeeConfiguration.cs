using BagChronos.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BagChronos.Infrastructure.Persistence.Configurations;

public class EmployeeConfiguration : IEntityTypeConfiguration<Employee>
{
    public void Configure(EntityTypeBuilder<Employee> builder)
    {
        builder.ToTable("Employees");

        builder.HasKey(e => e.Id);

        builder.Property(e => e.PersonalNo).HasMaxLength(32).IsRequired();
        builder.HasIndex(e => e.PersonalNo).IsUnique();

        builder.Property(e => e.FirstName).HasMaxLength(100).IsRequired();
        builder.Property(e => e.LastName).HasMaxLength(100).IsRequired();
        builder.Property(e => e.Email).HasMaxLength(254).IsRequired();
        builder.HasIndex(e => e.Email).IsUnique();

        builder.Property(e => e.Role).HasConversion<int>();
        builder.Property(e => e.TimeModel).HasConversion<int>();
        builder.Property(e => e.WeeklyHours).HasPrecision(5, 2);

        builder.HasOne(e => e.Manager)
            .WithMany()
            .HasForeignKey(e => e.ManagerId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
