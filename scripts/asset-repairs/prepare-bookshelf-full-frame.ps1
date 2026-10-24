param([Parameter(Mandatory)][string]$TileLabRun)
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$selectionPath = Join-Path $repoRoot 'scripts/asset-selections/bookshelf-full-frame.json'
$selection = Get-Content -Raw -LiteralPath $selectionPath | ConvertFrom-Json
$sourceRoot = (Resolve-Path -LiteralPath $TileLabRun).Path
$sourceImage = Join-Path $sourceRoot $selection.repair.sourceImage
if ((Get-FileHash -LiteralPath $sourceImage -Algorithm SHA256).Hash.ToLowerInvariant() -ne $selection.repair.sourceSha256) {
  throw 'Atlas bytes changed; inspect the new atlas before repinning this repair.'
}
$outputRoot = Join-Path $repoRoot ('local-asset-repairs/bookshelf-full-frame/' + (Split-Path -Leaf $sourceRoot))
if ($outputRoot -eq $sourceRoot) { throw 'Repair must not write into the TileLab run.' }
foreach ($relative in @('bookshelf/block-map.json', 'bookshelf/atlas_raw.png', 'bookshelf/atlas-report.json',
  'bookshelf/materials/oak_planks/raw_edit.png', 'bookshelf/materials/oak_planks/report.json')) {
  $target = Join-Path $outputRoot $relative
  New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $sourceRoot $relative) -Destination $target
}
$materialRoot = Join-Path $outputRoot 'bookshelf/materials/bookshelf'
New-Item -ItemType Directory -Path $materialRoot -Force | Out-Null
Add-Type -AssemblyName System.Drawing
$atlas = [Drawing.Bitmap]::new($sourceImage)
try {
  $rect = $selection.repair.rectangle
  $crop = $atlas.Clone([Drawing.Rectangle]::new($rect[0], $rect[1], $rect[2], $rect[3]), [Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try { $crop.Save((Join-Path $materialRoot 'repaired_seam.png'), [Drawing.Imaging.ImageFormat]::Png) }
  finally { $crop.Dispose() }
} finally { $atlas.Dispose() }
$outputHash = (Get-FileHash -LiteralPath (Join-Path $materialRoot 'repaired_seam.png') -Algorithm SHA256).Hash.ToLowerInvariant()
if ($outputHash -ne $selection.blocks[0].images.bookshelf.sha256) { throw 'Crop output differs from the reviewed image.' }
# The importer already supports a hash-pinned repaired alternative. Its filename is a variant slot;
# this receipt records the actual operation as a native crop, not a generated seam repair.
$upstreamReport = Join-Path $sourceRoot 'bookshelf/materials/bookshelf/report.json'
Copy-Item -LiteralPath $upstreamReport -Destination (Join-Path $materialRoot 'upstream-report.json')
$report = [ordered]@{
  status = 'generated_unreviewed'; targetName = 'bookshelf'; derivedFromAtlas = $true
  sourceFile = $selection.repair.sourceImage; sourceSha256 = $selection.repair.sourceSha256
  repair = $selection.repair; outputSha256 = $outputHash
  upstreamReportSha256 = (Get-FileHash -LiteralPath $upstreamReport -Algorithm SHA256).Hash.ToLowerInvariant()
  note = 'Deterministic local crop of existing generated artwork; no image generation or resizing.'
}
[IO.File]::WriteAllText((Join-Path $materialRoot 'report.json'), ($report | ConvertTo-Json -Depth 8) + "`n")
Write-Output $outputRoot
