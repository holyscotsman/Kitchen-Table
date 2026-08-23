/* A fixed-window request limiter, per client address. Family scale never
 * feels it (the progress poll is ~17 requests a minute); a hostile loop
 * hits the ceiling and gets a polite 429 instead of running up the
 * database. In-memory on purpose — a restart forgiving everyone is the
 * correct behaviour for a limiter this size. Pure; tests feed it clocks. */
"use strict";

function makeLimiter(limit, windowMs) {
  const seen = new Map(); // ip → { n, start }
  return {
    /* true = allowed */
    hit(ip, nowMs) {
      const key = String(ip || "?");
      let e = seen.get(key);
      if (!e || nowMs - e.start >= windowMs) {
        e = { n: 0, start: nowMs };
        seen.set(key, e);
      }
      e.n++;
      /* The map cannot grow unbounded. Expired buckets go first. */
      if (seen.size > 2000) {
        for (const [k, v] of seen) {
          if (nowMs - v.start >= windowMs) seen.delete(k);
          if (seen.size <= 1000) break;
        }
        /* `R176` — and when that frees nothing, the longest-standing go
         * anyway. The line above used to be the whole sweep, and its comment
         * claimed the map could not grow: true of scanner noise spread over
         * time, false of 2000 distinct callers INSIDE one window, which is a
         * distributed attempt rather than noise. Measured before this, with
         * the app's own 60-second limiter: 2600 → 3000 → 3001, the map still
         * growing, and a full scan on every subsequent request that deleted
         * not one entry — so the failure mode was a slow leak plus an O(n)
         * cost per request, on a 512MB free tier.
         *
         * Map iteration is insertion order, so these are the callers first
         * seen. That is not strictly the least recently active — a bucket
         * that rolls over is re-`set` and keeps its original place — and
         * saying so is better than implying an LRU this is not.
         *
         * Forgiving a live caller is the right way to fail here, and it
         * costs the family nothing: what money can be spent is walled by the
         * day cap counted in the database, which `server.js` checks BEFORE
         * it consults any of these buckets. The request in hand is still
         * counted either way — `e` is held locally. */
        if (seen.size > 2000) {
          for (const k of seen.keys()) {
            seen.delete(k);
            if (seen.size <= 1000) break;
          }
        }
      }
      return e.n <= limit;
    },
    size() { return seen.size; }
  };
}

module.exports = { makeLimiter };
