using BagChronos.Api.Auth;
using BagChronos.Api.Endpoints;
using BagChronos.Api.Health;
using BagChronos.Infrastructure;
using BagChronos.Infrastructure.Persistence;
using BagChronos.Infrastructure.Seeding;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddBagChronosInfrastructure(builder.Configuration);

builder.Services
    .AddAuthentication(ApiKeyAuthenticationHandler.SchemeName)
    .AddScheme<ApiKeyAuthenticationOptions, ApiKeyAuthenticationHandler>(
        ApiKeyAuthenticationHandler.SchemeName,
        _ => { });

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy(ErpEndpoints.ErpAuthorizationPolicy, policy =>
    {
        policy.AddAuthenticationSchemes(ApiKeyAuthenticationHandler.SchemeName);
        policy.RequireAuthenticatedUser();
        policy.RequireRole("ErpClient");
    });
});

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
    if (db.Database.IsSqlite())
    {
        await db.Database.EnsureCreatedAsync();
    }
    else
    {
        await db.Database.MigrateAsync();
    }

    if (string.Equals(Environment.GetEnvironmentVariable("BAGCHRONOS_RUN_SEED"), "true", StringComparison.OrdinalIgnoreCase))
    {
        var seedLogger = scope.ServiceProvider.GetRequiredService<ILogger<SeedRunner>>();
        seedLogger.LogWarning("BAGCHRONOS_RUN_SEED=true detected — running seed.");
        var runner = new SeedRunner(db, seedLogger);
        await runner.RunAsync();
        seedLogger.LogWarning("Seed finished. Remember to remove BAGCHRONOS_RUN_SEED.");
    }
}

app.UseHttpsRedirection();
app.UseCors(corsPolicy);

app.UseAuthentication();
app.UseAuthorization();

app.MapHealthEndpoints();
app.MapEmployeesEndpoints();
app.MapTimeEntriesEndpoints();
app.MapAccountsEndpoints();
app.MapLeaveAllowancesEndpoints();
app.MapRequestsEndpoints();
app.MapViolationsEndpoints();
app.MapErpEndpoints();

await app.RunAsync();

public partial class Program;
