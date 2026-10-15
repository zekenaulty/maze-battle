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
    var route = context.Request.Method + " " + context.Request.Path.Value;
    if (route is not ("GET /api/health" or "GET /api/host" or "GET /api/starts" or "POST /api/starts/stop" or "GET /fixture/proof"
        or "GET /api/operations" or "POST /api/operations/events" or "POST /api/operations/stop-decision" or "GET /api/recovery"))
    {
        context.Response.StatusCode = 403;
        return;
    }
    await next(context);
});
app.MapGet("/fixture/proof", () => new
{
    source = "577a214d020ba35ba3188761da6a114b978516b7",
    processId = Environment.ProcessId,
    factory.Created, factory.Entered, factory.Cancelled,
    factory.ScriptedCreated, factory.ScriptedCreateCalls, factory.ScriptedRefineCalls, factory.ScriptedStepsPlanned,
    decision = factory.Decision.Snapshot(),
    paidProviderCalls = 0, paidProviderCallsEvidence = "by-construction: injected offline planners only; not billing telemetry"
});
await app.RunAsync();
