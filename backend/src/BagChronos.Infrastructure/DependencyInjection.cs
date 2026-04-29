using BagChronos.Infrastructure.Persistence;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace BagChronos.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddBagChronosInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("BagChronos")
            ?? configuration["Sql:ConnectionString"];

        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException(
                "No connection string configured. Set ConnectionStrings:BagChronos or Sql:ConnectionString.");
        }

        var isSqlite = connectionString.Contains("Data Source=", StringComparison.OrdinalIgnoreCase) &&
                       connectionString.Contains(".db", StringComparison.OrdinalIgnoreCase);

        if (isSqlite)
        {
            connectionString = AnchorSqlitePath(connectionString);
        }

        services.AddDbContext<BagChronosDbContext>(options =>
        {
            if (isSqlite)
            {
                options.UseSqlite(connectionString);
            }
            else
            {
                options.UseSqlServer(connectionString);
            }
        });

        return services;
    }

    private static string AnchorSqlitePath(string connectionString)
    {
        var builder = new SqliteConnectionStringBuilder(connectionString);
        var dataSource = builder.DataSource;

        if (string.IsNullOrWhiteSpace(dataSource) || Path.IsPathRooted(dataSource))
        {
            return connectionString;
        }

        var anchor = Environment.GetEnvironmentVariable("BAGCHRONOS_DATA_DIR")
                     ?? FindRepoAnchor()
                     ?? AppContext.BaseDirectory;

        builder.DataSource = Path.GetFullPath(Path.Combine(anchor, dataSource));
        return builder.ConnectionString;
    }

    private static string? FindRepoAnchor()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            if (File.Exists(Path.Combine(dir.FullName, "BagChronos.sln")))
            {
                return dir.FullName;
            }
            dir = dir.Parent;
        }
        return null;
    }
}
