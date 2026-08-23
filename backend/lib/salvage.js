/* When YouTube's robot wall refuses yt-dlp (every disguise, tokens and
 * all), one route remains that is DESIGNED for servers: the official
 * Data API v3. A free key buys title + full description + duration for
 * any video — and most cooking channels write the whole recipe in the
 * description, which is enough for an honest extraction. Captions are
 * not available this way (OAuth-only for other people's videos); a
 * salvage import says so in its flag.
 *
 * Everything except the one fetch is pure and tested. */
"use strict";

/* The video id, from any of the link shapes people actually share. */
function youtubeId(url) {
  const s = String(url || "");
  let m = s.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  m = s.match(/[?&]v=([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  m = s.match(/\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  return null;
}

/* ISO-8601 durations, the only shape the API speaks: PT13M5S → 785. */
function isoDurationS(iso) {
  const m = String(iso || "").match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  return (parseInt(m[1] || 0, 10) * 86400) + (parseInt(m[2] || 0, 10) * 3600) +
    (parseInt(m[3] || 0, 10) * 60) + parseInt(m[4] || 0, 10);
}

/* videos.list response → the same meta shape the pipeline builds from
 * yt-dlp, or null when the answer holds no video. */
function parseApiSnippet(json) {
  const item = json && Array.isArray(json.items) && json.items[0];
  if (!item || !item.snippet) return null;
  return {
    title: String(item.snippet.title || ""),
    uploader: String(item.snippet.channelTitle || ""),
    description: String(item.snippet.description || ""),
    duration_s: isoDurationS(item.contentDetails && item.contentDetails.duration)
  };
}

/* Returns { meta, why } — never throws. `why` is the diagnostic that gets
 * written beside the job's raw stderr: a salvage that doesn't help must
 * say WHICH way it didn't (no key, key refused, video gone, description
 * carries no recipe), or the next failure is guesswork again. */
async function salvageYouTube(fetchFn, apiKey, videoId) {
  /* `why` ends up in the job row's public debug field — the key must never
   * ride along, however an error message chooses to phrase itself. Both
   * forms, because a message that quotes a URL quotes the escaped one, and
   * deciding per message which form it could be carrying is exactly the
   * reasoning nobody should have to redo (`R158`). */
  const scrub = (s) => {
    let out = String(s);
    if (!apiKey) return out;
    for (const form of new Set([apiKey, encodeURIComponent(apiKey)])) {
      out = out.split(form).join("[key]");
    }
    return out;
  };
  if (!apiKey) return { meta: null, why: "no YT_API_KEY set" };
  if (!videoId) return { meta: null, why: "no video id in the link" };
  try {
    /* The key goes in the header, not the query (`R158`). Google reads
     * both — measured against the live endpoint: with this header a bad
     * key is refused as "API key not valid", while with no key at all the
     * answer is a 403 about unregistered callers. Keeping it out of the
     * URL means the one string an error message is most likely to quote
     * back does not contain the secret in the first place, which is a
     * better guarantee than remembering to take it out again. */
    const res = await fetchFn(
      "https://www.googleapis.com/youtube/v3/videos?part=snippet%2CcontentDetails&id=" +
      encodeURIComponent(videoId),
      { headers: { "X-goog-api-key": apiKey }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      let detail = "";
      try { detail = (await res.text()).slice(0, 300); } catch (e) {}
      return { meta: null, why: scrub("Data API HTTP " + res.status + " " + detail) };
    }
    const meta = parseApiSnippet(await res.json());
    if (!meta) return { meta: null, why: "Data API returned no video for that id" };
    return { meta: meta, why: "ok (description " + meta.description.length + " chars)" };
  } catch (e) {
    return { meta: null, why: scrub("Data API unreachable: " + String(e && e.message || e).slice(0, 200)) };
  }
}

module.exports = { youtubeId, isoDurationS, parseApiSnippet, salvageYouTube };
