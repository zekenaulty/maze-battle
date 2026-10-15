using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;
using Agentica.Lab.Web.Contracts;

using var pin = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "pin.json")));
var commit = pin.RootElement.GetProperty("commit").GetString()!;
var assemblies = new[] { typeof(ProtocolValidation).Assembly, typeof(Agentica.Tools.ToolInputField).Assembly,
    typeof(Agentica.Clients.Llm.LlmStreamEvent).Assembly }.Select(assembly =>
{
    var name = Path.GetFileName(assembly.Location);
    var hash = Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(assembly.Location)));
    var version = assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()!.InformationalVersion;
    if (hash != pin.RootElement.GetProperty("assemblies").GetProperty(name).GetString() ||
        !version.EndsWith("+" + commit, StringComparison.Ordinal))
        throw new InvalidOperationException($"Loaded assembly differs from pin: {name}");
    return new { name, sha256 = hash, informationalVersion = version };
}).ToArray();
using var input = JsonDocument.Parse(Console.In.ReadToEnd());
var results = input.RootElement.EnumerateArray().Select(item =>
{
    var capabilities = item.GetProperty("capabilities").Deserialize<HostCapability[]>(HostProtocol.Json)!;
    return new { name = item.GetProperty("name").GetString(), digest = ProtocolValidation.Digest(capabilities),
        typedJson = JsonSerializer.Serialize(capabilities, HostProtocol.Json) };
}).ToArray();
Console.WriteLine(JsonSerializer.Serialize(new { commit, assemblies, results }, HostProtocol.Json));
