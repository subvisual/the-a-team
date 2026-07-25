---
name: ticket-writer
description: Use when concrete requirements, bug reports, maintenance needs, or research questions must become structured, implementation-ready delivery tickets; when a larger source (a PRD, spec, epic, or scoped request) needs splitting into multiple cohesive tickets; or when a ticket, story, or issues.md entry already exists and needs testable Gherkin acceptance criteria pasted straight in. In the A-Team pipeline, tickets are for agents and enter via the dev boundary: the issues phase runs this skill's AC-only mode over prd-to-issues' issues.md to enrich every issue's acceptance criteria before issue-swarm starts. Do not use for writing a full PRD (prd-writer), for planning discovery (discovery-plan), for structuring epics (epics), or for creating or rewriting Jobs to be Done (jobs-to-be-done).
metadata:
  version: 0.2.0
  owner: Alvaro Bezerra
  provenance: ported 2026-07-24 from product-craft ticket-writer (github.com/ABZerra/product-craft) and adapted to the A-Team contract — AC-enricher role in the issues phase, durable job/epic ids, agent-consumable output.
---

# ticket-writer

Produce implementation-ready delivery output: a single ticket, a batch of
tickets decomposed from a larger source, or a pasteable acceptance-criteria
block for a ticket that already exists. Every mode embeds **Gherkin checklist
acceptance criteria**, because criteria a tester — or an implementing agent —
can't verify are the main reason work bounces back.

In the A-Team, **tickets are written for agents first**: the reader who picks
one up cold is usually `issue-worker` inside a swarm, with no conversation
context. Implementation-ready means *agent*-ready — explicit scope, explicit
ACs, explicit dependencies, nothing implied.

## Place in the A-Team pipeline — the AC enricher

The issues phase stays two-step, each skill owning its altitude:

1. `prd-to-issues` decomposes prd.md + spec.md into `issues.md` (tracer-bullet
   slices, dependency order).
2. **This skill's AC-only mode runs over every issue in `issues.md`**,
   upgrading each `### Acceptance criteria` checklist to Gherkin — sourced
   from the PRD's requirement-level ACs (R-ids), the spec's per-state
   expectations, and the constraints behind known edge cases — and stamping
   each issue with the `[[NN]]` job it rolls up to. The enriched file is what
   `issue-swarm` consumes.

Enrichment **edits `issues.md` in place** (per-feature artifact — overwrite
cleanly, keep prd-to-issues' structure and dependency graph untouched; never
add, remove, or reorder issues in this pass — decomposition gaps are reported,
not silently fixed).

## Modes

- **Mode 1 — single ticket**: one concrete request in, one
  implementation-ready ticket out.
- **Mode 2 — batch decomposition**: a larger source (PRD, spec, epic, scoped
  request) in, multiple cohesive tickets out with explicit sibling
  dependencies. (In-pipeline, decomposition belongs to `prd-to-issues`; batch
  mode serves standalone use and non-feature work.)
- **Mode 3 — AC-only**: an existing ticket/story/issue in, a pasteable Gherkin
  acceptance-criteria block out. This is the pipeline mode.

## When NOT to use

- A full PRD (`prd-writer`) · discovery planning (`discovery-plan`) · epic
  structuring (`epics`) · defining or sharpening the underlying job
  (`jobs-to-be-done` first, then return).
- Inputs too vague to define a concrete, verifiable ticket — say so and list
  what's missing rather than padding a template.

## Inputs

- Source material: requirements, bug reports, maintenance or research scopes —
  or, for mode 3, the existing ticket/story/issues.md text.
- The context layer when in a target repo: `docs/product/jtbd/` (jobs by id,
  verbatim), `epics/` (the epic a ticket belongs to), the feature's `prd.md`
  (requirement ACs to refine — never copied verbatim) and `spec.md`
  (component states, edge cases).
- Constraints, dependencies, known risks, edge-case notes.
- Optional preferences: owner, priority, component, estimate, due date.
- Connectors (Notion, Figma, Granola, Slack, ops API) if available — material
  a ticket leans on is staged verbatim into `input/<date>-<source>-pulled/`
  per contract. Never block on a connector.

## Workflow

1. **Pick the mode** (above). Mode 3 → skip to step 6.
2. **Determine ticket type** (`feature`, `bug`, `chore`, `spike`) from the
   primary outcome. Templates: `references/ticket_feature_template.md`,
   `ticket_bug_template.md`, `ticket_chore_template.md`. Spikes follow the
   feature shape with research-outcome framing — the Story states the question,
   Scope carries the timebox, and the definition of done is the decision the
   spike enables, not code shipped.
3. **Anchor one primary job per ticket.** `[[NN]]` id + verbatim headline from
   `docs/product/jtbd/` (or upstream text standalone). Unknown or ambiguous →
   `JTBD: TBD`, route to `jobs-to-be-done`; never derive a job inline. A
   ticket solving multiple distinct jobs gets split or its primary named —
   mixed jobs are how scope creep hides in a "single" ticket.
4. **Draft sections in template order**, ACs as checklist items with explicit
   `Given …, when …, then …` phrasing. Dependencies and blockers in their
   dedicated section, never buried in prose.
5. **Batch mode specifics**: one primary outcome and one primary job per
   ticket; sibling dependencies explicit ("blocks" / "depends on"); batch
   ordered so the dependency chain is obvious. Note the epic each ticket
   belongs to (`[[epic NN]]`) when epics exist. Continue to step 7.
6. **AC-only mode** (`references/acceptance_criteria_template.md`): parse the
   source into the primary job (preserved, or `TBD`), discrete user outcomes,
   and failure paths. State preconditions; tie edge cases to the constraints
   behind them — edge cases invented without a constraint are noise. Refine
   the PRD's requirement-level ACs downward into per-ticket Gherkin; never
   copy them verbatim (two levels, no duplication). The finished block must
   drop into an `## Acceptance Criteria` / `### Acceptance criteria` section
   without editing. **Pipeline batch**: run this per issue across `issues.md`,
   preserving structure and dependency graph; report decomposition gaps
   instead of fixing them silently.
7. **Quality pass, all modes**: every criterion specific, observable,
   testable — strip "fast", "properly", "works correctly" for observable
   behavior. Each ticket agent-ready: someone (or something) with zero
   conversation context could pick it up and start.
8. **Close with the handoff**: `Next likely skill(s)` (`jobs-to-be-done` for
   TBD jobs · `epics` when a batch needs structuring · `prd-writer` if
   decomposition exposed a definition gap) · `What to pass forward` ·
   `Suggested next prompts`. In-pipeline: report enrichment stats (issues
   touched, ACs upgraded, gaps flagged) back to the orchestrator.

## No human present

Modes 1–2 with missing facts: draft with explicit `TBD`s and list the blocking
questions — never invent owners, estimates, or constraints. Mode 3 in-pipeline
is autonomous by design: it derives ACs from artifacts the human already
gated (PRD, spec); when those don't support a testable criterion, flag the
issue in the report rather than writing an untestable one.

## References & examples

- `references/ticket_feature_template.md` · `ticket_bug_template.md` ·
  `ticket_chore_template.md` — the ticket shapes.
- `references/acceptance_criteria_template.md` — the pasteable AC block.
- `examples/example-input.md` · `examples/example-output.md`.
