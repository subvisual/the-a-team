# Native FigJam rebuild (optional — for editability)

Load this only when the user wants an **editable** board. The default deliverable is the SVG/HTML; an
SVG dragged into FigJam lands as a **flat image (not editable)**. To get editable stickies/shapes/
connectors, drive the **Figma Plugin API** via the `use_figma` MCP tool from the finalized spec. Read
the `/figma-use` skill before your first `use_figma` call.

The page-brief shares the wireflow's FigJam mechanics; the layout intent differs (cards beside
journeys, ID chips for repeats).

## Placement intent (page-brief specific)
- Place each page's **full card once, at its primary occurrence** — the journey where the page is
  richest.
- Secondary occurrences in other journeys show a compact **ID chip** (`P3 · Lead detail`) that points
  back to the primary card — **not** a duplicated card.
- Linkage is by **stable ID**, not drawn connectors from every journey node (that's spaghetti on a
  real board). The card's own linkage fields carry the graph.
- If cards inline start to clutter the board, fall back to a **catalog column** of cards beside the
  wireflow, with ID chips on the journey nodes.
- Place the **Jobs-to-be-done page** and the **Job → pages index** once, at the top of the board. They
  are shared; never duplicate job definitions onto cards (Q14).
- **Open questions are post-its, not card fields** (Q3). When something is unresolved, create a sticky
  pinned beside the card at the point of doubt — `createSticky()`, tagged like everything else. Once
  answered it becomes a checklist item or an acceptance criterion and the sticky goes away. This is
  the whole reason the field was cut from the card: on a board it has a natural home that decays
  correctly; on a card it only accumulates.

## Mechanics
- **Card container:** `createRectangle()` for the frame + block backgrounds; text via `createText()`.
  For a lighter build, a card can be one `createShapeWithText()` per block. Set
  `.text.hyperlink = {type:'URL', value}` on the Design-ref to link the live route.
- **ID chips / journey links:** small `createShapeWithText()` (ROUNDED_RECTANGLE) with the page ID;
  place on the journey node. Connectors optional — prefer the ID convention.
- **Tag everything** so you can cleanly delete/rebuild: `setPluginData` is **NOT supported** — use
  `setSharedPluginData(ns, key, val)` / `getSharedPluginData`. Use a namespace like `pbns`, key `pb`,
  val `1` on every node you create (distinct from the wireflow's `wfns/wf` so the two can coexist and
  be cleaned independently).

## Gotchas that will bite you
- `use_figma` runs Plugin-API JS and **returns no value and no `console.log`.** To read diagnostics,
  `throw new Error("...JSON...")` — **but an uncaught throw ROLLS BACK all mutations in that call.**
  Use `throw` only for **read-only** checks; any call that mutates must complete normally.
- Each `use_figma` call is a **fresh JS context.** Reload Inter fonts (`Regular / Medium / Semi Bold /
  Bold`) and call `setCurrentPageAsync(originPage)` **every** call. Target the specific page/section
  node, not the default current page.
- **Build in chunks** (cleanup + scaffold first, then ~1–2 cards per call) to stay under the ~50k code
  limit per call — cards are text-heavy, so they're bigger than wireflow nodes; chunk smaller.
- You still **can't screenshot the big board.** Rely on the SVG/PNG render for visual truth, and run a
  `throw`-based overlap check on the native board for structure only.

## Recommended sequence
1. Finish and verify the SVG/HTML first (visual truth).
2. Call 1: delete prior `pbns/pb=1` nodes on the target page; create the card frames/anchors.
3. Calls 2..n: ~1–2 cards each — block backgrounds + text (all tagged), then ID chips on journeys.
4. Final call: a read-only `throw`-based overlap/structure check; fix in a follow-up mutation call.
