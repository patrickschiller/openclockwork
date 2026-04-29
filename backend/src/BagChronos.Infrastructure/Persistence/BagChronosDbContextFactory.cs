using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace BagChronos.Infrastructure.Persistence;

public sealed class BagChronosDbContextFactory : IDesignTimeDbContextFactory<BagChronosDbContext>
{
    public BagChronosDbContext CreateDbContext(string[] args)
    {
        var connectionString = Environment.GetEnvironmentVariable("BAGCHRONOS_DESIGN_CONNECTION")
            ?? "Server=(localdb)\\\\mssqllocaldb;Database=BagChronos;Trusted_Connection=true;";

        var options = new DbContextOptionsBuilder<BagChronosDbContext>()
            .UseSqlServer(connectionString)
            .Options;

        return new BagChronosDbContext(options);
    }
}
