# Review criteria — grading an existing wireflow

Use in REVIEW mode. These are the method decisions from `method-decisions.md` turned into checks.
Be specific and honest: name what's wrong, tie it to the check, and give the fix. A wireflow that
passes all of these is sound; most real ones fail 3–5, and that's the value of the review.

For each check: state **pass / partial / fail**, cite the evidence you can see, and give the fix.

## The checks

1. **Is it actually a wireflow?** It should sit *between* journeys and wireframes — page/state nodes
   + flow, not full UI and not an abstract flowchart. *Fail signals:* nodes are detailed wireframes
   (buttons, fields) → it's a wireframe set; or nodes are generic boxes with no sense of pages/states
   → it's a flowchart. *Fix:* raise/lower granularity to "one node = one page, page-state, or system step".

2. **Actor-anchored, cross-cutting journeys.** Each flow follows a real actor end-to-end and may cross
   epics — not one-flow-per-feature. *Fail:* flows named after features/epics ("Notifications flow").
   *Fix:* reorganize around actor journeys; weave cross-cutting concerns into the journeys they serve.

3. **A clear spine.** One journey carries the core JTBD and goes deeper than the rest. *Fail:* uniform
   shallow depth everywhere, or depth scattered with no focal journey. *Fix:* pick the spine, deepen it.

4. **Consistent node taxonomy + legible system boundary.** A fixed vocabulary (own screen / external
   site / external product / system / decision / agent / start / outcome / stop), and you can *see*
   build-vs-external-vs-backend from shape/colour. *Fail:* one box style for everything; can't tell
   what's built vs external. *Fix:* apply the type palette.

5. **Lanes = owners.** Swimlanes encode who owns each step. *Fail:* lanes are stages/phases, or there
   are no lanes. *Fix:* make lanes owners; shape/colour carries type. Cross-lane arrows should be
   tinted with the destination lane's colour (same-lane arrows gray) — the engine does this
   automatically; *fail:* every arrow is gray (stale engine) or the tint doesn't match the lane it
   lands in.

6. **Locked cuts shown as Stop nodes.** Deliberate non-paths (deferred/again-not-now decisions) are
   visible, not silently omitted. *Fail:* cuts are invisible, so the board can't answer "why not X?".
   *Fix:* add Stop nodes with the reason on the incoming edge.

7. **Coverage without labels.** Every requirement/initiative is *embodied* by a node/branch, but there
   are no initiative IDs, MoSCoW tags, or roadmap metadata on the flows. *Fail:* the board is annotated
   with initiative labels / priorities (clutter), OR requirements are missing (gaps). *Fix:* remove
   labels; add nodes for anything unembodied; prove coverage with the JTBD × Journey matrix.

8. **JTBDs anchored.** Each journey names actor + JTBD, with Start = the struggle and Outcome = the
   job done; a JTBD × Journey matrix exists. *Fail:* no jobs visible; starts/ends are generic.
   *Fix:* add the headers and the matrix.

9. **Depth inline, not split.** Detail is folded into the same journey band, not parked in a separate
   "L2" diagram. *Fail:* a detached detail diagram the reader has to jump to. *Fix:* inline it as a
   screen-detail cluster on the spine.

10. **Orientation fits the content.** Horizontal for a deep deliverable; matrix for a shared overview.
    *Fail:* a deep spine crammed into narrow matrix columns, or many parallel shallow journeys drawn as
    a long stack of horizontals when a matrix would compare them better. *Fix:* switch orientation (see
    `orientation.md`); consider producing both.

11. **Backend present but not dominant.** System nodes + decisions punctuate the screen-journey; the
    board hasn't become a data-flow diagram. *Fail:* backend boxes/arrows dominate and the human path
    is lost. *Fix:* demote backend to punctuation between screens.

## Output shape (what to hand back)
- **Verdict** — one line: sound wireflow or not, and the single biggest issue.
- **Strengths** — 2–4 bullets of what works.
- **Findings** — ordered by impact; each = check # + the problem you saw + the fix.
- **Fastest wins** — the 2–3 highest-leverage changes.
- Then offer to apply the fixes by switching to CREATE mode.
