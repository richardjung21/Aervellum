#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WHISPER_SOURCE="$ROOT/vendor/whisper.cpp"
PLATFORM="$(node -p "process.platform" 2>/dev/null || uname | tr '[:upper:]' '[:lower:]')"
BUILD_DIR="$ROOT/work/build-whisper-cpu-$PLATFORM"
RUNTIME="$ROOT/runtime/whisper/$PLATFORM/cpu"

if [[ ! -d "$WHISPER_SOURCE" ]]; then
  echo "whisper.cpp source was not found at vendor/whisper.cpp." >&2
  exit 1
fi

cmake -S "$WHISPER_SOURCE" -B "$BUILD_DIR" \
  -DCMAKE_BUILD_TYPE=Release \
  -DWHISPER_BUILD_TESTS=OFF \
  -DWHISPER_BUILD_SERVER=OFF

if command -v nproc >/dev/null 2>&1; then
  JOBS="$(nproc)"
else
  JOBS="$(sysctl -n hw.logicalcpu 2>/dev/null || echo 4)"
fi

cmake --build "$BUILD_DIR" --config Release -j "$JOBS"

mkdir -p "$RUNTIME"
cp "$BUILD_DIR/bin/whisper-cli" "$RUNTIME/"
echo "CPU whisper runtime staged in runtime/whisper/$PLATFORM/cpu"
