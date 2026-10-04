param([switch]$Simulation, [switch]$Reseau, [int]$Port = 4317)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$pocPython = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pocPython)) {
    python -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'Creation de l environnement Python impossible.' }
}
& $pocPython -c 'import bleak, fastapi, uvicorn'
if ($LASTEXITCODE -ne 0) {
    & $pocPython -m pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) { throw 'Installation des dependances impossible.' }
}
$pocListen = if ($Reseau) { '0.0.0.0' } else { '127.0.0.1' }
$pocArguments = @('-m', 'poc.server', '--host', $pocListen, '--port', "$Port")
if ($Simulation) { $pocArguments += '--simulate' }
& $pocPython @pocArguments
