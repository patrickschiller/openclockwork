using BagChronos.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace BagChronos.Infrastructure.Persistence;

public class BagChronosDbContext(DbContextOptions<BagChronosDbContext> options) : DbContext(options)
{
    public DbSet<Employee> Employees => Set<Employee>();
    public DbSet<TimeEntry> TimeEntries => Set<TimeEntry>();
    public DbSet<Request> Requests => Set<Request>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(BagChronosDbContext).Assembly);

        if (Database.IsSqlite())
        {
            var converter = new DateTimeOffsetToBinaryConverter();
            var nullableConverter = new ValueConverter<DateTimeOffset?, long?>(
                v => v.HasValue ? v.Value.ToUniversalTime().Ticks * 10 + (long)(v.Value.Offset.TotalMinutes / 15) : null,
                v => v.HasValue ? new DateTimeOffset(v.Value / 10, TimeSpan.FromMinutes((v.Value % 10) * 15)) : null);

            foreach (var entityType in modelBuilder.Model.GetEntityTypes())
            {
                foreach (var property in entityType.GetProperties())
                {
                    if (property.ClrType == typeof(DateTimeOffset))
                    {
                        property.SetValueConverter(converter);
                    }
                    else if (property.ClrType == typeof(DateTimeOffset?))
                    {
                        property.SetValueConverter(nullableConverter);
                    }
                }
            }
        }
    }
}
