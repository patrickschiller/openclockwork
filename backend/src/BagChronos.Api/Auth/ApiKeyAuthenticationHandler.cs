using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace BagChronos.Api.Auth;

public sealed class ApiKeyAuthenticationOptions : AuthenticationSchemeOptions
{
    public string ConfigKey { get; set; } = "Erp:ApiKey";
    public string HeaderName { get; set; } = "X-Api-Key";
    public string Role { get; set; } = "ErpClient";
}

public sealed class ApiKeyAuthenticationHandler : AuthenticationHandler<ApiKeyAuthenticationOptions>
{
    public const string SchemeName = "ApiKey";

    private readonly IConfiguration _configuration;

    public ApiKeyAuthenticationHandler(
        IOptionsMonitor<ApiKeyAuthenticationOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder,
        IConfiguration configuration)
        : base(options, logger, encoder)
    {
        _configuration = configuration;
    }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var configured = _configuration[Options.ConfigKey];
        if (string.IsNullOrWhiteSpace(configured))
        {
            return Task.FromResult(AuthenticateResult.Fail("API key auth is not configured."));
        }

        if (!Request.Headers.TryGetValue(Options.HeaderName, out var provided) || provided.Count == 0)
        {
            return Task.FromResult(AuthenticateResult.NoResult());
        }

        if (!CryptographicEquals(provided.ToString(), configured))
        {
            return Task.FromResult(AuthenticateResult.Fail("Invalid API key."));
        }

        var identity = new ClaimsIdentity(
            new[]
            {
                new Claim(ClaimTypes.Name, Options.Role),
                new Claim(ClaimTypes.Role, Options.Role)
            },
            Scheme.Name);

        var principal = new ClaimsPrincipal(identity);
        var ticket = new AuthenticationTicket(principal, Scheme.Name);
        return Task.FromResult(AuthenticateResult.Success(ticket));
    }

    private static bool CryptographicEquals(string a, string b)
    {
        if (a.Length != b.Length)
        {
            return false;
        }
        var diff = 0;
        for (var i = 0; i < a.Length; i++)
        {
            diff |= a[i] ^ b[i];
        }
        return diff == 0;
    }
}
