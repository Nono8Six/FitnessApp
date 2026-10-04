param([int]$Port = 4321)
$ErrorActionPreference = 'Stop'
$taskPython = Join-Path $PSScriptRoot '..\..\..\..\.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $taskPython)) { $taskPython = 'python' }
Write-Host "Maquettes uniquement : http://127.0.0.1:$Port"
Write-Host 'Ctrl+C pour fermer. Le POC et le tapis ne sont pas utilisés.'
& $taskPython -m http.server $Port --bind 127.0.0.1 --directory $PSScriptRoot
