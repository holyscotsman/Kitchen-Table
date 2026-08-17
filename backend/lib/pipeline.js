/* The background job pipeline (spec step 3): downloading → transcribing →
 * extracting → ready_for_review, with every failure landing as a
 * plain-language error_message and every temp file deleted on every exit
 * path. State lives in the import_jobs row — the phone that submitted the
 * link can leave at any point.
 *
 * The cheap paths are taken in order: a recipe written in the description
 * costs nothing; captions cost one small fetch; only a video with neither
 * gets downloaded, listened to, and looked at. */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const media = require("./media");
const groq = require("./groq");
const extract = require("./extract");
const { youtubeId, salvageYouTube } = require("./salvage");

/* One frame per 2–3s on short videos, stretched so long ones still fit the
 * ~40-frame cap with even coverage. */
function computeFps(durationS) {
  return Math.min(0.5, 40 / Math.max(durationS || 1, 1));
}

async function runJob(ctx, jobId) {
  const { sql } = ctx;
  const rows = await sql`select * from kitchen.import_jobs where id = ${jobId}`;
  const job = rows[0];
  if (!job || job.status !== "queued") return;

  const setStage = (s) => sql`
    update kitchen.import_jobs
       set status = ${s}, stage_started_at = now(), updated_at = now()
     where id = ${jobId}`;
  const fail = (msg) => sql`
    update kitchen.import_jobs
       set status = 'failed', error_message = ${String(msg).slice(0, 500)},
           updated_at = now()
     where id = ${jobId}`;
  /* Download failures keep the tool's own last words (result_json.debug —
   * unused on failed jobs otherwise): the friendly sentence is for people,
   * the raw tail is how the NEXT YouTube-defense shift gets diagnosed from
   * the job row instead of from guesswork. */
  const failDownload = (run, note) => sql`
    update kitchen.import_jobs
       set status = 'failed',
           error_message = ${media.friendlyDownloadError(run.stderr, job.platform)},
           result_json = ${JSON.stringify({
             debug: String(run.stderr || "").slice(-1200) + (note ? "\n\n" + note : "")
           })},
           updated_at = now()
     where id = ${jobId}`;

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kt-job-"));
  const ytdlp = media.resolveTool("yt-dlp");
  const ffmpeg = media.resolveTool("ffmpeg");

  try {
    /* ---- downloading ---- */
    await setStage("downloading");
    const metaRun = await media.runYtdlp(ytdlp,
      ["-J", "--no-download", "--no-playlist", "--no-warnings", job.url],
      { timeoutMs: 120000 });
    let info;
    if (!metaRun.ok || !metaRun.stdout) {
      /* YouTube's robot wall refused every disguise. The official Data
       * API (a free key, YT_API_KEY) can still hand over title +
       * description — and when the recipe is written under the video,
       * that is a whole import. Anything else about this failure stays
       * honest: no captions, no audio, no frames. */
      let saved = null, why = "not attempted (not a bot-check)";
      if (job.platform === "youtube" && media.isBotCheck(metaRun.stderr)) {
        const r = await salvageYouTube(ctx.fetch || fetch, ctx.ytKey, youtubeId(job.url));
        saved = r.meta;
        why = r.why;
        if (saved && !media.looksLikeRecipeText(saved.description)) {
          why += " — but no recipe is written in it";
          saved = null;
        }
      }
      if (!saved) {
        await failDownload(metaRun, "SALVAGE: " + why);
        return;
      }
      info = {
        title: saved.title, uploader: saved.uploader,
        description: saved.description, duration: saved.duration_s,
        __salvaged: true
      };
    } else {
      try { info = JSON.parse(metaRun.stdout); }
      catch (e) { await fail(media.friendlyDownloadError("", job.platform)); return; }
    }

    const duration = Math.round(info.duration || 0);
    if (duration > 1800) {
      await fail("This video is about " + Math.round(duration / 60) +
        " minutes long — imports are capped at 30 minutes to stay quick and free.");
      return;
    }
    await sql`update kitchen.import_jobs
                 set video_duration_s = ${duration || null}, updated_at = now()
               where id = ${jobId}`;

    const desc = String(info.description || "");
    const extraFlags = [];
    let transcript = "";
    let frames = [];

    if (info.__salvaged) {
      extraFlags.push("Video — YouTube blocked the server’s direct fetch, so this was " +
        "written up from the video’s official description only: no narration or " +
        "on-screen text was read. Check it against the video.");
    } else if (media.looksLikeRecipeText(desc)) {
      /* The recipe is written out under the video — no media needed. */
    } else {
      const track = media.pickCaptionTrack(info);
      if (track) {
        const subRun = await media.runYtdlp(ytdlp,
          ["--skip-download", track.auto ? "--write-auto-subs" : "--write-subs",
            "--sub-langs", track.lang, "--sub-format", "vtt",
            "--no-playlist", "--no-warnings", "-o", "sub.%(ext)s", job.url],
          { cwd: tmp, timeoutMs: 180000 });
        if (subRun.ok) {
          const vtt = fs.readdirSync(tmp).find(f => f.endsWith(".vtt"));
          if (vtt) transcript = media.vttToText(fs.readFileSync(path.join(tmp, vtt), "utf8"));
        }
      }

      if (transcript.length < 40) {
        /* No written recipe, no usable captions: fetch the smallest real
         * copy of the video and read it both ways. */
        transcript = "";
        const dl = await media.runYtdlp(ytdlp,
          ["-f", "worst[height>=240]/worst", "--max-filesize", "300m",
            "--no-playlist", "--no-warnings", "-o", "media.%(ext)s", job.url],
          { cwd: tmp, timeoutMs: 300000 });
        const mediaFile = fs.readdirSync(tmp).find(f => f.startsWith("media."));
        if (!dl.ok || !mediaFile) {
          await failDownload(dl);
          return;
        }

        /* ---- transcribing (audio and frames in parallel) ---- */
        await setStage("transcribing");
        const audioP = (async () => {
          const enc = await media.run(ffmpeg,
            ["-y", "-i", mediaFile, "-vn", "-ac", "1", "-ar", "16000",
              "-b:a", "32k", "audio.m4a"], { cwd: tmp, timeoutMs: 240000 });
          if (!enc.ok) return "";
          if (!ctx.groqKey) {
            extraFlags.push("Audio — the server has no transcription key set, so only on-screen text and the description were read.");
            return "";
          }
          try { return await groq.transcribe(ctx.groqKey, path.join(tmp, "audio.m4a")); }
          catch (e) {
            extraFlags.push("Audio — transcription failed (" +
              String(e.message).slice(0, 120) + "); the recipe was read from on-screen text only.");
            return "";
          }
        })();
        const framesP = (async () => {
          const fps = computeFps(duration);
          const vf = "fps=" + fps.toFixed(4);
          const jpg = await media.run(ffmpeg,
            ["-y", "-i", mediaFile, "-vf", vf + ",scale=512:-2", "-q:v", "7",
              "f%04d.jpg"], { cwd: tmp, timeoutMs: 240000 });
          const gray = await media.run(ffmpeg,
            ["-y", "-i", mediaFile, "-vf", vf + ",scale=16:16,format=gray",
              "-f", "rawvideo", "gray.raw"], { cwd: tmp, timeoutMs: 240000 });
          if (!jpg.ok) return [];
          const jpgs = fs.readdirSync(tmp).filter(f => /^f\d{4}\.jpg$/.test(f)).sort();
          let picked = jpgs;
          if (gray.ok && fs.existsSync(path.join(tmp, "gray.raw"))) {
            const buf = fs.readFileSync(path.join(tmp, "gray.raw"));
            const keep = media.frameKeepIndices(buf, 256, 8);
            picked = keep.map(i => jpgs[i]).filter(Boolean);
          }
          return picked.slice(0, 40).map(f =>
            fs.readFileSync(path.join(tmp, f)).toString("base64"));
        })();
        transcript = await audioP;
        frames = await framesP;

        if (!transcript && !frames.length && !desc.trim()) {
          await fail("Nothing could be read from this video — no narration, no captions, and no readable frames.");
          return;
        }
      }
    }

    /* ---- extracting ---- */
    await setStage("extracting");
    const meta = {
      platform: job.platform, url: job.url,
      title: info.title, uploader: info.uploader || info.channel,
      description: desc
    };
    let draft;
    try {
      const parsed = await extract.callExtractor(ctx.anthropic, meta, transcript, frames);
      draft = extract.draftFromResult(parsed, job.url, job.platform);
    } catch (e) {
      if (e && e.notRecipe) { await fail(e.message); return; }
      throw e;
    }
    for (const f of extraFlags) draft.flagged.push(f);
    if (job.contributor) draft.contributor = job.contributor;

    await sql`update kitchen.import_jobs
                 set status = 'ready_for_review', result_json = ${JSON.stringify(draft)},
                     stage_started_at = now(), updated_at = now()
               where id = ${jobId}`;
  } catch (e) {
    console.error("job " + jobId + " failed:", e);
    await fail("Something went wrong while importing — please try the link again. (" +
      String(e && e.message || e).slice(0, 200) + ")").catch(() => {});
  } finally {
    /* Keep nothing but extracted data (spec step 4) — on every exit path. */
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

module.exports = { runJob, computeFps };
