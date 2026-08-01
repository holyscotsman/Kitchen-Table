# Kitchen Table — the 1.0 gameplan

**Status:** `v0.9` · 0 of 130 tasks complete · Act I, Phase 1
**When this file is fully ticked, the app is version 1.0.**

---

## 1. What this is

Thirteen roles produced 39 projects and 130 tasks. This file throws away the
role grouping and puts all 130 in **the order they actually have to happen** —
the thing that unblocks the most comes first, the thing that depends on it comes
after.

It is written to be *looped*: one task per pass, tick the box, commit, repeat.
It does not need to be held in anyone's head between sessions. The file is the
memory.

```
   130 tasks   ·   15 phases   ·   4 acts   ·   1 gate

   ACT I     Find out what's true          Phases 1–3     tasks 001–034
   ACT II    Make it safe, make it designed Phases 4–6     tasks 035–061
   ACT III   Make the content true          Phases 7–10    tasks 062–089
   ACT IV    The fork                       Phases 11–15   tasks 090–130
```

Act IV only happens if the gate in §6 opens. If it doesn't, **1.0 ships at the
end of Act III** and 41 tasks are struck with a one-line reason. That is a
success, not a shortfall.

---

## 2. The loop

Repeat until the release checklist in §9 is clear. **One task per pass.**

```
 1. READ      Open this file. Read §3 (rules) and §6 (the gate).
 2. PICK      Take the lowest-numbered unticked task in the current phase
              whose "Needs" are all ticked. Never reach into a later phase.
              A task whose "Needs" include a parked task is parked too —
              note in §11 what it is transitively waiting on.
 3. TRIAGE    Check the marker:
                🤖  do it now
                🤝  do it now if the one answer it needs is already in §11;
                    otherwise write the question into §11 and pick again
                👤  you cannot do this. Write what you need into §11 and
                    pick again.
 4. DO        That one task. Not the adjacent one that looks related.
 5. VERIFY    Against its "Done when". If you cannot verify it, it is not done.
 6. CHECK     Run the six suites and the contrast audit, both themes. Red means
              you are not finished, even if your task passed.
 7. TICK      Change [ ] to [x]. Add one line to §10 — what changed, or what
              you learned. One line. Not a report.
 8. DOCUMENT  Apply the Technical Writer duty in §5.
 9. COMMIT    One task, one commit: `P07/065 — photo lightbox on the recipe page`
10. LOOP      Back to 2. When every task in the phase is ticked or parked,
              run the phase-close checklist in §4 and move to the next phase.
```

### Stop and ask when

- A task needs a colour, a type size, or a font that `tokens.css` does not have.
  **That is a question, never a value to invent.** (`CLAUDE.md`, rule one.)
- Two tasks disagree, or a task turns out to be impossible as written.
- A task would change something a person already decided in an earlier phase.
- You are about to enter Phase 11 or Phase 15 and the gate in §6 is unresolved.
- A 🤖 task turns out to need a person after all. Re-mark it 👤 in this file,
  say why, and move on.

---

## 3. Rules that do not change

1. **`tokens.css` is the palette.** Zero hardcoded hex outside the `@media print`
   block. This survives every phase.
2. **One font: Atkinson Hyperlegible**, weights 400 and 700 only.
3. **Nothing interactive under 44px. Icon buttons 48×48. No hover-only anything.**
4. **Recipe instruction text stays at 24px at the default step.**
5. **Never write recipe content a person did not give you.** No inferred
   servings, no guessed ingredients, no invented tags. The whole point of Act III
   is undoing the last round of that.
6. **Never tick a box you did not verify.** A parked task is honest; a falsely
   ticked one poisons every task that lists it under "Needs".
7. **One task, one commit.** A phase is reviewable; a 40-task commit is not.
8. **Never skip forward** to something more interesting. The order is the product.
9. **Both themes, every time.** A change that is only checked in dark is not
   checked.

---

## 4. Phase-close checklist

Before starting the next phase, all five:

- [ ] Every task in the phase is `[x]` or listed in §11 with what it is waiting for.
- [ ] The six suites and the contrast audit are green.
- [ ] `README.md` reflects anything a reader would now experience differently.
- [ ] One line in §10 summarising the phase.
- [ ] The counter at the top of this file is updated.

---

## 5. The Technical Writer duty — `README.md`

`README.md` is the front door of the GitHub repo and the only documentation
anyone outside this project will ever read. It goes stale silently, so it is not
one task at the end — **it is a duty attached to the loop.**

**Every phase closes with a README pass.** Ask one question: *would someone
reading this now be told something that is no longer true?*

These tasks change the README directly and are not done until it is edited:

| Task | What moves in the README |
| --- | --- |
| `028` | The category-versus-tag rule, in *Photos and tags* |
| `049` | Whether fonts are self-hosted, in *Files* |
| `061` | A link to the component reference |
| `067` `068` `069` | Tag autocomplete, bulk tagging, rename/merge, in *Photos and tags* |
| `079` | The whole *Adding a recipe* section, rewritten for someone who has never used GitHub |
| `080` | Cross-check `README.md` against `CLAUDE.md` — they drift apart, not together |
| `087` `088` | What search now matches, in *Screens* |
| `092` `104`–`112` | If a server exists, the README's core premise ("no server") is wrong and must be rewritten |
| `129` | The calendar, if it ships |

The README also carries the **live status line** — one sentence near the top
saying which version the app is on. Task `080` owns keeping it accurate.

---

## 6. The gate

Everything in Act IV hangs off **one unanswered question**, and it is task `026`.

