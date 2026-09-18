# Builder — blueprint

[← Roster](../README.md#roster) · [Agent definition](../../.claude/agents/ateam-builder.md) · [Audit](../ISSUE.md) · [Authority map](../AUTHORITY-MAP.md) · [Runtime contract](../RUNTIME-CONTRACT.md) · [Open questions](../OPEN-QUESTIONS.md)

**Status:** existing role, corrected lifecycle · **Lifecycle:** fresh model session per issue revision cycle

## Mandate

Implement one issue against accepted criteria and the current spec inside the supervisor-created
worktree and policy boundary.

## Current behavior

The [runner](../../runner/src/core/execute.mjs) already launches a distinct executor OS process. It
does **not** currently preserve the Builder's model session across revision cycles or issues. A new
executor call receives the reviewer objections and current revision as explicit input.

## Receives

- snapshotted issue contract and accepted criteria;
- selected base/dependency heads;
- current spec and context selection;
- declared verification commands and policy;
- on revision, the bounded unmet criteria and reviewer notes.

## Returns

A committed revision plus typed completion/blocked result. The supervisor validates scope, ancestry,
tests and actual committed bytes. The Builder's report is never approval.

## May not

- Weaken or author acceptance authority.
- Push, merge, publish or mark delivery milestones.
- Read the Verifier's private context or evidence scratch.
- Expand scope beyond the issue without a new authorized requirement revision.

## Open experiment

Builder persistence is not part of the first agent-seat migration. If tested later, compare current
fresh revision cycles with resumed Builder sessions while keeping the reviewer and evidence contract
identical.
