# Orientation — horizontal vs matrix

Two ways to lay a wireflow out. This is a real formatting decision; surface it in the grill and
recommend, don't silently pick. Both come from the *same* board spec — only `layout` changes.

## Horizontal (default) — one diagram per journey
- **Axes:** owner swimlanes stacked as horizontal bands; the journey flows **left → right**.
- **Reads as:** a story you follow end-to-end, one journey at a time. Journeys stack down the page.
- **Best for:** the **working deliverable**, and especially a **deep spine** — depth needs
  horizontal room, and each step gets a full-size node. Scales fine as you add journeys (just stack
  more diagrams).
- **Weakness:** you can't see all journeys against each other at once; a very deep journey gets wide.

## Matrix — one shared board
- **Axes:** owner lanes are **horizontal rows spanning ALL journeys**; each journey is a **vertical
  column**. So the lanes *match across journeys*.
- **Reads two ways** — this is the whole point:
  - **down a column** = follow one journey end-to-end;
  - **across a row** = follow one owner (e.g. "everything the System/agent touches") across *every*
    journey.
- **Best for:** a **stakeholder overview**, comparing journeys, and enforcing **one lane vocabulary**
  (the same owners everywhere). Makes cross-cutting owners (the agent, the backend, an external
  provider) legible at a glance.
- **Weakness:** it **compresses per-step depth** — nodes are smaller and a deep spine won't fit a
  narrow column. Not where you do the detailed spine work.

## Recommendation (what to tell the user)
Default to **horizontal for the deliverable**, and **offer matrix as an overview companion**.
Rationale: wireflows exist for few-page, deeply-dynamic apps, so the spine needs depth (→ horizontal),
while matrix is the better *orientation* artifact for aligning stakeholders and reading the owner
paths. They're complementary, not either/or — when unsure, generate both from the same spec
(`--layout horizontal` and `--layout matrix`). If the product is shallow with many parallel journeys
and the goal is comparison, matrix alone can be the primary.

## How it maps to the spec
- Set board-level `"layout": "horizontal"` or `"matrix"` (or pass `--layout` to override).
- **Shared lanes matter in matrix:** define board-level `"lanes"` so every journey uses the *same*
  owner rows in the *same* order — that's what makes the across-a-row reading work. In horizontal,
  each journey may use only the lanes it touches.
- Everything else in the spec is identical between the two — nodes keep `col` (progression) and
  `lane` (owner); the engine places them per orientation.
- In matrix, keep node `text` short (nodes are smaller) and prefer fewer `col` steps per journey so
  columns don't get too wide; push depth into the horizontal version of the spine.
