# Example Output: the two plans, written together

## docs/product/PLAN.md

```markdown
---
updated: 2026-07-24
evidence: [research/2026-07-20-triage-trust]
---

# Plan: AI-assisted ticket triage

## Goals

- Prove that auditable priority guidance fits the support team's real queue
  flow — serves [[01-focus-on-urgent-cases]] ("When support teams triage a new
  queue of incoming tickets, I want reliable priority guidance, so I can focus
  attention on the most urgent cases without re-sorting everything manually.")
- Reach a defensible Q3 pilot go/no-go decision.

## Deliverables to reach v0

- Clickable triage v0 with rationale UI · demonstrates the auditability bet ·
  unblocks agent usability interviews.
- Offline model evaluation on anonymized historical tickets · resolves the
  precision question (research-plan) · unblocks the pilot gate.
- Compliance answer on model-bound ticket data · resolves the PII question
  (research-plan) · unblocks vendor choice.
- Pilot recommendation with evidence summary.

## Initiatives

1. Baseline model evaluation — owner: dev agent, week 1.
2. Compliance review — owner: Ops, week 1.
3. Prototype + agent interviews — owner: PM + UX, week 2.

## Decision criteria

- Pilot go/no-go: precision + auditability thresholds met without violating
  compliance constraints.

## Status

Discovery complete; evaluation and compliance review not started.
```

## docs/product/research-plan.md

```markdown
---
updated: 2026-07-24
evidence: [research/2026-07-20-triage-trust]
---

# Research plan: AI-assisted ticket triage

## Evidence spine

- `research/2026-07-20-triage-trust` — job 01 **supports**: the triage struggle
  is confirmed; auditability shapes the solution, not the job. Open
  contradiction: newer agents want automation, experienced agents want
  override control first.

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

- Precision question → offline evaluation on anonymized historical tickets →
  dev agent → week 1.
- PII question → compliance review with legal/security → Ops → week 1.
- Trust + handling-time questions → agent interviews with the clickable v0 →
  PM + UX → week 2.
```

## Next likely skill(s)

- `wireflow` — map the validated triage journey into flows, then `page-brief`
  each screen; `prd-writer` after.

## What to pass forward

- Goals, job 01, the two assumptions with confidence, open compliance
  questions, target pilot timing.

## Suggested next prompts

- "Map the assisted-triage journey as a wireflow."
- "Create a feature-level PRD from these plans."
