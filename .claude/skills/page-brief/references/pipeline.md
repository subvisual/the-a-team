# Build pipeline checklist

The learning inherited from the wireflow build: **do not build straight onto a FigJam board via the
API first.** A real board is too large for the design tool to render back, so you'd build blind and
only the user would see the mistakes. Generate as code, verify by Reading a rasterized image, *then*
(optionally) rebuild natively.

## The loop
0. **Gate on the jobs** (`SKILL.md`, Movement 0). Read the JTBDs before anything else: progress-shaped?
   template followed? persona attached? If not, say so and offer `jobs-to-be-done` first. Never
   silently draft on feature-shaped jobs — that is the known cause of thin cards.
1. **Gather inputs** — the JTBD set, the journeys, the wireflow (page set + journey linkage), and the
   *live prototype's real screens/routes*. Read them so drafts are real and Design-refs link live
   routes.
2. **Draft + grill per page** (`references/method-decisions.md`) — design says WHAT, human says WHY and
   whether it's good. Lock one card before the next. The acceptance criteria's qualitative layer
   **cannot** be written without the human.
3. **Write the board spec** (`references/spec-schema.md`) from the locked cards.
4. **Generate:** `python scripts/page-brief.py board.json --out ./out --rasterize`.
   **Read the warnings it prints** — they catch v1 fields, missing cotton tests, and untagged tasks.
5. **Read every card's PNG.** The Read tool renders images, so you see overflow, tofu, and cramped
   columns before the user does. **Verify every card, not just the tricky ones** — mandatory; this is
   the core reliability trick. Fix issues per `references/card-layout.md`.
6. **Read the two shared pages too** — the JTBD definitions page and the job → pages index. The index
   is where an unserved job shows up, and that's a content finding you must surface.
7. **Iterate** the spec (rarely the engine) until every card is clean.
8. **Deliver** `out/board.html` + `out/board.svg`. Present the files. Design-refs link live routes.
9. **Offer the FigJam rebuild** for editability; build only if the user wants it
   (`references/figjam-rebuild.md`). Open questions go on the board as post-its beside their card —
   that's their home now, not a card field.

## Rasterizing for the Read step
`--rasterize` handles this for you. The engine tries, in order: **cairosvg** (pip) → **rsvg-convert**
→ **resvg** → **headless Chrome/Chromium/Edge**. Any one produces the PNG, so you normally just run
with `--rasterize` and Read the resulting `board.png` — even when cairosvg's native lib is missing
(common on macOS), the Chrome fallback kicks in automatically.

If it prints "could not rasterize" (no rasterizer *and* no Chromium browser found), the SVG + HTML are
still written — open the HTML, or render it to a PNG yourself with any headless browser:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --hide-scrollbars --default-background-color=FFFFFFFF \
  --window-size=<WIDTH>,<TALL_ENOUGH> --screenshot=out/board.png "file://$PWD/out/board.html"
```
The point is only to *see your own output* before delivery — any route to a PNG is fine.

## Definition of done
- The job gate was run, and its result was stated to the user.
- Every card PNG has been Read and is clean (no overflow, no tofu, no ragged collisions).
- Unit is the unique page — deduplicated; context differences are variants, not extra cards.
- Checklist items are **tasks**, each tagged to a job; untagged ones are dropped or flagged and the
  flags were resolved with the human.
- Every card has acceptance criteria with **both** layers, and the qualitative layer is presented as
  something a **person must run** — never reported as passing.
- Job vs journey is unambiguous everywhere; job codes are stable and come from the JTBD set.
- Connects-to captures cross-page **and** cross-job routing, including non-navigational handoffs.
- The job → pages index has no unserved job (or the unserved ones were surfaced as findings).
- Nothing above the boundary crept in — no business goals, metrics, or scope/phasing — and nothing
  below it either: no components, layout, or hierarchy.
- Degraded mode only: "Appears in journeys" TODOs are explicit and called out to the user.
