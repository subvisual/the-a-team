# Layout engine — rules and how to debug a bad render

`scripts/wireflow.py` encodes the layout rules below. They were learned the hard way (the SVG
generator went through several regressions). You rarely need to touch the engine — most fixes are
to the **spec**. Read this when a rasterized journey looks wrong, before editing code.

## The rules the engine encodes
- **Auto-size each lane band to its contents.** Lane height is computed from the max `row` used in
  that lane (`LANE_PAD*2 + rows*ROW_PITCH + NODE_H`). Never hardcode a lane height against a
  spacing constant — when you widen the row pitch, bands must grow or nodes spill "out of
  swimlane". If you ever see a node sitting *on* a lane border, this invariant was violated.
- **Router by geometry (3 cases):**
  1. Target directly **above/below** (same column) → straight vertical into the near edge.
  2. Target to the **right** (forward) → elbow through the **column gutter just before the
     target**, vertical segment near the target.
  3. Target to the **left** (backward/loop) → **exit sideways and approach from the target's left
     via a gutter** — never drop straight down (you'd cross the node beneath the source).
- **Edge labels** ride the vertical segment (cross-lane) or the mid-line (same row), on a **white
  chip**, and **wrap to 2 lines past ~22 chars** so they don't bleed onto nodes.
- **Edge colour = destination lane.** An arrow that **lands in a different lane** is tinted with the
  **ending lane's colour** (from `LANE_COLORS`); same-lane arrows stay neutral gray. The path and its
  arrowhead share the colour (one `<marker>` per colour). Each lane label carries a matching colour
  tick so the arrow colours are decodable at a glance. This is a *tracing* aid on the otherwise-neutral
  edge channel — **node fills still encode type**, so it does not collide with the type palette. Owner
  colours are stable across journeys (mapped from board-level `lanes`).
- **Glyph sanitising:** emoji/dingbats (⛔ ✦ ⚙ ↺ ▶) render as **tofu boxes** in cairosvg — the
  engine maps them to safe chars (× » etc.) or drops them. Plain arrows (→ ↗) render fine. Don't
  put raw emoji in node/edge text; if you need "stop", use a `stop` node (it draws its own ×).

## Debugging a bad render (fix the spec first)
| Symptom | Likely cause | Fix |
|---|---|---|
| Nodes overlap horizontally | two nodes share `col` + `lane` + `row` | give one a different `row`, or advance `col` |
| A node sits on a lane border | too many rows for the band — shouldn't happen (auto-sized); if it does, check `row` values are 0-based and contiguous | renumber `row` from 0 |
| Edge crosses through a node | a backward edge drawn as forward, or a long forward edge over a busy column | ensure `col(from) > col(to)` really holds for forward; insert an intermediate `col` |
| Label bleeds onto a node | label too long | shorten it, or let it wrap (it wraps at ~22 chars automatically) |
| Tofu boxes (□) in text | raw emoji/dingbat | remove it; use a typed node instead |
| Journey too wide to read | too many columns | split the *depth* into an inline screen-detail cluster on the spine, or check you're not reusing columns for parallel steps that should share a `col` with different `row` |

## When you genuinely must edit the engine
Only after a spec fix can't express what you need. Keep these invariants:
- Lane height stays a function of content (`layout()`), never a constant.
- The router's three cases stay exhaustive and never emit a straight vertical across an
  occupied cell.
- Any new node type goes in `TYPES` (fill/stroke/text/shape) **and** `LEGEND` so it appears in
  the combined-HTML legend.
Re-run `--rasterize` and **Read every journey PNG** after any engine change — the whole point of
the engine is that you can see its output before the user does.

## Matrix mode specifics
Matrix shares one set of owner rows across all journeys (each journey is a vertical column). Extra
rules that apply only there:
- **Define board-level `lanes`.** The shared row order is taken from board `lanes`; without it the
  engine unions lanes in first-appearance order, which may not be the order you want. Consistent rows
  are the whole point of matrix (read across a row = one owner everywhere).
- **Router is a vertical-elbow** (down-the-column), plus a straight horizontal for same-row hops. It's
  simpler than the horizontal 3-case router because matrix cells are sparser.
- **Columns get wide with depth.** If a journey has many `col` steps the whole board widens. Keep
  matrix journeys shallow and push the deep spine into the horizontal render (`orientation.md`).
- **Same-row short edges can clip their label** (e.g. decision → adjacent stop node). Shorten the
  label or move the target to a different `col`/`row`.
- Node text is smaller in matrix (`NODE_W_M`/`NODE_H_M`); keep it to ~3 words.

## Tuning knobs (top of the file)
`NODE_W, NODE_H, GUTTER, ROW_PITCH, LANE_PAD, LANE_LABEL_W` — geometry. `TYPES`/`LEGEND` — the
palette. `GLYPH_MAP` — glyph sanitising. Changing `ROW_PITCH` is safe (lanes auto-grow); changing
`NODE_W`/`GUTTER` changes column pitch for the whole board.
