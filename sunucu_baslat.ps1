# Bagimsiz statik frontend sunucusu baslaticisi
param(
    [ValidateRange(1, 65535)]
    [int]$Port = 4173,
    [switch]$Wait
)

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $scriptPath) { $scriptPath = Get-Location }

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
    Write-Host "Hata: Statik sunucu icin Node.js gereklidir." -ForegroundColor Red
    Exit 1
}

$serverScript = Join-Path $scriptPath "tools\server.mjs"
if (-not (Test-Path -LiteralPath $serverScript -PathType Leaf)) {
    Write-Host "Hata: Sunucu giris dosyasi bulunamadi: $serverScript" -ForegroundColor Red
    Exit 1
}

$existingListener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($existingListener) {
    Write-Host "Sunucu zaten calisiyor: http://localhost:$Port" -ForegroundColor Yellow
    Exit 0
}

$powerShellPath = Join-Path $PSHOME "powershell.exe"
$escapedNodePath = $nodeCommand.Source.Replace("'", "''")
$escapedServerScript = $serverScript.Replace("'", "''")
$childCommand = "`$env:HOST = '127.0.0.1'; `$env:PORT = '$Port'; & '$escapedNodePath' '$escapedServerScript'"
$encodedCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($childCommand))
$frontendCmd = "`"$powerShellPath`" -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand $encodedCommand"

Write-Host "Statik frontend sunucusu (Port $Port) WMI ile baslatiliyor..." -ForegroundColor Cyan
$result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine = $frontendCmd
    CurrentDirectory = $scriptPath
}

if ($result.ReturnValue -ne 0) {
    Write-Host "Hata: Sunucu baslatilamadi. Hata Kodu: $($result.ReturnValue)" -ForegroundColor Red
    Exit 1
}

Write-Host "-> Sunucu basariyla baslatildi! PID: $($result.ProcessId)" -ForegroundColor Green
Write-Host "   URL: http://localhost:$Port" -ForegroundColor Green

if ($Wait) {
    Wait-Process -Id $result.ProcessId -ErrorAction SilentlyContinue
}
