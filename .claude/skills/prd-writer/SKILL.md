---
name: prd-writer
description: Use when defining or refining a product feature document — a feature-level PRD aligning business context, scope, and success metrics across multiple tickets and stakeholders. Trigger on "write a PRD", "spec this feature", MoSCoW scoping, or turning discovery output (jobs, ateam-plan.md, research-plan.md, syntheses) into a delivery-ready definition. In the A-Team pipeline this is the definition phase's core artifact: docs/features/<slug>/prd.md, where every scoped item traces to a JTBD id. Do not use for a single ticket, bug fix, or minor tweak (ticket-writer); when the idea is too vague to commit to scope (discovery-plan first); or for a repo-level implementation plan feeding issue decomposition (the building plugin's write-a-prd owns the repo feature plan — this skill owns the product feature doc).
metadata:
  version: 0.2.0
  owner: Alvaro Bezerra
  provenance: ported 2026-07-24 from product-craft prd-writer (github.com/ABZerra/product-craft) and adapted to the A-Team contract — stories regrouped by job, requirement-level acceptance criteria added, full JTBD-id traceability.
---

# prd-writer

Create a feature-level PRD — the product feature doc that aligns business
context, jobs, user stories, MoSCoW scope, requirements with acceptance
criteria, and delivery decisions before ticket-level execution. In the A-Team
pipeline this is the definition phase's core artifact, presented at the human
gate **together with the JTBD set it scopes against** — a PRD's claims are only
checkable against the jobs they trace to.

This skill **consumes** jobs (`jobs-to-be-done` owns them), the product team's
plan (`ateam-plan.md`), the research plan (`research-plan.md`), syntheses
(`research/`), and — when the pages were already shaped — the `wireflow` +
`page-brief` catalog. It never mints or rewrites any of them.

## Where it writes

`<target>/docs/features/<slug>/prd.md` (template:
`references/prd_template.md`). Per-feature artifact — overwrite cleanly on
revision, never append duplicates. With a `feature.json` manifest present, read
`prompt` from it; without one (standalone), take the prompt from the invocation
and derive the slug the same way the orchestrator does. Commit per run:
`docs(<slug>): definition`.

## Traceability — the load-bearing adaptation

**Every scoped item traces to a JTBD id.** Stories are grouped by job (not by
persona — the A-Team works situations and struggles, not demographics; actors
in stories are situational roles like "a support agent triaging the morning
queue"). Every MoSCoW item and requirement carries its `[[NN]]` trace. An item
that traces to no job is either out of scope or evidence that a job is missing
— in which case: `TBD`, routed to `jobs-to-be-done`, and kept out of Must.

## Acceptance criteria — two levels, no duplication

The PRD carries **requirement-level acceptance criteria**: testable statements
a reviewer or downstream agent can check, one set per requirement. Ticket-level
Gherkin lives on tickets — `ticket-writer` refines PRD requirements into
per-ticket ACs later; do not write those here, and do not leave requirements
with vague "verification cues" either. If a requirement's AC cannot be stated
testably, the requirement isn't ready — say so in open questions.

## When to use / when not

Feature-level capability, multiple tickets or stakeholders expected, shared
decisions needed on goals/scope/metrics, discovery has landed. **Not** for: a
single ticket or tweak (`ticket-writer`), inputs too vague to commit to scope
(`discovery-plan`), or a codebase implementation plan (`building:write-a-prd`).
If the work is really one ticket, hand off instead of writing a thin PRD.

## Inputs

- The feature prompt (manifest or invocation).
- **The context layer, read before drafting**: `docs/product/context.md`
  (glossary — use its settled terms; ledger), `jtbd/` (active jobs in scope),
  `ateam-plan.md` (goals + deliverables the feature serves), `research-plan.md`
  (assumptions + confidence, open questions, technical research),
  `research/` (evidence). Build on what exists instead of re-asking.
- `briefs/` (wireflow + page briefs) when the definition phase already shaped
  pages — roll their job-tagged, per-page requirements up into feature scope;
  don't re-derive what they settled.
- Connectors (Notion, Figma, Granola, ops API) if available — anything the PRD
  leans on is staged verbatim into `input/<date>-<source>-pulled/` per
  contract. Never block on a connector.

## Workflow

1. **Confirm the trigger** (feature-level, not a ticket).
2. **Load the context layer** (above). Note which research-plan.md
   assumptions the PRD builds on — cite them, don't restate them as facts —
   and which ateam-plan.md deliverables this feature realizes.
3. **Question pass, honestly bounded.** Identify missing baseline/target,
   jobs in scope, constraints, ownership. With a human present, one focused
   clarifying round is fine. In the pipeline (draft + review mode), do not
   interrogate: draft with explicit `TBD`s and let the definition gate catch
   what matters — visible honesty beats invented answers.
4. **Draft in template order** — business context, problem definition with
   cited evidence, jobs in scope (ids + verbatim headlines), journey.
5. **Stories, grouped by job.** Under each `[[NN]]`: standard-format stories,
   situational actors, priority-ordered, edge/error/empty states covered,
   independent-valuable-testable. Watch the classic misses: vague, solution-
   prescriptive, benefit-free, internal tasks dressed as stories.
6. **MoSCoW, all four, every item traced.** Must lean (>~60% → re-slice);
   each Must supports a job in scope.
7. **Requirements + acceptance criteria.** Outcome-oriented requirements,
   each with its MoSCoW, its `[[NN]]` trace, and testable requirement-level
   ACs.
8. **Decision log** — significant decisions only; append-only (breadcrumb).
9. **Rollout** ordered by what unlocks the jobs first; explain divergences.
10. **Validate**: non-goals and Won't explicit, metrics measurable, every
    scoped item traced, open questions visible (mirrored to the ledger /
    research-plan.md, not forked into a PRD-only list).
11. **Hand off.** Next: `epics` (structure delivery), `ticket-writer`
    (decomposition + ticket-level ACs), and the design phase consumes the PRD
    at its floor. Pass forward requirement IDs, job ids, user outcomes,
    edge-case notes.

## No human present

Draft + review means the gate reviews you — but an unreviewable draft is a
failure. If blocking information is missing and nobody can answer, write the
draft with explicit `TBD`s where facts are owed, list the blocking questions
at the top under `## Open questions`, and report them. Never fill a `TBD` with
an invented fact to make the document look finished.

## Examples

- Input: `examples/example-input.md` · Output: `examples/example-output.md`
