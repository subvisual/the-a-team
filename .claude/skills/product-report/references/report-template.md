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
its headline quoted exactly. References: [context.md](context.md) for the
framing and glossary terms used.>

## Jobs it serves

<Active jobs by id, verbatim headlines, one line each — each id linking to
its file ([[01]] → [jtbd/01-<slug>.md](jtbd/01-<slug>.md)). Parked jobs
listed separately as parked — visible, not smoothed away.>

## Scope — the epics (MoSCoW)

<Every epic, one row each. The report indexes epics, never restates them.
References: the epic files under [epics/](epics/); requirement detail lives
in the run PRD(s) — link the relevant `../features/<slug>/prd.md`.>

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
research-plan.md assumption or decision that covers each deviation).
References: the run's [issues.md](../features/<slug>/issues.md) for what was
built as what, code paths for the evidence.>

## How it works

<The built shape in one block: stack, entry points, data model, how it runs.
From the code, at the altitude a PM or newcomer needs — not an architecture
doc. References: [spec.md](../features/<slug>/spec.md) and
[design.md](../features/<slug>/design.md) for the intended shape, the target
README for run instructions.>

## Success measures

<The metrics/probes the PRD and plans committed to, and what is observable
now vs still unmeasured. Unmeasured stays visible as unmeasured. References:
the run PRD's measurement plan, [ateam-plan.md](ateam-plan.md) decision
criteria.>

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

## Supporting documentation

<The gathered index — every final artifact this report rests on, one line
each: repo-relative link · what the reader finds there. Durable layer first,
then each run's feature artifacts grouped by run slug, oldest first (the
first group is the v0 run). Links are relative to this file's home,
docs/product/.>

Durable:

- [context.md](context.md) — framing, digest, source index, glossary, ledger
- [jtbd/](jtbd/) — the jobs, one file per id (active + parked)
- [epics/](epics/) — the epics, one file per id
- [ateam-plan.md](ateam-plan.md) — the plan built for the A-Team agents (to reach v0)
- [research-plan.md](research-plan.md) — open questions, assumptions, technical research
- [project-plan.md](project-plan.md) — the plan for the project after v0 (forward-looking).
  Omit this row when the file does not exist — a standalone report refreshed
  before any pr phase has none, and every row here must resolve.

Run `<feature-slug>` (v0):

- [prd.md](../features/<slug>/prd.md) — the run's feature-level PRD
- [briefs/](../features/<slug>/briefs/) — wireflow + page cards
- [design.md](../features/<slug>/design.md) · [spec.md](../features/<slug>/spec.md) — design direction + dev-facing spec
- [issues.md](../features/<slug>/issues.md) — the decomposed and built backlog
```

Rules that bind every writer of this file:

- **The code is the ground truth for verdicts.** An issue marked complete, a
  green suite, or a confident artifact is not shipped-evidence; the built
  behavior is.
- **Index, never restate.** Epic content lives in `epics/`, unknowns in
  `research-plan.md`, requirements in the run PRDs. This file cites ids and
  states verdicts.
- **Every section links the artifacts it draws on**, and `## Supporting
  documentation` gathers them all — a reader can reach any final artifact
  from this file in one hop. Every link is relative to `docs/product/` and
  resolves on disk.
- **Refresh keeps history.** Prior runs' content that still holds stays; the
  decision log and `runs:` only grow; superseded scope points forward instead
  of vanishing.
