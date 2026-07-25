# ateam-product-report.md template — the PRD for the product

`docs/product/ateam-product-report.md` is the **product-level PRD**: what the
product is, the jobs it serves, its scope at epic granularity, and how much of
it is real — grounded in code. It is not the feature-level `prd.md` (one run's
requirement-granular scope) and not a status update: it is the standing
document a newcomer reads first.

Durable artifact: update-only, never silently rebuilt; citations by id, epic
detail stays in the epic files.

```markdown
---
product: <name>                  # the durable docs-layer name — context.md's `project:`;
                                 #   a differing shipped brand is noted in prose, never here
updated: <YYYY-MM-DD>
runs: [<feature-slug>, ...]      # every run folded into this report, oldest first
---

# Product report: <name>

## What this product is

<One tight paragraph — what exists, for whom, why it matters. Present tense:
describe the built product, not the ambition. Cite the core job by id with
its headline quoted exactly.>

## Jobs it serves

<Active jobs by id, verbatim headlines, one line each. Parked jobs listed
separately as parked — visible, not smoothed away.>

## Scope — the epics (MoSCoW)

<Every epic, one row each. The report indexes epics, never restates them.>

| Epic | MoSCoW | Jobs | Verdict | Evidence |
| --- | --- | --- | --- | --- |
| [[epic:01-<slug>]] | Must | [[01]] | shipped | <path or behavior> |
| [[epic:02-<slug>]] | Should | [[01]] | partial — <gap named> | <path> |
| [[epic:03-<slug>]] | Could | [[04]] | not shipped | — |

<Verdicts come from the code: shipped = code evidences every bundled
requirement; partial = some real, gap named in the row; not shipped =
nothing real yet. Artifact claims the code contradicts are reported as the
code has it, citing the artifact contradicted. An epic the epics skill gave
mixed classes rows its primary class with the exceptions named in the cell —
e.g. "Must (edit rides as Should)".>

## What actually shipped

<Per shipped/partial epic: 2–4 lines of built reality — what a user can do
now, where it lives in the code, deviations from the plan and why (cite the
research-plan.md assumption or decision that covers each deviation).>

## How it works

<The built shape in one block: stack, entry points, data model, how it runs.
From the code, at the altitude a PM or newcomer needs — not an architecture
doc.>

## Success measures

<The metrics/probes the PRD and plans committed to, and what is observable
now vs still unmeasured. Unmeasured stays visible as unmeasured.>

## Open items

<Pointers into research-plan.md — the open questions and assumptions that
survive this run. Never fork or restate them; name the ones that gate the
next run.>

## Decision log

| Date | Decision | Rationale | Where decided |
| --- | --- | --- | --- |
<Product-level decisions only, append-only across runs. Sources: run PRD
decision logs, gate outcomes, and config/test-bar changes committed during
the run (cite the commit). Where decided names that source.>
```

Rules that bind every writer of this file:

- **The code is the ground truth for verdicts.** An issue marked complete, a
  green suite, or a confident artifact is not shipped-evidence; the built
  behavior is.
- **Index, never restate.** Epic content lives in `epics/`, unknowns in
  `research-plan.md`, requirements in the run PRDs. This file cites ids and
  states verdicts.
- **Refresh keeps history.** Prior runs' content that still holds stays; the
  decision log and `runs:` only grow; superseded scope points forward instead
  of vanishing.
