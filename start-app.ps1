param([switch]$Simulation, [switch]$Reseau, [int]$Port = 4330, [switch]$Reconstruire)
# Lance l'application Fitness sur ce PC. Le POC (start-poc.ps1) reste independant.
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

# Python : environnement .venv partage avec le POC
$appPython = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $appPython)) {
    python -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'Creation de l environnement Python impossible.' }
}
& $appPython -c 'import fastapi, uvicorn, httpx2'
if ($LASTEXITCODE -ne 0) {
    & $appPython -m pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) { throw 'Installation des dependances Python impossible.' }
}

# Interface : construite si absente ou plus ancienne que ses sources
$frontend = Join-Path $PSScriptRoot 'frontend'
$index = Join-Path $frontend 'dist\index.html'
$build = $Reconstruire -or -not (Test-Path -LiteralPath $index)
if (-not $build) {
    $builtAt = (Get-Item -LiteralPath $index).LastWriteTimeUtc
    $sources = @('src', 'public', 'index.html', 'package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json') |
        ForEach-Object { Join-Path $frontend $_ } | Where-Object { Test-Path -LiteralPath $_ }
    $newer = Get-ChildItem -LiteralPath $sources -Recurse -File | Where-Object { $_.LastWriteTimeUtc -gt $builtAt } | Select-Object -First 1
    $build = $null -ne $newer
}
if ($build) {
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        throw 'Node.js est necessaire pour construire l interface : installer la version LTS depuis https://nodejs.org puis relancer.'
    }
    Push-Location -LiteralPath $frontend
    try {
        $lock = Join-Path $frontend 'package-lock.json'
        $installed = Join-Path $frontend 'node_modules\.package-lock.json'
        if (-not (Test-Path -LiteralPath $installed) -or (Get-Item -LiteralPath $lock).LastWriteTimeUtc -gt (Get-Item -LiteralPath $installed -Force).LastWriteTimeUtc) {
            npm ci
            if ($LASTEXITCODE -ne 0) { throw 'Installation des dependances de l interface impossible.' }
        }
        npm run build
        if ($LASTEXITCODE -ne 0) { throw 'Construction de l interface impossible.' }
    } finally {
        Pop-Location
    }
}

$appListen = if ($Reseau) { '0.0.0.0' } else { '127.0.0.1' }
$appArguments = @('-m', 'backend', '--host', $appListen, '--port', "$Port")
if ($Simulation) { $appArguments += '--simulation' }
& $appPython @appArguments
