# ADR template — the canonical shape

One file per decision at `docs/product/adr/NN-<slug>.md`. Durable: the same
lifecycle rules as `jtbd/` and `epics/` — ids resolve forever, a wrong decision
is superseded rather than deleted, nothing lands without human review in the
same session.

Cited elsewhere as `[[adr:NN]]` (bare `[[NN]]` always means a job, per
CONTRACT.md's citation convention).

```markdown
---
id: 02
slug: monorepo-with-contract-surface
status: active            # active | superseded | parked
confidence: moderate      # strong | moderate | directional | hypothesis
decided: 2026-08-27
decided_by: human         # human | agent
sources: [2026-08-27-grill-digest, dev-research]
---

# 02. One monorepo, with the contract surface beside the app

## Status

active — ratified by the human at the 2026-08-27 grill.
<!-- when superseded: `superseded by [[adr:07]]` — and 07 says `supersedes [[adr:02]]` -->

## Context

The forces that made this a decision rather than a default. What the target repo
already binds. Which `dev-research` finding this rests on, and what that finding
was rated. Which jobs turn on it: [[03]], [[05]].

State the constraint honestly, including the one that argues against the choice.

## Decision

What we will do. Active voice, present tense, one paragraph. A reader who stops
here should be able to act.

## Alternatives considered

- **<option>** — why dropped. The real reason, not the polite one.
- **<option>** — why dropped.

At least one. A decision with no alternative is a preference wearing a
decision's clothes.

## Consequences

What gets easier. What gets harder. What this forecloses, and how expensive
reopening it would be. For a `seed of production` run: which part of this is a
v0 shortcut that becomes a migration later.

## Revisit when

The signal that reopens this — a number, an event, a job changing shape. Mirror
anything genuinely open into `research-plan.md` as an open question.

An ADR with no revisit trigger is a tombstone.
```

## Load-bearing

- **The headline is the decision, not the topic.** "02. Stack" says nothing;
  "02. One monorepo, with the contract surface beside the app" is auditable at a
  glance. Same discipline as the JTBD headline rule.
- **`decided_by` is honest.** `human` means they actually said yes, not that a
  recommendation was presented and nobody objected. Presented-but-unanswered is
  `status: parked`.
- **`confidence` uses the shared vocabulary** — the same four levels as jobs and
  dev-research findings, so a reader calibrates once across the whole context
  layer.
- **`sources` must resolve.** A grill-ratified decision cites the staged grill
  digest batch, exactly as jobs do.
- **Alternatives are the artifact's value.** In six months the question is never
  "what did we pick" — the code answers that. It is "what did we already rule
  out, and why". That is the breadcrumb.
