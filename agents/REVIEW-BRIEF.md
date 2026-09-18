# Independent review brief

[← Packet index](README.md) · [Audit](ISSUE.md) · [Authority map](AUTHORITY-MAP.md) · [Runtime contract](RUNTIME-CONTRACT.md) · [Open questions](OPEN-QUESTIONS.md)

Review the proposed agent architecture for `subvisual/the-a-team` at baseline `fa16af2`.

Start with [ISSUE.md](ISSUE.md). Inspect the repository contracts and runner code directly before
accepting its factual claims. Use the linked authority map, runtime contract, skill integration,
open questions, seat blueprints, and matching `.claude/agents/` definitions relevant to your
critique.

## Review objective

Determine whether the proposal safely moves role judgment from phase-shaped conductors into explicit
agent seats while preserving deterministic orchestration, artifact authority, independent semantic
verification, evidence discipline, refinement and recovery.

Do not review model branding or choose fills unless a finding depends on a demonstrated capability.
Do not propose runner integration yet; review the prepared agent definitions as part of the packet.

## Required checks

1. Verify findings `A1`–`A9` against [`PLAN.md`](../PLAN.md),
   [`CONTRACT.md`](../CONTRACT.md), [`SKILLS.md`](../SKILLS.md), the relevant skills, and
   [`runner/`](../runner/).
2. Look for duplicated authority, impossible phase ordering, hidden nested-agent requirements,
   weakened approval, missing lifecycle/cancellation behavior, or artifact ownership conflicts.
3. Check that #62's iteration entry, decision records, conflicts, assumption evidence and open-
   question propagation survive the design.
4. Challenge whether PM is the correct first vertical slice and whether the proposed pilot isolates
   agent ownership from session persistence.
5. Identify the smallest change that would falsify or validate each disputed claim.
6. Compare every reviewed blueprint with its linked agent definition. Flag mandate drift, excessive
   tools, accidental authority, missing refusal grounds, copied skill logic, or implicit persistence.

## Response format

```markdown
## Verdict
accept | revise | reject | test

## Findings
- [A<n> · blocking|major|minor] Claim
  - Evidence: exact file/path/line or runtime behavior
  - Consequence: what fails if unchanged
  - Disposition: concrete correction or minimal test

## Missing finding
- New issue not covered by A1–A9, with evidence

## Pilot recommendation
- Arms:
- Measures:
- Stop/go rule:

## Confidence
high | medium | low — reason
```

Silence is not agreement. If a concern is a preference rather than a repository conflict, label it
`test` and name the comparison that would settle it.
