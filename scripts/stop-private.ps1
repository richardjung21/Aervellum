$ErrorActionPreference = "Stop"

try {
    $Health = Invoke-RestMethod -Uri "http://127.0.0.1:3210/api/health" -TimeoutSec 2
} catch {
    Write-Host "Aervellum private host is not running."
    exit 0
}

if ($Health.service -notin @("aervellum", "vellum")) {
    throw "Port 3210 is in use by another service; it was not stopped."
}

$Listener = Get-NetTCPConnection -LocalPort 3210 -State Listen -ErrorAction Stop |
    Where-Object { $_.LocalAddress -eq "127.0.0.1" } |
    Select-Object -First 1

if (-not $Listener) {
    throw "Aervellum responded, but its listening process could not be identified."
}

$Process = Get-Process -Id $Listener.OwningProcess -ErrorAction Stop
if ($Process.ProcessName -notmatch "^node$") {
    throw "The Aervellum listener is not a Node process; it was not stopped."
}

Stop-Process -Id $Process.Id
Write-Host "Aervellum private host stopped."
