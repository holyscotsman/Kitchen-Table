/* One reader for every environment value this server holds.
 *
 * `R158`. The phone settled this question a long time ago and settled it
 * twice: the family passphrase is trimmed when it is typed in
 * (`el.value.trim()`) and trimmed again every time it is read back. The
 * server did not trim at all, and the two ends have to agree about what
 * the passphrase IS.
 *
 * A value pasted into Render's Environment tab, or into a GitHub Actions
 * secret, arrives with a trailing newline or a trailing space more often
 * than anyone would like — it is the ordinary way a pasted secret is
 * mangled. Read raw, that costs:
 *
 *   KT_WRITE_KEY   every phone's correct passphrase is refused, forever,
 *                  with the sentence written for a WRONG key — while
 *                  /api/health reports `accepts_changes: true` and does
 *                  not list it as missing. `R151`'s hazard exactly: the
 *                  half-configured state, reported as configured.
 *   YT_API_KEY     Google answers 400 "API key not valid" to every
 *                  salvage, so a robot-blocked YouTube import never
 *                  recovers, and health again says the key is there.
 *   GROQ_API_KEY   a header value with a newline in it does not go out at
 *   KT_GH_TOKEN    all — Node refuses to write one — so transcription and
 *   ANTHROPIC…     the publish poke fail on a key that looks perfect in
 *                  the dashboard.
 *
 * Trimming is safe for every one of them: leading and trailing whitespace
 * is never part of a key, a token, a connection string or a repository
 * name, and it cannot be typed on the phone at the other end.
 *
 * One reader rather than a `.trim()` at each site, for `R124`'s reason:
 * the sites are in six files and a rule kept in six places is a rule that
 * drifts. `tests/backend.js` holds every `process.env` in backend/ and
 * db/ to coming through here, with no exemption list. */
"use strict";

function envStr(name) {
  var v = process.env[name];
  return v === undefined || v === null ? "" : String(v).trim();
}

module.exports = { envStr };
