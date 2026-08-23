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

const { envStr } = require("./env");

const ENV_CAP = parseInt(envStr("KT_DAY_CAP"), 10);
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

/* `R91` — the cap above is a ceiling on the DAY. This one is a ceiling on
 * a CALLER, and they are different promises.
 *
 * The day cap bounds the money, which is what it was written for. It does
 * not stop one stranger spending the whole forty and leaving the family
 * locked out of their own importer until tomorrow — at no cost to the
 * stranger, since this API has no login by design and its address ships in
 * the page.
 *
 * `R81` is what makes this worth building. Before it the caller key was the
 * leftmost X-Forwarded-For entry, so anyone could rotate a header and be a
 * new caller on every request; a per-caller count would have been theatre.
 * Now the key is the hop the trusted proxy appended.
 *
 * This is a FAIRNESS valve, not a spending wall. The spending wall is the
 * database-backed day cap and it is unchanged — so this one may be counted
 * in memory, where a spin-down forgiving a stranger costs nothing, because
 * the forty still holds either way.
 *
 * Deliberately generous: a household shares one address, so this has to sit
 * well above what a family does in a day and only bite on abuse. */
const ENV_CALLER = parseInt(envStr("KT_CALLER_DAY_CAP"), 10);
const CALLER_DAY_CAP = ENV_CALLER > 0 ? ENV_CALLER : 15;

/* Same contract as dayCapMessage: null = go ahead, a string = the sentence.
 * Fails open for the same reason. The wording differs on purpose — this
 * wall is about THIS phone, not about the kitchen closing for everyone. */
function callerDayMessage(usedByCaller, cap) {
  const limit = cap === undefined ? CALLER_DAY_CAP : cap;
  if (!(Number(usedByCaller) >= limit)) return null;
  return "You’ve sent " + limit + " videos to the kitchen today, which is " +
    "plenty for one day — so this phone is resting until tomorrow while the " +
    "importer stays open for everyone else. Typing a recipe in by hand and " +
    "importing from a photo both still work, and neither of them needs the " +
    "server at all.";
}

module.exports = { DAY_CAP, dayCapMessage, CALLER_DAY_CAP, callerDayMessage };
