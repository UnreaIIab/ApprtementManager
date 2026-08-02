# Design system

Airbnb-inspired in its visual language — generous whitespace, rounded cards,
soft shadows, one accent colour — but shaped as a professional PMS: dense where
density helps, calm everywhere else.

---

## Tokens

Everything is a CSS custom property in `src/app/globals.css`, exposed to
Tailwind through `@theme inline` so `bg-surface`, `text-ink-2` and
`border-line` work as ordinary utilities.

| Role | Light | Dark |
|---|---|---|
| Page plane | `#f6f6f4` | `#0c0c0e` |
| Surface (cards, charts) | `#ffffff` | `#17181a` |
| Sunken surface | `#fafaf9` | `#1d1e21` |
| Primary ink | `#111114` | `#f7f7f6` |
| Secondary ink | `#56565a` | `#a9a9a6` |
| Muted ink | `#8a8a88` | `#7c7c7a` |
| Hairline | `#e7e7e3` | `#2a2c30` |
| Gridline | `#ececE8` | `#26282c` |
| Brand accent | `#ff385c` | `#ff5a76` |

**Dark mode is selected, not inverted.** Every dark value was chosen against the
dark surface; none is an algorithmic flip of its light counterpart. The theme is
driven by a `.dark` class on `<html>` (next-themes), so the in-app toggle beats
the OS preference in both directions.

The brand accent is reserved for chrome — primary buttons, the active nav item,
the logo. It is **never** used as a data-series colour.

---

## Typography and figures

The system sans (`system-ui, -apple-system, "Segoe UI", …`) throughout,
including headline figures. No display or serif face anywhere.

Large standalone numbers — KPI values, hero figures — use proportional figures.
`tabular-nums` (the `.tnum` utility) is applied only where numbers must line up
vertically: table columns, axis ticks, price breakdowns.

---

## Charts

Chart colour is computable, so it was computed rather than eyeballed.

### The palette

Eight categorical slots in a fixed order, each with a light step and a
separately-selected dark step:

| Slot | Hue | Light | Dark |
|---|---|---|---|
| 1 | blue | `#2a78d6` | `#3987e5` |
| 2 | orange | `#eb6834` | `#d95926` |
| 3 | aqua | `#1baf7a` | `#199e70` |
| 4 | yellow | `#eda100` | `#c98500` |
| 5 | magenta | `#e87ba4` | `#d55181` |
| 6 | green | `#008300` | `#008300` |
| 7 | violet | `#4a3aa7` | `#9085e9` |
| 8 | red | `#e34948` | `#e66767` |

### Validation

The palette was run against **this app's own surfaces** (`#ffffff` light,
`#17181a` dark), not generic defaults, and passes every gate in both modes:

| Check | Light | Dark |
|---|---|---|
| Lightness band | pass, all 8 | pass, all 8 |
| Chroma floor | pass, all 8 | pass, all 8 |
| CVD separation (adjacent) | ΔE 9.1 worst (`#eda100`↔`#1baf7a`) | ΔE 8.4 worst (`#c98500`↔`#199e70`) |
| Normal-vision floor (adjacent) | ΔE 19.6 worst | ΔE 19.3 worst |
| Contrast vs surface | 3 steps below 3:1 → relief rule applies | all 8 ≥ 3:1 |

Because three light-mode steps sit below 3:1 against white, the **relief rule**
is mandatory: every chart ships visible labels or a table view. That is why
`ChartCard` builds the table twin in rather than leaving it to call sites.

For scatter-type forms that need *all* pairs distinguishable rather than just
adjacent ones, the first three slots validate all-pairs in both modes; past
three, fold the tail into "Other" (`capSlices`) or facet.

### Rules the components enforce

- **Colour follows the entity, never its rank.** `sourceColor()` and
  `categoryColor()` map a key to a fixed slot, so filtering a chart never
  repaints the survivors.
- **A legend is always present for two or more series**; a single-series chart
  gets none — its title names it.
- **Every chart has a table twin.** Toggle in the card header.
- **One y-axis, always.** Two measures at different scales get two charts —
  there is no dual-axis chart anywhere in the app.
- **Thin marks, recessive chrome.** 2px strokes, 4px rounded bar ends, solid
  hairline gridlines (never dashed), no vertical gridlines.
- **A 2px surface-coloured stroke separates stacked segments** — the gap is the
  separator, not an outline around the mark.
- **Status colours are reserved.** `good` / `warning` / `serious` / `critical`
  never double as a series colour, and every status badge pairs its dot with a
  text label so state survives colourblindness, greyscale printing and
  forced-colors mode.
- **Sequential magnitude uses one hue, light → dark** (the occupancy heatmap),
  never a rainbow.
- **Filters live in one row above everything they scope**, never inside a chart
  card.

### Swapping in your own brand palette

Replace the `--series-*` and `--seq-*` values in `globals.css`, then re-run the
validator from the `dataviz` skill against your own surfaces:

```bash
node scripts/validate_palette.js "#hex,#hex,…" --mode light  --surface "#ffffff"
node scripts/validate_palette.js "#hex,#hex,…" --mode dark   --surface "#17181a"
```

Only adopt an ordering that clears every gate. Nothing else in the app needs to
change — components reference roles, not hex values.

---

## Motion

Framer Motion, kept quiet: 120–220ms for menus and tabs, spring transitions for
drawers and dialogs, a 6px fade-and-rise on page transitions. The whole system
collapses to near-zero duration under `prefers-reduced-motion`.

---

## Accessibility

- Focus rings on every interactive element, never suppressed.
- Dialogs and drawers trap focus, close on Escape, lock background scroll and
  restore focus to the trigger.
- Tables use `aria-sort`; icon-only buttons carry an `aria-label`.
- Status is never colour-alone.
- Charts expose the same numbers as text via the table view.
- Layout is responsive to 390px; wide tables scroll inside their own container
  so the page body never scrolls sideways.
