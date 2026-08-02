/* Estimated time remaining, per the spec's own words: rough is fine,
 * precision is fake. Three flat-ish stage estimates, summed over whatever
 * hasn't happened yet. Pure — tests feed it clocks. */
"use strict";

const LABEL = {
  queued: "Waiting its turn",
  downloading: "Fetching the video",
  transcribing: "Listening to it",
  extracting: "Writing up the recipe",
  ready_for_review: "Ready to check over",
  imported: "Saved to the book",
  failed: "Didn’t work"
};

/* Stage estimates in seconds. Download gets a cold-start allowance when the
 * server itself just woke — the request that created the job is usually the
 * request that woke the machine. */
function stageEstimates(videoDurationS, uptimeS) {
  return {
    downloading: 15 + (uptimeS < 120 ? 45 : 0),
    transcribing: videoDurationS ? Math.round(videoDurationS * 0.25) : 30,
    extracting: 25
  };
}

/* → { eta: seconds|null, overrun: bool }. eta is null once there is nothing
 * left to wait for. overrun means the CURRENT stage has taken 2× its
 * estimate — the frontend switches to "taking a bit longer than usual…"
 * instead of ever showing a frozen or negative countdown. */
function estimate(status, stageStartedAt, videoDurationS, uptimeS, nowMs) {
  const est = stageEstimates(videoDurationS, uptimeS);
  const order = ["downloading", "transcribing", "extracting"];
  const at = order.indexOf(status);
  if (status !== "queued" && at === -1) return { eta: null, overrun: false };

  let eta = 0;
  for (let i = Math.max(at, 0); i < order.length; i++) eta += est[order[i]];
  let overrun = false;
  if (at > -1 && stageStartedAt) {
    const elapsed = Math.max(0, (nowMs - new Date(stageStartedAt).getTime()) / 1000);
    const cur = est[order[at]];
    eta = Math.max(0, eta - Math.min(elapsed, cur));
    overrun = elapsed > 2 * cur;
  }
  return { eta: Math.round(eta), overrun };
}

module.exports = { LABEL, stageEstimates, estimate };
