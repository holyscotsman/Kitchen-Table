#!/usr/bin/env bash
# Fetch everything the pipeline shells out to, into backend/:
#
#   bin/yt-dlp, bin/ffmpeg     static Linux builds (skipped when both are
#                              already on PATH — the Docker image case)
#   bin/plugins/…zip           the bgutil PO-token plugin for yt-dlp
#   potserver/                 the matching token server (node), built
#
# The PO-token pair exists because YouTube answers cloud-server addresses
# with "Sign in to confirm you're not a bot" for ordinary videos — proof-of-
# origin tokens are how a datacenter IP stops looking like a robot. Plugin
# and server are pinned to the SAME release tag; they break in lockstep.
# Runs from the build command on Render, so the deploy needs no Docker.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p bin

if command -v yt-dlp >/dev/null 2>&1 && command -v ffmpeg >/dev/null 2>&1; then
  echo "get-tools: system yt-dlp and ffmpeg found — skipping the media tools."
else
  if [ ! -x bin/yt-dlp ]; then
    echo "get-tools: fetching yt-dlp…"
    curl -fsSL --retry 3 --retry-delay 2 --retry-all-errors -o bin/yt-dlp \
      "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux"
    chmod +x bin/yt-dlp
  fi
  if [ ! -x bin/ffmpeg ]; then
    echo "get-tools: fetching ffmpeg (static build)…"
    curl -fsSL --retry 3 --retry-delay 2 --retry-all-errors -o /tmp/ffmpeg.tar.xz \
      "https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-linux64-gpl.tar.xz"
    tar -xJf /tmp/ffmpeg.tar.xz -C /tmp
    cp /tmp/ffmpeg-master-latest-linux64-gpl/bin/ffmpeg bin/ffmpeg
    chmod +x bin/ffmpeg
    rm -rf /tmp/ffmpeg.tar.xz /tmp/ffmpeg-master-latest-linux64-gpl
  fi
fi

POT_REPO="https://github.com/Brainicism/bgutil-ytdlp-pot-provider"
if [ -f bin/plugins/bgutil-ytdlp-pot-provider.zip ] && [ -f potserver/server/build/main.js ]; then
  echo "get-tools: PO-token provider already in place."
else
  TAG="$({ curl -fsSL "https://api.github.com/repos/Brainicism/bgutil-ytdlp-pot-provider/releases/latest" || true; } \
    | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -1)"
  [ -n "$TAG" ] || TAG="1.3.1"   # last known-good, when the API rate-limits the build
  echo "get-tools: fetching PO-token provider $TAG (plugin + server, same tag)…"
  mkdir -p bin/plugins
  curl -fsSL --retry 3 --retry-delay 2 --retry-all-errors -o bin/plugins/bgutil-ytdlp-pot-provider.zip \
    "$POT_REPO/releases/download/$TAG/bgutil-ytdlp-pot-provider.zip"
  rm -rf potserver
  git clone --quiet --depth 1 --single-branch --branch "$TAG" "$POT_REPO" potserver
  (cd potserver/server && npm ci --no-audit --no-fund >/dev/null && npx tsc)
  echo "get-tools: PO-token server built."
fi

echo "get-tools: done."
{ command -v yt-dlp >/dev/null 2>&1 && yt-dlp --version || bin/yt-dlp --version; } 2>/dev/null || true
