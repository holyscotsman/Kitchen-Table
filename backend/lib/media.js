/* Media plumbing: where the tools live, how they're run, and the pure text /
 * pixel work around them (VTT → text, caption picking, frame dedupe).
 * The pure parts carry the correctness weight and are what tests/backend.js
 * exercises; the spawn helpers are thin. */
"use strict";

const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

/* yt-dlp and ffmpeg are found in this order: an env override, the bin/
 * directory get-tools.sh fills on Render's native runtime, then PATH (the
 * Docker image installs them system-wide). */
function resolveTool(name) {
  const envKey = name.toUpperCase().replace(/-/g, "") + "_PATH"; // YTDLP_PATH, FFMPEG_PATH
  if (process.env[envKey]) return process.env[envKey];
  const local = path.join(__dirname, "..", "bin", name);
  if (fs.existsSync(local)) return local;
  return name;
}

/* execFile with the failure modes flattened into the result — the pipeline
 * wants stderr for its friendly-message mapping even when the exit code is
 * zero-adjacent nonsense from a killed process. */
function run(cmd, args, opts) {
  const o = opts || {};
  return new Promise((resolve) => {
    execFile(cmd, args, {
      timeout: o.timeoutMs || 300000,
      maxBuffer: o.maxBuffer || 64 * 1024 * 1024,
      cwd: o.cwd,
      encoding: o.binary ? "buffer" : "utf8"
    }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        killed: !!(err && err.killed),
        stdout,
        stderr: String(stderr || (err && err.message) || "")
      });
    });
  });
}

/* WEBVTT → plain text. Auto-captions repeat themselves aggressively (each
 * cue re-shows the previous line as it scrolls), so consecutive duplicates
 * are dropped after tag-stripping. Capped: a transcript longer than ~30k
 * characters stops helping extraction and starts costing it. */
function vttToText(vtt) {
  const out = [];
  let last = "";
  for (const raw of String(vtt || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^WEBVTT/i.test(line) || /^(NOTE|STYLE|REGION)\b/.test(line)) continue;
    if (/^\d+$/.test(line)) continue;                      // cue index
    if (/-->/.test(line)) continue;                        // cue timing
    if (/^(Kind|Language):/i.test(line)) continue;         // yt-dlp header rows
    const text = line.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
    if (!text || text === last) continue;
    /* Rolling captions also re-emit the tail of the previous cue. */
    if (last && (last.endsWith(text) || text.startsWith(last))) {
      if (text.length > last.length) { out[out.length - 1] = text; last = text; }
      continue;
    }
    out.push(text);
    last = text;
  }
  return out.join(" ").slice(0, 30000);
}

/* "The description contains the recipe" (spec step 1): the bar is a real
 * ingredients block, not a lone measurement in a caption. */
function looksLikeRecipeText(text) {
  const t = String(text || "");
  const qtyLines = t.split(/\r?\n/)
    .filter(l => /^\s*[-•*·▢☐]?\s*(\d|[½⅓¼¾⅔⅛⅜⅝⅞])/.test(l)).length;
  if (/\bingredients?\b/i.test(t) && qtyLines >= 3) return true;
  return qtyLines >= 6;
}

/* From yt-dlp -J output: the best English caption track, uploaded subtitles
 * preferred over auto-generated. Returns { auto, lang } or null. */
function pickCaptionTrack(info) {
  for (const [key, auto] of [["subtitles", false], ["automatic_captions", true]]) {
    const tracks = info && info[key];
    if (!tracks) continue;
    const lang = Object.keys(tracks).find(l => /^en(-|$)/i.test(l) && tracks[l] && tracks[l].length);
    if (lang) return { auto, lang };
  }
  return null;
}

/* Frame dedupe (spec step 2): given N downscaled greyscale frames as one
 * buffer, keep a frame only when it differs enough from the last KEPT one.
 * Instagram text-overlay recipes sit on one shot for seconds at a time —
 * this is what turns 40 samples into the 6 that matter. */
