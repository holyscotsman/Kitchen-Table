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

async function salvageYouTube(fetchFn, apiKey, videoId) {
  if (!apiKey || !videoId) return null;
  try {
    const res = await fetchFn(
      "https://www.googleapis.com/youtube/v3/videos?part=snippet%2CcontentDetails&id=" +
      encodeURIComponent(videoId) + "&key=" + encodeURIComponent(apiKey),
      { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    return parseApiSnippet(await res.json());
  } catch (e) {
    return null;
  }
}

module.exports = { youtubeId, isoDurationS, parseApiSnippet, salvageYouTube };