```
                          026 · the backend memo
                                    │
                 ┌──────────────────┴──────────────────┐
                 │                                     │
             NO SERVER                              SERVER
                 │                                     │
     1.0 ships at end of Act III          Act IV runs: Phases 11–14
     Phases 11–14 struck (30 tasks)       then Phase 15 if 030 says yes
     Phase 15 runs client-side            1.0 ships at end of Phase 15
     if 030 says yes (11 tasks)
```

**Do not build speculatively past this line.** Building a server nobody decided
to run is the most expensive mistake available to this project — it is 30 tasks,
a monthly bill, and a database that becomes the only copy of 48 irreplaceable
recipes.

Phase 15 (the calendar) has its own smaller gate: task `030`. A calendar can be
built client-side without a server, but a meal plan only one phone can see is
close to useless — so `030` decides whether it is worth building either way.

**Key:** 🤖 an agent can do this alone · 🤝 needs one answer first ·
👤 needs a person, a phone, or a conversation

Of the 130: **74 are 🤖**, **24 are 🤝**, **32 are 👤**. The 👤 tasks are not a
problem with the plan — they are the reason this app is worth building. Nobody
can watch Joan cook except a person.

---

# ACT I — Find out what's true

*34 tasks. Nothing here builds anything. Every decision in Act II and every line
of content in Act III cites something measured here.*

## Phase 1 — Ground truth

*14 tasks. Nothing in this phase depends on anything. It can start today.*

- [x] `001` 🤖 **SEC** — Re-check that no GitHub token remains anywhere in the codebase or its history, after the publish flow was removed.
  - *Needs:* — · *Done when:* a full history scan is clean, and the result is written down. **Do this first.** If something leaked, everything else waits.
- [x] `002` 🤖 **QA** — Commit the six test suites into the repo so the whole set runs from one command.
  - *Needs:* — · *Done when:* a clean clone runs all 210 checks plus the contrast audit with one command.
- [x] `003` 🤖 **OPS** — Wire GitHub Actions to run those suites on every pull request.
  - *Needs:* `002` · *Done when:* a deliberately broken PR goes red before merge.
- [ ] `004` 👤 **QA** — Open every screen on a physical iPhone and confirm Atkinson Hyperlegible actually renders.
  - *Needs:* — · *Done when:* confirmed by eye against a fallback screenshot. **If this fails, the typographic contract is broken and Phase 6 changes shape.**
- [ ] `005` 👤 **QA** — Test Save to Notes through the real iOS share sheet, end to end.
  - *Needs:* — · *Done when:* a recipe arrives in Notes, readable, from a real device.
- [ ] `006` 👤 **QA** — Verify the wake lock holds through a genuine 40-minute bake, including backgrounding the app.
  - *Needs:* — · *Done when:* the screen is still on at the end, after a phone call or a switch to another app.
- [ ] `007` 👤 **QA** — Print a recipe to real paper and confirm nothing is white-on-white.
  - *Needs:* — · *Done when:* a printed page is legible in both themes' starting states.
- [x] `008` 🤖 **QA** — Confirm a removed recipe stays removed across a reload, a theme change and a browser restart.
  - *Needs:* — · *Done when:* covered by an automated check, not a manual pass.
- [x] `009` 🤖 **QA** — Test "Undo all my changes" from the Menu empty state — the only route back when everything is removed.
  - *Needs:* — · *Done when:* automated, from a state with zero recipes.
- [x] `010` 🤖 **FE-A** — Measure localStorage headroom with 48 photos attached and document the ceiling.
  - *Needs:* — · *Done when:* a number is written into §10. This decides task `062`.
- [x] `011` 🤖 **QA** — Fill localStorage to the quota with photos and confirm the failure message appears rather than a silent loss.
  - *Needs:* `010` · *Done when:* the quota message is asserted by a test.
- [x] `012` 🤖 **FE-A** — Benchmark first contentful paint on a throttled 3G profile and set a budget.
  - *Needs:* — · *Done when:* a number and a budget are recorded, and CI can fail against the budget.
- [x] `013` 🤖 **PM** — Start the visible list of known-wrong data, so it is never mistaken for polish work.
  - *Needs:* — · *Done when:* every inferred serving, empty ingredient list and truncated step is enumerated in one place. This is the input to Phase 8.
- [ ] `014` 🤖 **SEC** — Write down explicitly that contributor names are not authentication, so nobody builds on them later.
  - *Needs:* — · *Done when:* it is in `CLAUDE.md`, not in a chat message.

## Phase 2 — Watch Joan

*10 tasks, all of them a person's. Every accessibility choice so far was set from
a specification. None of it has been watched in her hands.*

- [ ] `015` 👤 **UXR** — Run an unguided first session with Joan on her own phone, screen-recorded with her permission.
  - *Needs:* `004` · *Done when:* a recording exists and nobody helped her.
- [ ] `016` 👤 **UXR** — Time how long it takes her to find a specific known recipe from a cold start.
  - *Needs:* `015` · *Done when:* a number, plus what she tried first.
- [ ] `017` 👤 **UXR** — Watch whether she discovers A−/A+ without being told, or never finds it.
  - *Needs:* `015` · *Done when:* observed, either way. Both answers are useful.
- [ ] `018` 👤 **UXR** — Test whether the mode switch reads as "edit this recipe" or as something she should avoid touching.
  - *Needs:* `015` · *Done when:* she says what she thinks it does, in her words.
- [ ] `019` 👤 **UXR** — Check whether tap-to-check-off is discovered during real cooking, or only when pointed out.
  - *Needs:* `015` · *Done when:* observed mid-recipe, not in a demo.
