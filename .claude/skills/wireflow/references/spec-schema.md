# Board spec schema

The engine (`scripts/wireflow.py`) consumes one JSON **board**. Run
`python scripts/wireflow.py --print-example` for a runnable example, or
`python scripts/wireflow.py --out ./out --rasterize` (no spec arg) to render the built-in one.

## Top level
```jsonc
{
  "title": "<Product> — MVP wireflow",
  "subtitle": "6 actor journeys · JTBDs at the core",   // optional, shown under the title
  "layout": "horizontal",              // "horizontal" (default) | "matrix"  — see orientation.md
  "lanes": ["Lead", "CRM / Own", "System", "External"], // shared owner lanes (order matters in matrix)
  "jtbds": ["Capture a lead compliantly", "Route to an owner", ...],  // board JTBD list -> matrix rows
  "journeys": [ Journey, Journey, ... ]
}
```
`layout` can also be overridden on the CLI with `--layout horizontal|matrix`.

**Orientation matters for `lanes`:**
- **horizontal** — each journey draws only the lanes it touches (per-journey `lanes` is enough).
- **matrix** — define board-level `lanes` so every journey shares the *same* owner rows in the same
  order; that's what makes "read across a row = one owner across all journeys" work. Keep node `text`
  short and journeys not-too-deep in matrix (columns get wide); push spine depth into the horizontal
  version. See `orientation.md`.

## Journey
```jsonc
{
  "id": "J1",                       // short, appears in header + matrix columns
  "title": "Compliant Capture",
  "actor": "Front desk / Lead",     // lane-agnostic; the human the journey follows
  "jtbd": "Capture a lead without breaking RGPD",   // the job this journey serves
  "start": "lead arrives via many channels",         // Start node = the struggle
  "outcome": "compliant lead sitting in the CRM",    // Outcome node = the job done
  "jtbds": ["Capture a lead compliantly"],           // which board JTBDs this journey covers (matrix dots)
  "lanes": ["Lead", "CRM / Own", "System", "External"],  // owner lanes, top-to-bottom order
  "nodes": [ Node, ... ],
  "edges": [ Edge, ... ]
}
```
If `lanes` is omitted, lane order is derived from the order nodes first appear.

## Node
```jsonc
{
  "id": "n2",                 // unique within the journey; edges reference it
  "col": 1,                   // 0-based column (left→right progression)
  "lane": "CRM / Own",        // must match a lane name
  "type": "screen",           // see node types below
  "text": "Capture form",     // wraps automatically; keep it short
  "row": 0,                   // optional: stack multiple nodes in the same lane+col band (0,1,2…)
  "href": "/leads/new"        // optional: live route for own-screen nodes (NOT screenshots)
}
```

### Node types
| type | meaning | shape / colour |
|---|---|---|
| `start` | the struggle | green pill |
| `outcome` | the job done | darker green pill |
| `screen` | CRM / own screen (build) | blue rect, links live route via `href` |
| `external_site` | view-only site you don't own | grey dashed rect |
| `external_product` | separate product/tool in the path | purple dashed rect |
| `system` | backend / engine step, no UI | slate rect with spine bar |
| `agent` | AI / automation step | teal rect |
| `decision` | branch point | amber diamond |
| `stop` | locked cut / deliberate non-path | red rect with × |

## Edge
```jsonc
{ "from": "n2", "to": "n3", "label": "submit" }   // label optional; wraps at ~22 chars
```
Edges are directional (arrowhead at `to`). The router picks geometry automatically:
- same column → straight vertical;
- target to the right → forward elbow through the gutter before the target;
- target to the left → backward/loop, approaching the target from its left (never a straight
  drop that would cross a node beneath the source).

## Tips that keep renders clean
- **Advance `col` along the human progression.** Don't reuse a column for unrelated steps; the
  router assumes left→right is forward.
- **Prefer self-disambiguating branch labels.** Two branches leaving one decision often share a
  gutter, so their labels sit near each other — the engine nudges colliding chips apart, but
  `"saved ok"` / `"write failed"` stays readable at any position where a bare `"yes"` / `"no"`
  pair invites misreading.
- **Use `row` to stack** parallel/sub steps in one lane rather than inventing extra lanes.
- **Keep node `text` to ~3–5 words.** Long text wraps and can crowd; put nuance in edge labels.
- **Give locked cuts a `stop` node**, with the reason in the incoming edge label ("no — RGPD").
- **Every journey lists its `jtbds`** so the coverage matrix is populated.
