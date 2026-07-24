# Example Output: docs/product/PLAN.md

```markdown
---
updated: 2026-07-24
evidence: [research/2026-07-20-triage-trust]
---

# Plan: AI-assisted ticket triage

## Objective

Decide whether to proceed with AI-assisted triage to a Q3 pilot. The v0 must
prove that auditable priority guidance fits the support team's real queue flow.

## Evidence spine

- `research/2026-07-20-triage-trust` — job 01 **supports**: the triage struggle
  is confirmed; auditability shapes the solution, not the job. Open
  contradiction: newer agents want automation, experienced agents want override
  control first.

## Jobs

- [[01-focus-on-urgent-cases]] — "When support teams triage a new queue of
  incoming tickets, I want reliable priority guidance, so I can focus attention
  on the most urgent cases without re-sorting everything manually."

## Open questions

- Can we reach ≥85% priority-classification precision on our ticket mix?
  (Answers whether the pilot is viable at all.)
- What PII controls are mandatory for model inputs and logs? (Blocks vendor
  choice and data flow design.)
- Does assisted triage actually improve handling time? (Decides the pilot's
  success metric.)

## Assumptions

- Newer agents adopt assisted triage faster than experienced agents —
  confidence: **directional** (one synthesis run, segment-split evidence) ·
  disproved by pilot usage split · probe: usability interviews across both
  segments.
- Auditable rationale is the trust unlock, not raw accuracy — confidence:
  **moderate** (converging interview theme) · disproved if agents ignore
  rationale UI in prototype tests · probe: clickable-prototype interviews.

## Technical research

- Classification: in-house model vs API (per-ticket cost, latency, PII
  exposure) — **open**; offline evaluation decides.
- Ticket-data compliance path: anonymization service vs on-prem inference —
  cost/effort/risk table owed after legal review — **open**.

## Research activities

- Offline evaluation on anonymized historical tickets → precision question
  (owner: dev agent, week 1).
- Compliance review with legal/security → PII question (owner: Ops, week 1).
- Agent usability interviews with the clickable v0 → trust + handling-time
  questions (owner: PM + UX, week 2).

## Initiatives & decision criteria

- Baseline model evaluation complete → gate: ≥85% precision.
- Compliance constraints approved → gate: legal sign-off on data flow.
- Pilot go/no-go → criteria: precision + auditability thresholds met without
  violating compliance constraints.

## Deliverables

- Pilot recommendation with evidence summary and open compliance blockers.
```

## Next likely skill(s)

- `wireflow` — map the validated triage journey into flows, then `page-brief`
  each screen; `prd-writer` after.

## What to pass forward

- Objective, job 01, the two assumptions with confidence, open compliance
  questions, target pilot timing.

## Suggested next prompts

- "Map the assisted-triage journey as a wireflow."
- "Create a feature-level PRD from this plan."
