# PRD template — docs/features/<slug>/prd.md

The A-Team feature PRD. Every scoped item — story, requirement, Must — traces
to a JTBD id from `docs/product/jtbd/`. Presented at the definition gate
together with the jobs it scopes against.

```markdown
# PRD: <Title>

## Summary

One paragraph: the user problem, proposed solution direction, expected impact.

## Metadata

- Status: Draft | In Review | Approved | In Delivery | Shipped
- Last updated: <YYYY-MM-DD>
- Feature: docs/features/<slug>/ · Plans: docs/product/ateam-plan.md, docs/product/research-plan.md
- Jobs in scope: [[01-<slug>]], [[03-<slug>]]

## Business context and strategic fit

- Business goal(s): target metric + baseline (with source) + time horizon.
- Why now: what changed that makes this a priority.
- Expected impact: if we do <X> for <Y situation>, we expect <Z> because <reason>.

## Problem definition

- **User problem statement**: what they struggle to do today, in what context,
  what happens if they fail.
- **Evidence snapshot**: cited — research/ runs, input/ batches,
  research-plan.md assumptions leaned on. No uncited claims.
- **Constraints (hard)** and **guardrails (must not regress)**.

## Jobs and journey

### Jobs in scope (required)

Per job: `[[NN-<slug>]]` + the verbatim headline. Consume jobs as delivered —
missing or contested jobs are `TBD` routed to jobs-to-be-done; never minted or
reworded here.

### Journey (current → future)

- Scenario trigger:
- Current phases and pain points:
- Future phases and desired experience:

### User stories (grouped by job)

Under each job id, standard-format stories ordered by priority. The actor is a
situational role ("a support agent triaging the morning queue"), never a
demographic persona. Describe the need, not the UI widget; every story carries
a why; cover edge, error, and empty states; keep stories independent,
valuable, testable.

#### [[01-<slug>]]

- As a <situational role>, I want <capability> so that <benefit>.

## Research log and open questions

- Research completed: cited research/ runs and findings.
- Open questions: | Question | Why it matters | Answer or TBD | Owner | Due |
  Mirror unresolved ones into the context.md ledger / ateam-plan.md rather than
  letting the PRD fork its own list.

## Goals, non-goals, and scope

### Goals / Non-goals

Explicit non-goals — what this feature deliberately does not do.

### MoSCoW scope (all four, each item traced)

Keep Must lean — Must > ~60% of total scope means re-slice before delivery.
Every Must supports a job in scope.

- **Must** — <item> `[[01]]`
- **Should** — <item> `[[01]]`
- **Could** — <item> `[[03]]`
- **Won't (this time)** — <item>

## Requirements and acceptance

Requirements stay outcome-oriented. Each carries **requirement-level
acceptance criteria** — testable statements a reviewer or agent can check
("given a mis-filed contract, search by counterparty surfaces it in the top 3
results") — refined later into ticket-level Gherkin by ticket-writer, not
duplicated there.

| Req ID | Requirement | MoSCoW | Traces to | Acceptance criteria | Notes |
| --- | --- | --- | --- | --- | --- |
| R1 |  | Must | [[01]] |  |  |

## Dependencies and stakeholders

| Team/person or dependency | Needed for | When | Status / risk if missing |
| --- | --- | --- | --- |

## Success metrics and measurement plan

- Primary metric(s) · leading indicators · guardrail metrics.
- How we measure: instrumentation, dashboard, experiment, rollout comparison.

## Risks and mitigations

- Risk: <what can go wrong> — Mitigation: <how to reduce it>.

## Decision log

Significant decisions only — those that change scope, experience,
dependencies, or success definition. Append-only.

| Date | Decision | Rationale | Impacted req(s) |
| --- | --- | --- | --- |

## Rollout and initiatives

Ordered by what most directly unlocks the jobs first; if the ordering differs
from job logic, say why. Phasing, rollback triggers.
```
