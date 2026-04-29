using BagChronos.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace BagChronos.Api.Tests.Infrastructure;

public sealed class BagChronosWebApplicationFactory : WebApplicationFactory<Program>
{
    public const string TestApiKey = "test-erp-key-1234567890";

    private readonly SqliteConnection _connection = new("DataSource=:memory:");

    public BagChronosWebApplicationFactory()
    {
        _connection.Open();

        Environment.SetEnvironmentVariable("ConnectionStrings__BagChronos", "Data Source=bagchronos-tests.db");
        Environment.SetEnvironmentVariable("Erp__ApiKey", TestApiKey);
    }

    public BagChronosDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<BagChronosDbContext>()
            .UseSqlite(_connection)
            .Options;
        return new BagChronosDbContext(options);
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");

        builder.ConfigureServices(services =>
        {
            var dbContextDescriptor = services.SingleOrDefault(
                d => d.ServiceType == typeof(DbContextOptions<BagChronosDbContext>));
            if (dbContextDescriptor is not null)
            {
                services.Remove(dbContextDescriptor);
            }

            services.AddDbContext<BagChronosDbContext>(options =>
                options.UseSqlite(_connection));
        });
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _connection.Dispose();
        }
        base.Dispose(disposing);
    }
}
