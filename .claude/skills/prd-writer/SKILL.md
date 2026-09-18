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

## Acceptance obligation ledger

The PRD owns `docs/features/<slug>/acceptance.json` alongside `prd.md`.
Requirement-level criteria are durable obligations, each with a project-owned
`R-...` requirement ID, positive requirement `version`, and globally unique
`OBL-...` obligation ID. Keep IDs on revision or decomposition. Every obligation
survives in the PRD, spec, and issues coverage, including non-code acceptance.
Create separate obligations for automated behavior, rendered review, performance,
and human study; one passing test cannot discharge all four.

Canonical schema (a minimal single-obligation example; add one record for every
requirement-level criterion):

```json
{
  "schemaVersion": 1,
  "revision": 1,
  "requirements": [{
    "id": "R-ROUNDTRIP",
    "version": 1,
    "obligations": [{
      "id": "OBL-ROUNDTRIP-CODE",
      "statement": "Saved records are restored after reopening",
      "category": "engineering",
      "method": "automated",
      "requiredStage": "verification",
      "owner": { "role": "Engineering", "actor": null },
      "status": "pending",
      "evidence": []
    }]
  }],
  "artifacts": [
    { "path": "prd.md", "kind": "prd", "obligationIds": ["OBL-ROUNDTRIP-CODE"] },
    { "path": "spec.md", "kind": "spec", "obligationIds": ["OBL-ROUNDTRIP-CODE"] },
    { "path": "issues.md", "kind": "issues", "obligationIds": ["OBL-ROUNDTRIP-CODE"] }
  ]
}
```

- `category`: `product`, `design`, or `engineering`.
- `method`: `automated`, `rendered-review`, `human-study`,
  `performance-benchmark`, or `manual-review`.
- `requiredStage`: `discovery`, `definition`, `design`, `spec`, `issues`,
  `implementation`, `verification`, `human-acceptance`, `integration`,
  `release`, or `product-validation`. Select the actual decision stage:
  a later human study does not block an earlier prototype milestone.
  `dev` and `pr` are compatibility aliases for implementation and integration;
  opening a PR does not itself evidence integration.
- `owner`: named `actor`, accountable `role`, or both. Both may be null while
  unresolved; the validator exposes this and blocks the required stage until
  one resolves. Do not invent an owner to pass the gate.
- `status`: `pending`, `blocked`, `satisfied`, or `deferred`. Status is owned by
  this ledger; ticket completion does not update acceptance automatically.
- `evidence`: recorded entries with `reference`, `actor`, `method`, and current
  `requirementVersion`. A satisfied obligation requires at least one. References
  identify inspectable results; the validator checks declared provenance and
  versions, while reviewers inspect the referenced evidence. An agent must not
  author human-study evidence from a code check or self-certify a study.
- A deferred obligation includes `deferral: {actor, authorized: true, reference,
  rationale, consequence, nextDecisionStage}`. `reference` points to the actual
  authorized decision. Record an existing authorization; this schema is not
  permission to make one. The next decision stage must be in the future and is
  checked again when reached. Deferred work stays visible and is not accepted.

Performance obligations also carry `benchmark: {version, workload, units,
threshold: {operator, value}, method, scope}`. `version` is a positive integer;
`operator` is `<`, `<=`, `>`, `>=`, or `=` and `value` is numeric. Preserve the
workload, units, target threshold, measurement method, and scope exactly. Evidence
adds `benchmarkVersion`. A latency benchmark and a comparative usability study
are separate obligations with their own evidence; never silently substitute one.

Before any ledger update, preserve the old complete file as
`acceptance-history/<revision>.json`, then increment the ledger `revision`.
All historical revisions remain present. Changes to an obligation's statement,
category, method, stage, or benchmark require the next requirement `version` and
`decision: {actor, authorized: true, reference, rationale, consequence}` on that
requirement. Benchmark changes also increase `benchmark.version`. Do not reuse
old evidence, including relabelling an old result reference with new versions.
Reference provenance is checked across the full history; clearing evidence in an
intermediate revision does not permit reusing that result under newer versions.
Keep superseded results in history. No revision may silently drop a requirement
or obligation; retain its explicit evidence or authorized outstanding disposition.
Owner resolution and status/evidence updates preserve the requirement version.

Every declared Markdown artifact includes exactly one top-level
`acceptance-obligations` fenced JSON array. Each record copies `requirementId`,
`requirementVersion`, and the obligation's `id`, `statement`, `category`, `method`,
`requiredStage`, `owner`, and `benchmark` when present. Copy these definition
fields exactly; status, evidence, and deferrals remain canonical in the ledger.
This is structured lineage, alongside the artifact's human-readable criteria.
The helper `obligationSnapshot(requirement, obligation)` in
`runner/src/obligations.mjs` produces that record. Nested illustrative code fences
are not acceptance snapshots.

Declare each actual page brief in `artifacts` with `kind: "page-brief"` and its
applicable `obligationIds`. For `briefs/pages/board.json`, store the same array in
top-level `acceptanceObligations`; Markdown page briefs use the fence. Board
metadata must retain every page's qualitative criterion as a human obligation.
The issues artifact adds a disposition to every snapshot: a real ticket reference
or explicit outstanding work (see ticket-writer). An empty outstanding disposition
is not acceptance evidence or a deferral.

Validation from the A-Team checkout:

```sh
node runner/src/obligations-cli.mjs issues --feature /absolute/target/docs/features/<slug>
```

The read-only command validates actual PRD, spec, page briefs, and parsed tickets;
it automatically loads the immutable history. Historical drafts are checked for
schema, authorized revisions, and evidence provenance; completion, due ownership,
and deferral expiry are checked against the current ledger at the requested stage.
JSON output lists each obligation,
remaining pending/blocked/deferred work, unresolved owners, requirement acceptance,
and errors naming the obligation ID and missing or changed field. Exit `0` permits
this stage's advancement; exit `2` blocks it. Use `--stage verification` (or another
stage above) to evaluate the required acceptance at that stage. Future pending
work may permit advancement while the requirement remains `accepted: false`.

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

Invocation path must be declared. **Standalone/harness** may use its documented
clarifying exchange. **Agent mode** drafts from revision-bound inputs; missing
authority becomes a typed `escalated` return and existing ledger entry, never a
prompt or wait. This skill never spawns.

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
   ACs. Create or revise the canonical acceptance ledger and exact PRD snapshot
   using the schema above; retain every required validation method.
8. **Decision log** — significant decisions only; append-only (breadcrumb).
   A row that derives from a discovery decision record cites it as
   `[[dec:NN]]`; a row that would reverse one is not a log entry but a flag
   for the gate.
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
