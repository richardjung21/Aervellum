$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$WhisperSource = Join-Path $Root "vendor\whisper.cpp"
$BuildDir = Join-Path $Root "work\build-whisper-cpu"
$Runtime = Join-Path $Root "runtime\whisper\win32\cpu"

if (-not (Test-Path $WhisperSource)) {
    throw "whisper.cpp source was not found at vendor\whisper.cpp."
}

cmake -S $WhisperSource -B $BuildDir -G Ninja `
    -DCMAKE_BUILD_TYPE=Release `
    -DWHISPER_BUILD_TESTS=OFF `
    -DWHISPER_BUILD_SERVER=OFF

cmake --build $BuildDir --config Release -j 8

New-Item -ItemType Directory -Force $Runtime | Out-Null
Copy-Item (Join-Path $BuildDir "bin\whisper-cli.exe") $Runtime -Force

$StrawberryBin = "C:\Strawberry\c\bin"
foreach ($Dll in "libgcc_s_seh-1.dll", "libstdc++-6.dll", "libwinpthread-1.dll", "libgomp-1.dll") {
    $Source = Join-Path $StrawberryBin $Dll
    if (Test-Path $Source) {
        Copy-Item $Source $Runtime -Force
    }
}

Write-Host "CPU whisper runtime staged in runtime\whisper\win32\cpu"
