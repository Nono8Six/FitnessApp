$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts\prepare-helpers.ps1')
$binary = Join-Path $PSScriptRoot 'launcher\bin\Fitness Launcher.exe'
$stamp = Join-Path $PSScriptRoot 'launcher\bin\fitness-launcher.sha256'
$build = -not (Test-Path -LiteralPath $binary) -or -not (Test-Path -LiteralPath $stamp)
if (-not $build) { $build = (Get-Content -LiteralPath $stamp -Raw).Trim() -ne (Get-LauncherFingerprint $PSScriptRoot) }
if ($build) { & (Join-Path $PSScriptRoot 'build-launcher.ps1') }
Start-Process -FilePath $binary -WorkingDirectory $PSScriptRoot
