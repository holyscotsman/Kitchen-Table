/* What a day of importing is allowed to cost.
 *
 * Every other limit in this server bounds a BURST — requests per minute per
 * address, jobs in the queue at once — and not one of them bounds the bill.
 * A video import spends real money on somebody's key (an Anthropic call,
 * a Groq transcription, the bandwidth to fetch the video), and a patient
 * stranger submitting one link every thirty seconds stays comfortably under
 * every burst limit while running that key dry over a weekend.
 *
 * So: a ceiling on the day, counted in the database rather than in memory,
 * because this service spins down after fifteen idle minutes and an
 * in-memory counter would simply forgive anyone willing to wait.
 *
 * The number is a day of family cooking with room to spare. Nobody imports
 * forty videos in a day; if anyone ever does, the answer is a plain
 * sentence and tomorrow, not a surprise invoice. KT_DAY_CAP moves it.
 */
"use strict";

const ENV_CAP = parseInt(process.env.KT_DAY_CAP, 10);
const DAY_CAP = ENV_CAP > 0 ? ENV_CAP : 40;

/* null = go ahead. A string = the sentence to hand back, which must leave
 * the person somewhere to go: typing a recipe in and importing from a photo
 * both run on the phone and cost nothing, so they are never walled.
 *
 * Fails OPEN by design: if the count ever arrives as nonsense, the family
 * keeps their importer. This wall exists to bound a stranger's spending,
 * not to punish the server's own confusion. */
function dayCapMessage(usedToday, cap) {
  const limit = cap === undefined ? DAY_CAP : cap;
  if (!(Number(usedToday) >= limit)) return null;
  return "That’s " + limit + " video imports in a day — well past anything a " +
    "kitchen needs, so the importer is resting until tomorrow. Typing a " +
    "recipe in by hand and importing from a photo both still work, and " +
    "neither of them needs the server at all.";
}

module.exports = { DAY_CAP, dayCapMessage };
