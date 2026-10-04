param(
    [switch]$Simulation,
    [switch]$Reseau,
    [ValidateRange(1, 65535)][int]$Port = 4330,
    [switch]$Reconstruire,
    [switch]$Ouvrir
)
# Lance l'application Fitness sur ce PC. Le POC (start-poc.ps1) reste independant.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$env:PYTHONUTF8 = '1'
Set-Location -LiteralPath $PSScriptRoot

$appListen = if ($Reseau) { '0.0.0.0' } else { '127.0.0.1' }
$busy = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() |
    Where-Object { $_.Port -eq $Port }
if ($busy) {
    throw "Le port $Port est deja utilise. Si Fitness tourne deja, ouvrir http://127.0.0.1:$Port ; sinon choisir -Port <numero>."
}
$probe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse($appListen), $Port)
$probe.ExclusiveAddressUse = $true
try {
    $probe.Start()
} catch {
    throw "Le port $Port est indisponible. Si Fitness tourne deja, ouvrir http://127.0.0.1:$Port ; sinon choisir -Port <numero>. $($_.Exception.Message)"
} finally {
    $probe.Stop()
}

# Une empreinte du contenu detecte aussi les suppressions et les anciens horodatages.
function Get-SourceFingerprint([string]$Directory, [string[]]$RelativePaths) {
    $paths = $RelativePaths | ForEach-Object { Join-Path $Directory $_ } | Where-Object { Test-Path -LiteralPath $_ }
    $entries = Get-ChildItem -LiteralPath $paths -Recurse -File | Sort-Object FullName | ForEach-Object {
        $relative = $_.FullName.Substring($Directory.Length + 1).Replace('\', '/')
        "$relative=$((Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash)"
    }
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        return [BitConverter]::ToString($sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes(($entries -join "`n")))).Replace('-', '')
    } finally {
        $sha.Dispose()
    }
}

# Python : environnement .venv partage avec le POC
$appPython = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $appPython)) {
    if (Get-Command py.exe -ErrorAction SilentlyContinue) {
        py.exe -3.12 -m venv .venv
    } elseif (Get-Command python.exe -ErrorAction SilentlyContinue) {
        python.exe -m venv .venv
    } else {
        throw 'Python 3.12 est necessaire. Installer Python depuis https://www.python.org puis relancer.'
    }
    if ($LASTEXITCODE -ne 0) { throw 'Creation de l environnement Python impossible.' }
}
& $appPython -c 'import sys; sys.exit(0 if sys.version_info[:2] == (3, 12) else 1)'
if ($LASTEXITCODE -ne 0) { throw 'L environnement .venv doit utiliser Python 3.12. Voir README.md.' }

$requirements = Join-Path $PSScriptRoot 'requirements.txt'
$requirementsHash = (Get-FileHash -LiteralPath $requirements -Algorithm SHA256).Hash
$requirementsStamp = Join-Path $PSScriptRoot '.venv\fitness-requirements.sha256'
$requirementsChanged = -not (Test-Path -LiteralPath $requirementsStamp)
if (-not $requirementsChanged) { $requirementsChanged = (Get-Content -LiteralPath $requirementsStamp -Raw).Trim() -ne $requirementsHash }
& $appPython -c "import importlib.util, sys; sys.exit(0 if all(importlib.util.find_spec(name) for name in ('fastapi', 'uvicorn', 'bleak', 'httpx2')) else 1)"
if ($LASTEXITCODE -ne 0 -or $requirementsChanged) {
    Write-Host 'Preparation des dependances Python...'
    & $appPython -m pip install --disable-pip-version-check -r $requirements
    if ($LASTEXITCODE -ne 0) { throw 'Installation des dependances Python impossible.' }
    Set-Content -LiteralPath $requirementsStamp -Value $requirementsHash -Encoding ASCII
}
& $appPython -c 'import fastapi, uvicorn, bleak, httpx2'
if ($LASTEXITCODE -ne 0) {
    throw 'Les dependances Python ne peuvent pas etre chargees. Voir l erreur ci-dessus.'
}

# Interface : construite uniquement quand son contenu ou sa configuration change.
$frontend = Join-Path $PSScriptRoot 'frontend'
$index = Join-Path $frontend 'dist\index.html'
$sourcePaths = @('src', 'public', 'index.html', 'package.json', 'package-lock.json', 'vite.config.ts')
$sourcePaths += Get-ChildItem -LiteralPath $frontend -Filter 'tsconfig*.json' -File | ForEach-Object { $_.Name }
$sourceHash = Get-SourceFingerprint $frontend $sourcePaths
$buildStamp = Join-Path $frontend 'dist\.fitness-source.sha256'
$build = $Reconstruire -or -not (Test-Path -LiteralPath $index) -or -not (Test-Path -LiteralPath $buildStamp)
if (-not $build) {
    $build = (Get-Content -LiteralPath $buildStamp -Raw).Trim() -ne $sourceHash
}
if ($build) {
    if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
        throw 'Node.js est necessaire pour construire l interface : installer la version LTS depuis https://nodejs.org puis relancer.'
    }
    Push-Location -LiteralPath $frontend
    try {
        $dependencyHash = Get-SourceFingerprint $frontend @('package.json', 'package-lock.json')
        $installed = Join-Path $frontend 'node_modules\.fitness-dependencies.sha256'
        $install = -not (Test-Path -LiteralPath $installed)
        if (-not $install) { $install = (Get-Content -LiteralPath $installed -Raw).Trim() -ne $dependencyHash }
        if ($install) {
            npm.cmd ci
            if ($LASTEXITCODE -ne 0) { throw 'Installation des dependances de l interface impossible.' }
            Set-Content -LiteralPath $installed -Value $dependencyHash -Encoding ASCII
        }
        npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'Construction de l interface impossible.' }
        Set-Content -LiteralPath $buildStamp -Value $sourceHash -Encoding ASCII
    } finally {
        Pop-Location
    }
}

$appArguments = @('-m', 'backend', '--host', $appListen, '--port', "$Port")
if ($Simulation) { $appArguments += '--simulation' }
if ($Ouvrir) { $appArguments += '--open-browser' }
& $appPython @appArguments
if ($LASTEXITCODE -ne 0) { throw 'Le serveur ne peut pas demarrer. Voir l erreur ci-dessus.' }
