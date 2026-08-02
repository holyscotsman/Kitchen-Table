#!/usr/bin/env bash
# Fetch the two media tools the pipeline shells out to — yt-dlp and ffmpeg —
# as static Linux builds into backend/bin/. Render's native Node runtime has
# neither; this runs from the build command so the deploy needs no Docker.
# If both are already on PATH (the Docker image, a dev machine with them
# installed), this is a no-op.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p bin

if command -v yt-dlp >/dev/null 2>&1 && command -v ffmpeg >/dev/null 2>&1; then
  echo "get-tools: system yt-dlp and ffmpeg found — nothing to fetch."
  exit 0
fi

if [ ! -x bin/yt-dlp ]; then
  echo "get-tools: fetching yt-dlp…"
  curl -fsSL -o bin/yt-dlp \
    "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux"
  chmod +x bin/yt-dlp
fi

if [ ! -x bin/ffmpeg ]; then
  echo "get-tools: fetching ffmpeg (static build)…"
  curl -fsSL -o /tmp/ffmpeg.tar.xz \
    "https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-linux64-gpl.tar.xz"
  tar -xJf /tmp/ffmpeg.tar.xz -C /tmp
  cp /tmp/ffmpeg-master-latest-linux64-gpl/bin/ffmpeg bin/ffmpeg
  chmod +x bin/ffmpeg
  rm -rf /tmp/ffmpeg.tar.xz /tmp/ffmpeg-master-latest-linux64-gpl
fi

echo "get-tools: done."
bin/yt-dlp --version || true
bin/ffmpeg -version 2>/dev/null | head -1 || true
