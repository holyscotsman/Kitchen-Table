/* Who may change the book for everybody.
 *
 * READING needs nothing and must keep needing nothing. CHANGING needs the
 * one secret the family shares, because the alternative is that anyone who
 * ever sees this address can rewrite Joan's recipes and nobody could say
 * who did.
 *
 * A byline is not a key. `contributor` stays a label exactly as CLAUDE.md
 * insists, and is never consulted here: the passphrase says "someone in this
 * family is holding the phone", not "this is Jennifer". If real identity is
 * ever wanted that is a different conversation, not this string.
 *
 * Lives in its own file so it can be proved rather than trusted — a gate
 * that only exists inside a request handler is a gate nothing tests.
 */
"use strict";
const crypto = require("crypto");

function makeWriteGate(key, failLimiter) {
  const KEY = key || "";

  /* Compared over digests, so the comparison is fixed-length whatever
   * arrives. timingSafeEqual throws on a length mismatch, and how long the
   * real key is happens to be the first thing a stranger would like to
   * learn. */
  function keyOk(given) {
    if (!KEY || !given) return false;
    return crypto.timingSafeEqual(
      crypto.createHash("sha256").update(String(given)).digest(),
      crypto.createHash("sha256").update(KEY).digest());
  }

  return {
    configured: !!KEY,
    keyOk,

    /* null when the caller may write; {status, error} when not.
     *
     * Fails CLOSED: with no key configured every write is refused. A server
     * that has not been set up to take changes must not be one that takes
     * them from anybody — the unconfigured state is the dangerous one, so it
     * is the locked one.
     *
     * The refusal never says whether the key was close, never echoes what
     * was sent, and reads the same for a wrong key as for no key at all. */
    refusalFor(headers, ip, nowMs) {
      if (!KEY) {
        return { status: 503, error: "This kitchen server has not been set up to accept changes yet." };
      }
      if (keyOk((headers || {})["x-kitchen-key"])) return null;
      /* Ten wrong answers an hour, per caller. The global limiter stops a
       * flood; a family passphrase is not attacked by flooding, it is
       * attacked by patience, and this is what stops that. Counted only on
       * FAILURES, so ordinary saving never walks toward the wall. */
      if (failLimiter && !failLimiter.hit(ip, nowMs === undefined ? Date.now() : nowMs)) {
        return { status: 429, error: "Too many wrong passphrases from this connection. Try again later." };
      }
      return { status: 401, error: "That passphrase is not the family’s one." };
    }
  };
}

module.exports = { makeWriteGate };
