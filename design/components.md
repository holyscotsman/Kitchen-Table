# Kitchen Table — component reference

One page, for the next person who adds a screen. Every component below already
exists in `style.css`; build from these, never invent parallel ones. Colours
come only from `tokens.css` (see `CLAUDE.md`, rule one), and every new surface
must clear `design/a11y-criteria.md` before merge.

The vocabulary is small on purpose. If a new screen seems to need a component
this page doesn't have, that is a design conversation, not a CSS file to grow.

## Type

- **Font:** Atkinson Hyperlegible only — self-hosted in `fonts/`, weights 400
  and 700 (+ 400 italic). Never 500/600, never a fallback-first stack.
- **Reading scale:** recipe content only, `FS = 20/24/29/34/40`, default 24,
  stepped by A−/A+, persisted (`kt.fsIndex`). Chrome never scales with it —
  headers, buttons and labels hold their fixed sizes (`033` precedent:
  chrome that scales crowds out the content it serves).
- **Easy Read** (`kt.easyRead`): floor rises to 29, one column everywhere,
  `--dim`/`--card-dim` promote to full ink, borders thicken to 2px. Additive
  to the stepper. Endorsed as designed in `DECISIONS.md` §059.

## Surfaces

| Component | Class | Contract |
| --- | --- | --- |
| Page | `body` | `--bg`, padded by each screen's own wrapper (`.main`, `.recipe`) |
| Recipe card | `.rcard` | `--card` fill, 64px lead slot (photo thumb *or* category icon, never both, never empty), one per line at every width |
| Contributor tile | `.who-tile` | Filled `--card` when someone has recipes; dashed outline + accent plus + "None yet — add the first" when empty (`058`) |
| Stat/serving cards | `.statcard` `.servcard` | `--surf`, wrap under 360px rather than compress |
| Panel | `.panel`, `.panel--flag` | Notes and warnings; the flag variant always carries its heading — colour is never the only signal |
| Sheet | `.sheet` + `.scrim` | Bottom-anchored dialog: traps Tab, closes on Escape, returns focus to its opener, rises 240ms (`sheet-in`, consumed on open only) |

## Controls

- **Tap floor:** 44px minimum for anything interactive; icon buttons are
  48×48 (`.iconbtn`). No hover-only affordances anywhere — iPhone has no
  hover.
- **Primary action:** `.bigbtn` / `.actbtn--primary` — accent fill,
  `--acc-ink` text.
- **Secondary:** `.actbtn` / `.outlinebtn` — outlined, `--surf`.
- **Switch:** `.switch`, 64×36, knob 26px, `role="switch"` +
  `aria-checked`.
- **Stepper buttons:** `.servbtn` / `.fsbig` — the two big-target steppers
  (servings, text size). Disabled state keeps its label readable.
- **Check-off row:** `.checkrow` + `aria-pressed`; the tick glyph pops 220ms
  on check only — un-checking is a correction and stays silent.

## The tag chip (spec from task `060`)

One rule everywhere: **a chip is a single line; rows wrap, chips never fold.**

| Surface | Class | Size | Long-tag behaviour |
| --- | --- | --- | --- |
| Menu card | `.rcard .minitag` | 13px, outline style on card fill | caps at 22ch, ellipsis; max two chips shown |
| Recipe page | `.minitag--link` | 44px tap target, tag-tint fill | runs the full line width, then ellipsis |
| Filter sheet | `.chip` + `.chip__label` | 52px tap target | label span ellipsizes at sheet width |

Selected chips add the check glyph beside the label — the non-colour half of
the state. (Implementation note that cost an hour: a flex container cannot
`text-overflow` a bare text node; the label span exists for that.)

## Focus (spec from task `055`)

One designed ring: **3px `--acc`, offset 2, radius 4** — measured 10.5:1
(dark) / 8.7:1 (light) against the page. Accent-filled controls add a 2px
page-coloured gap (`box-shadow`) so the ring never touches a fill of its own
colour. Never suppress it except where the app moves focus programmatically
after navigation (see the `:focus` rule on `#app h1[tabindex="-1"]`).

## Icons and artwork

- **Icons** are hand-drawn stroke SVG, `currentColor`, stroke 2.2, 24-box —
  the ten `CAT_ICON` glyphs (all verified legible at 20px, task `056`) and
  the small UI set in `I`. No icon libraries, ever (assets rule).
- **Artwork** (`ART.steam`, `ART.empty`) fills slots that would otherwise be
  blank — hero without a photo, empty states. Decorative by definition:
  always `aria-hidden`, always `currentColor`, wisps animate only outside
  reduced-motion.

## Motion

Armed by the action that earns it, consumed by exactly one paint, dead under
`prefers-reduced-motion` — no exceptions. The inventory: screen enter (260ms,
route change only), card stagger (capped at ten), tick pop, rescale flash
(600ms, the longest thing in the app), theme spin, sheet rise, boot breathe.
Anything new joins the reduced-motion kill list in the same commit.

## Photos (spec from task `057`)

One deliberate box per slot, centre-crop (`object-fit: cover`), reserved
before decode: hero 3:2 capped 280px, thumbnail 64×64. A recipe without a
photo renders its category icon in the same 64px slot — never a placeholder,
never a broken glyph (`064`). The hero opens a lightbox with the whole
photograph (`065`), because the crop loses the handwriting's margins.

## Print

Black on white regardless of theme, via the `--print-*` tokens appended to
`tokens.css` (task `054`). Content only: chrome, sheets, artwork and the
version stamp all hide. If a new component can appear on the recipe page,
decide its print behaviour in the same commit.
