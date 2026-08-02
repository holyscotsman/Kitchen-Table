# The week view — layout spec (gameplan 121, drawn before build)

Composed entirely from `design/components.md` vocabulary. No new tokens, no
new type sizes; every measurement below already exists in the system.

## Anatomy, top to bottom

```
┌──────────────────────────────────────────────┐
│ ‹ Menu                    [theme]            │  header, same as Recipe's
│ THIS WEEK                                    │  eyebrow (13px caps, --dim)
│ 3 – 9 November             ‹  Today  ›       │  h1 22px + week nav row
├──────────────────────────────────────────────┤
│ MONDAY 3                                     │  day head: 15px 700 --dim
│ ┌──────────────────────────────────────────┐ │
│ │ [64px icon/thumb] Chicken Cordon Bleu    │ │  assigned meal = .rcard
│ │ Dinner · serves 4              [chev]    │ │  grammar, full width
│ └──────────────────────────────────────────┘ │
│ + Breakfast   + Lunch                        │  quiet adds: textbtn, 44px
├──────────────────────────────────────────────┤
│ TUESDAY 4                                    │
│ ┌─ dashed ─────────────────────────────────┐ │
│ │ + Add dinner                             │ │  empty slot = who-tile--empty
│ └──────────────────────────────────────────┘ │  grammar: dashed, plus, words
│ + Breakfast   + Lunch                        │
│ …                                            │
├──────────────────────────────────────────────┤
│ ▸ Shopping list (preview)                    │  collapsible, panel styling
│ 🖨 Print this week                           │  outlinebtn
└──────────────────────────────────────────────┘
```

## The three widths

- **390px** — one column, day sections stacked. Meal cards full-width, 64px
  lead slot, exactly the Menu card recipe. Nothing horizontal anywhere.
- **768px** — same single column, capped at 640px and centred. A 7-column
  grid was considered and rejected: day columns at ~100px cannot hold a
  recipe title at 24px+, which is the `033` precedent (legibility beats
  density) applied before the mistake instead of after.
- **1180px** — unchanged, 640px centred. The week is a list, not a wall
  chart; the print view is the wall chart.

## Interactions (all sheets on the house contract)

- Tap an **empty slot** → the picker sheet: search field (the 087 fold/typo
  search), result rows reusing the card grammar, tap to assign.
- Tap an **assigned meal** → the meal sheet: open the recipe, a servings
  stepper (the recipe-page stepper, same 48px buttons), remove from the plan.
- **Week nav**: ‹ previous · Today · next ›. View Transitions API where
  supported, plain repaint where not, nothing under reduced motion.

## Easy Read / zoom

Single column already; day heads gain weight from the existing dim-promotion;
the dashed empty slots thicken with the global border rule. The zoom suite
holds `#plan` to the same 320px/top-step/no-horizontal-scroll bar as every
other screen.

## Print

Black on white via the `--print-*` tokens: the week as a headed list, meals
with their servings, empty slots omitted, shopping-list preview included when
open. One page for a normal week.

## Data

`kt.plan` in localStorage, entries shaped exactly like `kitchen.menu_plan`
rows (`date`, `slot`, `recipeId`, `titleThen`, `servings`) so the database
wiring syncs rather than migrates. A removed recipe leaves `titleThen`
behind, rendered as plain text with a "no longer in the book" note — the
slot never crashes or vanishes (127).
