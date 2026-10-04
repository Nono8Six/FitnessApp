$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
. (Join-Path $PSScriptRoot 'scripts\prepare-helpers.ps1')
if (-not (Get-Command cargo.exe -ErrorAction SilentlyContinue)) {
    throw 'Rust est necessaire pour construire le lanceur : https://rustup.rs (outils C++ Microsoft requis). Le mode console reste disponible avec start-app.ps1.'
}
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'Node.js LTS est necessaire pour construire le lanceur.' }
$binary = Join-Path $PSScriptRoot 'launcher\bin\Fitness Launcher.exe'
if (Test-Path -LiteralPath $binary) {
    $running = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $binary }
    if ($running) { throw 'Fermer la fenetre du lanceur Fitness avant de le reconstruire.' }
}
Push-Location -LiteralPath (Join-Path $PSScriptRoot 'frontend')
try {
    Install-FrontendDependencies (Join-Path $PSScriptRoot 'frontend')
    npm.cmd run build:launcher
    if ($LASTEXITCODE -ne 0) { throw 'Construction de l interface du lanceur impossible.' }
} finally { Pop-Location }
Push-Location -LiteralPath (Join-Path $PSScriptRoot 'launcher')
try {
    cargo.exe build --release --locked
    if ($LASTEXITCODE -ne 0) { throw 'Construction Rust du lanceur impossible.' }
} finally { Pop-Location }
New-Item -ItemType Directory -Path (Split-Path -Parent $binary) -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'launcher\target\release\fitness-launcher.exe') -Destination $binary
Set-Content -LiteralPath (Join-Path $PSScriptRoot 'launcher\bin\fitness-launcher.sha256') -Value (Get-LauncherFingerprint $PSScriptRoot) -Encoding ASCII
Write-Host "Lanceur pret : $binary"
