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
- **No recipe has a tag.** Task `076` seeds nationality tags by asking, not
  inferring.
- **Every recipe is Joan's.** Jason, Jennifer, Lindsay and Siobhan have empty
  sections — task `078`.
- `hibachi-fried-rice` — the servings count was partly visible but cut off by
  the browser header, so it is both "inferred" (§1) and "almost known".

---

## Resolved

| Item | Resolved on | How |
| --- | --- | --- |
| — | | |
