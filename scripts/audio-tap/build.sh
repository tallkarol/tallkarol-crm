#!/bin/bash
# Build TKAudioTap.app (ad-hoc signed unless TK_SIGN_IDENTITY is set). Prints the binary path.
set -euo pipefail
cd "$(dirname "$0")"

APP="build/TKAudioTap.app"
BIN="$APP/Contents/MacOS/audio-tap"
mkdir -p "$APP/Contents/MacOS"

xcrun swiftc -O \
  -swift-version 6 \
  -target arm64-apple-macos14.2 \
  -framework Foundation \
  -framework CoreAudio \
  -framework AudioToolbox \
  -framework AVFoundation \
  -framework CoreMedia \
  -framework ScreenCaptureKit \
  main.swift -o "$BIN"

cp Info.plist "$APP/Contents/Info.plist"

# Ad-hoc ("-") by default: no entitlements file, hardened runtime off. Every rebuild changes the
# code hash, so TCC forgets its answer and prompts again — see README.
codesign --force --sign "${TK_SIGN_IDENTITY:--}" "$APP"

echo "$PWD/$BIN"
