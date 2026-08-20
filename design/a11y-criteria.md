# Accessibility acceptance criteria

Every feature merged after 2026-08-01 is held to this list. It exists because
of gameplan task `034`; the precedent it enforces is `DECISIONS.md` §033:
**when visual preference and legibility collide, legibility wins.**

Two sections. The first is enforced by the suites on every PR — a reviewer
checks that the new feature is *covered* by them, not that they pass (CI does
that). The second is manual and cheap. A third section names what the
VoiceOver pass will add when a physical iPhone is available; until then it is
a known gap, not a silent one.

## Enforced automatically — confirm the new surface is covered

1. **Contrast.** Every new screen/state appears in the contrast audit's route
   list (`tests/contrast.js`) and passes AA in dark, light, and Easy Read.
2. **Tap targets.** Nothing interactive under 44px; icon buttons 48×48
   (`tests/kt.js` measures every interactive element on every screen —
   `R16` widened it after a control shipped under the floor on a screen the
   sweep never visited).
3. **Reflow.** The new screen holds at 320px viewport (200% zoom) at the top
   font step inside Easy Read — no horizontal scroll, no clipped text
   (`tests/zoom.js`; add the new route to its screen list).
4. **Escaping.** Any new interpolation of user or imported text goes through
   `esc()` (`tests/sec.js` carries the hostile fixtures; extend them if the
   feature stores a new kind of string).
5. **Reduced motion.** Any new animation is listed in the
   `prefers-reduced-motion` block and dies there (`tests/quick.js` asserts
   the block covers every `animation:` rule in the file).
6. **Focus visible** (`R35`). Every control tabbed to on every screen draws
   the designed ring — tabbed for real, since `:focus-visible` is about
   keyboard focus and a programmatic `.focus()` is a different thing. This
   was a reviewer item until the sweep found the fields: **every text input
   in the app had `outline: none` on focus**, leaving a border colour change
   as the only cue, which is exactly what criterion 12 says can never stand
   alone. The one deliberate exception stays: route headings take programmatic
   focus and are not interactive, so they draw nothing.
7. **Names, labels, focus order and decorative artwork** (`R23`). Every
   button and link has a name a screen reader can say; every input has a
   label (visually hidden is fine); nothing carries a positive `tabindex`;
   every decorative `<svg>` is hidden from the accessibility tree. Checked on
   sixteen surfaces — the six screens plus every sheet, edit mode and the
   review forms — in `tests/kt.js`, which also asserts it actually reached the
   controls, so a state that failed to open can't read as a clean pass. These
   were reviewer items until the sweep proved cheap; a reviewer's attention is
   not a durable guarantee.

## Checked by the reviewer, by hand

8. **No hover-only affordances.** Everything reachable by tap alone.
9. **Sheets/dialogs** follow the house contract: trap Tab, close on Escape,
   return focus to the opener. Reuse the existing machinery; don't rebuild it.
11. **State is announced, not just drawn.** Toggles use `aria-pressed` /
    `aria-checked` / `role="switch"`; async outcomes land in a `role="status"`
    region, not only as a visual change.
12. **Colour is never the only signal** — pair it with a word, a glyph, or a
    weight change.
13. **Chrome does not scale with reading text.** New UI takes the fixed
    chrome sizes; only recipe content follows the A−/A+ stepper.
14. **Easy Read survives it.** Open the feature with Easy Read on, top step:
    one column, no faded text, nothing truncated.
15. **Both themes, by eye.** The automated audit catches ratios, not a
    white-on-white photo overlay or a shadow that vanished.
16. **Live regions stay quiet.** New renders must not re-announce old
    notices; a notice fires once, for the action that earned it.
17. **Print still works** if the feature touches the recipe page — the print
    stylesheet shows content only, black on white.

## Deferred to the device pass (`035`–`040`, `042`)

- What VoiceOver actually announces on each screen, in order.
- Whether the route-change live region is spoken, not merely present.
- Rotor behaviour inside open sheets.
- iOS Reduce Motion and Increase Contrast honoured end to end.

When that pass happens, its findings amend this file; anything it contradicts
above, it wins.
