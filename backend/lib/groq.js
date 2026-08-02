/* Groq's Whisper endpoint (OpenAI-compatible) — audio in, transcript out.
 * Only exercised when a video has no captions and no written-out recipe;
 * the free tier caps uploads at 25MB, which the pipeline's 16kHz-mono
 * re-encode keeps a 30-minute video comfortably under. */
"use strict";

const fs = require("fs");

async function transcribe(apiKey, audioPath) {
  const buf = fs.readFileSync(audioPath);
  if (buf.length > 24 * 1024 * 1024) {
    throw new Error("The audio track is too large to transcribe.");
  }
  const fd = new FormData();
  fd.append("file", new Blob([buf], { type: "audio/mp4" }), "audio.m4a");
  fd.append("model", "whisper-large-v3-turbo");
  fd.append("response_format", "json");
  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: "Bearer " + apiKey },
    body: fd,
    signal: AbortSignal.timeout(240000)
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error("Transcription failed (HTTP " + res.status + "): " + body.slice(0, 200));
  }
  const json = await res.json();
  return String(json.text || "").slice(0, 30000);
}

module.exports = { transcribe };
