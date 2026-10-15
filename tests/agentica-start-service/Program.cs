using System.Net;
using Agentica.Lab.Web;
using Agentica.Lab.Web.Providers;
using Maze.StartServiceFixture;

if (args.Length != 1 || !Path.IsPathFullyQualified(args[0]))
    throw new ArgumentException("Supply one absolute isolated storage directory.");
var storage = Path.GetFullPath(args[0]);
if (!storage.StartsWith(Path.GetTempPath(), StringComparison.OrdinalIgnoreCase))
    throw new ArgumentException("Fixture storage must be below TEMP.");
Directory.CreateDirectory(storage);
Directory.CreateDirectory(Path.Combine(storage, "wwwroot"));
var factory = new WaitingPlannerFactory();
await using var app = LabWebApplication.Create(
    ["--urls", "http://127.0.0.1:5259", "--contentRoot", storage, "--environment", "Production"],
    factory, storage, new OpenAiProviderConfiguration(_ => throw new InvalidOperationException("Provider environment access forbidden.")));
app.Use(async (context, next) =>
{
    if (context.Connection.RemoteIpAddress is not { } address || !IPAddress.IsLoopback(address))
    {
        context.Response.StatusCode = 403;
        return;
    }
    var path = context.Request.Path.Value;
    if (path is not ("/api/health" or "/api/host" or "/api/starts" or "/api/starts/stop" or "/fixture/proof"))
    {
        context.Response.StatusCode = 403;
        return;
    }
    await next(context);
});
app.MapGet("/fixture/proof", () => new
{
    source = "602f15ac24a60faee8665cb165cb2d7c761c9eed",
    processId = Environment.ProcessId,
    factory.Created, factory.Entered, factory.Cancelled,
    paidProviderCalls = 0, emittedActions = 0
});
await app.RunAsync();
