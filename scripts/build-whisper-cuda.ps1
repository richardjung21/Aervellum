$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$WhisperSource = Join-Path $Root "vendor\whisper.cpp"
$BuildDir = Join-Path $Root "work\build-whisper-cuda"
$Runtime = Join-Path $Root "runtime\whisper\win32\cuda"

if (-not (Test-Path $WhisperSource)) {
    throw "whisper.cpp source was not found at vendor\whisper.cpp."
}
if (-not $env:CUDA_PATH) {
    throw "CUDA_PATH is not set. Install the NVIDIA CUDA Toolkit before building the CUDA runtime."
}

cmake -S $WhisperSource -B $BuildDir `
    -DCMAKE_BUILD_TYPE=Release `
    -DGGML_CUDA=ON `
    -DWHISPER_BUILD_TESTS=OFF `
    -DWHISPER_BUILD_SERVER=OFF

cmake --build $BuildDir --config Release -j 8

New-Item -ItemType Directory -Force $Runtime | Out-Null
$Built = @(
    Join-Path $BuildDir "bin\Release\whisper-cli.exe"
    Join-Path $BuildDir "bin\whisper-cli.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $Built) {
    throw "Could not find the built whisper-cli.exe in $BuildDir."
}

Copy-Item $Built $Runtime -Force
Write-Host "CUDA whisper runtime staged in runtime\whisper\win32\cuda"
