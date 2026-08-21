# Accessibility acceptance criteria

Every feature merged after 2026-08-01 is held to this list. It exists because
of gameplan task `034`; the precedent it enforces is `DECISIONS.md` §033:
**when visual preference and legibility collide, legibility wins.**

Two sections. The first is enforced by the suites on every PR — a reviewer
checks that the new feature is *covered* by them, not that they pass (CI does
that). The second is manual and cheap. **Six items moved from the second
list to the first between `R23` and `R39`**, and four of those five found a
real defect on the way: a control under the tap floor, every text field with
its focus ring switched off, a notice announced twelve times, and Easy Read
drawn as on while announcing nothing. A reviewer's attention is not a durable
guarantee; that is the whole argument for moving them. A third section names what the
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
   (`tests/zoom.js`; add the new route to its screen list). Since `R61` the
   suite also walks **every recipe in the book**, not one of them: the list
   of routes opened a single recipe, and swept properly **20 of the 48
   scrolled sideways**, from +9px to +147px — almost all on one long word in
   a title at a size the reader chose. The same shape as `R16`'s tap-target
   finding, and the same lesson: a criterion enforced on one screen is not
   enforced. A new screen whose content varies per record needs its check to
   vary with it too.
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
7. **Live regions stay quiet** (`R36`). A notice fires once, for the action
   that earned it. In an app that re-renders everything on every state
   change, that means live regions live **outside** `#app` — a `role="status"`
   in the rendered HTML is a new live region on every render, and each one is
   announced. There is exactly one region, `#route-live`, written once per
   distinct message; rendered notices are visible text only. `tests/kt.js`
   counts inserted live regions the way a screen reader sees them.
8. **State is announced, not just drawn** (`R37`). Every control that picks
   up "on" styling says so where a screen reader reads it — `aria-pressed`,
   `aria-checked`, or its own accessible name — and stops saying it when the
   state goes off. Checked by comparing the on state against the off state,
   not by looking for the presence of an attribute: an attribute that never
   changes passes the second test and fails the reader.
9. **Chrome does not scale with reading text** (`R39`). A−/A+ is for the
   recipe, not for the app: three presses must move `.recipe` and leave the
   header, the back link and the stepper exactly where they were. Labels
   *inside* the recipe do scale, because they are the recipe — that
   distinction is the point, so it is asserted rather than assumed.
   **And the other half of it** (`R78`): recipe text scales *wherever it
   appears*, which includes the boxes you type it into. The mechanism is
   one line — the screen's wrapper carries the step in px and everything
   inside is em — and the Add / review screen simply never had it, so its
   title, ingredients, steps and servings sat at 13.6px whatever the reader
   had chosen. A new screen that shows or edits recipe text inherits this
   or it is broken for the person the app was built for; the two forms are
   measured against each other at more than one step, with a floor so they
   cannot pass by both being wrong. `R79` found the third place — the week
   plan's shopping list, ingredient lines at a hardcoded 17px on the screen
   you read in the shop. **The test for "is this recipe text?" is whose
   words they are**, not which screen they are on: quantities and
   ingredient names are the recipe's, so they scale; day headings, sheet
   titles and hints are the app's, so they do not.
10. **Names, labels, focus order and decorative artwork** (`R23`). Every
   button and link has a name a screen reader can say; every input has a
   label (visually hidden is fine); nothing carries a positive `tabindex`;
   every decorative `<svg>` is hidden from the accessibility tree. Checked on
   sixteen surfaces — the six screens plus every sheet, edit mode and the
   review forms — in `tests/kt.js`, which also asserts it actually reached the
   controls, so a state that failed to open can't read as a clean pass. These
   were reviewer items until the sweep proved cheap; a reviewer's attention is
   not a durable guarantee.

## Checked by the reviewer, by hand

11. **No hover-only affordances.** Everything reachable by tap alone.
   (Partly enforced: `tests/polish.js` proves no `a:hover` rule turns a
   filled control invisible.)
12. **Sheets/dialogs** follow the house contract: trap Tab, close on Escape,
   return focus to the opener. Reuse the existing machinery; don't rebuild it.
   (Partly enforced since `R55`: `tests/polish.js` scrolls every sheet to the
   bottom, upright and on its side, and requires a control that closes it to
   be fully on screen there, at least 44px, and neither covered nor
   see-through. Escape and the scrim both close a sheet, but neither is
   something a person can *see* — on a phone there is no Escape key, and the
   scrim is drawn as nothing. The Filter sheet failed this: 1134px of chips
   in a 544px window put Done 590px above the fold.)
13. **Colour is never the only signal** — pair it with a word, a glyph, or a
    weight change.
14. **Easy Read survives it.** Open the feature with Easy Read on, top step:
    one column, no faded text, nothing truncated. (Partly enforced since
    `R67`: `tests/polish.js` asserts **nothing renders in italics** under
    Easy Read, with the counterpart that those same notes *are* italic with
    it off — so the check is measuring the setting and not an app that
    happens to have no italics. All three the app had were explanatory
    notes, which is the text this reader most needs to read easily; upright
    and bold now, the same treatment Easy Read already gave `.hint`.)
15. **Both themes, by eye.** The automated audit catches ratios, not a
    white-on-white photo overlay or a shadow that vanished.
16. **Print still works** if the feature touches the recipe page — the print
    stylesheet shows content only, black on white. (Enforced for the recipe
    page itself since `R24`; a new surface that prints needs its own check.)

## Deferred to the device pass (`035`–`040`, `042`)

- What VoiceOver actually announces on each screen, in order.
- Whether the route-change live region is spoken, not merely present.
- Rotor behaviour inside open sheets.
- iOS Reduce Motion and Increase Contrast honoured end to end.

When that pass happens, its findings amend this file; anything it contradicts
above, it wins.
