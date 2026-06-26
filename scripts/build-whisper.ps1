$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$WhisperSource = Join-Path $Root "vendor\whisper.cpp"
$BuildDir = Join-Path $Root "work\build-whisper-vulkan"
$VulkanSdk = Join-Path $Root "tools\vulkan-sdk"
$SpirvHeaders = Join-Path $Root "tools\spirv-headers"

if (-not (Test-Path (Join-Path $VulkanSdk "Bin\glslc.exe"))) {
    throw "Local Vulkan SDK not found at tools\vulkan-sdk. See README.md."
}

$env:VULKAN_SDK = $VulkanSdk
$env:CC = "C:\Strawberry\c\bin\gcc.exe"
$env:CXX = "C:\Strawberry\c\bin\g++.exe"

cmake -S $WhisperSource -B $BuildDir -G Ninja `
    -DCMAKE_BUILD_TYPE=Release `
    "-DCMAKE_PREFIX_PATH=$($SpirvHeaders.Replace('\','/'))" `
    "-DVulkan_INCLUDE_DIR=$($VulkanSdk.Replace('\','/'))/Include" `
    "-DVulkan_LIBRARY=$($VulkanSdk.Replace('\','/'))/Lib/vulkan-1.lib" `
    "-DVulkan_GLSLC_EXECUTABLE=$($VulkanSdk.Replace('\','/'))/Bin/glslc.exe" `
    "-DCMAKE_C_FLAGS=-D_WIN32_WINNT=0x0601" `
    "-DCMAKE_CXX_FLAGS=-D_WIN32_WINNT=0x0601" `
    -DGGML_VULKAN=ON `
    -DWHISPER_BUILD_TESTS=OFF `
    -DWHISPER_BUILD_SERVER=OFF

cmake --build $BuildDir --config Release -j 8

$Runtime = Join-Path $Root "runtime\whisper"
$PlatformRuntime = Join-Path $Runtime "win32\vulkan"
New-Item -ItemType Directory -Force $Runtime | Out-Null
New-Item -ItemType Directory -Force $PlatformRuntime | Out-Null
Copy-Item (Join-Path $BuildDir "bin\whisper-cli.exe") $Runtime -Force
Copy-Item (Join-Path $BuildDir "bin\whisper-cli.exe") $PlatformRuntime -Force

foreach ($Dll in "libgcc_s_seh-1.dll", "libstdc++-6.dll", "libwinpthread-1.dll", "libgomp-1.dll") {
    Copy-Item (Join-Path "C:\Strawberry\c\bin" $Dll) $Runtime -Force
    Copy-Item (Join-Path "C:\Strawberry\c\bin" $Dll) $PlatformRuntime -Force
}

Write-Host "Vulkan whisper runtime staged in runtime\whisper and runtime\whisper\win32\vulkan"
