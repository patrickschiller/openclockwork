using BagChronos.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BagChronos.Infrastructure.Persistence.Configurations;

public class RequestEventConfiguration : IEntityTypeConfiguration<RequestEvent>
{
    public void Configure(EntityTypeBuilder<RequestEvent> builder)
    {
        builder.ToTable("RequestEvents");

        builder.HasKey(e => e.Id);

        builder.Property(e => e.Kind).HasConversion<int>();
        builder.Property(e => e.Note).HasMaxLength(1000);

        builder.HasOne(e => e.Request)
            .WithMany()
            .HasForeignKey(e => e.RequestId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(e => new { e.RequestId, e.At });
    }
}
