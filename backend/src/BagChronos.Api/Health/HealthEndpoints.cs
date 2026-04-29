namespace BagChronos.Api.Health;

public static class HealthEndpoints
{
    public static IEndpointRouteBuilder MapHealthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/health").WithTags("Health");

        group.MapGet("/", GetHealthAsync)
            .WithName("GetHealth")
            .WithOpenApi();

        return app;
    }

    private static async Task<IResult> GetHealthAsync(CancellationToken cancellationToken)
    {
        await Task.CompletedTask;
        return Results.Ok(new HealthResponse(
            Status: "Healthy",
            Service: "BagChronos.Api",
            UtcTimestamp: DateTimeOffset.UtcNow));
    }
}

public record HealthResponse(string Status, string Service, DateTimeOffset UtcTimestamp);
