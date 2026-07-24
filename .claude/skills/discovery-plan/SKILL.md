---
name: discovery-plan
description: Use when a problem space still has unvalidated assumptions and open questions blocking confident scope or build decisions — e.g. research-synthesis produced job verdicts, contradictions, or gaps needing targeted follow-up; the context.md ledger holds surviving unknowns that must become a plan; or a team needs structured research activities, risks, and go/no-go criteria before writing a PRD. Produces docs/product/PLAN.md — the research plan that ships with the v0: open questions, agent assumptions + confidence, technical research (services, stack, integration costs). Re-run it at any phase to keep the plan live. Do not use when requirements are validated and delivery is underway (prd-writer), to synthesize raw research (research-synthesis first), or to create or rewrite job statements (jobs-to-be-done).
metadata:
  version: 0.2.0
  owner: Alvaro Bezerra
  provenance: ported 2026-07-24 from product-craft discovery-plan (github.com/ABZerra/product-craft) and adapted to the A-Team contract — output is the durable PLAN.md research document that ships with v0.
---

# discovery-plan

Turn what discovery learned — and did not learn — into the **research plan**:
`docs/product/PLAN.md`, the durable document that ships alongside the v0
prototype. It states, honestly and in one place:

1. **Open questions** — what the v0 was built without knowing.
2. **Assumptions + confidence** — everything the agents (and humans) assumed,
   how confident, and what would disprove each.
3. **Technical research** — services, tech stack, integrations: options,
   costs, and choices. For a client brief that names integrations, the cost
   breakdown of every one of them is the genuinely useful, non-obvious output.

This is the bridge from evidence into definition (`prd-writer`, `wireflow`,
`page-brief`) — and the reason stopping discovery loses nothing: every
non-blocking unknown lands here as a deliverable instead of dying in a chat.

This skill **consumes** finished jobs and synthesis; it never mints or rewrites
jobs (`jobs-to-be-done`) and never synthesizes raw evidence
(`research-synthesis` first).

## Where it writes

`<target>/docs/product/PLAN.md` — repo-first-and-always; a Cowork folder is a
valid target, never a blocker. Durable rules apply: **update-only** (refresh
what changed, keep what holds — a rebuild that drops content is a forbidden
overwrite), mandatory **read-back** before writing, one commit per run with a
message naming what changed (`docs(plan): compliance unknown resolved; 2 new
dev-phase assumptions`).

**The plan stays live.** Re-run this skill at any phase — after a brainstorm
adds ledger entries, after a synthesis lands verdicts, after design or dev
surface new assumptions — and it folds the new material in. Keeping PLAN.md
current downstream is the PM's standing duty; this skill is how it's done.

## Inputs

- `docs/product/context.md` — the Know/Don't-Know ledger is the primary feed:
  surviving unknowns become open questions; ledger assumptions carry their
  confidence in.
- `docs/product/research/` — synthesis runs; cite them as the evidence spine
  (verdicts included), never duplicate their content.
- `docs/product/jtbd/` — active jobs, ids + verbatim headlines. Suggested new
  jobs must pass through `jobs-to-be-done` before entering the plan; the plan
  holds proper job statements or an explicit `TBD`, nothing in between.
- The current problem statement, constraints, stakeholder goals, timelines.
- Connectors (Notion, Granola, Slack, ops API) if available — pulled material
  the plan leans on is staged verbatim into `input/<date>-<source>-pulled/`
  per the contract. Never block on a connector.

## Outputs

`PLAN.md` in the template shape (`references/plan-template.md`): Objective ·
Evidence spine (cited) · Jobs · Open questions · Assumptions (each with
confidence + disproof + cheapest probe) · Technical research (services, stack,
integration costs) · Research activities (owner — human or agent — and date) ·
Initiatives & decision criteria · Deliverables. Plus the closing handoff:
**Next likely skill(s)** · **What to pass forward** · **Suggested next
prompts**.

## Workflow

1. **Load the ledger and the evidence.** Read `context.md` (ledger first),
   the `research/` runs, and the active jobs. If raw evidence is still
   unsynthesized, stop and route to `research-synthesis` — a plan built on
   un-digested mess plans the wrong unknowns.
2. **Evidence spine first.** Cite the synthesis runs and summarize each
   verdict in a line — which jobs stand solid, which need discovery work. The
   plan's credibility is its explicit evidence basis.
3. **Fix the job framing.** Ids + verbatim headlines. Challenged/refinement
   verdicts and new-job signals route through `jobs-to-be-done`; unresolved
   jobs enter as `TBD` with resolving them listed as a discovery activity.
4. **Open questions.** Pull the ledger's surviving unknowns and any questions
   the verdicts raised. Tag each with what changes if it's answered. Blocking
   unknowns should already be resolved or escalated — if one is still open,
   say so loudly; don't bury it mid-list.
5. **Assumptions.** Everything agents and humans are building on — from the
   ledger, the brainstorm captures, and your own reading — each with
   confidence (strong / moderate / directional / hypothesis), what would
   disprove it, and the cheapest probe. Never let an assumption hide inside
   polished prose.
6. **Technical research.** Services, stack, and every integration in play:
   options considered, cost (money, effort, risk), chosen or open. API
   research questions that can't be answered yet become research activities.
7. **Activities, initiatives, criteria.** Map questions to research
   activities with owners (human or agent) and dates; define initiatives and
   the go/no-go criteria that gate them.
8. **Read-back, write, commit.** Present the drafted plan (or diff, on a
   refresh) for correction; write; update `updated:`/`evidence:` frontmatter;
   commit.
9. **Hand off.** Unknowns reduced enough to define scope → `wireflow` (map
   validated journeys) → `page-brief` (per-screen requirements) →
   `prd-writer`; page-light features go straight to `prd-writer`. Pass
   forward the problem statement, jobs, validated assumptions, and open
   questions.

## No human present

The read-back gate needs a human. With nobody present, deliver the drafted
plan in your report only, write nothing durable, and state that the run awaits
review. Never commit an unreviewed plan — it ships with the v0 as the honest
record; an unreviewed one is neither.

## Examples

- Input: `examples/example-input.md` · Output: `examples/example-output.md`
