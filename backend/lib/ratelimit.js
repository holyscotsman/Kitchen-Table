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
      /* The map cannot grow unbounded off scanner noise. */
      if (seen.size > 2000) {
        for (const [k, v] of seen) {
          if (nowMs - v.start >= windowMs) seen.delete(k);
          if (seen.size <= 1000) break;
        }
      }
      return e.n <= limit;
    },
    size() { return seen.size; }
  };
}

module.exports = { makeLimiter };