- [ ] `020` 👤 **UXR** — Observe whether she notices the servings control, and whether rescaled fractions like `1½` read clearly to her.
  - *Needs:* `015` · *Done when:* she reads a scaled quantity aloud correctly, or doesn't. This decides whether `074` is even the right fix.
- [ ] `021` 👤 **UXR** — Sit with a second family member through an import from a link, start to finish, without helping.
  - *Needs:* — · *Done when:* they either complete it or get stuck, and where is recorded.
- [ ] `022` 👤 **UXR** — Establish whether "Download updated recipes.json" means anything at all to a non-technical person.
  - *Needs:* `021` · *Done when:* answered plainly. This is the single biggest input to the gate.
- [ ] `023` 👤 **UXR** — Report back on the category names in her words — does she say "Sides", or "vegetables"?
  - *Needs:* `015` · *Done when:* her vocabulary is written down verbatim. This decides `027`.
- [ ] `024` 👤 **UXR** — Write the findings as observations rather than recommendations, so design and engineering argue about the fix and not the facts.
  - *Needs:* `015`–`023` · *Done when:* the write-up contains no sentence beginning "we should".

## Phase 3 — Decide

*10 tasks. Every one of these is a ruling that unblocks other people. Nothing
here is built; everything here is written down.*

- [ ] `025` 👤 **PM** — Get a real answer from the family on whether "download and commit" is acceptable friction, or the thing that kills adoption.
  - *Needs:* `022` · *Done when:* an actual person has said yes or no.
- [ ] `026` 🤝 **PM** — Write the one-page backend decision memo: what breaks today without one, what it would cost per month, who maintains it.
  - *Needs:* `010` `011` `021` `025` · *Done when:* the memo ends in a decision, not options. **This is the gate in §6.**
- [ ] `027` 🤝 **PM** — Rule on the ten-category list — specifically whether `Sides` and `Drinks` stay, since they were added over the requested eight to avoid mislabelling 11 recipes.
  - *Needs:* `023` · *Done when:* the list is final and `CAT_ALIASES` covers anything dropped.
- [ ] `028` 🤝 **TW** — Agree with the family what counts as a category versus a tag, and write the rule down.
  - *Needs:* `027` · *Done when:* the rule is in `README.md` and someone can apply it to a new recipe without asking.
- [ ] `029` 🤝 **PM** — Set the bar for what "done" means for a recipe: does it need a photo, verified servings, and at least one tag before it counts as finished?
  - *Needs:* `013` · *Done when:* written. This is the acceptance criterion for all of Phase 8.
- [ ] `030` 👤 **PM** — Decide whether the menu-planning calendar is 1.0 or a stretch goal, and write down which.
  - *Needs:* `026` · *Done when:* decided. **This gates Phase 15.**
- [ ] `031` 🤝 **PM** — Define what happens when two family members edit the same recipe, since local-only editing has no merge story at all.
  - *Needs:* `026` · *Done when:* the rule is written, whether or not a server exists to enforce it.
- [ ] `032` 🤝 **PM** — Agree a cadence for pulling everyone's local edits into the repo — weekly, monthly, or on request.
  - *Needs:* `026` `031` · *Done when:* a named person owns it and a frequency is set.
- [ ] `033` 🤝 **PM** — Arbitrate the first accessibility-versus-feature conflict in writing, so the precedent exists before it is contested under pressure.
  - *Needs:* `024` · *Done when:* a real conflict has been ruled on, not a hypothetical one.
- [ ] `034` 🤖 **A11Y** — Write the accessibility acceptance criteria every new feature must meet before merge.
  - *Needs:* `033` · *Done when:* it is a checklist a reviewer can run. **Everything merged after this is held to it.**

---

# ACT II — Make it safe, make it designed

*27 tasks. Verify and harden what already exists before adding to it, so every
feature built in Act III and Act IV inherits the guarantees rather than being
retro-fitted with them.*

## Phase 4 — Audit what is already shipped

*12 tasks. Automated contrast passes across 44 combinations already. Automated
checks cannot tell you whether a screen reader announces anything useful.*

- [ ] `035` 👤 **A11Y** — Run VoiceOver on iOS through every screen and log what is announced versus what should be.
  - *Needs:* `004` · *Done when:* every screen has a line in the log, including Add, Import and the Text-size sheet.
- [ ] `036` 👤 **A11Y** — Verify the route-change live region is actually spoken, rather than merely present.
  - *Needs:* `035` · *Done when:* heard, on a device.
- [ ] `037` 👤 **A11Y** — Test the filter and download sheets for focus trapping with a real screen reader, not just by keystroke.
  - *Needs:* `035` · *Done when:* the rotor cannot escape an open sheet.
- [ ] `038` 👤 **A11Y** — Check that check-off rows announce their pressed state and their text together.
  - *Needs:* `035` · *Done when:* "checked, two cups flour" and not two separate announcements.
- [ ] `039` 👤 **A11Y** — Confirm the servings stepper announces the new count when it changes.
  - *Needs:* `035` · *Done when:* the change is spoken without re-navigating to it.
- [ ] `040` 👤 **A11Y** — Verify every category icon is correctly hidden from assistive technology and never read as content.
  - *Needs:* `035` · *Done when:* all ten are silent. This feeds `056`.
- [ ] `041` 🤖 **A11Y** — Audit at 200% browser zoom on top of Easy Read — the compounding case nobody tests.
  - *Needs:* — · *Done when:* no horizontal scroll and no clipped text at any of the five font steps.
