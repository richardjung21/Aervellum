$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$Health = "http://127.0.0.1:3210/api/health"
$PrivateUrl = if ($env:AERVELLUM_PRIVATE_URL) { $env:AERVELLUM_PRIVATE_URL } elseif ($env:VELLUM_PRIVATE_URL) { $env:VELLUM_PRIVATE_URL } else { "Set AERVELLUM_PRIVATE_URL to show your Tailscale URL here." }
try {
    $Existing = Invoke-RestMethod -Uri $Health -TimeoutSec 2
    if ($Existing.ok) {
        Write-Host "Aervellum is already running at http://127.0.0.1:3210"
        Write-Host "Private URL: $PrivateUrl"
        exit 0
    }
} catch {
}

$LogDir = Join-Path $Root "outputs\host"
New-Item -ItemType Directory -Force $LogDir | Out-Null
$Stdout = Join-Path $LogDir "server.stdout.log"
$Stderr = Join-Path $LogDir "server.stderr.log"
$Node = (Get-Command node).Source

$Process = Start-Process -FilePath $Node `
    -ArgumentList "app/server.js" `
    -WorkingDirectory $Root `
    -RedirectStandardOutput $Stdout `
    -RedirectStandardError $Stderr `
    -WindowStyle Hidden `
    -PassThru

for ($Attempt = 0; $Attempt -lt 20; $Attempt++) {
    Start-Sleep -Milliseconds 250
    try {
        $Ready = Invoke-RestMethod -Uri $Health -TimeoutSec 2
        if ($Ready.ok) {
            Write-Host "Aervellum private host started (PID $($Process.Id))."
            Write-Host "Private URL: $PrivateUrl"
            exit 0
        }
    } catch {
    }
}

throw "Aervellum did not start. Inspect outputs\host\server.stderr.log."
