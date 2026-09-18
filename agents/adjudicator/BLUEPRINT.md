# Adjudicator — blueprint

[← Roster](../README.md#roster) · [Agent definition](../../.claude/agents/ateam-adjudicator.md) · [Audit](../ISSUE.md) · [Authority map](../AUTHORITY-MAP.md) · [Runtime contract](../RUNTIME-CONTRACT.md) · [Open questions](../OPEN-QUESTIONS.md)

**Status:** experimental · **Lifecycle:** fresh, only for a typed semantic-review dispute

## Mandate

Provide a second independent semantic assessment of an implementation dispute after deterministic
evidence is complete. It is not a general decision maker and does not reopen product or architecture
decisions.

## Preconditions

- Exact issue, base, head, accepted criteria and authority are pinned.
- Required deterministic evidence passed.
- The dispute is named criterion-by-criterion.
- No missing product decision, requirement or human authorization is being disguised as review.

## Returns

A complete second semantic review under the same adequacy contract, plus its disagreement with the
first review. It does not return a bare tie-break vote.

## May not

- Override missing, pending or failed evidence.
- Waive an unmet criterion.
- Change acceptance authority or baseline.
- Resolve demand-side, design or architecture decisions.
- Approve by provider rank or “one rung above” alone.

## Default disposition

Until an explicit approval policy and comparative pilot exist, adjudication escalates the two
reviews to the authorized human/operator. Cross-provider selection remains a testable fill policy,
not part of the seat mandate.
