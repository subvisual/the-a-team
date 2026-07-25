# research-plan.md template — the research plan

`docs/product/research-plan.md` is the research document that **ships together
with the v0 final outputs**: what we still don't know, what the agents (and
humans) assumed and how confident they were, and the technical research behind
the build. It is the honest disclosure that makes a v0 trustworthy. Goals and
deliverables are NOT here — they live in `ateam-plan.md` (see
`references/plan-template.md`). The two are written together by the
discovery-plan skill so they cannot drift.

Durable artifact: update-only, read-back before every write, kept live as
later phases surface new assumptions.

```markdown
---
updated: <YYYY-MM-DD>
evidence: [research/2026-07-24-onboarding]   # synthesis runs this plan stands on
---

# Research plan: <project / feature area>

## Evidence spine

Cited, not duplicated: the research/ runs this plan stands on, each with a
one-line verdict summary (which jobs stand on solid ground, which need work).

## Open questions

What ships unresolved with the v0 — the ledger's surviving unknowns, including
questions raised by challenges/refinement verdicts. Each tagged with what it
would change if answered. A still-open **blocking** unknown is stated loudly at
the top, never buried mid-list.

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

Question → activity → owner (human or agent) → date. The work of closing the
unknowns above; its outcomes land back in research/ runs and flip ledger
entries to Know.
```
