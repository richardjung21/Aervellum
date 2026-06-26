#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WHISPER_SOURCE="$ROOT/vendor/whisper.cpp"
BUILD_DIR="$ROOT/work/build-whisper-metal"
RUNTIME="$ROOT/runtime/whisper/darwin/metal"

if [[ ! -d "$WHISPER_SOURCE" ]]; then
  echo "whisper.cpp source was not found at vendor/whisper.cpp." >&2
  exit 1
fi

cmake -S "$WHISPER_SOURCE" -B "$BUILD_DIR" \
  -DCMAKE_BUILD_TYPE=Release \
  -DGGML_METAL=ON \
  -DWHISPER_BUILD_TESTS=OFF \
  -DWHISPER_BUILD_SERVER=OFF

cmake --build "$BUILD_DIR" --config Release -j "$(sysctl -n hw.logicalcpu 2>/dev/null || echo 4)"

mkdir -p "$RUNTIME"
cp "$BUILD_DIR/bin/whisper-cli" "$RUNTIME/"
echo "Metal whisper runtime staged in runtime/whisper/darwin/metal"