function frameKeepIndices(buf, frameBytes, threshold) {
  const n = frameBytes > 0 ? Math.floor((buf ? buf.length : 0) / frameBytes) : 0;
  const keep = [];
  let lastKept = null;
  for (let i = 0; i < n; i++) {
    const start = i * frameBytes;
    if (lastKept === null) { keep.push(i); lastKept = start; continue; }
    let diff = 0;
    for (let b = 0; b < frameBytes; b++) {
      diff += Math.abs(buf[start + b] - buf[lastKept + b]);
    }
    if (diff / frameBytes > threshold) { keep.push(i); lastKept = start; }
  }
  return keep;
}

/* YouTube answers cloud-server addresses with "Sign in to confirm you're
 * not a bot" for perfectly ordinary videos — a robot check on the SERVER,
 * not a fact about the video. It must never be mistaken for age
 * restriction (that read "cooking video can't be fetched, needs a login"
 * to the first real user). */
function isBotCheck(stderr) {
  return /sign in to confirm (you.?re not a bot|that you.?re not a bot)|not a bot/i.test(String(stderr || ""));
}

/* Proof-of-origin tokens: the actual cure for the robot check. get-tools.sh
 * places the bgutil plugin beside the binary and builds its token server,
 * which server.js keeps running on 4416; every yt-dlp call then carries
 * the plugin dir and the server's address. When the pair isn't installed
 * (tests, a build that skipped it) this contributes nothing and the
 * client-rotation fallback below still applies. */
const PLUGIN_DIR = path.join(__dirname, "..", "bin", "plugins");
const POT_ZIP = path.join(PLUGIN_DIR, "bgutil-ytdlp-pot-provider.zip");
const POT_BASE = "http://127.0.0.1:" + (process.env.KT_POT_PORT || 4416);

function potArgs() {
  if (process.env.KT_NO_POT || !fs.existsSync(POT_ZIP)) return [];
  return ["--plugin-dirs", PLUGIN_DIR,
    "--extractor-args", "youtubepot-bgutilhttp:base_url=" + POT_BASE];
}

/* When a call still hits the robot check, retry as clients YouTube
 * doesn't bot-check from datacenter addresses — the TV app interface
 * first (which also passes many genuine age gates without a login), IPv4
 * forced since the flagging is harsher on cloud IPv6 ranges. Non-YouTube
 * failures (private, deleted, Instagram) never retry — their answer
 * wouldn't change. */
const YT_CLIENT_FALLBACKS = [
  ["-4", "--extractor-args", "youtube:player_client=tv"],
  ["-4", "--extractor-args", "youtube:player_client=tv_embedded,android"]
];

async function runYtdlp(tool, args, opts) {
  const pot = potArgs();
  let res = await run(tool, pot.concat(args), opts);
  if (res.ok || !isBotCheck(res.stderr)) return res;
  for (const extra of YT_CLIENT_FALLBACKS) {
    res = await run(tool, pot.concat(extra, args), opts);
    if (res.ok || !isBotCheck(res.stderr)) return res;
  }
  return res;
}

/* yt-dlp's stderr → a sentence a person can act on. The Instagram wording is
 * a spec requirement: scraping IG breaks periodically, and the workaround
 * (screen-record it) deserves to be said every time. */
function friendlyDownloadError(stderr, platform) {
  const s = String(stderr || "");
  if (isBotCheck(s)) {
    return "YouTube blocked the kitchen server’s connection for this video — " +
      "it sometimes treats cloud servers as robots. It’s nothing about the " +
      "video itself. If the recipe is written under the video, copy that " +
      "text and use the paste box under From a link; or screen-record the " +
      "recipe and use From a photo.";
  }
  if (/private/i.test(s)) return "That video is private, so it can’t be fetched.";
  if (/age.?restrict|confirm your age/i.test(s)) return "That video is age-restricted, so it can’t be fetched without a login.";
  if (/unavailable|removed|does not exist|404/i.test(s)) return "That video seems to be unavailable or deleted — check the link still opens.";
  if (/not available in your country|geo/i.test(s)) return "That video isn’t available from the server’s region.";
  if (platform === "instagram") {
    return "Instagram wouldn’t let us fetch this video. Try screen-recording it and importing that as a photo instead.";
  }
  return "The video couldn’t be fetched — check the link opens in a browser, then try again.";
}

module.exports = {
  resolveTool, run, runYtdlp, isBotCheck, potArgs, vttToText, looksLikeRecipeText,
  pickCaptionTrack, frameKeepIndices, friendlyDownloadError
};
