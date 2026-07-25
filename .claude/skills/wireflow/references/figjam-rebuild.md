# Native FigJam rebuild (optional — for editability)

Load this only when the user wants an **editable** board. The default deliverable is the SVG/HTML;
an SVG dragged into FigJam lands as a **flat image (not editable)**. To get editable
stickies/shapes/connectors, drive the **Figma Plugin API** via the `use_figma` MCP tool from the
finalized spec. Read the `/figma-use` skill before your first `use_figma` call.

Good news: **FigJam auto-routes connectors**, so on the native side you just connect node *pairs* —
you do **not** need the SVG router. One spec drives both outputs.

## Mechanics
- **Nodes:** `createShapeWithText()` with `shapeType` ROUNDED_RECTANGLE / SQUARE / DIAMOND / ELLIPSE;
  set `.text.characters`; for own-screen nodes set `.text.hyperlink = {type:'URL', value}` to link the
  live route. Lane bands = `createRectangle()` + a label text. Connectors attach to a plain Rectangle
  too, if you need it.
- **Connectors:** `createConnector()` with `connectorStart/End = {endpointNodeId, magnet:'AUTO'}` and
  `connectorLineType = 'ELBOWED'`. Let FigJam route them. **Match the SVG's cross-lane colouring:** when
  the pair spans two lanes, set `connector.strokes = [{type:'SOLID', color: <destination lane rgb>}]`
  (the same owner→colour map as `LANE_COLORS` in `wireflow.py`, converted to 0–1 rgb); leave same-lane
  connectors the default gray. Colour the lane-band label the same way so the tint is decodable.
- **Tag everything** so you can cleanly delete/rebuild later: `setPluginData` is **NOT supported** in
  this runtime — use `setSharedPluginData(ns, key, val)` / `getSharedPluginData`. Use a namespace like
  `wfns`, key `wf`, val `1` on every node you create.

## Gotchas that will bite you
- `use_figma` runs Plugin-API JS and **returns no value and no `console.log`.** To read diagnostics,
  `throw new Error("...JSON...")` — **but an uncaught throw ROLLS BACK all mutations in that call.**
  So use `throw` only for **read-only** checks; any call that mutates must complete normally.
- Each `use_figma` call is a **fresh JS context.** Reload Inter fonts (`Regular / Medium / Semi Bold /
  Bold`) and call `setCurrentPageAsync(originPage)` **every** call. Content usually lives on a specific
  page/section node, not the default current page — target it explicitly.
- **Build in chunks** (cleanup + scaffold first, then ~2 journeys per call) to stay under the ~50k code
  limit per call.
- You still **can't screenshot the big board.** Rely on the SVG render for visual truth, and run a
  `throw`-based node-overlap check on the native board for structure only.

## Recommended sequence
1. Finish and verify the SVG/HTML first (visual truth).
2. Call 1: delete prior `wfns/wf=1` nodes on the target page, create lane bands + start/outcome anchors.
3. Calls 2..n: ~2 journeys each — nodes (tagged) then connectors between pairs.
4. Final call: a read-only `throw`-based overlap/structure check; fix in a follow-up mutation call.
