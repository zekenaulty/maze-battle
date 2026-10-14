param(
    [Parameter(Mandatory = $true)][string]$AgenticaRoot
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $AgenticaRoot).Path
$pin = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'pin.json') -Raw | ConvertFrom-Json
$head = & git -C $root rev-parse HEAD
if ($LASTEXITCODE -ne 0 -or $head -ne $pin.commit) { throw "Agentica source must be pinned to $($pin.commit)" }
$dirty = & git -C $root status --porcelain --untracked-files=no
if ($LASTEXITCODE -ne 0 -or $dirty) { throw 'Agentica tracked source must be clean.' }
$bin = Join-Path $root 'Agentica.Lab.Web/bin/Release/net10.0'
foreach ($assembly in $pin.assemblies.PSObject.Properties) {
    $path = Join-Path $bin $assembly.Name
    if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $assembly.Value) {
        throw "Pinned DLL hash mismatch: $path"
    }
}
$workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$output = Join-Path $workspace ('test-results/agentica-service-custody/' + [Guid]::NewGuid().ToString('N'))
$obj = Join-Path $output 'obj/'
$built = Join-Path $output 'bin'
$project = Join-Path $PSScriptRoot 'AgenticaCustodyProbe.csproj'
$config = Join-Path $PSScriptRoot 'NuGet.Config'
Push-Location -LiteralPath $workspace
try {
    & dotnet build $project --configuration Release --output $built --disable-build-servers `
        "-p:AgenticaBin=$bin" "-p:BaseIntermediateOutputPath=$obj" "-p:RestoreConfigFile=$config" '-p:UseSharedCompilation=false'
    if ($LASTEXITCODE -ne 0) { throw 'Probe build failed.' }
    & dotnet (Join-Path $built 'AgenticaCustodyProbe.dll') (Join-Path $output 'evidence')
    if ($LASTEXITCODE -ne 0) { throw 'Custody handshake probe failed.' }
} finally { Pop-Location }
Write-Output "Proof: $(Join-Path $output 'evidence/proof.json')"
