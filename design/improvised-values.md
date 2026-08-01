# Improvised values — the screens the styleguide never covered

Gameplan task `053`. The Add / Import flow, the review form and the edit
fields were composed by an engineer from the existing vocabulary;
`styleguide.html` predates them. This is the honest inventory of every value
on those screens that the styleguide does not define — the input for `054`
(extend `tokens.css` where something is genuinely missing) and `061` (the
component reference). Nothing here is a colour: the palette audit is
enforced by tooling and stands at zero hex outside `@media print`.

## Complies with the styleguide as written

| Element | Value | Styleguide source |
| --- | --- | --- |
| `.pathbtn` min-height | 88px | card min-height 88 |
| `.pathbtn` radius | `--r-card` | card radius |
| `.input` / `.textarea` min-height | 58px | field 58 |
| `.input` border | `--bw-field` + `--r-input` | field spec |
| `.savebtn` min-height | 60px | primary button 60 |
| `.notice` radius | `--r-row` | row radius |
| `.pathbtn__s`, `.addscreen__note` | 15px | card meta 15 |
| Chips (52px / pill) | reused as-is | chips section |

## Deliberate deviations — the scaling contract

The styleguide sets fixed pixel sizes; the recipe screen's edit fields sit
inside the A−/A+ scaling context, so their type is specified in `em` against
the reading size. This is a considered extension, not drift — a fixed 19px
input beside 40px instruction text would be the accessibility bug.

| Element | Value | Fixed equivalent at default (24px) |
| --- | --- | --- |
| `.input`, `.textarea`, `.savebtn`, `.outlinebtn`, `.addline` font | `0.85em` | ≈ 20px (styleguide fixed 19) |
| `.field__label` | `0.62em`, 700, caps, `0.1em` tracking | ≈ 15px (eyebrow spec is 12px fixed) |
| Tap minimums | `min-height` in px, never em | 44/48 floors hold at every step |

## Improvised — needs a designer's eye (`054` / `058` / `061`)

| Element | Improvised value | Nearest styleguide value |
| --- | --- | --- |
| `.addscreen` max-width | 820px | Main is 760 / 1040 — 820 is a third width |
| `.addscreen__h1` | 30px | type scale jumps 26 → 34; 30 is a new stop |
| `.addscreen__lead` | 17px | scale has 15 and 19, not 17 |
| `.pathbtn` padding | 18px | card padding is 16 |
| `.pathbtn__t` | 20px | scale has 19 and 21, not 20 |
| `.notice` font | 16px, 700 | not in the scale |
| `.notice` padding | 14 × 16 | field is 0 × 14 |
| `.input` padding | 14 × 16 | styleguide field is 0 × 14 (single-line) |
| `.delbtn` | 56 × 56 | matches `.servbtn`, which is itself outside the guide |
| `.addline` border style | dashed `--bw-field` | dashed appears nowhere in the guide |
| Sheet paddings/radius | 20 / `--r-hero` top | sheets predate the guide's scope too |

## Fixed during this audit

- `.outlinebtn` was 58px min-height — the styleguide's secondary button is
  60. Brought to 60. (58 belongs to *fields*, and the button is not a field.)

## Not covered by the styleguide at all

The styleguide has no section for: sheets, the sort menu, the mode strip,
the Add path buttons as a pattern, file inputs, the flagged panel, the tag
chip on cards (`.minitag`), category icons, or the empty states. `061`'s
component reference is where those get their page.
