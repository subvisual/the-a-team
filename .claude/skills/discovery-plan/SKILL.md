---
name: discovery-plan
description: Use when a problem space still has unvalidated assumptions and open questions blocking confident scope or build decisions — e.g. research-synthesis produced job verdicts, contradictions, or gaps needing targeted follow-up; the context.md ledger holds surviving unknowns that must become a plan; or a team needs goals, deliverables, research activities, and go/no-go criteria before writing a PRD. Compiles the ledger + evidence into TWO durable artifacts in one pass: docs/product/PLAN.md (the product team's plan — goals and deliverables to reach v0) and docs/product/research-plan.md (the research plan that ships with the v0 — open questions, agent assumptions + confidence, technical research: services, stack, integration costs). Re-run it at any phase to keep both live. Do not use when requirements are validated and delivery is underway (prd-writer), to synthesize raw research (research-synthesis first), or to create or rewrite job statements (jobs-to-be-done).
metadata:
  version: 0.3.0
  owner: Alvaro Bezerra
  provenance: ported 2026-07-24 from product-craft discovery-plan (github.com/ABZerra/product-craft) and adapted to the A-Team contract — output split into PLAN.md (goals & deliverables) and research-plan.md (the research plan shipped with v0), written together.
---

# discovery-plan

Turn what discovery learned — and did not learn — into the two durable planning
artifacts, compiled together in one pass so they cannot drift:

- **`docs/product/PLAN.md` — the product team's plan.** Goals (each traced to
  the jobs it serves) and the deliverables to reach v0, grouped into
  initiatives with owners and dates, gated by decision criteria. This is how
  the product team understands where the work is going.
- **`docs/product/research-plan.md` — the research plan.** The document that
  ships together with the v0 final outputs: **open questions** (what the v0
  was built without knowing), **assumptions + confidence** (everything agents
  and humans assumed, what would disprove each, the cheapest probe), and
  **technical research** (services, stack, and the cost breakdown of every
  integration in play).

The split line: *what we'll do* goes in PLAN.md; *what we don't know, assumed,
or researched* goes in research-plan.md. The same compile step writes both —
a deliverable that closes an unknown appears in PLAN.md as work and in
research-plan.md as the question it closes.

This is the bridge from evidence into definition (`prd-writer`, `wireflow`,
`page-brief`) — and the reason stopping discovery loses nothing: every
non-blocking unknown lands in the research plan instead of dying in a chat.
This skill **consumes** finished jobs and synthesis; it never mints or rewrites
jobs (`jobs-to-be-done`) and never synthesizes raw evidence
(`research-synthesis` first).

## Where it writes

`<target>/docs/product/PLAN.md` + `<target>/docs/product/research-plan.md` —
repo-first-and-always; a Cowork folder is a valid target, never a blocker.
Durable rules apply to both: **update-only** (refresh what changed, keep what
holds — a rebuild that drops content is a forbidden overwrite), mandatory
**read-back** before writing, one commit per run naming what changed
(`docs(plan): compliance unknown resolved; 2 new dev-phase assumptions`).

**Both plans stay live.** Re-run this skill at any phase — after a brainstorm
adds ledger entries, after a synthesis lands verdicts, after design or dev
surface new assumptions — and it folds the new material into both files.
Keeping them current downstream is the PM's standing duty; this skill is how
it's done.

## Inputs

- `docs/product/context.md` — the Know/Don't-Know ledger is the primary feed:
  surviving unknowns become open questions; ledger assumptions carry their
  confidence in.
- `docs/product/research/` — synthesis runs; cite them as the evidence spine
  (verdicts included), never duplicate their content.
- `docs/product/jtbd/` — active jobs, ids + verbatim headlines. Suggested new
  jobs must pass through `jobs-to-be-done` before entering either plan; the
  plans hold proper job statements or an explicit `TBD`, nothing in between.
- The current problem statement, constraints, stakeholder goals, timelines.
- Connectors (Notion, Granola, Slack, ops API) if available — pulled material
  the plans lean on is staged verbatim into `input/<date>-<source>-pulled/`
  per the contract. Never block on a connector.

## Outputs

- `PLAN.md` in the shape of `references/plan-template.md`: Goals (job-traced) ·
  Deliverables to reach v0 · Initiatives (owner, date) · Decision criteria ·
  Status.
- `research-plan.md` in the shape of `references/research-plan-template.md`:
  Evidence spine (cited) · Open questions · Assumptions (confidence + disproof
  + cheapest probe) · Technical research (services, stack, integration costs) ·
  Research activities (owner, date).
- The closing handoff: **Next likely skill(s)** · **What to pass forward** ·
  **Suggested next prompts**.

## Workflow

1. **Load the ledger and the evidence.** Read `context.md` (ledger first),
   the `research/` runs, and the active jobs. If raw evidence is still
   unsynthesized, stop and route to `research-synthesis` — a plan built on
   un-digested mess plans the wrong unknowns.
2. **Evidence spine first** (research-plan side). Cite the synthesis runs and
   summarize each verdict in a line — which jobs stand solid, which need
   discovery work.
3. **Fix the job framing.** Ids + verbatim headlines. Challenged/refinement
   verdicts and new-job signals route through `jobs-to-be-done`; unresolved
   jobs enter as `TBD` with resolving them listed as a research activity.
4. **Split the ledger.** Surviving unknowns → research-plan **open questions**
   (each tagged with what changes if answered; a still-open blocking unknown
   is stated loudly at the top). Ledger and brainstorm assumptions →
   research-plan **assumptions**, each with confidence, disproof, cheapest
   probe. Never let an assumption hide inside polished prose.
5. **Technical research** (research-plan side). Services, stack, and every
   integration in play: options considered, cost (money, effort, risk),
   chosen or open. Unanswerable API questions become research activities.
6. **Goals and deliverables** (PLAN side). Goals traced to jobs; the
   deliverables that must exist to reach v0 — including resolution
   deliverables that close research-plan questions. Group into initiatives
   with owners (human or agent) and dates; define the decision criteria that
   gate them.
7. **Cross-check the pair.** Every research activity has a home in an
   initiative or is explicitly deferred; every resolution deliverable points
   at its question. The two files must read as one plan split by audience.
8. **Read-back, write, commit.** Present both drafts (or diffs, on refresh)
   for correction; write; update `updated:`/`evidence:` frontmatter; commit.
9. **Hand off.** Unknowns reduced enough to define scope → `wireflow` (map
   validated journeys) → `page-brief` (per-screen requirements) →
   `prd-writer`; page-light features go straight to `prd-writer`. Pass
   forward the problem statement, jobs, validated assumptions, and open
   questions.

## No human present

The read-back gate needs a human. With nobody present, deliver both drafts in
your report only, write nothing durable, and state that the run awaits review.
Never commit an unreviewed research plan — it ships with the v0 as the honest
record; an unreviewed one is neither.

## Examples

- Input: `examples/example-input.md` · Output: `examples/example-output.md`