- [ ] `042` 👤 **A11Y** — Test with iOS Reduce Motion and Increase Contrast both on.
  - *Needs:* `004` · *Done when:* every animation is off and nothing has lost a border.
- [ ] `043` 🤖 **A11Y** — Check colour is never the only signal — the flagged panel and the empty-contributor tile are the two risks.
  - *Needs:* — · *Done when:* both carry a shape or a word as well as a colour. Feeds `058`.
- [ ] `044` 🤖 **SEC** — Audit every render path for unescaped interpolation, especially in imported fields.
  - *Needs:* — · *Done when:* every path is either escaped or explicitly justified in a comment.
- [ ] `045` 🤖 **SEC** — Import a page containing a script tag and confirm it is inert everywhere it appears.
  - *Needs:* `044` · *Done when:* a test asserts it, in the card, the recipe page and the edit field.
- [ ] `046` 🤖 **SEC** — Cap the size of imported fields so a hostile page cannot exhaust storage.
  - *Needs:* `044` · *Done when:* a cap exists, is enforced, and says so when it truncates.

## Phase 5 — Close the third-party surface

*6 tasks. Four CORS relays, a Tesseract CDN and Google Fonts. Each is a party
that sees something, and none is documented for the family. The CSP goes last,
because it can only be written once every legitimate origin is known.*

- [ ] `047` 🤖 **SEC** — Confirm the OCR library genuinely runs locally and uploads nothing.
  - *Needs:* — · *Done when:* verified by network trace, not by reading the README of the library.
- [ ] `048` 🤖 **SEC** — Pin the Tesseract CDN version and add subresource integrity.
  - *Needs:* `047` · *Done when:* the version is exact and a tampered hash blocks the load.
- [ ] `049` 🤖 **SEC** — Review whether Google Fonts should be self-hosted to remove a third party from every page load.
  - *Needs:* `004` · *Done when:* decided and done, or decided and written down why not. **→ README**
- [ ] `050` 🤖 **SEC** — Document, in the UI, exactly what each relay receives when a link is imported.
  - *Needs:* — · *Done when:* the disclosure names the relays and says what is sent, before the request is made.
- [ ] `051` 🤖 **FE-B** — Show which relay succeeded, so a persistent failure can be diagnosed rather than guessed at.
  - *Needs:* `050` · *Done when:* the review screen names the relay that answered.
- [ ] `052` 🤖 **SEC** — Add a Content-Security-Policy and confirm it does not break the lazily-loaded OCR library.
  - *Needs:* `047` `048` `049` `050` · *Done when:* the policy is as tight as the known origin list allows, and every path still works.

## Phase 6 — Design the screens that were never designed

*9 tasks. Add, Import, the Text-size sheet, Easy Read and the category icons were
composed from the existing vocabulary by an engineer. They hold together and
they pass contrast, but nobody with a designer's eye has reviewed them.*

- [ ] `053` 🤖 **UI** — Audit the Add and Import screens against `styleguide.html` and mark every value that was improvised.
  - *Needs:* — · *Done when:* a list exists of every size, space and radius that is not in the styleguide.
- [ ] `054` 🤝 **UI** — Extend `tokens.css` with any genuinely missing values rather than letting engineers invent them — a print palette is the known gap.
  - *Needs:* `007` `053` · *Done when:* the `@media print` block's literal black, white and grey are tokens, and the file's hex count outside it is still zero. **Any new value is asked for, never invented.**
- [ ] `055` 🤝 **UI** — Specify focus-visible styling as a designed state, not a browser default.
  - *Needs:* `035`–`043` · *Done when:* it is drawn, and it clears AA against every surface it lands on.
- [ ] `056` 🤖 **UI** — Redraw any of the ten category icons that do not read at 24px — the Sides bowl and Baking whisk are the weakest.
  - *Needs:* `040` · *Done when:* all ten are identifiable at 20px on a phone.
- [ ] `057` 🤖 **UI** — Specify the photo aspect ratio and crop behaviour for hero and thumbnail, including portrait photos from a phone.
  - *Needs:* — · *Done when:* a portrait photo, a landscape photo and a square photo all look deliberate in both slots.
- [ ] `058` 🤝 **UI** — Design the empty-contributor tile properly; the current outlined treatment was an engineering judgement call.
  - *Needs:* `043` · *Done when:* it reads as an invitation rather than a zero, without colour being the only signal.
- [ ] `059` 🤝 **UI** — Review Easy Read against the design intent — it currently removes the dim tier, which was an engineering decision about contrast.
  - *Needs:* `017` `041` · *Done when:* the mode is either endorsed as-is or redrawn, in writing.
- [ ] `060` 🤖 **UI** — Define the tag chip at every size and on every surface it appears on: card, recipe page, and filter sheet.
  - *Needs:* `028` · *Done when:* one spec covers all three, including a chip with a long tag in it.
- [ ] `061` 🤖 **UI** — Produce a one-page component reference so the next person to add a screen has something to build from.
  - *Needs:* `053`–`060` · *Done when:* it is in the repo and linked from the README. **→ README**

---

# ACT III — Make the content true

*28 tasks. The app is finished and the content is not: servings inferred on 34
of 48 recipes, no photos, no tags, four recipes with no ingredients at all. This
act builds the instruments first, then does the work, then makes it findable.*

## Phase 7 — Photos and tags: the machinery

*10 tasks. Built to the Phase 6 design, so the content pass in Phase 8 has
somewhere to put things. Tagging 48 recipes one at a time will not happen, so
bulk tagging exists before anyone is asked to tag.*

