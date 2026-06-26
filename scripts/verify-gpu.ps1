$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Runtime = Join-Path $Root "runtime\whisper\whisper-cli.exe"
$Model = Join-Path $Root "models\ggml-large-v3-turbo-q5_0.bin"
$Sample = Join-Path $Root "vendor\whisper.cpp\samples\jfk.wav"
$OutputDir = Join-Path $Root "outputs\verification"
$OutputBase = Join-Path $OutputDir "jfk-vulkan"
$Log = Join-Path $OutputDir "jfk-vulkan.log"

New-Item -ItemType Directory -Force $OutputDir | Out-Null
$Stdout = Join-Path $OutputDir "jfk-vulkan.stdout.log"
$Stderr = Join-Path $OutputDir "jfk-vulkan.stderr.log"
$Process = Start-Process -FilePath $Runtime `
    -ArgumentList @("-m", $Model, "-f", $Sample, "-l", "en", "-otxt", "-of", $OutputBase) `
    -WorkingDirectory $Root `
    -RedirectStandardOutput $Stdout `
    -RedirectStandardError $Stderr `
    -WindowStyle Hidden `
    -Wait `
    -PassThru

$lines = @((Get-Content $Stdout), (Get-Content $Stderr))
$lines | Set-Content $Log
$lines | Write-Host

if ($Process.ExitCode -ne 0) {
    throw "whisper-cli exited with code $($Process.ExitCode). Inspect $Log."
}

if (-not ($lines -match "using Vulkan0 backend")) {
    throw "Vulkan backend was not selected. Inspect outputs\verification\jfk-vulkan.log."
}
if (-not ($lines -match "AMD Radeon RX 6700 XT")) {
    throw "The expected Radeon GPU was not detected."
}

Write-Host "`nGPU transcription verified."
