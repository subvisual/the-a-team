# Example Input: prd-writer

Feature prompt (from `feature.json`): "Assisted triage v0 — priority guidance
with auditable rationale for the support queue."

Context layer state:

- `jtbd/01-focus-on-urgent-cases.md` (active, confidence: moderate) — "When
  support teams triage a new queue of incoming tickets, I want reliable
  priority guidance, so I can focus attention on the most urgent cases without
  re-sorting everything manually."
- `PLAN.md` — deliverable: "Clickable triage v0 with rationale UI"; decision
  criterion: pilot go/no-go on precision + auditability.
- `research-plan.md` — assumption: "auditable rationale is the trust unlock,
  not raw accuracy" (moderate); open question: PII controls for model inputs.
- `research/2026-07-20-triage-trust.md` — job 01 supported; contradiction:
  experienced agents want override control before automation.
