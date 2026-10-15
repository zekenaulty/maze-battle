param([Parameter(Mandatory = $true)][string]$AgenticaRoot)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $AgenticaRoot).Path
$pin = Get-Content -LiteralPath (Join-Path $PSScriptRoot '../pin.json') -Raw | ConvertFrom-Json
$head = & git -C $root rev-parse HEAD
if ($LASTEXITCODE -ne 0 -or $head -ne $pin.commit) { throw "Agentica source must be pinned to $($pin.commit)" }
$dirty = & git -C $root status --porcelain --untracked-files=no
if ($LASTEXITCODE -ne 0 -or $dirty) { throw 'Agentica tracked source must be clean.' }
$bin = Join-Path $root 'Agentica.Lab.Web/bin/Release/net10.0'
foreach ($assembly in $pin.assemblies.PSObject.Properties) {
    if ((Get-FileHash -LiteralPath (Join-Path $bin $assembly.Name) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $assembly.Value) {
        throw "Pinned DLL hash mismatch: $($assembly.Name)"
    }
}
$workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../../..')).Path
$output = Join-Path $workspace ('test-results/manifest-digest/' + [Guid]::NewGuid().ToString('N'))
$project = Join-Path $PSScriptRoot 'ManifestDigestProbe.csproj'
$oldProbe = $env:MAZE_MANIFEST_PROBE_DLL
$oldEvidence = $env:MAZE_MANIFEST_PROBE_EVIDENCE
Push-Location -LiteralPath $workspace
try {
    & dotnet build $project --configuration Release --output (Join-Path $output 'bin') --disable-build-servers `
        "-p:AgenticaBin=$bin" "-p:BaseIntermediateOutputPath=$(Join-Path $output 'obj/')" `
        "-p:RestoreConfigFile=$(Join-Path $PSScriptRoot '../NuGet.Config')" '-p:UseSharedCompilation=false'
    if ($LASTEXITCODE -ne 0) { throw 'Digest probe build failed.' }
    $env:MAZE_MANIFEST_PROBE_DLL = Join-Path $output 'bin/ManifestDigestProbe.dll'
    $env:MAZE_MANIFEST_PROBE_EVIDENCE = Join-Path $output 'proof.json'
    & node node_modules/vitest/vitest.mjs run src/services/agentica/game/manifestDigest.test.ts `
        tests/agentica-service-custody-probe/manifest-digest/manifest-digest.proof.test.ts
    if ($LASTEXITCODE -ne 0) { throw 'Manifest digest proof failed.' }
    Write-Output "Proof: $env:MAZE_MANIFEST_PROBE_EVIDENCE"
} finally {
    $env:MAZE_MANIFEST_PROBE_DLL = $oldProbe
    $env:MAZE_MANIFEST_PROBE_EVIDENCE = $oldEvidence
    Pop-Location
}
