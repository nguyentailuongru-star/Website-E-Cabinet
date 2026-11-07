param(
  [Parameter(Mandatory=$true)][string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$out = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $out -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$stage = Join-Path $out (".phong-hop-stage-" + [guid]::NewGuid().ToString('N'))
$stageFull = [System.IO.Path]::GetFullPath($stage)
if (-not $stageFull.StartsWith($out.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Staging path escaped output directory.' }
New-Item -ItemType Directory -Path $stage | Out-Null
try {
  foreach ($name in @('node_modules','server','public','scripts','docs','package.json','package-lock.json','README.md','.env.example')) {
    $source = Join-Path $root $name
    if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination $stage -Recurse -Force }
  }
  @"
Offline bundle created on $([System.Runtime.InteropServices.RuntimeInformation]::OSDescription)
Node: $(node --version)
Architecture: $([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture)
Native node_modules are for this same operating system and architecture only.
Install runtime prerequisites on the target before using this package.
"@ | Set-Content -LiteralPath (Join-Path $stage 'PACKAGE-INFO.txt') -Encoding utf8
  $archive = Join-Path $out "phong-hop-offline-$stamp.zip"
  Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $archive -CompressionLevel Optimal
  Write-Output "Created $archive"
} finally {
  Remove-Item -LiteralPath $stage -Recurse -Force
}