- [ ] `062` 🤖 **FE-A** — Move photo storage to IndexedDB if the ceiling from `010` proves too low for the collection.
  - *Needs:* `010` `011` · *Done when:* 48 photos fit, or it is written down why the current store is enough.
- [ ] `063` 🤖 **FE-A** — Add lazy loading and explicit dimensions to thumbnails so the list does not reflow as photos decode.
  - *Needs:* `012` `057` · *Done when:* cumulative layout shift is zero with a full list of photos.
- [ ] `064` 🤖 **FE-A** — Handle a recipe whose photo has been committed but whose local copy is gone, without flashing a broken state.
  - *Needs:* `062` · *Done when:* the fallback to the category icon is silent.
- [ ] `065` 🤖 **FE-A** — Add a photo lightbox on the recipe page, since a hero at 280px is not enough to read a handwritten card.
  - *Needs:* `057` · *Done when:* it opens, traps focus, closes on Escape and returns focus — same contract as every other sheet.
- [ ] `066` 🤖 **FE-B** — Support importing several photos into one recipe, since a long recipe spans two cards.
  - *Needs:* `062` `057` · *Done when:* two cards produce one recipe with both pages retained.
- [ ] `067` 🤖 **FE-B** — Add tag autocomplete drawing on tags already in use, to stop near-duplicates being created.
  - *Needs:* `060` `028` · *Done when:* typing "ital" offers "Italian" before it offers to create "italian". **→ README**
- [ ] `068` 🤖 **FE-B** — Add bulk tagging from the Menu.
  - *Needs:* `067` · *Done when:* ten recipes can be tagged in one pass. **→ README**
- [ ] `069` 🤖 **FE-B** — Build tag rename and merge, and make it update every recipe that uses the old name.
  - *Needs:* `067` · *Done when:* merging "italian" into "Italian" leaves no recipe pointing at the old one. **→ README**
- [ ] `070` 🤖 **FE-B** — Detect a likely duplicate on save by comparing title and ingredients against the collection.
  - *Needs:* — · *Done when:* it warns and offers a comparison, and never blocks the save.
- [ ] `071` 🤖 **FE-A** — Revisit the four recipes with no ingredient list and design a better in-page prompt to fix them.
  - *Needs:* `029` · *Done when:* the prompt says what is missing and opens the right field, in Viewer mode as well as Edit.

## Phase 8 — The content truth pass

*9 tasks, and the most valuable block in this file. Almost all of it is a
person's — nobody can ask Joan what a recipe serves except a person. **Nothing
here may be inferred.** Rule 5 in §3 exists for this phase.*

- [ ] `072` 👤 **TW** — Recover ingredient lists for `chops`, `parsnips`, `fries-in-ninja` and `steak-time-to-cook`.
  - *Needs:* `013` `071` · *Done when:* four recipes have real ingredients, from Joan, not reconstructed.
- [ ] `073` 👤 **TW** — Resolve the cut-off final step in `parsnips`, currently truncated mid-sentence by an ad banner.
  - *Needs:* `072` · *Done when:* the step ends in a full stop that Joan recognises.
- [ ] `074` 👤 **TW** — Sit with Joan and confirm the real serving count for the 34 recipes where it was inferred.
  - *Needs:* `013` `020` · *Done when:* all 34 are either confirmed or explicitly marked unknown. Marked unknown is a valid answer; a guess is not.
- [ ] `075` 🤝 **TW** — Maintain a duplicates list and decide which version wins when two people have the same recipe.
  - *Needs:* `070` · *Done when:* the list exists and each entry has a winner named.
- [ ] `076` 👤 **TW** — Seed the first nationality tags by asking where each dish came from, rather than inferring it.
  - *Needs:* `067` `068` `028` · *Done when:* every tag traces to something someone said.
- [ ] `077` 👤 **TW** — Collect at least one photo per course so the Main hero is not empty for every category.
  - *Needs:* `062` `063` `057` · *Done when:* all ten categories have at least one, committed to `images/`.
- [ ] `078` 👤 **TW** — Chase Jason, Jennifer, Lindsay and Siobhan for their first recipe each.
  - *Needs:* — · *Done when:* four empty contributor tiles are no longer empty, or a real reason is recorded for each that stays.
- [ ] `079` 🤖 **TW** — Write the one-page "how to add a recipe" guide aimed at someone who has never used GitHub.
  - *Needs:* `028` `067` `068` · *Done when:* someone non-technical follows it start to finish without asking a question. **→ README**
- [ ] `080` 🤖 **TW** — Bring `CLAUDE.md`'s build-state section current, and cross-check `README.md` against it.
  - *Needs:* `072`–`079` · *Done when:* every decision taken in Acts I–III appears in one of the two, and neither contradicts the other. **→ README**

## Phase 9 — Import you can trust

*6 tasks. Import is the only place machine-guessed content enters the collection,
and the one feature that has already failed in production. The pipeline is
verified against a stubbed recogniser; Tesseract has never seen a real photograph
of one of Joan's cards.*

- [ ] `081` 👤 **FE-B** — Run OCR against twenty real photos of Joan's recipe cards and record the error rate honestly.
  - *Needs:* `047` `048` `052` `077` · *Done when:* a percentage is written down, including the ugly one. **Do not round it down.**
- [ ] `082` 🤖 **FE-B** — Flag individual fields the parser was unsure about, rather than flagging the whole recipe.
  - *Needs:* `081` · *Done when:* `flagged` names fields, and the recipe page shows the flag beside the field it belongs to.
