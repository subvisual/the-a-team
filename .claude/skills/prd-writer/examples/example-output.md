# Example Output: docs/features/assisted-triage-v0/prd.md (abridged)

```markdown
# PRD: Assisted triage v0

## Summary

Support agents re-sort every incoming queue by hand. We add priority guidance
with an auditable rationale per ticket, so agents focus on urgent cases while
keeping override control. Expected impact: shorter time-to-first-urgent-touch
without trust loss.

## Metadata

- Status: Draft
- Last updated: 2026-07-24
- Feature: docs/features/assisted-triage-v0/ · Plans: docs/product/PLAN.md,
  docs/product/research-plan.md
- Jobs in scope: [[01-focus-on-urgent-cases]]

## Problem definition

- **User problem**: triaging a fresh queue means manually re-sorting
  everything; urgent cases wait behind the sort.
- **Evidence snapshot**: research/2026-07-20-triage-trust (job 01 supported;
  override-control contradiction) · research-plan.md assumption "auditable
  rationale is the trust unlock" (moderate).
- **Constraints**: no ticket PII may leave approved processing (open question
  in research-plan.md — mirrored below). **Guardrail**: no regression in
  mis-priority complaints.

## Jobs and journey

### Jobs in scope

- [[01-focus-on-urgent-cases]] — "When support teams triage a new queue of
  incoming tickets, I want reliable priority guidance, so I can focus
  attention on the most urgent cases without re-sorting everything manually."

### User stories (grouped by job)

#### [[01-focus-on-urgent-cases]]

- As an agent opening the morning queue, I want tickets pre-ranked by urgency
  so that I start on the most urgent case within seconds.
- As an agent reviewing a ranked ticket, I want the rationale behind its
  priority so that I can trust or overrule it deliberately.
- As an agent who disagrees with a ranking, I want a one-step override so that
  the queue reflects my judgment. (Edge: override during an active refresh.)
- As an agent with an empty or tiny queue, I want ranking to stay out of the
  way so that the feature costs nothing when there's nothing to sort.

## Goals, non-goals, and scope

- Goals: prove auditable guidance fits real queue flow; enable pilot go/no-go.
- Non-goals: auto-actioning tickets; SLA management.
- MoSCoW: **Must** ranked queue `[[01]]` · rationale per ticket `[[01]]` ·
  one-step override `[[01]]`; **Should** override audit trail `[[01]]`;
  **Could** segment-tuned defaults `[[01]]`; **Won't (this time)**
  auto-escalation.

## Requirements and acceptance

| Req ID | Requirement | MoSCoW | Traces to | Acceptance criteria |
| --- | --- | --- | --- | --- |
| R1 | Queue renders ranked by predicted urgency | Must | [[01]] | Given a queue of ≥20 mixed tickets, the view opens ranked with the top item's urgency ≥ any item below it |
| R2 | Every ranked ticket shows its rationale | Must | [[01]] | Given any ranked ticket, opening it reveals the factors behind its priority in plain language |
| R3 | Agent can override a ranking in one step | Must | [[01]] | Given a ranked ticket, a single action re-positions it and the queue persists the override |

## Open questions

- PII controls for model inputs — owner: Ops (mirrored in research-plan.md).

## Decision log

| Date | Decision | Rationale | Impacted req(s) |
| 2026-07-24 | Rationale ships in v0, not post-pilot | trust-unlock assumption is the bet being tested | R2 |
```

## Next likely skill(s)

- `epics` (structure delivery) · `ticket-writer` (decomposition + ticket-level
  Gherkin) · design phase consumes this PRD at its floor.

## What to pass forward

- R1–R3 with ACs, job 01, override contradiction, PII open question.
