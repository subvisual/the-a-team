# Lead — blueprint

[← Roster](../README.md#roster) · [Agent definition](../../.claude/agents/ateam-lead.md) · [Audit](../ISSUE.md) · [Authority map](../AUTHORITY-MAP.md) · [Runtime contract](../RUNTIME-CONTRACT.md) · [Open questions](../OPEN-QUESTIONS.md)

**Status:** deferred · **Lifecycle under test:** fresh or resumable on exceptions

## Mandate

Synthesize bounded seat outputs when the deterministic supervisor cannot select a routine next action
without judgment. Recommend; never mutate state or create a parallel authority.

## Receives

- current `feature.json` status projection from [`feature-cli.mjs`](../../runner/src/feature-cli.mjs);
- relevant canonical decisions, ADRs, assumptions and obligations;
- revision-bound seat handoffs;
- the typed exception requiring judgment.

## Returns

A proposed next action, rationale, rejected alternatives, authority destination, affected checks and
unresolved objections. The supervisor validates and records any accepted result through the authority
map. Routine state-machine transitions do not require a Lead call.

## May not

- Advance phases, approve gates, publish, merge or deploy.
- Own a universal decision ledger.
- Decide PM, design, architecture or verification craft.
- Turn an open demand-side question into a default.
- Treat session memory as cross-phase evidence.

## Why deferred

The current state machine already dispatches normal work. A pilot must first identify recurring
exceptions where Lead synthesis improves outcomes enough to justify another model call and context.