- [ ] `083` 🤖 **FE-B** — Let a user correct the ingredients-versus-steps split with one control when the parser guessed wrong.
  - *Needs:* `081` · *Done when:* a misplaced line moves between the two lists in one tap.
- [ ] `084` 🤖 **FE-B** — Preserve a half-finished import across an accidental refresh instead of losing the work.
  - *Needs:* — · *Done when:* a refresh mid-review returns to the same draft, and the draft is still never saved until Save is pressed.
- [ ] `085` 🤝 **QA** — Feed the OCR path a deliberately terrible photo and confirm it flags rather than invents.
  - *Needs:* `081` `082` · *Done when:* an unreadable photo produces flags and empty fields, never plausible-looking fiction.
- [ ] `086` 🤖 **QA** — Run the import with all four relays blocked and confirm the paste box still completes a save.
  - *Needs:* `051` · *Done when:* asserted by a test, with the network fully blocked.

## Phase 10 — Search and scale

*3 tasks. Deferred to the end of Act III on purpose: tuning search before the
tags exist is tuning it against the wrong data.*

- [ ] `087` 🤖 **FE-A** — Add diacritic and simple typo tolerance to search, so "creme" finds "crème".
  - *Needs:* `076` · *Done when:* a set of real misspellings from `016` all resolve. **→ README**
- [ ] `088` 🤖 **FE-A** — Show which field matched a search hit, so a tag match does not look like a mistake.
  - *Needs:* `087` · *Done when:* a hit on an ingredient says so on the card. **→ README**
- [ ] `089` 🤖 **FE-A** — Virtualise the Menu list if it passes roughly 150 recipes.
  - *Needs:* `063` `078` · *Done when:* it is built, or it is written down that the collection is nowhere near the threshold and this is deferred.

---

# ACT IV — The fork

*41 tasks, all of them downstream of task `026`. **If `026` says no server,
strike Phases 11–14 (30 tasks) with that as the reason and skip to Phase 15** —
or straight to the release checklist if `030` also says no.*

> **Read §6 before entering this act.** Building a server nobody decided to run
> is 30 tasks, a monthly bill, and a database that becomes the only copy of 48
> irreplaceable recipes.

## Phase 11 — Prove the ground *(gated on `026`)*

*8 tasks. The architecture doc's own warning first: a host that resets its
filesystem on redeploy destroys a SQLite database silently, and the loss is only
discovered later.*

- [ ] `090` 🤖 **OPS** — Compare Railway, Render and Fly on persistent-disk behaviour, monthly cost and cold-start time.
  - *Needs:* `026` · *Done when:* three rows, same columns, real numbers.
- [ ] `091` 👤 **OPS** — Write a file to the shortlisted host's disk, force a redeploy, and confirm it is still there. Document the result.
  - *Needs:* `090` · *Done when:* proven on the actual plan that would be paid for, not the docs' claim about it.
- [ ] `092` 👤 **PM** — Choose the hosting platform and record why.
  - *Needs:* `090` `091` · *Done when:* chosen, paid for, and the reason is written down. **→ README** — the README's "no server" premise is now wrong.
- [ ] `093` 🤖 **DB** — Write the schema with tags as a real join table, not a comma-separated column.
  - *Needs:* `092` `028` · *Done when:* people, recipes, tags and menu_plan exist and the tag join is real.
- [ ] `094` 🤖 **DB** — Index `recipes.category`, `recipes.contributor_id` and `menu_plan.date` from the start.
  - *Needs:* `093` · *Done when:* in the first migration, not a later one.
- [ ] `095` 🤖 **DB** — Add a migration runner that records applied versions.
  - *Needs:* `093` · *Done when:* it exists before the second schema change, not after it.
- [ ] `096` 🤖 **BE** — Write the OpenAPI description before any endpoint, so the frontend can be built against a contract.
  - *Needs:* `093` · *Done when:* every endpoint in Phase 13 is described and nothing is implemented yet.
- [ ] `097` 🤝 **DB** — Decide whether images live in the database or on disk, and write down why.
  - *Needs:* `091` `092` · *Done when:* decided, with the persistence result from `091` cited.

## Phase 12 — Move the data *(gated on `026`)*

*6 tasks. The migration script is also the best audit `recipes.json` will ever
get. This data is genuinely irreplaceable, so the backup is tested before the
API is written, not after.*

- [ ] `098` 🤖 **DB** — Build the `recipes.json` import and have it fail loudly on anything malformed.
  - *Needs:* `095` `080` · *Done when:* a deliberately broken file stops the import with a useful message.
- [ ] `099` 🤖 **DB** — Report, during migration, every recipe with an empty ingredient list.
  - *Needs:* `098` · *Done when:* the report runs. **If Phase 8 did its job this now returns zero — that is the check on `072`.**
- [ ] `100` 🤖 **DB** — Preserve the `flagged` array; it is the record of what the transcription was unsure about.
  - *Needs:* `098` `082` · *Done when:* a round trip loses no flag, including the per-field ones from `082`.
- [ ] `101` 🤖 **DB** — Add a round-trip export back to `recipes.json` so the project is never locked into the database.
  - *Needs:* `098` `100` · *Done when:* export → import → export is byte-identical.
- [ ] `102` 🤝 **DB** — Script a nightly backup that copies the database somewhere off the host.
  - *Needs:* `097` `101` · *Done when:* it has run unattended overnight at least once.
- [ ] `103` 🤝 **DB** — Test a restore end to end — an untested backup is not a backup.
  - *Needs:* `102` · *Done when:* a destroyed database has been rebuilt from a backup and the app came up on it.

