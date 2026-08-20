# Kitchen Table — the 1.0 gameplan

**Status:** `v0.9` · calendar + database shipped 2026-08-02 · **Phase 16, the video importer (Jason's spec), shipped 2026-08-02** — `V01`–`V05` all done; only the video conversion lives on Render, the app stays static · of the original 130: 79 done · 20 struck-as-superseded (`096` joined the list — the Render server *is* the small worker) · 31 open, nearly all needing a person (§11) · **to light the kitchen server up: three env vars in Render + one deploy (`backend/README.md`)**
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
- [x] `014` 🤖 **SEC** — Write down explicitly that contributor names are not authentication, so nobody builds on them later.
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
- [x] `026` 🤝 **PM** — Write the one-page backend decision memo: what breaks today without one, what it would cost per month, who maintains it.
  - *Needs:* `010` `011` `021` `025` · *Done when:* the memo ends in a decision, not options. **This is the gate in §6.**
  - *Ruled 2026-08-01, provisional:* **no server for 1.0** — `DECISIONS.md` §026. Taken as the recommended default on Jason's instruction to proceed; `021`/`025` (the family-friction session) stayed undone and are the one input that would reopen this.
- [x] `027` 🤝 **PM** — Rule on the ten-category list — specifically whether `Sides` and `Drinks` stay, since they were added over the requested eight to avoid mislabelling 11 recipes.
  - *Needs:* `023` · *Done when:* the list is final and `CAT_ALIASES` covers anything dropped.
  - *Ruled 2026-08-01, provisional:* **the ten stay** — nothing dropped, so `CAT_ALIASES` is already complete. `DECISIONS.md` §027; Joan's vocabulary (`023`) can still reopen it.
- [x] `028` 🤝 **TW** — Agree with the family what counts as a category versus a tag, and write the rule down.
  - *Needs:* `027` · *Done when:* the rule is in `README.md` and someone can apply it to a new recipe without asking.
  - *Done 2026-08-01 (family sign-off pending, like every provisional ruling):* the rule is in `README.md` — category = "when would you serve this", one of ten; everything else is a tag, with the Baking edge case called out.
- [x] `029` 🤝 **PM** — Set the bar for what "done" means for a recipe: does it need a photo, verified servings, and at least one tag before it counts as finished?
  - *Needs:* `013` · *Done when:* written. This is the acceptance criterion for all of Phase 8.
  - *Ruled 2026-08-01, provisional:* **true text** — real ingredients and steps, servings confirmed-or-marked-unknown; photos and tags optional. `DECISIONS.md` §029. The 1.0 content blockers are exactly the 4 empty lists + 34 inferred servings.
- [x] `030` 👤 **PM** — Decide whether the menu-planning calendar is 1.0 or a stretch goal, and write down which.
  - *Needs:* `026` · *Done when:* decided. **This gates Phase 15.**
  - *Ruled 2026-08-01, provisional:* **stretch goal** — without a server a plan is one-phone-only, and 1.0 should not wait 11 tasks for it. Phase 15 struck intact. `DECISIONS.md` §030.
- [x] `031` 🤝 **PM** — Define what happens when two family members edit the same recipe, since local-only editing has no merge story at all.
  - *Needs:* `026` · *Done when:* the rule is written, whether or not a server exists to enforce it.
  - *Ruled 2026-08-01:* **last committed file wins, committer must diff first, same-recipe conflicts go to Joan, the losing version is preserved in `CONTENT.md`.** `DECISIONS.md` §031.
- [x] `032` 🤝 **PM** — Agree a cadence for pulling everyone's local edits into the repo — weekly, monthly, or on request.
  - *Needs:* `026` `031` · *Done when:* a named person owns it and a frequency is set.
  - *Ruled 2026-08-01:* **on request + a monthly nudge, owner Jason.** `DECISIONS.md` §032.
- [x] `033` 🤝 **PM** — Arbitrate the first accessibility-versus-feature conflict in writing, so the precedent exists before it is contested under pressure.
  - *Needs:* `024` · *Done when:* a real conflict has been ruled on, not a hypothetical one.
  - *Done 2026-08-01, with a deviation:* `024` remains open, but a real conflict predates it — the handoff's 2–3 column Menu grid versus title legibility, already ruled for legibility. That ruling is now the written precedent: **legibility wins, and denser treatments must survive the top font step + Easy Read.** `DECISIONS.md` §033.
- [x] `034` 🤖 **A11Y** — Write the accessibility acceptance criteria every new feature must meet before merge.
  - *Needs:* `033` · *Done when:* it is a checklist a reviewer can run. **Everything merged after this is held to it.**
  - *Done 2026-08-01:* `design/a11y-criteria.md` — 17 checks a reviewer can run, split into the automated set (cited to the suite that enforces each) and the manual set, with a marked section for what the VoiceOver pass (`035`–`040`) must later add. Written now rather than waiting: an incomplete checklist enforced beats a complete one that doesn't exist.

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
- [x] `041` 🤖 **A11Y** — Audit at 200% browser zoom on top of Easy Read — the compounding case nobody tests.
  - *Needs:* — · *Done when:* no horizontal scroll and no clipped text at any of the five font steps.
- [ ] `042` 👤 **A11Y** — Test with iOS Reduce Motion and Increase Contrast both on.
  - *Needs:* `004` · *Done when:* every animation is off and nothing has lost a border.
- [x] `043` 🤖 **A11Y** — Check colour is never the only signal — the flagged panel and the empty-contributor tile are the two risks.
  - *Needs:* — · *Done when:* both carry a shape or a word as well as a colour. Feeds `058`.
- [x] `044` 🤖 **SEC** — Audit every render path for unescaped interpolation, especially in imported fields.
  - *Needs:* — · *Done when:* every path is either escaped or explicitly justified in a comment.
- [x] `045` 🤖 **SEC** — Import a page containing a script tag and confirm it is inert everywhere it appears.
  - *Needs:* `044` · *Done when:* a test asserts it, in the card, the recipe page and the edit field.
- [x] `046` 🤖 **SEC** — Cap the size of imported fields so a hostile page cannot exhaust storage.
  - *Needs:* `044` · *Done when:* a cap exists, is enforced, and says so when it truncates.

## Phase 5 — Close the third-party surface

*6 tasks. Four CORS relays, a Tesseract CDN and Google Fonts. Each is a party
that sees something, and none is documented for the family. The CSP goes last,
because it can only be written once every legitimate origin is known.*

- [x] `047` 🤖 **SEC** — Confirm the OCR library genuinely runs locally and uploads nothing.
  - *Needs:* — · *Done when:* verified by network trace, not by reading the README of the library.
- [x] `048` 🤖 **SEC** — Pin the Tesseract CDN version and add subresource integrity.
  - *Needs:* `047` · *Done when:* the version is exact and a tampered hash blocks the load.
- [x] `049` 🤖 **SEC** — Review whether Google Fonts should be self-hosted to remove a third party from every page load.
  - *Needs:* `004` · *Done when:* decided and done, or decided and written down why not. **→ README**
  - *Done 2026-08-01:* **self-hosted.** Six woff2 files (52 KB, latin + latin-ext, OFL text included) in `fonts/`, same unicode-ranges as Google served, 400/700 preloaded. Verified: zero third-party requests at load, faces active, FCP 888 ms with the fonts now inside the measurement. `004` (does it render on the physical iPhone) still stands — self-hosting makes that more likely, not less, since the face no longer depends on a third party being reachable.
- [x] `050` 🤖 **SEC** — Document, in the UI, exactly what each relay receives when a link is imported.
  - *Needs:* — · *Done when:* the disclosure names the relays and says what is sent, before the request is made.
- [x] `051` 🤖 **FE-B** — Show which relay succeeded, so a persistent failure can be diagnosed rather than guessed at.
  - *Needs:* `050` · *Done when:* the review screen names the relay that answered.
- [x] `052` 🤖 **SEC** — Add a Content-Security-Policy and confirm it does not break the lazily-loaded OCR library.
  - *Needs:* `047` `048` `049` `050` · *Done when:* the policy is as tight as the known origin list allows, and every path still works.
  - *Done 2026-08-01:* meta CSP in `index.html` — scripts by self + jsdelivr + hash (no `unsafe-inline`), fonts self-only, objects none; `connect-src https:` stays open because link import fetches whatever page the user pastes, by design. First run broke OCR exactly as the task predicted — wasm compilation, fixed with `wasm-unsafe-eval`. Live OCR re-proven under the policy; 7 CSP checks added to sec.js. Bonus: writing the script hash exposed a real bug — the pre-paint theme script compared the raw string while `save()` stores JSON, so it had never fired; fixed and proven with app.js blocked.

## Phase 6 — Design the screens that were never designed

*9 tasks. Add, Import, the Text-size sheet, Easy Read and the category icons were
composed from the existing vocabulary by an engineer. They hold together and
they pass contrast, but nobody with a designer's eye has reviewed them.*

- [x] `053` 🤖 **UI** — Audit the Add and Import screens against `styleguide.html` and mark every value that was improvised.
  - *Needs:* — · *Done when:* a list exists of every size, space and radius that is not in the styleguide.
- [x] `054` 🤝 **UI** — Extend `tokens.css` with any genuinely missing values rather than letting engineers invent them — a print palette is the known gap.
  - *Needs:* `007` `053` · *Done when:* the `@media print` block's literal black, white and grey are tokens, and the file's hex count outside it is still zero. **Any new value is asked for, never invented.**
  - *Done 2026-08-01:* `--print-ink/-paper/-line` appended to `tokens.css` in a marked block — its first amendment since the handoff, recorded in `CLAUDE.md`. `style.css` now carries zero hex anywhere. No other missing values surfaced: `053`'s improvised list was spacing/size, not colour. (`007`, printing on paper, still stands as the physical check.)
- [x] `055` 🤝 **UI** — Specify focus-visible styling as a designed state, not a browser default.
  - *Needs:* `035`–`043` · *Done when:* it is drawn, and it clears AA against every surface it lands on.
  - *Done 2026-08-01:* one designed ring — 3px accent, offset 2, rounded — measured at 10.5:1 (dark) / 8.7:1 (light) against the page it sits over; accent-filled controls gain a 2px page-coloured gap so ring never touches same-coloured fill. First cut flipped the ring to ink on filled controls; measurement showed 1.6:1 and killed it — the gap, not a colour change, is what works. (`035`–`040` VoiceOver halves still open; the visual spec no longer waits on them.)
- [x] `056` 🤖 **UI** — Redraw any of the ten category icons that do not read at 24px — the Sides bowl and Baking whisk are the weakest.
  - *Needs:* `040` · *Done when:* all ten are identifiable at 20px on a phone.
  - *Done 2026-08-01:* three redrawn, not two — rendering the full set at 20px caught **Breakfast reading as an eye**, worse than either named suspect. Now: egg in a pan (yolk off-centre), footed bowl with peas, scored loaf on a board. All ten verified by rendered strip at 20px and 44px. (`040`'s VoiceOver half — icons silent to AT — still open; the `aria-hidden` attributes are asserted in kt.js.)
- [x] `057` 🤖 **UI** — Specify the photo aspect ratio and crop behaviour for hero and thumbnail, including portrait photos from a phone.
  - *Needs:* — · *Done when:* a portrait photo, a landscape photo and a square photo all look deliberate in both slots.
- [x] `058` 🤝 **UI** — Design the empty-contributor tile properly; the current outlined treatment was an engineering judgement call.
  - *Needs:* `043` · *Done when:* it reads as an invitation rather than a zero, without colour being the only signal.
  - *Done 2026-08-01:* the zero is gone. Empty tiles are dashed (the empty-slot mark), carry an accent plus and "None yet — add the first", and still route to that person's filtered Menu whose empty state offers Add. Three non-colour signals: dash, glyph, words. Verified by screenshot, zoom suite, contrast audit.
- [x] `059` 🤝 **UI** — Review Easy Read against the design intent — it currently removes the dim tier, which was an engineering decision about contrast.
  - *Needs:* `017` `041` · *Done when:* the mode is either endorsed as-is or redrawn, in writing.
  - *Done 2026-08-01:* **endorsed as built**, in writing — `DECISIONS.md` §059, on the audit evidence (0 AA failures across 48 combinations, zoom suite green). Reopens if Joan's sessions (`017`/`020`) contradict it.
- [x] `060` 🤖 **UI** — Define the tag chip at every size and on every surface it appears on: card, recipe page, and filter sheet.
  - *Needs:* `028` · *Done when:* one spec covers all three, including a chip with a long tag in it.
  - *Done 2026-08-01:* one rule — a chip is always one line; rows wrap, chips never fold. Card chips cap at 22ch and ellipsize; recipe-page chips (44px tap targets) run the full line before truncating; sheet chips ellipsize in a label span (flex containers can't truncate bare text nodes — found the hard way). Spec prose lands in `design/components.md` with `061`. Verified with a marathon tag at 390px on all three surfaces.
- [x] `061` 🤖 **UI** — Produce a one-page component reference so the next person to add a screen has something to build from.
  - *Needs:* `053`–`060` · *Done when:* it is in the repo and linked from the README. **→ README**
  - *Done 2026-08-01:* `design/components.md` — type, surfaces, controls, the chip and focus specs, icons/artwork, motion inventory, photos, print. Linked from the README beside the a11y criteria. Deliberately one page: a vocabulary, not a framework.

---

# ACT III — Make the content true

*28 tasks. The app is finished and the content is not: servings inferred on 34
of 48 recipes, no photos, no tags, four recipes with no ingredients at all. This
act builds the instruments first, then does the work, then makes it findable.*

## Phase 7 — Photos and tags: the machinery

*10 tasks. Built to the Phase 6 design, so the content pass in Phase 8 has
somewhere to put things. Tagging 48 recipes one at a time will not happen, so
bulk tagging exists before anyone is asked to tag.*

- [x] `062` 🤖 **FE-A** — Move photo storage to IndexedDB if the ceiling from `010` proves too low for the collection.
  - *Needs:* `010` `011` · *Done when:* 48 photos fit, or it is written down why the current store is enough.
- [x] `063` 🤖 **FE-A** — Add lazy loading and explicit dimensions to thumbnails so the list does not reflow as photos decode.
  - *Needs:* `012` `057` · *Done when:* cumulative layout shift is zero with a full list of photos.
- [x] `064` 🤖 **FE-A** — Handle a recipe whose photo has been committed but whose local copy is gone, without flashing a broken state.
  - *Needs:* `062` · *Done when:* the fallback to the category icon is silent.
- [x] `065` 🤖 **FE-A** — Add a photo lightbox on the recipe page, since a hero at 280px is not enough to read a handwritten card.
  - *Needs:* `057` · *Done when:* it opens, traps focus, closes on Escape and returns focus — same contract as every other sheet.
- [x] `066` 🤖 **FE-B** — Support importing several photos into one recipe, since a long recipe spans two cards.
  - *Needs:* `062` `057` · *Done when:* two cards produce one recipe with both pages retained.
- [x] `067` 🤖 **FE-B** — Add tag autocomplete drawing on tags already in use, to stop near-duplicates being created.
  - *Needs:* `060` `028` · *Done when:* typing "ital" offers "Italian" before it offers to create "italian". **→ README**
  - *Done 2026-08-01:* suggestion chips under both tag fields (Edit + Add), built from tags in use, canonical casing, prefix-first, already-listed excluded, capped at five. DOM-patched on input so the caret is never stolen by a render. Five checks in add.js (now 63).
- [x] `068` 🤖 **FE-B** — Add bulk tagging from the Menu.
  - *Needs:* `067` · *Done when:* ten recipes can be tagged in one pass. **→ README**
  - *Done 2026-08-01:* a "Tag" mode beside "Remove" — tap recipes, the pill counts them, one sheet applies the list to all. Typed tags canonicalize against existing casings (067's rule, enforced on the bulk path too), unions never double. Proven at exactly ten in feat.js (now 52).
- [x] `069` 🤖 **FE-B** — Build tag rename and merge, and make it update every recipe that uses the old name.
  - *Needs:* `067` · *Done when:* merging "italian" into "Italian" leaves no recipe pointing at the old one. **→ README**
  - *Done 2026-08-01:* "Rename or merge" beside the filter sheet's tag group — tap a tag, type the new name; a name that already exists (any casing) merges after a confirm, deduping per recipe and following any active filter. The exact done-when case is the feat.js fixture (now 54).
- [x] `070` 🤖 **FE-B** — Detect a likely duplicate on save by comparing title and ingredients against the collection.
  - *Needs:* — · *Done when:* it warns and offers a comparison, and never blocks the save.
- [x] `071` 🤖 **FE-A** — Revisit the four recipes with no ingredient list and design a better in-page prompt to fix them.
  - *Needs:* `029` · *Done when:* the prompt says what is missing and opens the right field, in Viewer mode as well as Edit.
  - *Done 2026-08-01, one deliberate narrowing:* Viewer shows a flag panel that names the gap and points at the Edit switch **in prose, not a button** — "Viewer shows no edit affordances" outranks the task's literal wording. Toggling Edit on such a recipe opens with one empty ingredient line and the caret already in it. Verified on `chops`.

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
- [x] `075` 🤝 **TW** — Maintain a duplicates list and decide which version wins when two people have the same recipe.
  - *Needs:* `070` · *Done when:* the list exists and each entry has a winner named.
  - *Done 2026-08-01:* pairwise scan of all 48 in `CONTENT.md` — one candidate (`scone-in-ninja` × `scones`), verdict **both stay**: air-fryer/metric vs oven/cups are two real preparations, not a duplicate. Standing rule written for future pairs; the in-app save-time warning (`070`) is the intake.
- [x] `076` 👤 **TW** — Seed the first nationality tags by asking where each dish came from, rather than inferring it.
  - *Needs:* `067` `068` `028` · *Done when:* every tag traces to something someone said.
  - *Done 2026-08-02, basis amended by Jason ("research where they come from to tag it properly"): 38 tags across 37 recipes, each traceable to an established culinary fact or a method the title states; the eleven genuinely-ambiguous recipes stay untagged for Joan. Research record + the two Needs-Jason items in CONTENT.md.*
- [ ] `077` 👤 **TW** — Collect at least one photo per course so the Main hero is not empty for every category.
  - *Needs:* `062` `063` `057` · *Done when:* all ten categories have at least one, committed to `images/`.
- [ ] `078` 👤 **TW** — Chase Jason, Jennifer, Lindsay and Siobhan for their first recipe each.
  - *Needs:* — · *Done when:* four empty contributor tiles are no longer empty, or a real reason is recorded for each that stays.
- [x] `079` 🤖 **TW** — Write the one-page "how to add a recipe" guide aimed at someone who has never used GitHub.
  - *Needs:* `028` `067` `068` · *Done when:* someone non-technical follows it start to finish without asking a question. **→ README**
  - *Done 2026-08-01:* `ADDING.md` — leads with the one mental model that matters ("saves on your phone; publishing is handing the file to Jason"), covers all three paths, the category/tag rule in plain words, mistakes, and the same-recipe-twice case. Linked from the README, whose tags section also gained the 067–069 machinery. The literal done-when (a real non-technical person follows it unaided) rides with the family sessions.
- [x] `080` 🤖 **TW** — Bring `CLAUDE.md`'s build-state section current, and cross-check `README.md` against it.
  - *Needs:* `072`–`079` · *Done when:* every decision taken in Acts I–III appears in one of the two, and neither contradicts the other. **→ README**
  - *Done 2026-08-01 (for everything that exists; re-runs after the content pass lands `072`–`078`):* CLAUDE.md gained "The completion push" — the provisional rulings, what they unlocked, and the honest remainder; the Verified section reads 299 checks; the README gained its live status line and was cross-checked clean against it.

## Phase 9 — Import you can trust

*6 tasks. Import is the only place machine-guessed content enters the collection,
and the one feature that has already failed in production. The pipeline is
verified against a stubbed recogniser; Tesseract has never seen a real photograph
of one of Joan's cards.*

- [ ] `081` 👤 **FE-B** — Run OCR against twenty real photos of Joan's recipe cards and record the error rate honestly.
  - *Needs:* `047` `048` `052` `077` · *Done when:* a percentage is written down, including the ugly one. **Do not round it down.**
- [x] `082` 🤖 **FE-B** — Flag individual fields the parser was unsure about, rather than flagging the whole recipe.
  - *Needs:* `081` · *Done when:* `flagged` names fields, and the recipe page shows the flag beside the field it belongs to.
  - *Done 2026-08-01 (mechanics; `081`'s real-photo error rate still informs the wording later):* parsers emit "Field — …" flags; the recipe page classifies (with a keyword fallback so pre-convention data gains the chips too) and shows a "Double-check" chip beside title/servings/ingredients/steps. The chip is wayfinding, not editing — it scrolls to the full panel, reduced-motion respected. `flagged` stays an array of strings, so no stored data breaks.
- [x] `083` 🤖 **FE-B** — Let a user correct the ingredients-versus-steps split with one control when the parser guessed wrong.
  - *Needs:* `081` · *Done when:* a misplaced line moves between the two lists in one tap.
  - *Done 2026-08-01:* every review line carries a swap button beside its delete — one tap sends the line to the other list, notice confirms, draft persistence keeps it. Verified: an "ingredient" reading "Preheat the oven" lands at the end of the instructions in one tap.
- [x] `084` 🤖 **FE-B** — Preserve a half-finished import across an accidental refresh instead of losing the work.
  - *Needs:* — · *Done when:* a refresh mid-review returns to the same draft, and the draft is still never saved until Save is pressed.
- [x] `085` 🤝 **QA** — Feed the OCR path a deliberately terrible photo and confirm it flags rather than invents.
  - *Needs:* `081` `082` · *Done when:* an unreadable photo produces flags and empty fields, never plausible-looking fiction.
  - *Done 2026-08-01:* `KT_OCR_NOISE=1 node tests/ocr-live.js` feeds pure random noise through the real Tesseract. Result: 3 flags, zero lines with plausible quantities, zero plausible steps — what garbage produces is visibly garbage plus a flag, never fiction. The gate asserts it (exit non-zero on invented content).
- [x] `086` 🤖 **QA** — Run the import with all four relays blocked and confirm the paste box still completes a save.
  - *Needs:* `051` · *Done when:* asserted by a test, with the network fully blocked.

## Phase 10 — Search and scale

*3 tasks. Deferred to the end of Act III on purpose: tuning search before the
tags exist is tuning it against the wrong data.*

- [x] `087` 🤖 **FE-A** — Add diacritic and simple typo tolerance to search, so "creme" finds "crème".
  - *Needs:* `076` · *Done when:* a set of real misspellings from `016` all resolve. **→ README**
  - *Done 2026-08-01 (mechanics; `016`'s real misspellings validate it later):* NFD fold plus one-edit tolerance on words of 5+ letters, exact-first so precision degrades gracefully. creme→crème, jamaican→Jamaïcan, chiken→chicken, garbage still finds nothing — all in feat.js (58).
- [x] `088` 🤖 **FE-A** — Show which field matched a search hit, so a tag match does not look like a mistake.
  - *Needs:* `087` · *Done when:* a hit on an ingredient says so on the card. **→ README**
  - *Done 2026-08-01:* cards say "matches ingredient" / "matches tag" when the hit isn't the visible title — Main results and Menu search both.
- [x] `089` 🤖 **FE-A** — Virtualise the Menu list if it passes roughly 150 recipes.
  - *Needs:* `063` `078` · *Done when:* it is built, or it is written down that the collection is nowhere near the threshold and this is deferred.
  - *Done 2026-08-01, the second branch:* **deferred, in writing** — 48 recipes against the ~150 threshold, CLS 0.0000, FCP at a fifth of budget; virtualising now would tax scroll restoration and screen readers for zero measured gain. The ruling lives as a comment on `menuMatches` where the implementer would look first.

---

# ACT IV — The fork

*41 tasks, all of them downstream of task `026`. **If `026` says no server,
strike Phases 11–14 (30 tasks) with that as the reason and skip to Phase 15** —
or straight to the release checklist if `030` also says no.*

> **Read §6 before entering this act.** Building a server nobody decided to run
> is 30 tasks, a monthly bill, and a database that becomes the only copy of 48
> irreplaceable recipes.

> ⛔ ~~THE GATE CLOSED THIS ACT — 2026-08-01~~ · **⟲ AND JASON REOPENED IT —
> 2026-08-02.** He supplied a Neon Postgres instance and ruled the calendar
> into 1.0 (`DECISIONS.md` §026/§030). The act runs again, **reshaped**: Neon
> replaces the Express+SQLite+paid-host plan, which supersedes some tasks
> outright and completes others by different means. Per-task notes below say
> which. Executed same-day: schema (`db/schema.sql`), migration of all 48
> recipes (`db/migrate.js`), round-trip export proven clean (`db/export.js`).
> Open: the app↔database wiring (Data API vs worker — Jason's console call)
> and the calendar build (Phase 15, now the active queue).
>
> Task-status key for this act: **[x] done** (possibly by Neon rather than
> the original wording) · **[ ] + *superseded*** — no longer meaningful under
> Neon, struck with that reason · **[ ] open** — still real work.
>
> - `090`–`092` *(host comparison, disk persistence, platform choice)* —
>   **superseded**: Jason chose the platform by handing over the instance;
>   Neon's storage is managed, there is no disk to distrust.
> - `093` `094` `095` — **done 2026-08-02**: `kitchen` schema with tags as a
>   join table, the three indexes, and a `schema_version` ledger.
> - `096` *(OpenAPI before endpoints)* — **open, reshaped**: the contract
>   question is now "Neon Data API with row-level security, or a worker" —
>   blocked on Jason's console decision.
> - `097` *(images in DB or on disk)* — **open**: currently images stay
>   files in the repo; revisit when the app wiring lands.
> - `098`–`101` — **done 2026-08-02**: loud-failing import, the
>   empty-ingredients audit (reports exactly the four), flags preserved,
>   round-trip export proven content-identical.
> - `102` `103` *(backups + tested restore)* — **open, reshaped**: Neon has
>   point-in-time restore, but an untested backup is still not a backup —
>   verify PITR on this plan, and schedule `db/export.js` as the off-host
>   copy (it doubles as one by design).
> - `104`–`112` *(the Express API)* — **superseded as written**; their
>   real content (validation, health, server-side import, rate limits,
>   image sizes, sync/conflicts, static fallback) returns as concrete tasks
>   once the Data-API-vs-worker call is made. `112`'s guarantee already
>   holds: the static build runs from `recipes.json` with the database off.
> - `113`–`119` *(pipeline, staging, uptime, logs, rollback)* — **superseded
>   as written**: Pages deployment is unchanged; what returns after the
>   wiring is a nightly `export.js` sync job and an uptime check, tracked
>   with the wiring task.

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
- [x] `093` 🤖 **DB** — Write the schema with tags as a real join table, not a comma-separated column.
  - *Needs:* `092` `028` · *Done when:* people, recipes, tags and menu_plan exist and the tag join is real.
  - *Done 2026-08-02: `kitchen` schema on Jason's Neon — tags are a real join table.*
- [x] `094` 🤖 **DB** — Index `recipes.category`, `recipes.contributor_id` and `menu_plan.date` from the start.
  - *Needs:* `093` · *Done when:* in the first migration, not a later one.
  - *Done 2026-08-02: category, contributor and plan-date indexes in the first migration.*
- [x] `095` 🤖 **DB** — Add a migration runner that records applied versions.
  - *Needs:* `093` · *Done when:* it exists before the second schema change, not after it.
  - *Done 2026-08-02: `kitchen.schema_version` ledger, written before any second migration exists.*
- [ ] `096` 🤖 **BE** — Write the OpenAPI description before any endpoint, so the frontend can be built against a contract.
  - *Needs:* `093` · *Done when:* every endpoint in Phase 13 is described and nothing is implemented yet.
- [ ] `097` 🤝 **DB** — Decide whether images live in the database or on disk, and write down why.
  - *Needs:* `091` `092` · *Done when:* decided, with the persistence result from `091` cited.

## Phase 12 — Move the data *(gated on `026`)*

*6 tasks. The migration script is also the best audit `recipes.json` will ever
get. This data is genuinely irreplaceable, so the backup is tested before the
API is written, not after.*

- [x] `098` 🤖 **DB** — Build the `recipes.json` import and have it fail loudly on anything malformed.
  - *Needs:* `095` `080` · *Done when:* a deliberately broken file stops the import with a useful message.
  - *Done 2026-08-02: `db/migrate.js` — validates every field, dies loudly, idempotent upserts.*
- [x] `099` 🤖 **DB** — Report, during migration, every recipe with an empty ingredient list.
  - *Needs:* `098` · *Done when:* the report runs. **If Phase 8 did its job this now returns zero — that is the check on `072`.**
  - *Done 2026-08-02: the migration reports exactly the four known empty lists — the 072 worklist, confirmed from a second direction.*
- [x] `100` 🤖 **DB** — Preserve the `flagged` array; it is the record of what the transcription was unsure about.
  - *Needs:* `098` `082` · *Done when:* a round trip loses no flag, including the per-field ones from `082`.
  - *Done 2026-08-02: `flagged` rides through as jsonb; round trip loses nothing.*
- [x] `101` 🤖 **DB** — Add a round-trip export back to `recipes.json` so the project is never locked into the database.
  - *Needs:* `098` `100` · *Done when:* export → import → export is byte-identical.
  - *Done 2026-08-02: `db/export.js` regenerates recipes.json; `--check` proved database and file content-identical.*
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

## Phase 15 — The calendar *(⟲ RULED INTO 1.0 by Jason, 2026-08-02 — the active build queue)*

*11 tasks. The database's `menu_plan` table already exists with per-meal
servings (`125`) and deletion-survival (`127`) designed in; the build starts
at `120` (slot decision) and `121` (drawings before code), per the phase's
own design-first rule.*

- [x] `120` 🤝 **FE-C** — Decide and document the meal slots — breakfast, lunch, dinner, or dinner only.
  - *Needs:* `030` · *Done when:* decided from how the family actually plans, not from what a calendar usually has.
  - *Done 2026-08-02: dinner-first, all three slots live, Monday start — DECISIONS.md 120.*
- [x] `121` 🤝 **UI** — Draw the calendar week view at 390px, 768px and 1180px before anyone builds it.
  - *Needs:* `120` `061` · *Done when:* all three widths are drawn and none needs a new token.
  - *Done 2026-08-02: design/calendar.md — anatomy, the three widths (one column everywhere), interactions, print, data shape. Drawn before built.*
- [x] `122` 🤖 **FE-C** — Prototype the week grid at 390px and confirm it survives Easy Read without horizontal scrolling.
  - *Needs:* `121` `041` `059` · *Done when:* seven days fit at the largest font step with no horizontal scroll. **If it cannot, `121` is wrong and goes back.**
  - *Done 2026-08-02: seven days at 390px, zero horizontal scroll, held under Easy Read at the 40px step — asserted in tests/plan.js and the zoom suite.*
- [x] `123` 🤖 **FE-C** — Build tap-to-assign with a recipe picker reusing the existing search.
  - *Needs:* `122` `087` · *Done when:* assigning is a tap. **Never drag — it is hostile on a phone and unusable with a tremor or low vision.**
  - *Done 2026-08-02: tap an empty slot, search (the 087 fold/typo search), tap a recipe — assigned. Never drag.*
- [x] `124` 🤖 **FE-C** — Show an assigned recipe as a card carrying its category icon and photo thumbnail.
  - *Needs:* `123` `056` `063` · *Done when:* it reads at a glance at the largest font step.
  - *Done 2026-08-02: assigned meals are the Menu card grammar — 64px icon/thumb, title, slot · servings.*
- [x] `125` 🤖 **FE-C** — Let a planned meal record its own servings, independent of the recipe's default.
  - *Needs:* `123` `074` · *Done when:* Tuesday for four and Sunday for twelve are the same recipe with different amounts.
  - *Done 2026-08-02: each planned meal carries its own servings via the meal sheet stepper; the recipe default never moves.*
- [x] `126` 🤖 **FE-C** — Handle the same recipe planned twice in one week without treating it as an error.
  - *Needs:* `125` · *Done when:* both entries exist independently and can be scaled differently.
  - *Done 2026-08-02: the same recipe twice in a week is two independent entries — asserted.*
- [x] `127` 🤖 **FE-C** — Define what a meal plan means when the recipe it points at is later removed.
  - *Needs:* `126` `031` · *Done when:* the slot degrades to the recipe's name rather than vanishing or crashing.
  - *Done 2026-08-02: a removed recipe leaves its planned-under name, marked "No longer in the book", removable, never a crash.*
- [x] `128` 🤖 **FE-C** — Add week-to-week navigation with the View Transitions API, degrading cleanly where unsupported.
  - *Needs:* `122` `042` · *Done when:* it works without the API, and is off entirely under Reduce Motion.
  - *Done 2026-08-02: week nav via View Transitions where supported, plain repaint where not, nothing under reduced motion.*
- [x] `129` 🤖 **FE-C** — Add a print view of the week for the fridge door — likely the most-used output.
  - *Needs:* `124` `054` `007` · *Done when:* one page, black on white, legible across a kitchen. **→ README**
  - *Done 2026-08-02: print strips the controls and keeps the meals — black on white via the print tokens, empty slots omitted. → README done.*
- [x] `130` 🤖 **FE-C** — Prototype ingredient summing and find out how badly units break it before promising the feature.
  - *Needs:* `125` `076` · *Done when:* the failure modes are written down. **This is a spike. Shipping it is a separate decision, not part of 1.0.**
  - *Done 2026-08-02: the summing spike shipped as a labelled preview; failure modes recorded in DECISIONS.md 130. Promoting it past preview is a separate decision, as the task warned.*

## Phase 16 — The video importer *(addendum arc, 2026-08-02 — from Jason's spec, not the original 130)*

*Jason supplied a written spec (video-import-spec) and the ruling that shapes
it: **only the video conversion lives on Render — the app stays static and
instant.** Five tasks, adapted to this repo per the Stage-0 report: `KT_DB`
not `DATABASE_URL`, `kitchen.contributors` not `people`, the existing review
screen as the landing point, vanilla node http instead of Express (four
routes), a contributor NAME on the job row (names are labels, never keys).
Side effect worth naming: the accept endpoint is the first live app→database
write — the "small worker" `096` was waiting for now exists.*

- [x] `V01` 🤖 **DB** — `kitchen.import_jobs` as schema v2: the six-state walk, ETA inputs, the draft in `result_json`, plain-language `error_message`.
  - *Done 2026-08-02: applied live to Neon; ledger reads 1, 2. The re-run also synced the 38 research-tag links.*
- [x] `V02` 🤖 **BE** — The import server: four routes + health, concurrency-1 queue, yt-dlp/ffmpeg as fetched static builds, cheap paths first (description → captions → media), Groq Whisper, one extraction call to the Anthropic API (structured output, flag-don't-guess), 30-minute cap, media deleted on every exit, restart recovery per the spec's wording.
  - *Done 2026-08-02: `backend/` + the repo-root package.json that makes Render's existing `yarn` / `yarn start` service work unchanged. Booted against live Neon.*
- [x] `V03` 🤖 **FE** — The fourth Add path: progress card (three human stages, ETA that says "taking a bit longer" at 2× rather than freezing), the close-this-page promise, the waking state, the Ready-to-check-over list, review handoff, accept-on-save.
  - *Done 2026-08-02: disclosure names Render, Groq and Anthropic before anything is sent (050 discipline); the local save never waits on the server.*
- [x] `V04` 🤖 **FE** — `manifest.json` with `share_target` so Android shares land in the importer and submit themselves; icons from the existing mark; the two-minute iPhone Shortcut recipe in `ADDING.md`.
  - *Done 2026-08-02: boot consumes the shared query once, strips the address bar, routes video links to the kitchen and other links to the link importer.*
- [x] `V05` 🤖 **QA** — Both suites: the server's logic with tools faked and no network (75), the browser flow with the kitchen stubbed (36); every hermetic suite that visits `#add` aborts the Render origin so CI never pokes the real server.
  - *Done 2026-08-02: full battery 450 functional checks, 0 failures; the video form is in the contrast matrix, AA clean.*

*Still needed to light it up, and only Jason can: the three env vars in
Render's dashboard, then a deploy — `backend/README.md` is the two-minute
checklist. The spec's live checklist (real YouTube/Instagram videos, the
cold-start path, a restart mid-job) runs after that, since it needs the
real server.*

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
| `014` | 2026-08-01 | `CLAUDE.md` now states it: the contributor field is a byline, never authentication — no per-person permissions may ever hang off it. Real access control = the backend gate, not this string. |
| *Phase 1* | 2026-08-01 | **Closed.** 10 of 14 done; `004`–`007` parked on a physical iPhone (§11). 214 functional checks + perf budget green, contrast 0 failures, README gained the Checks section and the new files. One real bug found and fixed (invisible quota notice). |
| *Phase 2* | 2026-08-01 | **Closed, fully parked.** All ten tasks are watching Joan and one other family member use the app — §11 says exactly what is needed. Nothing an agent can substitute for. |
| *Phase 3* | 2026-08-01 | **Closed, fully parked.** Nine rulings for Jason (§11), led by `026`, the gate — its measured inputs are ready in this log. `034` waits on the VoiceOver findings it should cite. |
| `041` | 2026-08-01 | **Found three reflow failures** at 320px (200% zoom) + Easy Read + top step: the servings card and body columns stretched past the viewport (grid `min-width:auto`), and "Instructions"/"Worcestershire"-length words could not break. Fixed: grid guards, servcard wraps, headings and checklist text hyphenate at the extreme. `tests/zoom.js` now holds all nine screens to it, in CI. |
| `043` | 2026-08-01 | The two named risks pass (flagged panel has its heading; empty tile says "0"). The audit found a third: **selected filter chips signalled by colour alone** — they now carry a check glyph, matching the sort menu. Asserted in polish.js. |
| `044` | 2026-08-01 | Static scan of all 51 bare interpolations: every user/imported string goes through `esc()`; the bare ones are numbers, booleans, internal constants, or icon markup. The rule is now documented at `esc()` itself. |
| `045` | 2026-08-01 | `tests/sec.js`: a page whose title/ingredient/step are live XSS payloads imports as inert text on the review form, recipe page, menu card, and edit field — nothing executes anywhere. |
| `046` | 2026-08-01 | `capDraft()` bounds every imported field (title 300, lines 500/2000, lists 100/60, notes 5000) on both the JSON-LD and text/OCR paths, and discloses each trim in `flagged`. Asserted with a 60 KB hostile page. |
| `047` | 2026-08-01 | **Real Tesseract ran for the first time** (the CDN block noted in CLAUDE.md's known limits no longer holds; bridged through the sandbox proxy). Trace: 4 requests, all bodyless GETs to cdn.jsdelivr.net — the photo never leaves the device. Read a synthetic card's title correctly. Tool: `tests/ocr-live.js`. |
| `048` | 2026-08-01 | Pinned to `tesseract.js@5.1.1` with sha384 SRI on the entry script. Both directions proven: clean bytes load and OCR completes; tampered bytes are refused and the app shows its plain fallback message. SRI reaches the entry script only — noted in code. |
| `050` | 2026-08-01 | The link-import disclosure now names every relay by name, drawn from the live `RELAYS` list so text and code can't drift, and says exactly what is sent (the pasted address, nothing else) before any request is made. |
| `051` | 2026-08-01 | Every imported draft's flagged entry now says which route answered — "fetched directly from the site" or "fetched through allorigins.win" — so a persistent failure is diagnosable. Asserted in add.js. |
| *Phase 5* | 2026-08-01 | **Closed.** 4 of 6 done; `049` and `052` parked on the iPhone font check (§11). CLAUDE.md's known-limits brought current — the "sandbox cannot reach the Tesseract CDN" limit no longer holds. |
| `053` | 2026-08-01 | `design/improvised-values.md`: every Add/edit value sorted into complies / deliberate-scaling-deviation / improvised-awaiting-designer. One compliance miss fixed on the spot — `.outlinebtn` 58→60, the styleguide's secondary-button height. |
| `057` | 2026-08-01 | `design/photo-treatment.md`: one deliberate box per slot, centre-crop only, reserved before decode. Recipe hero now declares 3:2 (was content-height). Verified: portrait, landscape and square all land at identical 358×239 hero / 64×64 thumb. |
| *Phase 4* | 2026-08-01 | **Closed.** 5 of 12 done (`041` `043`–`046`); `035`–`040` + `042` parked on VoiceOver/iOS (§11). Close-gate contrast audit green. |
| *Phase 6* | 2026-08-01 | **Closed.** 2 of 9 done; the rest are designer rulings (`054` `055` `058` `059` `060`), a redraw gated on the VoiceOver check (`056`), and the reference that needs all of them (`061`). §11 holds each. |
| `062` | 2026-08-01 | Photos live in IndexedDB: sync reads from a boot-filled cache, writes persist behind it and un-cache on failure, legacy `kt.images` migrates at boot, and a browser with no IndexedDB falls back to localStorage — where the quota message still fires (proven in feat.js). All 48 photos stored and read back (`measure-quota.js`). |
| `063` | 2026-08-01 | Thumbs carry `width/height/loading=lazy/decoding=async`; hero reserved by `aspect-ratio` (057). Measured with all 48 recipes photographed and a full scroll: **CLS 0.0000**, gated at 0.02 in CI (`tests/perf.js`). |
| `064` | 2026-08-01 | A referenced-but-absent `images/<id>.jpg` never shows a broken glyph: capture-phase error handler swaps thumbs to their category icon, drops heroes, restores the Main blank. Asserted in feat.js. |
| `065` | 2026-08-01 | The hero taps open the whole photograph — the writing a 3:2 crop loses is the point. Full dialog contract (trap, Escape, focus return) by joining the sheets' machinery; native pinch-zoom preserved on the image. |
| `066` | 2026-08-01 | Photos accumulate on the Add path; all are OCR'd in sequence into one draft, and the cards are kept as the recipe's pages — page 1 is the hero, later cards render whole, Download photos writes `<id>-2.jpg`, and the flag says the join may sit mid-list. |
| `070` | 2026-08-01 | Saving something that looks like an existing recipe warns once — names it, links to it — and "Save anyway" is one tap. Detector is deliberately conservative: exact normalized title, or ≥50% title-word + ≥40% ingredient-line overlap. |
| `084` | 2026-08-01 | A half-finished import survives a refresh: the draft snapshots to sessionStorage (debounced off typing, since typing deliberately doesn't render) and restores on arrival at Add. Save and picking a new path discard; navigation never does. Still nothing saved until Save. |
| `086` | 2026-08-01 | With every relay dead the paste box carries a recipe from text to saved page, no network at all — asserted end to end in add.js. |
| *Phase 7* | 2026-08-01 | **Closed.** 6 of 10 done. `067`–`069` (tag machinery) wait on the `028` category-vs-tag ruling + `060` chip spec; `071` waits on the `029` done-bar. |
| *Phase 9* | 2026-08-01 | **Closed.** 2 of 6 done. `081`–`083` + `085` need twenty real photos of Joan's cards — the pipeline is proven live (`047`), the accuracy number is not. |
| *Phase 10* | 2026-08-01 | **Closed, fully parked.** Search tuning (`087`–`089`) against tags that don't exist yet would be tuning against the wrong data — exactly what the phase note predicted. |
| — | 2026-08-01 | **The loop has consumed every task an agent can do alone in Acts I–III: 29 of 130.** Everything remaining is in §11. Act IV stays shut behind `026`. |
| `026` | 2026-08-01 | **The gate is ruled: no server for 1.0** (provisional default on Jason's proceed-to-completion instruction; he skipped the direct question, so the recommended option stands). Memo in `DECISIONS.md`. Phases 11–14 struck — 30 tasks. Reopens on one sentence from him, or on `025` showing download-and-commit kills adoption. |
| `027` | 2026-08-01 | Ten categories final (provisional): nothing mislabelled, aliases already complete. |
| `029` | 2026-08-01 | Done-bar = true text: 4 empty ingredient lists + 34 inferred servings are the only 1.0 content blockers. |
| `030` | 2026-08-01 | Calendar = stretch goal; Phase 15 struck intact (11 tasks). |
| `031` | 2026-08-01 | Merge story written: committer diffs, same-recipe conflicts go to Joan, losers preserved in `CONTENT.md`. |
| `032` | 2026-08-01 | Pull cadence: on request + monthly nudge, owner Jason. |
| `033` | 2026-08-01 | Precedent written from the real Menu-grid conflict: legibility beats density; survival at top step + Easy Read is the bar. (`024` still open — deviation noted on the task.) |
| `034` | 2026-08-01 | `design/a11y-criteria.md`: 17 reviewer-runnable checks (5 suite-enforced, 12 manual) + a named VoiceOver gap. Batch note: `027`–`034` landed as one commit — decisions are paper; the reviewable unit is the batch. Rule 7 resumes with code. |
| `028` | 2026-08-01 | Category-vs-tag rule in README: category = "when would you serve this?", one of ten; everything else tags. |
| `049` | 2026-08-01 | Fonts self-hosted: 52 KB of woff2 + OFL in `fonts/`, zero third-party requests at load, FCP 888 ms with the face in the payload. The 12.7 s degraded-network figure is retired. |
| `067` | 2026-08-01 | Tag autocomplete: canonical-cased chips under both fields, DOM-patched so the caret survives. |
| `068` | 2026-08-01 | Bulk Tag mode on the Menu; ten in one pass proven; casing folds into existing tags. |
| `069` | 2026-08-01 | Rename/merge beside the tag filters; italian→Italian is the fixture; filters follow. |
| `071` | 2026-08-01 | Empty-ingredient recipes: flag panel in Viewer (prose pointer, no affordance), Edit opens with the caret in a waiting line. |
| `075` | 2026-08-01 | Duplicates scan: one candidate, both stay (two real scone preparations). Rule + intake recorded in CONTENT.md. |
| `079` | 2026-08-01 | `ADDING.md` written for never-used-GitHub; README's tag section covers the new machinery. |
| `082` | 2026-08-01 | Flags name fields; Double-check chips sit beside title/servings/ingredients/steps and scroll to the panel. |
| `083` | 2026-08-01 | One-tap swap moves a misplaced line between ingredients and steps on review. |
| `085` | 2026-08-01 | Noise photo through real Tesseract: 3 flags, zero plausible fiction; gated in ocr-live. |
| `087`–`089` | 2026-08-01 | Search folds diacritics + one edit, exact-first; cards say "matches ingredient/tag"; virtualisation deferred in writing at 48/150. |
| `080` | 2026-08-01 | CLAUDE.md gained the completion-push section; README status line added; cross-check clean. 299 checks total. Stale-assertion sweep: 5 checks updated to the day's redesigns after verifying each was stale, not regressed. |
| *Phases 7–10* | 2026-08-01 | **Every agent-doable task in Acts I–III is done: 60 of 130, 41 struck, 29 open — all 29 need a person.** Suite: 299 green + perf + zero AA failures. |
| — | 2026-08-02 | **Jason answered everything.** Gate reversed: Neon Postgres in, calendar in 1.0, ten categories settled, done-bar = his words (ingredients + steps + source; all 48 already have sources). Five bug fixes shipped same reply: kitchen-fraction scaling (no decimals ever), OCR bullet-ghost/fuzzy-heading/meta-claiming parser, the light-mode a:hover vanishing-text bug (tokens.css's own rule), the mark became a working logo on the left, Jessica joined. |
| `093`–`095`, `098`–`101` | 2026-08-02 | **The database is real**: `kitchen` schema on Jason's Neon, all 48 migrated, four empty lists reported, flags preserved, round trip proven content-identical. Credential lives in env/Actions secrets only — and should be rotated, since it transited a chat. |
| — | 2026-08-02 | Act IV reshaped: `090`–`092` + `104`–`119` superseded by Neon (their real content returns with the wiring task); `096` is now "Data API vs worker", Jason's console call. Phase 15 is the active queue. |
| `076` | 2026-08-02 | Research tagging (Jason-authorized): 38 traceable tags, 11 recipes left for Joan on purpose. Content scan found zero defensible errors — the 125–145°F "anomalies" are correct doneness temps. One junk source fixed, two questions filed for Jason (empanada spelling; satay origin). |
| `096`~ | 2026-08-02 | Data API enabled by Jason and probed live: the gateway requires a Neon-Auth JWT even for the anonymous role (grants are in place server-side). Bridge shipped meanwhile: nightly db-sync Action regenerates recipes.json from the database (needs the KT_DB repo secret). Remaining for live reads/writes: the Neon Auth publishable key, or Neon adding tokenless anon. |
| `120`–`130` | 2026-08-02 | **The calendar shipped, whole**: dinner-first week, tap-to-assign, per-meal servings, twice-in-a-week, plans outlive their recipes, View-Transitions nav, fridge-door print, and the summing preview with its failure modes on record. tests/plan.js (27 checks) joins the CI gate; zoom and contrast cover the new screen. Suite: 328 functional checks, 0 AA failures. |
| `052` | 2026-08-01 | CSP shipped; OCR broke on wasm exactly as predicted, fixed with `wasm-unsafe-eval`, re-proven live. **Found a real bug:** the pre-paint theme script never matched `save()`'s JSON quoting — light-mode users have had a dark flash since the beginning. Fixed, proven with app.js blocked. sec.js now 23 checks. |
| *Phase 5* | 2026-08-01 | **Closed for real: 6 of 6.** The third-party surface at page load is now zero; jsdelivr remains only when OCR is invoked, pinned + SRI'd, and the relays only when a link is imported, disclosed. |
| `054` | 2026-08-01 | Print palette became tokens — tokens.css's first sanctioned amendment; style.css now zero hex anywhere. |
| `055` | 2026-08-01 | The focus ring, designed and measured: 3px accent + page-gap on fills (10.5/8.7:1). The ink-flip alternative measured 1.6:1 and died. |
| `056` | 2026-08-01 | Three icons redrawn, not two — the render strip caught Breakfast reading as an eye. All ten verified at 20px. |
| `058` | 2026-08-01 | Empty tiles: dashed + plus + "None yet — add the first". Invitation in shape and words. |
| `059` | 2026-08-01 | Easy Read endorsed as built (`DECISIONS.md`), on the audit numbers. |
| `060` | 2026-08-01 | Chip spec: one line always; card 22ch cap, recipe full-line, sheet label-span ellipsis. Flex can't truncate bare text — span added at all three call sites. |
| `061` | 2026-08-01 | `design/components.md` — the one-page vocabulary, linked from the README. |
| *Phase 6* | 2026-08-01 | **Closed for real: 9 of 9.** The screens that were never designed now are; the reference documents all of it. |
| *Phase 3* | 2026-08-01 | **Closed: 9 of 10 done.** `025` stays open as the *check* on the provisional gate ruling. Act IV struck: 41 tasks. |
| `V01` | 2026-08-02 | `kitchen.import_jobs` live as schema v2. A job's whole life is one row; contributor is a name, never a key. |
| `V02` | 2026-08-02 | The import server, Render-shaped: Jason's failed deploy diagnosed (no backend existed; `yarn start` was right all along) — the repo-root package.json makes his existing service work with zero settings changes, just the three env vars. |
| `V03` | 2026-08-02 | The fourth way in: progress card, waking state, waiting list, review handoff, accept-on-save. The phone never waits on the server. |
| `V04` | 2026-08-02 | Android share sheet lands in the importer and submits itself; iPhone gets the two-minute Shortcut recipe in ADDING.md. |
| `V05` | 2026-08-02 | 111 new checks (backend 75 with tools faked, browser 36 with the kitchen stubbed). Full battery 450 green; CI never pokes the real server. |
| `096` | 2026-08-02 | **Struck as superseded**: the Render import server *is* the small worker — it holds `KT_DB` server-side and `accept` is the first live app→database write. The Data-API/browser-key question no longer blocks anything. |
| `031` `032` | 2026-08-02 | Refreshed for the live-write era in DECISIONS.md: video-accept inserts reach the file through the nightly export; id collisions suffix, never overwrite. |
| `V06` | 2026-08-02 | **The first real video found the first real bug**: YouTube robot-checks Render's cloud address and the error mapping mislabelled it "age-restricted". Now: retried automatically as the TV client (which also passes many true age gates), and the message names the robot check for what it is — about the server, never the video. |
| `V07` | 2026-08-02 | Jason's retry showed even the TV client refused — YouTube wants proof-of-origin tokens from datacenter IPs. The build now installs the bgutil PO-token pair (plugin + minting server, one pinned tag); server.js supervises the minter as a sibling process and every yt-dlp call presents tokens. No login, no cookies, no user steps. Verified to the sandbox's edge: plugin loads in the standalone binary, minter answers /ping, and its mint call correctly reaches for YouTube (blocked only by the sandbox proxy — Render has no such wall). |
| `V08` | 2026-08-02 | Live probing with real diagnostics found TWO truths: the fetch path works (an old video sailed through — tokens earning their keep), and a schema bug of mine sat hidden behind the wall — structured outputs reject integer bounds, so every job reaching extraction 400'd. Fixed; the full machine then proved itself in production by correctly REFUSING Rick Astley: "This is a music video… Nothing was imported." Spec checklist item 5, passed live. |
| `V09` ✅ | 2026-08-03 | **Verified live in production.** With Jason's `YT_API_KEY` in place, a robot-blocked YouTube video (Tasty's Peach Cobbler Overnight Oats) came back a complete draft — twelve ingredients with fractions intact, six steps, category Breakfast, cook time, tags — and six honest flags naming exactly what wasn't read. The reproduced failing case (a Babish upload) still fails, and the new diagnostic says why in one line: *"SALVAGE: ok (description 0 chars) — but no recipe is written in it."* The key works; that video simply has no description. Nothing left to guess about: a blocked video with a written recipe imports, a blocked video without one fails honestly and points at the paste box. |
| `V09` | 2026-08-02 | Jason: "Instagram works but YouTube still blocked." Instagram end-to-end = the heavy path (download/audio/frames/Groq) proven live. For YouTube, every keyless datacenter route was probed and found walled — modern videos bot-check through all clients+tokens, watch pages serve hollow LOGIN_REQUIRED shells, relays are refused, Invidious instances 403, RSS descriptions are empty for 13 of 15 entries. The one door built for servers: the official Data API. `YT_API_KEY` (free, 2-min setup) now rescues robot-blocked imports from the video's official description — flagged honestly, since nothing was heard or seen. Backend suite 100. |
| `R1` | 2026-08-17 | The improvement loops begin (Jason: three lanes, ship continuously). Performance: the spec's client-side cache built — a service worker serves shell + recipes.json cache-first with background refresh, document network-first; offline reload proven serving all 48 recipes. Cross-origin stays native so the hermetic suites and disclosures are untouched. CI stops re-downloading Chromium (cached on the Playwright version). |
| `R2` | 2026-08-17 | Security: npm audit zero across the tree; secrets scan clean (no key patterns anywhere); the YT key is scrubbed from public job diagnostics even when an error message echoes it; every API answer carries nosniff/no-referrer/no-store; a per-address limiter (120/min) turns hostile loops into polite 429s while the app's own polling never feels it. |
| `R3` | 2026-08-17 | UI/UX: the review form's Serves field gains the recipe screen's one-tap stepper grammar (56px targets, clamps at 1 and 40, typing still allowed) — imports land with flagged servings, and fixing a number is now taps. Sheets contain their overscroll (no rubber-banding through to the page), recipe titles balance their rag, and the Double-check scroll target lands with breathing room. All from the existing vocabulary; zero new colours; AA clean. |
| `R4` | 2026-08-17 | The rotation's fourth pass, one of each lane: the page preconnects to the kitchen server so the first import interaction skips DNS+TLS; Edit mode gains the same one-tap Serves stepper as the review form (parity — one grammar everywhere servings get corrected); and the progress poll holds one request in flight, ever — a slow answer can no longer stack polls behind it. |
| `R5` | 2026-08-17 | Cleanup, on Jason's ask: brand references neutralised (the UI and docs name Anthropic — the party data actually goes to — instead of a product name; the internal call is `callExtractor` now); `recipe.html` (the pre-hash-routing bookmark stub) and `tests/measure-quota.js` (the one-shot quota probe, superseded by IndexedDB) removed; CLAUDE.md's ground-truth list now points only at files that exist in this repo (`design/*` — the handoff's styleguide/screenshots/dc-references were never committed). GitHub already tidy: two branches, both live. |
| `R6` | 2026-08-17 | The loops made durable: CodeQL reads every PR and a weekly pass of main; Dependabot files small monthly update PRs that the suites gate like any change. The service worker gained a proof-gate (repeat visits must show a worker hop in resource timing, not merely survive offline); waiting drafts say how long they've waited; README's stale rows (recipe.html, the phantom design/ description, the pre-planner status) caught up with reality. |
| `R7` | 2026-08-18 | The new machinery's first harvest, taken by hand after a wobble: the session's container was rolled back to an older clone mid-round, and a force-push from that stale checkout reset the working branch to old history. Nothing merged was lost — `main` held every round through R6 — and the branch (disposable by design) was restored from it. The dependency updates Dependabot had proposed were then applied directly and proven by CI rather than trusted from bot PRs: `@anthropic-ai/sdk` 0.117.1, `actions/checkout` v7, `actions/setup-node` v7, `actions/cache` v6, `github/codeql-action` v4. Lesson recorded: after any container restart, re-fetch and re-verify HEAD before pushing — a lease refresh proves the remote, not the local. |
| `R8` | 2026-08-18 | The video feature's last silent failure closed: an import that died while the phone was away used to vanish without a word — the submission was real, so the failure is now owed a sentence. The Add screen surfaces recent failures with the server's own plain-language reason and when they happened, plus Try again (pre-fills the link rather than resubmitting behind you) and Dismiss (which sticks on that device). The listing endpoint gained exactly one more status and no more: time-bounded, capped, no raw status reaching SQL. Eleven new checks; battery 507. |
| `R9` | 2026-08-18 | Three findings, one round. **The recipes are data, not shell**: the worker served `recipes.json` stale-while-revalidate, so a recipe published an hour ago could arrive a load late — now network-first with the cache as fallback (fresh book, instant shell). **The old offline test proved nothing**: Playwright's offline emulation does not reach fetches made by a service worker, so R1's "offline" checks were passing because the worker quietly reached the live server; the block now serves the app from a throwaway server and *kills* it, so the outage is real — and the app genuinely survives it. **The 44px floor was marginal, not structural**: controls specified at exactly 44px can measure 43.99 after sub-pixel layout, which the planner caught; every one now carries a pixel of headroom. Battery 509. |
| `R10` | 2026-08-18 | Two silent failure modes closed, one honest gap recorded. **The nightly sync was silent about being unwired**: reading its logs showed `KT_DB is not set — Skipping` every night for a fortnight, reported as a green run — so a recipe accepted from a video import would sit in the database and never reach `recipes.json`. It now raises a warning annotation and writes its state to the run summary: "not wired up" no longer looks like "nothing to do". **The precache list was unguarded**: `cache.addAll()` is all-or-nothing, so one missing file kills offline support entirely and silently — a test now asserts every listed path exists, and was mutation-checked (adding a non-existent file makes it fail) rather than trusted. **CodeQL alerts could not be read from the session** (the alerts API refuses this session's credentials); the scans themselves run green on every PR, but "zero alerts" is unverified from here — the Security tab is the place to confirm. Battery 511. |
| `R11` | 2026-08-18 | **A real crash, found by asking what happens when the server lies.** The Add screen trusted the kitchen server's JSON completely: a draft whose `ingredients` arrived as a string passed the truthiness check and then had `.map` called on it — the review screen never rendered, taking the import *and* the way to fix it down together. Proven first (the test failed before the fix, as it should), then closed: every field from a job is coerced into the shape the form expects — lists from strings, servings clamped to a real number, an unknown course falling back, `[object Object]` impossible — and the two waiting lists render server strings through the same guard, with a bad timestamp saying nothing rather than "NaN days ago". Seven new checks; battery 518. The other two workflows were audited for db-sync's silent-skip shape and have none: both fail loudly by construction. |
| `R12` | 2026-08-18 | **The same trust question one layer down, and the book could be bricked.** A single rotten entry in the local overlay — a `null` from a half-finished write, a value edited by hand, a list from an older version — reached `Object.keys(null)` at boot and threw: the app hung on "Loading recipes…" forever, and because "Undo all my changes on this phone" lives *inside* the app, the recovery died with it. A published `recipes.json` that parses but is not a list did the same. Both proven failing first, then closed: non-recipes are dropped rather than rendered, and a file of the wrong shape reaches the same honest error as a file that never arrived. The planner's own overlay was examined under the same lens and needs nothing — `loadPlan` already filters on date and slot. Five new checks; battery 523. |
| `R13` | 2026-08-18 | **The last two trust boundaries, and the sweep closes.** The Add screen's own snapshot (084) was restored straight into the review form — a snapshot written by an older build has fewer fields than today's form expects, which took the screen down *on every arrival* until the tab was closed, since sessionStorage kept handing back the same poison. Proven failing, then fixed by consolidating R11's coercion into one `normalizeDraft` both paths share: whatever the snapshot carried is kept, whatever it lacked comes back as an empty field. The **photo store needed nothing** — junk values already degrade through the broken-image handler to the category icon, and that is now asserted rather than assumed (three checks). With the kitchen server (`R11`), the published file and overlay (`R12`), and these two closed, every boundary where this app trusts data it did not just create is now guarded and tested. Seven new checks; battery 530. |
| `R13b` | 2026-08-18 | R13's own CI run was cancelled at the 30-minute cap without executing a single test: the job had hung in `playwright install-deps`, which the terminated-orphan line in the log named outright. That step is now bounded to eight minutes with `continue-on-error` — a stalled apt mirror costs a step, not a run, and libraries that are genuinely missing fail loudly at browser launch instead of hanging in silence. Worth recording for the next session: the first diagnosis of this was **wrong**, and wrong in an instructive way. The container had rolled back to an older checkout, so `ci.yml` on disk was the pre-`R1` version — from which it looked as though R1's browser cache had never shipped. It had; `origin` had it all along. Verify against the remote before believing a local tree, especially after a rollback. |
| `R14` | 2026-08-19 | **A How-To screen, inside the app** (Jason's ask). Six sections in the order someone actually meets them — finding a recipe, making the writing bigger, cooking from one, planning the week, adding one (all four ways), changing one — written for the person holding the phone rather than for whoever built it. It lives at `#help`, reached from a link in the front page's one-line explanation, because a help page on a website somewhere is no use to someone standing at the hob: this one inherits the typeface, the A−/A+ stepper and Easy Read like every other screen. No new colours, no new patterns. Nine checks in `quick`, and the screen joined the contrast matrix — AA clean in all four theme × Easy-Read combinations. Battery 539. |
| `R15` | 2026-08-19 | Jason reopened the loops for improvement, security and interaction. Three real findings. **Servings could only be stepped**: going from 4 to 40 was thirty-six taps — not a stepper, a punishment. The number itself is now a control: tap it, type it, Enter or looking away commits it, absurd values clamp, and the ± buttons stay for small nudges. **The keyboard's Go key did nothing.** On a phone, searching and pressing the blue key is the obvious way to say "that one"; it was a dead end, and the reader had to dismiss the keyboard and aim at a card. Enter now opens the top match from either search box. **The server was describing its own insides in public**: a failed job's `debug` field carried yt-dlp's mention of plugin directories, temp paths and the local token service, readable by anyone who can reach the API. Paths keep only their last segment and the local service is unnamed; the public help links — the useful part — survive untouched. Thirteen new checks; battery 552. |
| `R16` | 2026-08-20 | **CI caught what the tap-target sweep should have.** R15's servings button measured 43.99997px on the runner's font metrics — under the 44px floor by a third of a pixel — and the same rule's `font: inherit` had quietly out-specified `.servcard__value`, stripping the number's size and weight so it read like body text. Both fixed at the rule. The sweep itself was the deeper fault: **"nothing interactive under 44px" only ever visited the Menu.** It now walks Main, Menu, Recipe, Add, Week planner and How-to — and immediately found a second one, the front page's "How to use it" link at 21px tall. An inline link in a sentence can't be a 44px box without wrecking the line, so it got vertical padding, which grows the hit area without touching the line box. One new check (the emphasis guard) and one widened from a single screen to six; the search test's fixed 300ms pause became a wait for the rendered match. Battery 553. |
| `R17` | 2026-08-20 | **The one thing in this app with no ceiling was the bill.** Every limit on the import server bounds a burst — 120 requests a minute per address, eight jobs queued at once — and not one of them bounds a total. A patient stranger submitting one link every thirty seconds stays under all of them while spending Jason's Anthropic and Groq keys for as long as they care to. A day of importing is now capped at 40 (`KT_DAY_CAP`), counted **in the database**, because this service spins down after fifteen idle minutes and an in-memory tally would forgive anyone willing to wait it out. Past the cap the answer names the two ways in that never touch the server — typing it in, and from a photo — so nobody hits a dead end, and it blames nobody. It fails **open**: a count the server can't read lets the import through, because this wall is for a stranger's spending, not for the server's own confusion. Eleven new checks; battery 564. |
| `R18` | 2026-08-20 | **The Menu's filters lived nowhere the address could see.** Filter to Sides and Desserts, sort A–Z, then reload — everything back to 48, most-recent-first, with no way to say what you were looking at. The app already knew this mattered: *clearing* a filter dropped it from the address, so the URL was only ever honest in one direction. Now both. Applying a filter or a sort writes the canonical `#menu?cat=Sides&cat=Desserts&sort=az` back, repeated keys for multi-select (the parser previously kept only the last value of each, so a shared address described a list the Menu was never showing), and the default sort left out — an address should carry what you chose, not what you were given. Written with **replaceState**, deliberately: filtering is a lens on one screen, not navigation, and pushing would turn twenty chip taps into twenty presses of Back before you could leave. Nine new checks, one of them the history-depth guard. Battery 573. |
| `R19` | 2026-08-20 | **A weak signal behaved exactly like an outage.** `R9` made `recipes.json` network-first so a recipe published an hour ago arrives on the next open — correct, but it put no clock on the request. On one bar in a kitchen, the book waited for the browser's own timeout, tens of seconds, with a complete copy sitting in the worker's cache the whole time; the app looked broken while holding everything it needed. The network now gets 2 seconds, then the cached book is served — and the late answer is still stored, which is what keeps the *next* open current. A first visit has nothing cached and simply waits, as it must. Proven the honest way: the throwaway server in `polish` now delays only the book, and the checks measure that the app paints in under 4.5s where it used to take 6.4, that what it paints is the cached copy, and that the late answer still lands. Three new checks; battery 576. |
| `R20` | 2026-08-20 | **Forty to sixty pixels of every phone screen were clearing a status bar that wasn't there.** The design reference pads the top of all three screens on narrow widths — `statusPad`, a flat 60 on Main and 54 on the Menu and Recipe headers — which is right for a Home Screen install, where the page really does run under the status bar. In a browser tab, which is how everyone actually opens this, the browser's own chrome is already there and the pad is dead space, charged at the top of every screen and, on the sticky headers, at every scroll position. All three now read the device's own measurement: `calc(base + env(safe-area-inset-top))`, the same technique the sheets and the lightbox already used. In a tab the inset is 0 and the space comes back; installed on a notched phone the inset supplies the exact number, which the constant was only ever guessing at. The Menu's sticky header drops 208px → 168px — a quarter of an iPhone viewport to a fifth, and 41% → 33% at 320×512, which is what 200% zoom looks like. Four new checks; battery 580. |
| `R21` | 2026-08-20 | **A real injection, and the test that nearly missed it.** The security suite proved the import path inert on titles, ingredients and steps; it had never touched tags, contributor, notes, the times, the flags or the id, and had never opened the Week planner at all. Extending it found the planner's `servings` reaching the page **unescaped** in two places — the meal card and the meal sheet — so a rotten `kt.plan` built a real `<img onerror>` into the DOM. It never fired only because the CSP refuses inline handlers: defence in depth doing its job, and a hole all the same. Fixed at the boundary the way `R12` fixed the recipe overlay (servings coerced to 1–40 on load, which also repairs the ± buttons that were comparing against a string) and again at both render sites. **The first version of the new test passed vacuously** — it seeded localStorage then navigated by hash, which is a same-document navigation, so the app never re-booted and every check ran against the shipped book. That is `R9`'s lesson twice; the block now reloads, and it counts *injected elements* as well as executed handlers, so the CSP can never again mask a hole beneath a green check. Thirteen new checks; battery 593. |
| `R22` | 2026-08-20 | **`R18` closed the front door; the back arrow was still open.** Filtering the Menu now writes the address, but the recipe screen's own "Menu" link pointed at a bare `#menu` — so leaving a filtered list and coming back gave the same six recipes with an address claiming all 48, and a reload from there lost them. Both back links (recipe and Add) carry `menuHash()` now, which is exactly "the list you left" and exactly `#menu` when you arrived from Main, so nothing changes for someone who never filtered. Five new checks; battery 598. |
| `R23` | 2026-08-20 | **Four accessibility rules were reviewer discipline; now they are machinery.** `design/a11y-criteria.md` listed names for controls, labels for fields, focus order and decorative artwork as things a reviewer checks by hand — on the app built for a low-vision reader, that is the wrong place for them. All four run automatically now across **sixteen surfaces**: the six screens plus every sheet, edit mode, the open search field and all four Add forms. Two things make it trustworthy rather than decorative. It counts what it inspected and fails if that number collapses, so a state that quietly stopped opening can never read as a clean pass — `R21`'s lesson, applied before it could bite. And both detectors were **mutation-tested**: stripping one `aria-label` and one hidden `<label>` each produced exactly one failure, and the label mutation went undetected until the Menu's open search field joined the list, which is how that gap was found. Five new checks; battery 602. |
| `R24` | 2026-08-20 | **The PDF path had never been tested.** CLAUDE.md is explicit that print *is* the PDF path — the download sheet's PDF option is `window.print()` against the print stylesheet — and the week planner's print view has been checked since `129`, but the recipe's, the one that actually ends up on the counter beside the pan, never was. Eight checks now cover it: the chrome gone, the recipe present, **the quantities you scaled to rather than the stored default**, black on white from either theme (dark is the default, and a dark page printed is a wasted cartridge), one column instead of the screen's two, and the faded `--dim` tier surviving onto paper instead of vanishing into it. Nothing was found wrong — and to prove that means something, two mutations (letting the checkboxes through, keeping the two-column grid) each produced exactly the failure they should. Eight new checks; battery 610. |
| `R25` | 2026-08-20 | **A budget for the taps, and an honest account of what it is worth.** FCP says the book opens fast; CLS says it doesn't jump; neither says anything about using it. Measured in-page under a 6× CPU throttle — a phone several years older than the runner — the app is quick: check-off **33 ms**, servings **50 ms**, a filter chip re-rendering all 48 cards **158 ms**. The investigation's real finding is that there is nothing to fix: of that 158 ms only ~30 ms is this app's JavaScript, the rest being the browser laying out and painting 48 cards. `content-visibility: auto` was measured (183 → 125 ms) and **rejected** — card heights run 100–256px, so no `contain-intrinsic-size` fits, and the drift would land on the scroll restoration this screen deliberately owns. So the round ships a tripwire instead of an optimisation, with its limits written into the file: twelve full JSON round-trips of the whole book per render, added deliberately, moved the chip only to 206 ms, so these gates catch an architectural regression and not small waste. Three budgets; battery 610 plus the perf gate. |

---

## 11. Waiting on you

*The loop writes here when it hits a 👤 or an unanswered 🤝. Everything below
blocks something. Clearing an item here unblocks the loop.*

| Task | What is needed | Blocks |
| --- | --- | --- |
*Rewritten 2026-08-01 after the completion push. Everything below needs a
person; nothing below can be done by an agent, and none of it blocks another
agent task — the agent queue is empty.*

| Task | What is needed | Blocks |
| --- | --- | --- |
| `004`–`007` | **A physical iPhone.** Does Atkinson render; Save-to-Notes through the real share sheet; a 40-minute wake-lock bake; print to real paper. | `015`, `035`, `042`, and re-checking `049`/`054` on-device |
| `015`–`024` | **Sessions with Joan and one other family member**, on their own phones. All ten of Phase 2 is watching real use. | `023` re-checks `027`; `024` extends `033`; `020` shapes `074`; `022` feeds `025` |
| `025` | The family's answer: is "download and commit" acceptable friction? **The check on the provisional no-server ruling.** | reopening `026` |
| `035`–`040`, `042` | **VoiceOver on iOS, Reduce Motion + Increase Contrast.** Findings amend `design/a11y-criteria.md` and may reopen `055`/`056`. | the deferred section of `034` |
| `072`–`074`, `076`–`078` | **The content truth pass — sit-downs with Joan.** `CONTENT.md` is the worklist: 4 ingredient lists, the `parsnips` truncation, 34 servings, first tags, first photos, chasing the other four contributors. Rule 5: nothing inferred. | the `029` done-bar for 1.0; re-running `080` after |
| `081` | **Twenty real photos of Joan's recipe cards** through the proven pipeline; write down the honest error rate. | final wording of the `082` flags |
| ~~*light the kitchen*~~ ✅ | **Done 2026-08-03.** All four env vars are in Render (`KT_DB`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `YT_API_KEY`) and the server reports `missing: []`. Instagram imports work end to end; YouTube works through the Data-API salvage, both proven with live jobs. Remaining courtesy items: flip the service's Branch to `main`, and rotate the Neon password. | — |
| *`KT_DB` Actions secret* | Same value, repo Settings → Secrets → Actions, so the nightly `db-sync` keeps `recipes.json` telling the database's story — including recipes accepted from video imports. | accepted imports reaching the published file |
| *rotate the credential* | The Postgres password transited a chat; rotate it in the Neon console once the env vars are placed (the two spots above are the only two places it lives). | hygiene, not function |
| *(struck)* `096` | ~~Neon Data API decision~~ — superseded 2026-08-02: the Render import server is the small worker; see §10. | — |

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
