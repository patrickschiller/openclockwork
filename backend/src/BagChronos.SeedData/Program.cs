using BagChronos.Infrastructure;
using BagChronos.Infrastructure.Persistence;
using BagChronos.Infrastructure.Seeding;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

var configuration = new ConfigurationBuilder()
    .AddJsonFile("appsettings.json", optional: true)
    .AddJsonFile("appsettings.Development.json", optional: true)
    .AddEnvironmentVariables()
    .AddCommandLine(args)
    .Build();

var services = new ServiceCollection();
services.AddLogging(b => b.AddSimpleConsole(o =>
{
    o.SingleLine = true;
    o.TimestampFormat = "HH:mm:ss ";
}));
services.AddBagChronosInfrastructure(configuration);

await using var provider = services.BuildServiceProvider();
var logger = provider.GetRequiredService<ILogger<SeedRunner>>();
var db = provider.GetRequiredService<BagChronosDbContext>();

if (db.Database.IsSqlite())
{
    logger.LogInformation("Ensuring SQLite schema exists...");
    await db.Database.EnsureCreatedAsync();
}
else
{
    logger.LogInformation("Applying pending migrations...");
    await db.Database.MigrateAsync();
}

var runner = new SeedRunner(db, logger);
await runner.RunAsync();

logger.LogInformation("Seed completed.");
return 0;
