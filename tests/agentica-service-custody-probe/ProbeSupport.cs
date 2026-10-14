using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;
using Agentica.Clients.Llm;
using Agentica.Lab.Web.Providers;
using Agentica.Lab.Web.Runtime;
using Agentica.Planning;

internal static class ProbeSupport
{
    public static void Require(bool condition, string message)
    {
        if (!condition) throw new InvalidOperationException(message);
    }

    public static string Hash(string path) => Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(path)));

    public static string StoreSnapshot(string root) => JsonSerializer.Serialize(Directory.GetFiles(root, "*", SearchOption.AllDirectories)
        .Order(StringComparer.Ordinal).Select(path => new { path = Path.GetRelativePath(root, path), sha256 = Hash(path) }));

    public static object VerifyAssemblies(string pinPath)
    {
        using var pin = JsonDocument.Parse(File.ReadAllText(pinPath));
        var commit = pin.RootElement.GetProperty("commit").GetString()!;
        var expected = pin.RootElement.GetProperty("assemblies");
        var assemblies = new[] { typeof(HostRunRegistry).Assembly, typeof(IWorkflowPlanner).Assembly, typeof(LlmStreamEvent).Assembly };
        return assemblies.Select(assembly =>
        {
            var name = Path.GetFileName(assembly.Location);
            var hash = Hash(assembly.Location);
            var version = assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()!.InformationalVersion;
            Require(hash == expected.GetProperty(name).GetString(), $"Loaded assembly hash changed: {name}");
            Require(version.EndsWith("+" + commit, StringComparison.Ordinal), $"Loaded assembly pin changed: {name}");
            return new { name, sha256 = hash, informationalVersion = version, loadedFrom = assembly.Location };
        }).ToArray();
    }
}

internal sealed class ForbiddenPlannerFactory : ILabPlannerFactory
{
    public int CreateCalls { get; private set; }
    public int MetadataCalls { get; private set; }
    public IWorkflowPlanner Create(ProviderSettings settings, Action<LlmStreamEvent> onStreamEvent)
    {
        CreateCalls++;
        throw new InvalidOperationException("Provider/model activation is forbidden in this probe.");
    }
    public IReadOnlyList<ProviderMetadata> GetProviders()
    {
        MetadataCalls++;
        throw new InvalidOperationException("Provider discovery is forbidden in this probe.");
    }
}