## Phase 13 — Build the API *(gated on `026`)*

*9 tasks, built against the `096` contract. Server-side import comes before the
sync endpoints because it removes the CORS relay chain entirely — the single
biggest reliability win available to this project.*

- [ ] `104` 🤖 **BE** — Implement recipe CRUD with validation that rejects malformed imports rather than storing them.
  - *Needs:* `096` `098` `046` · *Done when:* every field is validated and the API matches the OpenAPI description exactly. **→ README**
- [ ] `105` 🤖 **BE** — Add a health endpoint that verifies the database file is present and writable.
  - *Needs:* `104` · *Done when:* it fails when the disk is read-only, not just when the process is dead.
- [ ] `106` 🤖 **BE** — Move link fetching server-side and drop the four-relay fallback chain.
  - *Needs:* `104` `051` · *Done when:* import works with every relay blocked at the client, and §5's relay disclosure is removed from the UI as no longer true.
- [ ] `107` 🤖 **BE** — Run OCR server-side with a request size limit and a hard timeout.
  - *Needs:* `104` `081` · *Done when:* the error rate matches or beats the number recorded in `081`.
- [ ] `108` 🤖 **BE** — Rate-limit the import endpoints — they are the only ones that make outbound requests.
  - *Needs:* `106` `107` · *Done when:* the limit is enforced and the message says what to do about it.
- [ ] `109` 🤖 **BE** — Serve images at requested sizes so phones do not download a 1200px hero for a 64px slot.
  - *Needs:* `097` `104` · *Done when:* the 3G budget from `012` still holds with a full list of photos.
- [ ] `110` 🤖 **BE** — Add an endpoint that accepts a device's whole local overlay and reports conflicts instead of overwriting.
  - *Needs:* `104` `031` · *Done when:* a device with a month of local edits can be reconciled without losing one.
- [ ] `111` 🤖 **BE** — Build a conflict-resolution response the UI can present as a choice, not an error.
  - *Needs:* `110` `031` · *Done when:* a conflict renders as two readable versions and a pick.
- [ ] `112` 🤖 **BE** — Keep the existing static build working against the API, so a rollback is always possible.
  - *Needs:* `104` · *Done when:* the static build still runs from `recipes.json` alone with the server switched off. **→ README**

## Phase 14 — Run it *(gated on `026`)*

*7 tasks. Deployment already works today: push to `main`, Pages rebuilds in about
a minute. The moment deployment needs a runbook, updates stop happening — so the
bar is that shipping a change stays a normal push.*

- [ ] `113` 🤝 **OPS** — Set up the GitHub-to-host pipeline so a merge deploys automatically.
  - *Needs:* `092` `104` `003` · *Done when:* a merge deploys with no manual step and the suites gate it.
- [ ] `114` 🤝 **OPS** — Keep a staging environment with a copy of the data for testing migrations.
  - *Needs:* `113` `102` · *Done when:* a migration has been rehearsed on staging before production.
- [ ] `115` 🤝 **OPS** — Add an uptime check that alerts on the site being down, not just the host being up.
  - *Needs:* `105` `113` · *Done when:* it fires on a deliberately broken deploy, and it reaches a person.
- [ ] `116` 🤝 **OPS** — Set up log retention long enough to investigate a problem reported days later.
  - *Needs:* `113` · *Done when:* a week-old request can still be traced.
- [ ] `117` 🤝 **OPS** — Automate the database backup off-host and verify it runs unattended.
  - *Needs:* `102` `103` `113` · *Done when:* it has survived a week without anyone touching it.
- [ ] `118` 🤝 **OPS** — Document the rollback procedure and rehearse it once.
  - *Needs:* `112` `113` · *Done when:* someone who did not write it has followed it successfully.
- [ ] `119` 🤖 **OPS** — Keep the static-only build deployable as a fallback if the server has to be abandoned.
  - *Needs:* `112` `101` · *Done when:* Pages can be re-pointed at the static build in one commit, with current data.

## Phase 15 — The calendar *(gated on `030`)*

*11 tasks. Nothing exists yet. This phase can run without a server if `030` says
1.0 — but a meal plan only one phone can see is close to useless, which is why
`030` is a real question and not a formality.*

- [ ] `120` 🤝 **FE-C** — Decide and document the meal slots — breakfast, lunch, dinner, or dinner only.
  - *Needs:* `030` · *Done when:* decided from how the family actually plans, not from what a calendar usually has.
- [ ] `121` 🤝 **UI** — Draw the calendar week view at 390px, 768px and 1180px before anyone builds it.
  - *Needs:* `120` `061` · *Done when:* all three widths are drawn and none needs a new token.
- [ ] `122` 🤖 **FE-C** — Prototype the week grid at 390px and confirm it survives Easy Read without horizontal scrolling.
  - *Needs:* `121` `041` `059` · *Done when:* seven days fit at the largest font step with no horizontal scroll. **If it cannot, `121` is wrong and goes back.**
- [ ] `123` 🤖 **FE-C** — Build tap-to-assign with a recipe picker reusing the existing search.
  - *Needs:* `122` `087` · *Done when:* assigning is a tap. **Never drag — it is hostile on a phone and unusable with a tremor or low vision.**
- [ ] `124` 🤖 **FE-C** — Show an assigned recipe as a card carrying its category icon and photo thumbnail.
  - *Needs:* `123` `056` `063` · *Done when:* it reads at a glance at the largest font step.
