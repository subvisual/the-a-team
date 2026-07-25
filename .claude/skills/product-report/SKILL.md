---
name: product-report
description: Use when an A-Team run's pr phase reaches its report step — dev integrated, plans/config refreshed, PR not yet open — or when a human asks for the product-level PRD after the fact ("what is this product now", "refresh the product report"). Compiles the durable docs/product/ateam-product-report.md — the PRD for the product: product framing, the epics on the MoSCoW scope with shipped-status, grounded in the run's artifacts AND the final v0 code, never in intentions. Do not use for the feature-level prd.md (prd-writer), to define or restructure epics (epics), or mid-run before dev has integrated — a report written from plans instead of code is fiction.
metadata:
  version: 0.1.0
  owner: Alvaro Bezerra
  provenance: authored 2026-07-25 from the output-feedback round — the "PRD for the product" Alvaro asked for after the F5 dry run, distinguished by name from the per-feature prd.md.
---

# product-report

Write the **PRD for the product** — `docs/product/ateam-product-report.md`,
the durable document that says what this product *is*, which jobs it serves,
what its scope is at **epic granularity** (the epics on the MoSCoW scope), and
what has **actually shipped** — reconciled against the built code, not the
plans.

The layer split this skill exists for:

- `docs/features/<slug>/prd.md` (**prd-writer**) is the *feature-level* PRD —
  one run's scope, requirement-granular, freely rewritten by its run.
- `docs/product/ateam-product-report.md` (**this skill**) is the
  *product-level* PRD — durable, epic-granular, refreshed at the end of every
  run. A reader who opens only this file learns what the product is, why, and
  how much of it is real.

It runs at the **end of a run** for a reason: only then can every claim be
checked against code. This skill collects the other agents' inputs by reading
what they wrote — the CONTRACT already forces each phase's decisions and
assumptions into artifacts — plus the final v0 code itself.

## Where it writes

`<target>/docs/product/ateam-product-report.md`, in the shape of
`references/report-template.md`. Durable rules apply in full: **update-only**
(refresh what changed, keep what still holds — a rebuild that drops content is
a forbidden overwrite), ids cited never restated, supersede never delete. One
commit: `docs(<slug>): product report`.

## Invocation modes

- **Pipeline** (normal): the orchestrator's pr phase invokes this after
  serialized integration + plan refresh + config refresh, **before the PR
  opens** — the report ships inside the PR and the final human review covers
  it. Write no manifest fields: the pr phase is harness-owned and the
  orchestrator keeps all state.
- **Standalone** (manifest-optional): a human invokes it directly to seed or
  refresh the report — e.g. after hand-made changes moved the product. Same
  document, same rules, same self-check. Durable-write review is carried by
  the human who invoked it reviewing the diff. Standalone touches no manifest
  or run state either — in **no mode** does this skill write anything but the
  report file.

## Inputs — read all of it, then the code

From `docs/product/` (durable): `context.md` (framing, glossary, source
index), `jtbd/` (active + parked jobs — ids and verbatim headlines),
`epics/NN-*.md` (every epic: MoSCoW class, jobs served, requirements
realized), `ateam-plan.md` (goals, deliverables, status),
`research-plan.md` post-refresh (open questions, assumptions + confidence —
including every phase-appended entry).

From `docs/features/<slug>/` (this run): `prd.md` (requirements, ACs, decision
log), `briefs/` (wireflow + page cards — inventory them; deep-read where a
verdict depends on a screen's obligations), `design.md`, `spec.md`,
`issues.md` (what was decomposed and its status), `feature.json` (run state).

**And the final v0 code — required, not optional.** Read the integrated
`feature/<slug>` tree: entry points, the real data model, what a user can
actually do, the test suite if one exists. The report's shipped-claims are
grounded here. An epic the artifacts call done but the code doesn't evidence
is reported as **partial**, with the gap named — never smoothed over.

## Workflow

1. **Read the durable layer first** (context → jobs → epics → plans), then the
   run's feature artifacts. Note every deviation the plans/research-plan
   recorded during the run.
2. **Read the code.** Walk the integrated feature branch: what exists, what
   runs, which requirements have visible implementation. Map each epic's
   "Requirements realized" to concrete evidence (file, behavior, or test).
3. **Reconcile.** Three verdicts per epic: **shipped** (code evidences it),
   **partial** (some requirements real, gap named), **not shipped** (nothing
   real yet). Where built reality contradicts an artifact, the report states
   the reality and cites the artifact it contradicts.
4. **Compile the scope table** — every epic, cited `[[epic:NN]]`, with its
   MoSCoW class, the jobs it serves (`[[NN]]`), verdict, and evidence pointer.
   Epic detail stays in the epic files; the report indexes, never restates.
5. **Draft or refresh** per the template. First write (no report on disk yet):
   seed every section; the refresh-preservation check below is N/A. On
   refresh: keep prior run content that still holds, fold in what changed,
   append the run to `runs:` in the frontmatter. The decision log only ever
   grows.
6. **Self-check before returning:**
   - every `[[epic:NN]]` and `[[NN]]` citation resolves to a file on disk;
   - every **shipped** verdict names its evidence (path or behavior);
   - no scope item exists that traces to no job;
   - open items point into `research-plan.md`, never fork it;
   - a refresh dropped nothing (diff the previous version to confirm; N/A on
     a first write).
7. **Commit** with the standard message. Pipeline mode: return a one-paragraph
   summary plus the blocking-flags list (unshipped Musts, contradictions
   found) for the orchestrator's gate report.

## What this skill never does

- Never mints, edits, or re-prioritizes an epic or a job — it reports them
  (`epics` / `jobs-to-be-done` own changes; a wrong epic found here is a
  blocking flag, not an edit).
- Never rewrites `prd.md` or any other phase's artifact.
- Never reports intentions as shipped. "The issue was marked complete" is not
  evidence; the code is.
