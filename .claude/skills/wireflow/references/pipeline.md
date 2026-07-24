# Build pipeline checklist

The one learning that turned the original project around: **do not build straight onto a FigJam
board via the API first.** A real board is too large for the design tool to render back to you, so
you'd be building blind and only the user would see the mistakes. Generate as code, verify by
Reading a rasterized image, *then* (optionally) rebuild natively.

## The loop
1. **Ground** in the sources — read the spec, and read the *live prototype's real screens/routes*
   so own-screen nodes can link live routes (not screenshots, which go stale).
2. **Lock the method** via the grill (`references/method-decisions.md`), one decision at a time.
3. **Write the board spec** (`references/spec-schema.md`) from the locked decisions.
4. **Generate:** `python scripts/wireflow.py board.json --out ./out --rasterize`.
5. **Read every journey PNG** (`out/wf_*.png`). The Read tool renders images, so you see overlaps,
   out-of-lane nodes, and glyph problems before the user does. **Verify every journey, not just the
   tricky ones** — this is mandatory, it's the core reliability trick.
6. **Iterate** the spec (rarely the engine — see `references/layout-engine.md`) until clean.
7. **Deliver** `out/wireflow.html` (all journeys + legend + JTBD × Journey matrix) and the
   per-journey `out/wf_*.svg`. Present the files.
8. **Offer the FigJam rebuild** for editability; build it only if the user wants it
   (`references/figjam-rebuild.md`).

## Definition of done
- Every journey PNG has been Read and is clean (no overlaps, nothing out of lane, no tofu).
- Every board JTBD and every epic is *embodied* by a node/branch (matrix confirms JTBD coverage).
- Locked cuts appear as Stop nodes.
- Own-screen nodes carry live-route `href`s.
- No initiative labels, no MoSCoW/roadmap metadata on the flows.
