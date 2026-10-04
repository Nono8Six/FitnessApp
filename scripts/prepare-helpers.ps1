# Empreinte du contenu, partagee par les deux lanceurs Windows.
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

function Get-LauncherFingerprint([string]$Directory) {
    Get-SourceFingerprint $Directory @(
        'launcher/src', 'launcher/icons', 'launcher/Cargo.toml', 'launcher/Cargo.lock',
        'launcher/build.rs', 'launcher/tauri.conf.json', 'frontend/src/launcher', 'frontend/src/styles',
        'frontend/src/components/ui.tsx', 'frontend/public',
        'frontend/launcher.html', 'frontend/vite.launcher.config.ts', 'frontend/tsconfig.json', 'frontend/tsconfig.launcher.json',
        'frontend/package.json', 'frontend/package-lock.json', 'build-launcher.ps1', 'scripts/prepare-helpers.ps1'
    )
}

function Install-FrontendDependencies([string]$Directory) {
    $dependencyHash = Get-SourceFingerprint $Directory @('package.json', 'package-lock.json')
    $installed = Join-Path $Directory 'node_modules\.fitness-dependencies.sha256'
    $install = -not (Test-Path -LiteralPath $installed)
    if (-not $install) { $install = (Get-Content -LiteralPath $installed -Raw).Trim() -ne $dependencyHash }
    if (-not $install) { return }
    Push-Location -LiteralPath $Directory
    try {
        npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw 'Installation des dependances de l interface impossible.' }
        Set-Content -LiteralPath $installed -Value $dependencyHash -Encoding ASCII
    } finally { Pop-Location }
}
