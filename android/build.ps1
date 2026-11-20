param(
    [string]$Platform = "$env:ANDROID_HOME\platforms\android-35",
    [string]$Tools = "$env:ANDROID_HOME\build-tools\35.0.0"
)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$androidJar = (Resolve-Path -LiteralPath (Join-Path $Platform 'android.jar')).Path
$signer = Join-Path $Tools 'apksigner.bat'
$build = Join-Path ([IO.Path]::GetTempPath()) ('fitness-apk-' + [guid]::NewGuid().ToString('N'))
$classes = Join-Path $build 'classes'
$null = New-Item -ItemType Directory -Path $classes
$keyDir = Join-Path $env:LOCALAPPDATA 'FitnessApp\android-signature'
$null = New-Item -ItemType Directory -Force -Path $keyDir
$key = Join-Path $keyDir 'fitness-sante.p12'
$passwordFile = Join-Path $keyDir 'password.dpapi'
$published = Join-Path $PSScriptRoot '..\frontend\public\fitness-sante.apk'
if ((Test-Path -LiteralPath $published) -and (!(Test-Path $key) -or !(Test-Path $passwordFile))) {
    throw 'Pour mettre à jour le compagnon distribué, utilisez le compte Windows qui possède sa clé de signature.'
}
if (!(Test-Path $key) -and !(Test-Path $passwordFile)) {
    $random = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($random) } finally { $rng.Dispose() }
    $secure = ConvertTo-SecureString ([Convert]::ToBase64String($random)) -AsPlainText -Force
    $secure | ConvertFrom-SecureString | Set-Content -LiteralPath $passwordFile -Encoding ascii
}
$secret = Get-Content -LiteralPath $passwordFile -Raw | ForEach-Object { ConvertTo-SecureString $_.Trim() }
$env:FITNESS_APK_STORE_PASS = [Net.NetworkCredential]::new('', $secret).Password
try {
    if (!(Test-Path $key)) {
        & keytool -genkeypair -keystore $key -storetype PKCS12 -storepass:env FITNESS_APK_STORE_PASS -keypass:env FITNESS_APK_STORE_PASS -alias fitness -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=FitnessApp Sante'
        if ($LASTEXITCODE) { throw 'Signature Android indisponible' }
    }
    & javac --release 17 -encoding UTF-8 -classpath $androidJar -d $classes (Join-Path $PSScriptRoot 'src\fr\fitnessapp\sante\SaveWorkout.java')
    if ($LASTEXITCODE) { throw 'Compilation Java en échec' }
    $classesJar = Join-Path $build 'classes.jar'
    & jar cf $classesJar -C $classes .
    if ($LASTEXITCODE) { throw 'Assemblage Java en échec' }
    & (Join-Path $Tools 'd8.bat') --min-api 34 --lib $androidJar --output $build $classesJar
    if ($LASTEXITCODE) { throw 'Compilation DEX en échec' }
    $unsigned = Join-Path $build 'unsigned.apk'
    & (Join-Path $Tools 'aapt2.exe') link -I $androidJar --manifest (Join-Path $PSScriptRoot 'AndroidManifest.xml') -o $unsigned
    if ($LASTEXITCODE) { throw 'Assemblage du manifeste en échec' }
    & jar uf $unsigned -C $build classes.dex
    if ($LASTEXITCODE) { throw 'Assemblage APK en échec' }
    $aligned = Join-Path $build 'aligned.apk'
    & (Join-Path $Tools 'zipalign.exe') -f 4 $unsigned $aligned
    if ($LASTEXITCODE) { throw 'Alignement APK en échec' }
    $signed = Join-Path $build 'fitness-sante.apk'
    & $signer sign --ks $key --ks-pass env:FITNESS_APK_STORE_PASS --ks-key-alias fitness --out $signed $aligned
    if ($LASTEXITCODE) { throw 'Signature APK en échec' }
    $verification = & $signer verify --verbose --print-certs $signed
    if ($LASTEXITCODE) { throw 'Signature APK invalide' }
    $verification
    if (Test-Path -LiteralPath $published) {
        $previous = & $signer verify --print-certs $published
        if ($LASTEXITCODE) { throw 'Signature de la version distribuée invalide' }
        $cert = $verification -match '^Signer #1 certificate SHA-256 digest:'
        if (!$cert -or $cert[0] -notin $previous) { throw 'Le certificat a changé. Le compagnon distribué est conservé.' }
    }
    Copy-Item -LiteralPath $signed -Destination $published -Force
} finally {
    Remove-Item Env:FITNESS_APK_STORE_PASS
}
