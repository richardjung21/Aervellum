# Aervellum Diary for iPhone

A native SwiftUI companion to the desktop Aervellum app. It records spoken diary
entries and transcribes them locally with WhisperKit/Core ML. Entries are stored
in SwiftData inside the app sandbox.

## Current design

- iOS 17 or newer
- iPhone-only interface
- WhisperKit multilingual `base` model by default
- Optional `tiny` and `small` models
- M4A microphone recording at 16 kHz mono
- Editable paper diary entries
- Local SwiftData archive

The first model setup requires internet access to download Core ML assets from
Hugging Face. Once the model is cached, recording, transcription, editing, and
reading work offline.

The project pins the Argmax Swift package to commit
`99d0a2fc9e95f5a1d736f4fb04144f9e1b3a4b33` (checked June 24, 2026) so the
WhisperKit API does not move underneath the first build.

## Build on a Mac

Requirements:

- macOS 14 or newer
- Xcode 16 or newer
- An Apple developer identity for installing on a physical iPhone
- XcodeGen

Install XcodeGen:

```bash
brew install xcodegen
```

Generate and open the project:

```bash
cd ios/AervellumDiary
xcodegen generate
open AervellumDiary.xcodeproj
```

In Xcode:

1. Select the `AervellumDiary` target.
2. Open **Signing & Capabilities**.
3. Select your development team.
4. Replace `com.example.AervellumDiary` with a unique bundle ID.
5. Connect the iPhone 14 Pro, select it as the run destination, and press Run.
6. Approve microphone permission.
7. Keep the app open during the first model download.

For a free Apple ID, device installations normally need to be refreshed
periodically. A paid Apple Developer account supports normal long-lived signing
and TestFlight distribution.

## Model guidance for iPhone 14 Pro

- `base`: recommended starting point; multilingual and relatively gentle.
- `small`: more accurate, but slower and warmer during long entries.
- `tiny`: fastest and smallest; useful for testing, but less reliable.

The desktop RX 6700 XT large-v3-turbo path should remain available for maximum
accuracy. The iPhone app is intended for offline capture when the PC is asleep
or unavailable.

## Source layout

```text
Sources/
  Models/       SwiftData diary model
  Services/     AVFoundation recording and WhisperKit transcription
  Theme/        Paper-and-ink visual system
  Views/        Library, composer, entry editor, and model settings
```