- [ ] `125` 🤖 **FE-C** — Let a planned meal record its own servings, independent of the recipe's default.
  - *Needs:* `123` `074` · *Done when:* Tuesday for four and Sunday for twelve are the same recipe with different amounts.
- [ ] `126` 🤖 **FE-C** — Handle the same recipe planned twice in one week without treating it as an error.
  - *Needs:* `125` · *Done when:* both entries exist independently and can be scaled differently.
- [ ] `127` 🤖 **FE-C** — Define what a meal plan means when the recipe it points at is later removed.
  - *Needs:* `126` `031` · *Done when:* the slot degrades to the recipe's name rather than vanishing or crashing.
- [ ] `128` 🤖 **FE-C** — Add week-to-week navigation with the View Transitions API, degrading cleanly where unsupported.
  - *Needs:* `122` `042` · *Done when:* it works without the API, and is off entirely under Reduce Motion.
- [ ] `129` 🤖 **FE-C** — Add a print view of the week for the fridge door — likely the most-used output.
  - *Needs:* `124` `054` `007` · *Done when:* one page, black on white, legible across a kitchen. **→ README**
- [ ] `130` 🤖 **FE-C** — Prototype ingredient summing and find out how badly units break it before promising the feature.
  - *Needs:* `125` `076` · *Done when:* the failure modes are written down. **This is a spike. Shipping it is a separate decision, not part of 1.0.**

---

## 9. Release checklist — what makes it 1.0

Every one of these, after the last phase closes:

- [ ] All 130 tasks are `[x]`, or struck with a written reason under §11.
- [ ] The six suites and the contrast audit are green, both themes.
- [ ] `tokens.css` still holds every colour. Zero hardcoded hex outside `@media print`.
- [ ] Atkinson Hyperlegible confirmed rendering on a physical iPhone (`004`).
- [ ] Recipe instruction text is still 24px at the default step.
- [ ] Nothing interactive under 44px; icon buttons still 48×48.
- [ ] Every recipe meets the `029` bar, or is on the `013` list with a reason.
- [ ] `README.md` describes the app that exists, not the one that was planned.
- [ ] `CLAUDE.md`'s build-state section matches reality (`080`).
- [ ] **Change `VERSION` in `app.js` from `0.9` to `1.0`.** It is one constant; it
      renders in the bottom corner of every screen.
- [ ] Tag the release `v1.0` and say so in the README status line.

---

## 10. Log

*One line per task. Append, never rewrite. This is how a session that starts cold
finds out what the last one learned.*

| Task | Date | One line |
| --- | --- | --- |
| — | 2026-08-01 | Gameplan written. 130 tasks sequenced, 15 phases, 1 gate at `026`. Nothing started. |
| `001` | 2026-08-01 | Full-history scan clean: zero credential patterns; the removed publish flow read its token from localStorage at runtime, never from code. |
| `002` | 2026-08-01 | Six suites + contrast audit now live in `tests/`, one command (`tests/run.sh`), hermetic — every relay stubbed, so no test waits on a real network. Wake-lock check needs full Chromium; the runner finds it. |
| `003` | 2026-08-01 | CI runs `tests/run.sh` on every PR. Red path proven locally: a deliberately broken `app.js` exits the runner non-zero. The green path shows on this PR's own checks. |
| `008` | 2026-08-01 | Removal persistence now asserted across reload, theme change, and a fresh browser context carrying only stored state — the closest a test gets to quitting Safari. |
| `009` | 2026-08-01 | Already covered when the suites moved in: polish.js empties the collection, recovers via the Menu empty state's undo, and counts 48 back. No new code — verified, ticked. |
| `010` | 2026-08-01 | **The ceiling: 12 photos.** A noisy 1200px/0.72 JPEG data URL is ~425 KB; Chromium's localStorage quota threw at #13 (~5 MB stored). 48 photos cannot fit — `062` must move photos to IndexedDB. Tool: `tests/measure-quota.js`. |
| `011` | 2026-08-01 | **Found and fixed a real bug:** the quota message was set but never rendered in edit mode — the one place photos get attached. Edit mode now renders notices; test asserts both the message and that nothing was silently stored. |
| `012` | 2026-08-01 | FCP on fast-3G, hermetic (repo bytes only): **720 ms median**; budget 4000 ms, enforced in CI (`tests/perf.js`). With the render-blocking Google Fonts CSS through this sandbox's proxy it was 12.7 s — that cost is `049`'s evidence for self-hosting the font. |
| `013` | 2026-08-01 | `CONTENT.md` created: 34 inferred servings (ids recovered from the pre-handoff file at `9d6ae5c`), 4 empty ingredient lists, 6 mid-sentence truncations, 3 unshown quantities, 2 faithful oddities, and the collection-wide gaps. Phase 8's worklist. |

---

## 11. Waiting on you

*The loop writes here when it hits a 👤 or an unanswered 🤝. Everything below
blocks something. Clearing an item here unblocks the loop.*

| Task | What is needed | Blocks |
| --- | --- | --- |
| — | *(nothing yet — the loop has not started)* | — |

---

## 12. If only three things happen

If this plan is never finished, these three are the ones that mattered:

1. **Phase 8 — the content truth pass.** The app is finished and the data is not.
   34 inferred servings and four empty ingredient lists are the difference
   between a working app and a trustworthy one.
2. **Tasks `004`–`007` — real-device testing.** The one device that matters has
   never run this. The font, the share sheet and the wake lock all behave
   differently there, and all three are load-bearing.
3. **Phase 2 — the session with Joan.** Every accessibility decision so far was
   made from a specification rather than from watching her use it. She is the
   standard, not WCAG. AA is the floor.
