$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Health = Join-Path $Root "app\local-service.js"
$Sample = Join-Path $Root "vendor\whisper.cpp\samples\jfk.wav"
$OutputDir = Join-Path $Root "outputs\verification"

if (-not (Test-Path $Sample)) {
    throw "Sample audio not found at vendor\whisper.cpp\samples\jfk.wav."
}

New-Item -ItemType Directory -Force $OutputDir | Out-Null

Push-Location $Root
try {
    $Script = @"
const fs = require("node:fs/promises");
const service = require("./app/local-service");

(async () => {
  const config = await service.getConfig();
  console.log("Model:", config.modelName);
  console.log("Runtime:", config.binaryPath || "(missing)");
  console.log("Source:", config.runtimeSource || "(none)");

  if (!config.binaryReady || !config.modelReady) {
    process.exitCode = 1;
    return;
  }

  const wavBytes = await fs.readFile("vendor/whisper.cpp/samples/jfk.wav");
  const result = await service.transcribe({ wavBytes, language: "en" });
  console.log("Backend:", result.backend);
  console.log("Accelerator:", result.accelerator);
  console.log("Transcript:", result.text);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
"@
    $Script | node
} finally {
    Pop-Location
}
