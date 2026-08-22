/* Poking db-sync after a change, so an edit reaches the family in minutes
 * rather than overnight.
 *
 * The database is the canonical shared copy; `.github/workflows/db-sync.yml`
 * is what turns it back into recipes.json and commits, which is what makes
 * GitHub Pages republish. It already runs nightly and on demand — this asks
 * for the on-demand run.
 *
 * Three rules, all of them about not making things worse:
 *
 *  1. A failed poke NEVER fails the write. The recipe is already in the
 *     database by the time this runs; the nightly sync will publish it
 *     regardless. Telling someone their edit failed because a webhook did
 *     would be a lie about the thing they actually care about.
 *  2. It is DEBOUNCED. Someone fixing four typos in a row should cause one
 *     publish, not four: the sync regenerates the whole file, so a single
 *     run covers everything that landed before it.
 *
 *     Which makes the debounce a PROMISE THAT A RUN IS ALREADY COVERING
 *     THIS, not a rate limit (`R137`). A poke GitHub never took covers
 *     nothing, so it gives the window back rather than spending ninety
 *     seconds it did not earn — otherwise one unlucky request quietly sends
 *     the next writer's change to the nightly sync as well, and tells them
 *     it is already on its way.
 *  3. No token, no poke, and no complaint in the write path — the health
 *     endpoint is where "this is not set up" belongs.
 */
"use strict";

function makePublisher(opts) {
  const o = opts || {};
  const token = o.token || "";
  const repo = o.repo || "holyscotsman/Kitchen-Table";
  const workflow = o.workflow || "db-sync.yml";
  const ref = o.ref || "main";
  const cooldownMs = o.cooldownMs === undefined ? 90000 : o.cooldownMs;
  const doFetch = o.fetchImpl || ((...a) => fetch(...a));
  const log = o.log || (() => {});

  /* Never sent, rather than "sent at the epoch". Starting this at 0 meant
   * the FIRST poke after a start was measured against it and debounced away
   * — and this server sleeps on Render's free tier, so "the first poke after
   * a start" is most of them. The one that got dropped would be the one
   * somebody was waiting on. */
  let lastAt = null;
  /* Why the most recent attempt did not land, for the health endpoint —
     `publishes_on_change` only ever meant "a token is set", so a token that
     has stopped working reads exactly like one that works while every change
     waits for morning. Never carries the token: `poke` puts only a status
     code in `why`. */
  let lastWhy = null;

  return {
    configured: !!token,

    /* Returns what it did, so a caller that wants to say so can — and so a
     * test can see the difference between "asked" and "held back". */
    async poke(nowMs) {
      const now = nowMs === undefined ? Date.now() : nowMs;
      if (!token) return { sent: false, why: "no token" };
      if (lastAt !== null && now - lastAt < cooldownMs) return { sent: false, why: "debounced" };
      /* Claimed before the request, so two writes landing together do not
         both call GitHub — and given back below if it did not land. */
      const prev = lastAt;
      lastAt = now;
      try {
        const res = await doFetch(
          "https://api.github.com/repos/" + repo + "/actions/workflows/" +
          workflow + "/dispatches",
          {
            method: "POST",
            headers: {
              "authorization": "Bearer " + token,
              "accept": "application/vnd.github+json",
              "content-type": "application/json",
              "user-agent": "kitchen-table"
            },
            body: JSON.stringify({ ref: ref })
          });
        if (res && (res.status === 204 || res.ok)) { lastWhy = null; return { sent: true }; }
        lastAt = prev;
        lastWhy = "http " + (res && res.status);
        /* Never let the token near a log line or a response body. */
        log("db-sync poke refused: HTTP " + (res && res.status));
        return { sent: false, why: lastWhy };
      } catch (e) {
        lastAt = prev;
        lastWhy = "unreachable";
        log("db-sync poke failed: " + String(e && e.message).slice(0, 120));
        return { sent: false, why: lastWhy };
      }
    },

    /* When a poke last LANDED, and why the most recent one did not. Both are
       for the health endpoint, which is where "this is not working" belongs
       (`R137`); `lastSentAt` used to be set for pokes that were never sent,
       and nothing read it, so nothing ever noticed. */
    lastSentAt() { return lastAt; },
    lastError() { return lastWhy; }
  };
}

module.exports = { makePublisher };
