using BagChronos.Api.Endpoints;
using BagChronos.Api.Health;
using BagChronos.Infrastructure;
using BagChronos.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddBagChronosInfrastructure(builder.Configuration);

const string corsPolicy = "Frontend";
builder.Services.AddCors(options =>
{
    options.AddPolicy(corsPolicy, policy =>
    {
        var origins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
        policy.WithOrigins(origins)
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<BagChronosDbContext>();
    var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("Startup");
    try
    {
        if (db.Database.IsSqlite())
        {
            await db.Database.EnsureCreatedAsync();
        }
        else
        {
            logger.LogInformation("Applying SQL Server migrations");
            await db.Database.MigrateAsync();
            logger.LogInformation("Migrations applied successfully");
        }
    }
    catch (Exception ex)
    {
        logger.LogCritical(ex, "Database initialization failed: {Message}", ex.Message);
        Console.Error.WriteLine($"FATAL DB INIT: {ex}");
        throw;
    }
}

app.UseHttpsRedirection();
app.UseCors(corsPolicy);

app.MapHealthEndpoints();
app.MapEmployeesEndpoints();
app.MapTimeEntriesEndpoints();
app.MapAccountsEndpoints();
app.MapRequestsEndpoints();
app.MapViolationsEndpoints();

await app.RunAsync();

public partial class Program;
