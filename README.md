# Aervellum

Aervellum is a private, local-first voice-notes app that records microphone audio,
transcribes it with local Whisper models, and typesets the result as an editable
entry, diary page, or poem on a textured paper surface.

This project was made as a side activity. I always felt that it was really
tiring to type out everything or handwrite my thoughts, and I would often lose
the train of thought I was having while typing or writing it down. I felt this
especially when I was writing my diary or trying to quickly take down idea
notes. 

I tried looking for dedicated apps that could record and transcribe my voice notes on the fly, 
though admittedly not with a huge amount of effort, and eventually decided to make my own.

The app currently has three main writing shapes:

- Entry
- Diary
- Poem

All models should run locally. Right now, I have it set up so that I can host
the app on my computer and connect to the hosted site through Tailscale. I am
planning to turn it into an app that can be downloaded so it is fully local on a
phone too, but there are also good reasons to keep the hosted option: as long as
you are connected to your Tailscale network, you can access all of your notes
from anywhere.

The goal is for Aervellum to run on most personal systems, including NVIDIA GPU
machines, Intel/CPU-only computers, and macOS devices. This portability work is
still ongoing, so support outside the original Windows + AMD Vulkan setup may be
buggy while the project is still young.

If anyone is interested in progressing this project further, do not hesitate to
let me know. I love open-source software, so I am planning to do the same with
this. I was able to create this with the help of Codex.

![Aervellum desktop app screenshot](assets/aervellum-app.png)

The workspace also contains a native iPhone companion in `ios/AervellumDiary/`.
It uses WhisperKit/Core ML for on-device transcription and SwiftData for a
private diary archive. See its own README for Mac/Xcode build instructions.

No account, server, analytics, cloud API, or network connection is used at
runtime. Recordings and notes stay under `outputs/`.

## Run the app

If you cloned this repository from GitHub, the private and heavy local files are
intentionally not included. You need:

- a local model, normally `models/ggml-large-v3-turbo-q5_0.bin`
- a local `whisper-cli` runtime, either under `runtime/whisper/` or available
  on `PATH`
- Electron dependencies in `node_modules/`

### Fresh clone setup

Install the JavaScript dependencies:

```powershell
npm.cmd install
```

Fetch the local `whisper.cpp` source used by the setup scripts:

```powershell
New-Item -ItemType Directory -Force vendor | Out-Null
git clone https://github.com/ggml-org/whisper.cpp vendor/whisper.cpp
git -C vendor/whisper.cpp checkout 43d78af5be58f41d6ffbc227d608f104577741ea
```

Create the local model folder:

```powershell
New-Item -ItemType Directory -Force models | Out-Null
```

Download `ggml-large-v3-turbo-q5_0.bin` from the upstream whisper.cpp model
collection and place it at:

```text
models/ggml-large-v3-turbo-q5_0.bin
```

If you have Git Bash, WSL, macOS, or Linux available, the vendored whisper.cpp
helper can download it directly into Aervellum's local `models/` folder:

```bash
cd vendor/whisper.cpp/models
./download-ggml-model.sh large-v3-turbo-q5_0 ../../../models
```

On Windows, you can also try the bundled command script:

```powershell
vendor\whisper.cpp\models\download-ggml-model.cmd large-v3-turbo-q5_0 models
```

Or download the same model manually from:

```text
https://huggingface.co/ggerganov/whisper.cpp/tree/main
```

Then build or install a `whisper-cli` runtime. The easiest starting point is the
CPU fallback:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\build-whisper-cpu.ps1
```

For GPU acceleration, use the backend-specific build scripts in the build
section below.

Verify the local model and runtime:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\verify-runtime.ps1
```

Then start the desktop app:

From PowerShell:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\run.ps1
```

Or:

```powershell
npm.cmd start
```

On first use, Windows will ask for microphone permission. Recording stops when
you press the red button a second time. After transcription, the text remains
editable. "Save as Markdown" writes the page to `outputs/notes/`; source WAV
files and plain transcripts are kept in `outputs/audio/`. Diary entries use a
lined journal treatment and are saved with `form: diary` in their front matter.

Aervellum records WAV because uncompressed PCM audio is simple, local, and widely
supported across Windows, macOS, Linux, browsers, and `whisper.cpp`. WAV is not
limited to Windows. Some `whisper-cli` builds can also decode formats such as
FLAC, MP3, and OGG, especially when built with FFmpeg support, but WAV avoids
extra codec dependencies.

## Verify local transcription

Run the included 11-second JFK sample through the installed model:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\verify-runtime.ps1
```

This prints the selected runtime, backend, accelerator, and transcript. Aervellum
detects the backend from the installed `whisper-cli` build. Depending on what
you built or installed, that may be:

- CUDA for NVIDIA GPUs
- Vulkan for AMD, Intel, or other Vulkan-capable GPUs
- Metal for macOS
- CPU-only fallback for computers without a supported GPU

The original Windows development machine was also verified with:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\verify-gpu.ps1
```

That older check is intentionally specific to the AMD Radeon RX 6700 XT Vulkan
build. The verified result on June 24, 2026 was:

> And so, my fellow Americans, ask not what your country can do for you, ask
> what you can do for your country.

The 11-second clip completed in 5.63 seconds total with the 573.40 MB quantized
model loaded on the Radeon.

## Build details

The app now resolves the Whisper runtime in this order:

1. `AERVELLUM_WHISPER_BINARY`, if set
2. `runtime/whisper/<platform>/cuda/whisper-cli`
3. `runtime/whisper/<platform>/vulkan/whisper-cli`
4. `runtime/whisper/<platform>/metal/whisper-cli`
5. `runtime/whisper/<platform>/cpu/whisper-cli`
6. `runtime/whisper/whisper-cli.exe` or `runtime/whisper/whisper-cli`
7. `whisper-cli` from `PATH`

The model path defaults to `models/ggml-large-v3-turbo-q5_0.bin`. You can point
at another local model with `AERVELLUM_WHISPER_MODEL`.

The workspace contains:

- `vendor/whisper.cpp/` at commit `43d78af5be58f41d6ffbc227d608f104577741ea`
- `tools/vulkan-sdk/` with a workspace-local Vulkan SDK payload
- `tools/spirv-headers/` with the installed SPIR-V headers package
- `work/build-whisper-vulkan/` with the CMake/Ninja build
- `runtime/whisper/` with repo-local app runtimes

The build used GCC 13.2, CMake 3.29, Ninja, and:

```text
GGML_VULKAN=ON
Vulkan SDK 1.4.309.0
GL_EXT_integer_dot_product enabled
```

To rebuild the original Windows Vulkan runtime after editing or updating
`vendor/whisper.cpp`:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\build-whisper.ps1
powershell.exe -ExecutionPolicy Bypass -File .\scripts\verify-runtime.ps1
```

Other experimental runtime builds:

```powershell
# Windows CPU-only fallback
powershell.exe -ExecutionPolicy Bypass -File .\scripts\build-whisper-cpu.ps1

# Windows NVIDIA CUDA, requires the NVIDIA CUDA Toolkit
powershell.exe -ExecutionPolicy Bypass -File .\scripts\build-whisper-cuda.ps1
```

```bash
# macOS Metal
./scripts/build-whisper-metal.sh

# macOS/Linux CPU-only fallback
./scripts/build-whisper-cpu.sh
```

The Windows Vulkan build script stages the finished executable and required
MinGW DLLs into `runtime/whisper/`. The newer portable scripts stage runtimes
under `runtime/whisper/<platform>/<backend>/`.

## What is not committed

Some folders are intentionally ignored so the public repository does not include
private recordings, transcripts, machine-specific builds, or very large model
files:

- `outputs/` contains your local recordings, transcripts, notes, and host logs.
- `models/` contains downloaded Whisper model weights.
- `runtime/` contains locally built `whisper-cli` binaries and platform DLLs.
- `vendor/` contains cloned third-party source trees such as `whisper.cpp`.
- `work/` contains CMake/Ninja build trees.
- `node_modules/` contains installed JavaScript dependencies.
- `.env` and `.env.*` are reserved for private local settings.

These files are recreated by the fresh-clone setup and build steps above. The
repo should stay small and privacy-safe, while still being reproducible.

## Development checks

```powershell
npm.cmd install
npm.cmd run check
npm.cmd audit
```

Electron is pinned in `package.json` and `package-lock.json`. The UI is plain
HTML/CSS/JavaScript; the Electron main process only exposes three narrow IPC
operations: inspect local readiness, transcribe WAV bytes, and save Markdown.

## Private phone access with Tailscale

The same interface can run as a localhost web app. Audio is recorded by the
phone browser, sent through the encrypted tailnet to this computer, transcribed
on the host computer with the best available local Whisper runtime, and stored
in this workspace.

Start the private host:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\serve-private.ps1
```

This workspace expects the existing Tailscale Serve mapping:

```powershell
tailscale serve --bg http://127.0.0.1:3210
```

Then, from a phone signed into the same tailnet, open your own Tailscale Serve
URL:

```text
https://your-machine.your-tailnet.ts.net
```

If you want `serve-private.ps1` to print your private URL, set it in your local
shell or a private startup script:

```powershell
$env:AERVELLUM_PRIVATE_URL = "https://your-machine.your-tailnet.ts.net"
```

Allow microphone access when prompted. Tailscale Serve provides the HTTPS
secure context required by mobile browsers. The Node host binds only to
`127.0.0.1`; it is not exposed directly to the LAN or public internet.

### Browse previous entries

Saved Markdown entries appear as pages after the current draft. Use the arrow
buttons above the paper, the left/right keyboard arrows, or horizontal trackpad
scrolling. On a phone, swipe left for older entries and right to return toward
the current draft.

Archived pages are read-only, while the current draft remains editable and is
preserved as you browse. Long archived entries scroll vertically inside the
paper. Press the page counter to jump directly back to the draft.

The archive uses `outputs/audio/*-transcript.txt` as its source of truth, so
every completed recording appears as its own page. A matching Markdown file can
provide that recording's custom title and form. Standalone Markdown notes also
appear when they do not match a recording. Repeated save requests reuse the
existing Markdown entry instead of creating extra copies.

The browser requests only the live archive count at startup. It loads a
recording's text when that page is opened, then preloads only the immediately
previous and next pages. The count refreshes every 15 seconds and whenever the
app returns to the foreground, so new transcript files appear without rebuilding
or restarting the app.

Newly saved Markdown includes an explicit `recording` field that links it to its
source transcript. This preserves custom titles and the selected field-note,
poem, or diary shape even when the displayed text was reformatted after
transcription.

Host logs are written to `outputs/host/`. To stop the host, find its process
cleanly:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\stop-private.ps1
```

The computer must remain awake and connected to Tailscale while the phone is
using Aervellum. After a reboot, run `serve-private.ps1` again; the existing
Tailscale Serve mapping remains in place.

## Workspace map

```text
app/                    Electron main, preload, renderer, and paper UI
ios/AervellumDiary/        Native SwiftUI on-device diary companion
models/                 Local Whisper model
outputs/audio/          Recordings and raw transcripts
outputs/notes/          Saved Markdown notes, poems, and diary entries
outputs/verification/   GPU verification transcript and logs
runtime/whisper/        Repo-local whisper-cli runtimes used by the app
scripts/                Build, verify, and run commands
tools/                  Workspace-local build dependencies
vendor/                 whisper.cpp and SPIR-V header source
work/                   CMake/Ninja build trees
```
