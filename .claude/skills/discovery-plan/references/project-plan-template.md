# project-plan.md template — docs/product/project-plan.md

The plan for the **project after v0** — what the human team picks up when the
A-Team hands over. Written only at the pr phase's plan refresh, once a v0
actually exists.

Three plans, three horizons — keep them apart:

| File | Horizon | Audience |
|---|---|---|
| `ateam-plan.md` | the plan to **reach** v0 | the A-Team agents |
| `research-plan.md` | the disclosure shipping **with** v0 | whoever inherits the unknowns |
| `project-plan.md` | what happens **after** v0 | the human team |

And distinct from `ateam-product-report.md`, which is backward-looking and
code-grounded. This file is forward-looking and necessarily speculative; mixing
the two is how the report loses its authority.

```markdown
---
project: <name>
updated: <YYYY-MM-DD>
v0_run: <feature slug the v0 came out of>
---

# Project plan: <project name>

## Where the v0 leaves us

<Two or three sentences, grounded in what actually shipped. On a **first v0
run** ateam-product-report.md does not exist yet — the plan refresh runs before
it — so ground this in issues.md statuses and the integrated feature branch. On
a **refresh**, cite the report instead; it is code-grounded and better sourced.
Either way: what a user can do today; what they cannot yet.>

## What comes next

<Ordered, outcome-first. Each item cites the epic it continues ([[epic:NN]]) or
the job it serves ([[NN]]). Epics parked or unshipped in the v0 appear here with
why they were deferred — a deferral with no reason reads as an oversight.>

| # | Outcome | Traces to | Why now / why not yet |
| --- | --- | --- | --- |
| 1 | <outcome> | [[epic:NN]] · [[NN]] | <...> |

## What the open questions imply

<The forward-looking read of research-plan.md — not a copy of it. Which open
questions block which next step, and which assumptions would be expensive to
discover wrong late. Point into research-plan.md; never fork it.>

## Known debt from the v0

<What was built fast on purpose: mocked integrations, skipped tests, provisional
data models. Each with the cost of leaving it. The v0's honest shape, so nobody
inherits a surprise.>

## Not planned

<Explicitly out. An unstated boundary becomes an invented one.>
```

Load-bearing:

- **Only written when a v0 exists.** Mid-run there is nothing to plan past, and
  a project plan compiled from intentions is fiction — the same rule that keeps
  `product-report` at the end of the run.
- **Cites, never restates.** Epics, jobs, the product report, and the research
  plan all stay authoritative in their own files. This plan is the forward view
  across them.
- **Durable rules apply**: update-only, read-back before writing, supersede
  rather than delete, one commit naming what changed.
- **Speculation is labelled as such.** This file is allowed to be uncertain —
  it is the only one of the three that looks past evidence. Say which items are
  firm and which are a guess.
