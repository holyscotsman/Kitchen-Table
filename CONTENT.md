# Content truth — what is known-wrong in the data

This is gameplan task `013`: the visible list of known-wrong data, kept so it is
never mistaken for polish work. It is the working input to **Phase 8, the
content truth pass** — every item here needs an answer from Joan or the family,
not a guess. Rule 5 of the gameplan applies: nothing on this list may be
resolved by inference.

**Maintained by:** the Technical Writer role (task `013` creates it, Phase 8
burns it down, task `080` retires what's fixed). When an item is resolved, move
it to the log at the bottom with where the answer came from.

---

## 1. Inferred servings — 34 of 48 recipes

The original transcription captured no serving count for these; the design
handoff normalized them to integers, which means **the number shown today is a
guess**. Task `074` confirms each with Joan — or marks it unknown, which is a
valid answer where a guess is not.

`bacon-ranch-chicken-casserole` · `bbq-steak-times` · `boiled-eggs-in-ninja` ·
`chicken-fritters` · `chops` · `corn-on-the-cob` · `creamy-chicken-casserole` ·
`crepes` · `empinada` · `fish-pie` · `fries-in-ninja` · `frozen-lemonade` ·
`frozen-steak-and-mashed-potatoes` · `grilled-zucchini` · `hibachi-fried-rice` ·
`honey-glazed-parsnips` · `mushroom-risotto` · `ninja-cookies` ·
`ninja-frozen-meatballs` · `parsnips` · `potato-bacon-soup` · `potato-scone` ·
`rice-in-ninja` · `salmon-in-ninja` · `satay-sauce` · `scone-in-ninja` ·
`scones` · `scottish-tablet` · `shepherds-pie` · `shrimp-etouffee` ·
`square-sausage` · `steak-time-to-cook` · `sweet-potato-casserole` ·
`vanilla-frosting`

The other 14 carry counts that were actually visible in the source screenshots.
(Provenance: the pre-handoff `recipes.json` at commit `9d6ae5c` holds `null`
for exactly these 34.)

## 2. Empty ingredient lists — 4 recipes

The screenshots only ever showed the instructions. Task `072` recovers these
from Joan.

- `chops` — both screenshots show steps 1–5 only
- `fries-in-ninja` — also unclear whether the note describes fries alone or a
  fries-and-fish combination
- `parsnips` — single screenshot; likely parsnips, oil spray, salt — but likely
  is not known
- `steak-time-to-cook` — times only, no ingredients captured

## 3. Text cut off mid-sentence — 6 recipes

An ad banner or app chrome covered the end of a line in the source screenshot.
Task `073` resolves `parsnips`; the same conversation should resolve the rest.

- `parsnips` — final step ends "The parsnips are ready when they are…"
- `rice-in-ninja` — step 5 ends "If making brown rice allow it…"
- `salmon-in-ninja` — notes end "…sometimes a minute more is…"
- `crannachan` — step 8 ends "…sprinkle a little oatmeal on the top for ___"
- `potato-scone` — step 1 never captured; the bake step may be missing a
  transfer-to-baking-sheet instruction
- `corn-on-the-cob` — end of step 6 reconstructed as best as legible

## 4. Quantities that were never shown — 3 recipes

- `chicken-fritters` — most quantities described by purpose, not amount
- `grilled-zucchini` — zucchini quantity not visible; step 4's grill time
  obscured in all three copies of the screenshot
- `creamy-chicken-casserole` — ingredient list is the "a lot of sauce" option
  but the instructions use the "little bit" amounts; not reconciled

## 5. Oddities transcribed faithfully — 2 recipes

Transcribed exactly as the source showed, flagged rather than corrected:

- `scottish-tablet` — vinegar is listed but never used in the steps; "A few
  drops of white chocolate" reads oddly but is what the card says
- `fish-pie` — there were two separate Fish Pie notes (~2020 and ~2021); only
  one exported. The other may still exist in the Notes folder.

## 6. Collection-wide gaps

- **No recipe has a photo.** Task `077` collects at least one per course.
- ~~No recipe has a tag.~~ **37 now carry research-traceable tags** (see the
  research pass below); Joan-memory tags for the ambiguous eleven stay open
  under `076`.
- **Every recipe is Joan's.** Jason, Jennifer, Lindsay and Siobhan have empty
  sections — task `078`.
- `hibachi-fried-rice` — the servings count was partly visible but cut off by
  the browser header, so it is both "inferred" (§1) and "almost known".

---

## Duplicates (task `075`)

The whole collection was scanned pairwise — exact normalized titles, plus
fuzzy title-word × ingredient-line overlap (the same conservative thresholds
the in-app save-time detector uses). One candidate pair surfaced:

| Pair | Verdict | Why |
| --- | --- | --- |
| `scone-in-ninja` × `scones` | **Both stay — not duplicates** | Same word, different recipes: air fryer at 200°C with metric self-raising flour versus a greased-tray oven bake in cups; 8 steps vs 4. Two preparations Joan actually uses. |

**The standing rule for future duplicates:** when the same dish genuinely
appears twice, the version Joan cooks is the one that keeps the plain id and
the other is either removed or retitled to say how it differs (as the scone
pair already does). New candidates get a row here — the app's save-time
duplicate warning is the intake.

---

## The research pass (Jason's request, 2026-08-02)

Instruction: research the existing recipes — what might be wrong, where they
come from for tagging — with no major changes; major issues go to Jason first.

**Content scan:** temperatures and times across all 48 checked programmatically;
the four flagged values (125/135/145°F) are correct internal doneness
temperatures for steak and pork, not errors. **No defensible content errors
found.** The known gaps (4 empty ingredient lists, the parsnips truncation)
remain the content pass's worklist — nothing new joined them.

**Tags applied — 38, all traceable:** origin tags only where the dish name has
one established answer (Cranachan, tablet, tattie scones and square sausage are
Scottish; étouffée is Cajun; schnitzel is German; stroganoff is Russian;
lasagne and risotto are Italian; and so on), plus method tags the titles state
outright ("in Ninja" → *air fryer*) and *keto* where the title says so.
Eleven recipes stay untagged because their origin is genuinely ambiguous
(chops, corn on the cob, frosting, sponge cake, the grilled sides, the steak
timing charts, chicken fritters, pork chops in white wine) — guessing is
exactly what this ledger exists to prevent.

**Minor fix, disclosed:** `grilled-potatoes-and-peppers` had the literal word
"Ingredients" as its source — a parser artifact from the original screenshot —
now matching the title-line pattern every other source follows.

### Needs Jason (major-change gate)

| Item | Question |
| --- | --- |
| `empinada` | The dish is conventionally spelled **empanada**. Is "Empinada" Joan's own spelling (keep it — it's her book) or a transcription slip (I'll fix title + id with a redirect)? |
| `satay-sauce` | Tagged *Southeast Asian*; if the family knows it specifically as Malaysian/Thai-style, say so and I'll sharpen the tag. |

## Resolved

| Item | Resolved on | How |
| --- | --- | --- |
| — | | |
