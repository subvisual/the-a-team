# ateam-plan.md template — the plan built for the A-Team agents

`docs/product/ateam-plan.md` is the **plan the A-Team works from**: what we are
trying to achieve and what must exist to reach v0 — goals and deliverables the
agents run against, readable by anyone in the repo. It is not a project plan,
and not the research plan — open questions, assumptions, and technical
research live in `research-plan.md` (see
`references/research-plan-template.md`). The two are written together by the
discovery-plan skill so they cannot drift.

Durable artifact: update-only, read-back before every write, never silently
rebuilt.

```markdown
---
updated: <YYYY-MM-DD>
evidence: [research/2026-07-24-onboarding]   # synthesis runs this plan stands on
---

# Plan: <project / feature area>

## Goals

What we are trying to achieve, and for whom. Each goal traces to the job(s) it
serves — `[[NN-<slug>]]` with verbatim headlines. A goal that traces to no job
is a solution looking for a problem: flag it, don't bury it.

## Deliverables to reach v0

What must exist for the v0 to be real, one line each: the deliverable · why it
matters · what it unblocks. Includes artifact deliverables (prototype, PRD,
briefs) and resolution deliverables ("compliance answer on ticket data" — the
work of closing an unknown, tracked as a question in research-plan.md).

## Initiatives

The deliverables grouped into workstreams, ordered by what most directly
unlocks the jobs first — if the ordering differs from job logic, say why.
Owner (human or agent) and target date per initiative.

## Decision criteria

The go/no-go gates the humans steering the A-Team decide by: initiative → gate → criterion.

## Status

One honest paragraph: where we are against this plan, updated each run.
```
