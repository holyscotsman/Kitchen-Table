/* One way to make a browser context, so the hermetic promise is kept in one
 * place instead of ninety.
 *
 * CLAUDE.md has said since the video arc that the suites run "hermetically —
 * the suites stub the kitchen server and abort the Render origin, so CI never
 * wakes the real one." That was kept by hand, one `ctx.route(...)` per
 * context, and `R146` counted what hand-keeping had produced:
 *
 *     tests/kt.js      19 contexts,  2 aborts
 *     tests/polish.js  36 contexts, 21 aborts
 *     tests/plan.js     6 contexts,  0 aborts
 *     tests/quick.js    2 contexts,  0 aborts
 *
 * What is MEASURED: a context made the way `kt.js`'s typing sweep made one
 * reaches for the family's real Render origin on `#add` — four requests per
 * `freshAdd` cycle, because `onRoute` asks the kitchen for the waiting and
 * failed import lists, and that sweep runs three cycles.
 *
 * What is NOT measured, and was wrongly claimed once before this comment was
 * rewritten: whether those requests are ANSWERED on a CI runner. The sandbox
 * this was measured in has no route to that host, so an aborted request and
 * an unreachable one look identical from here — `page.on('request')` fires
 * before routing and before any network attempt, which is exactly how the
 * wrong claim was made. A GitHub runner has open egress, so they very likely
 * would be; "very likely" is why this is written down rather than asserted.
 *
 * Either way the suites should not be reaching for a third party at all, and
 * one maker means a new context cannot be born without the rule.
 *
 * The abort is deliberately at the ORIGIN and not at a path: a suite that
 * wants to answer for the kitchen points `kt.importApi` at its own stub host
 * (`video.js` does) and routes that instead, which never reaches this rule.
 *
 * ---------------------------------------------------------------------------
 * Two traps that have now cost three rounds in a row (`R159`, `R160`, `R161`),
 * written here because this is the one file every suite already opens.
 *
 * 1. A `goto` to the address the page is ALREADY on is not a navigation. The
 *    app is a hash-routed SPA, so `page.goto(B + '/index.html#thing')` when
 *    the hash is already `#thing` renders nothing at all — the page keeps
 *    whatever state it had. Each time this has bitten, the check went green
 *    or red for a reason belonging to neither the fix nor the bug: a page
 *    left in Edit mode reporting 0 chips (a pass), one fixture's answer
 *    standing for four cases (three passes). Use `reload()`, or a fresh
 *    context, or navigate somewhere else first — and wait on something that
 *    proves the new state arrived.
 *
 * 2. `addInitScript` ACCUMULATES. Every call adds another script, and all of
 *    them run on every later load, in the order added. Seeding a second
 *    fixture on the same page does not replace the first; and a `reload()`
 *    re-runs the seed, which is how a check that measured a save came to
 *    measure the original fixture instead. One fixture per context is the
 *    reliable shape, and `freshContext` is cheap.
 * ---------------------------------------------------------------------------
 */
"use strict";

const KITCHEN_ORIGIN = "**/*.onrender.com/**";

async function freshContext(br, opts) {
  const ctx = await br.newContext(opts || {});
  await ctx.route(KITCHEN_ORIGIN, (r) => r.abort("failed"));
  return ctx;
}

module.exports = { freshContext, KITCHEN_ORIGIN };
