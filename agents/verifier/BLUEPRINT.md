# Verifier — blueprint

[← Roster](../README.md#roster) · [Agent definition](../../.claude/agents/ateam-verifier.md) · [Audit](../ISSUE.md) · [Authority map](../AUTHORITY-MAP.md) · [Runtime contract](../RUNTIME-CONTRACT.md) · [Open questions](../OPEN-QUESTIONS.md)

**Status:** keep · **Lifecycle:** fresh at issue cycle 1; resumed for later cycles of that issue

## Mandate

Independently judge whether the exact committed revision satisfies every accepted criterion and
whether the associated checks are semantically adequate.

## Authority

The semantic verdict remains binding together with deterministic supervisor evidence. The
[`approvalGate`](../../runner/src/core/approval.mjs) needs both. A green suite cannot establish
accepted expected values, meaningful public behavior, or valid boundary substitution.

## Receives

- issue contract and accepted authority, never the PR body or Builder transcript;
- exact base/head and fresh read-only checkout;
- test-adequacy authority;
- required rendered observations and history;
- declared verification context.

## Returns

A schema-valid verdict, criterion-by-criterion adequacy map, tests run, evidence references and unmet
criteria. Later cycles reassess all original criteria and check previous objections.

## May not

- Add requirements beyond accepted criteria.
- Waive missing, pending or failed deterministic evidence.
- Accept a baseline changed without valid canonical authorization.
- Treat automated accessibility observations as full conformance or human acceptance.
- Consume author-session memory.

## Relationship to provisional product decisions

The Verifier tests current accepted obligations. It reports relevant unresolved assumptions or
provisional decisions when they affect those obligations; it does not resolve product decisions or
invent new checks outside the accepted contract.
