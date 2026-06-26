$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not (Test-Path "node_modules\electron\dist\electron.exe")) {
    throw "Electron runtime is not installed. Run: npm.cmd install"
}

& npm.cmd start
