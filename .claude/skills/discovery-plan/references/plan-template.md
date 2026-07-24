# PLAN.md template — the research plan

`docs/product/PLAN.md` is the research document that **ships with the v0**: what
we still don't know, what the agents assumed and how confident they were, and
the technical research behind the build (services, stack, integration costs).
It is a durable artifact — update-only, read-back before every write, never
silently rebuilt.

```markdown
---
updated: <YYYY-MM-DD>
evidence: [research/2026-07-24-onboarding]   # synthesis runs this plan stands on
---

# Plan: <project / feature area>

## Objective

What decision(s) this plan needs to enable, and what the v0 must prove.

## Evidence spine

Cited, not duplicated: the research/ runs this plan stands on, each with a
one-line verdict summary (which jobs stand on solid ground, which need work).
Full themes/contradictions live in the research files.

## Jobs

JTBD ids + verbatim headlines only. A job that is unclear, contested, or newly
suggested is `TBD` with a routing note — resolving it via jobs-to-be-done is
itself a discovery activity. Never derive a job here.

## Open questions

What ships unresolved with the v0 — the ledger's surviving unknowns, including
questions raised by challenges/refinement verdicts. Each tagged with what it
would change if answered.

## Assumptions

Every assumption the agents (or humans) are building on, one line each:
the assumption · confidence (strong / moderate / directional / hypothesis) ·
what would disprove it · the cheapest probe. Later phases append here — the
plan stays live as design and dev surface new assumptions.

## Technical research

Services, tech stack, and integrations: the options considered, what each
costs (money, effort, risk), and what was chosen or still open. This is the
"cost breakdown of every integration the client mentioned" — the genuinely
useful, non-obvious output.

## Research activities

Question → activity → owner (human or agent) → date.

## Initiatives & decision criteria

The go/no-go structure: initiatives with their gates, and the criteria that
decide them.

## Deliverables

What must exist to reach v0.
```
