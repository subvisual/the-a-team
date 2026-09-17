# Agent runtime contract

[← Packet index](README.md) · [Audit](ISSUE.md) · [Authority map](AUTHORITY-MAP.md) · [Skill integration](SKILL-REVISIONS.md) · [Open questions](OPEN-QUESTIONS.md)

The prepared [Claude Code agent definitions](../.claude/agents/) make each mandate manually
inspectable and invocable. They are host manifests, not a substitute for the supervisor manifest
below. No new seat should enter the automated pipeline until the supervisor enforces every field.

## Seat manifest

```yaml
schemaVersion: 1
seat: pm
mandate: discovery-and-definition
lifecycle:
  start: phase
  resume: same-feature-allowed
  stop: phase-complete-or-escalated
skills:
  conduct: [ateam-discovery, ateam-definition]
  compose: [jobs-to-be-done, project-context, research-synthesis, discovery-plan, prd-writer, epics, wireflow, page-brief]
policy:
  role: pm
  tools: []
  read: []
  write: []
inputs:
  schema: pm-input-v1
outputs:
  schema: pm-output-v1
reviewer: definition-reviewer
```

This is illustrative, not an adopted filename or schema.

## Required semantics

| Field | Requirement |
|---|---|
| Mandate | The outcome owned and explicit non-goals |
| Lifecycle | Fresh/resumable policy, valid resume key, termination and cancellation |
| Skills | Conductors versus craft composed; no copied skill bodies |
| Tools | Exact allowed tools and external connectors |
| Read scope | Canonical artifacts and revision selectors |
| Write scope | Exact artifact classes; supervisor rejects escape |
| Inputs | Versioned, bounded, revision-bound schema |
| Outputs | Versioned result, artifacts, deviations, obligations, evidence pointers |
| Refusal | Typed escalation/block result, never a prose-only hang |
| Review | Independent reviewer identity and when it is required |
| Fan-out | Requests returned to supervisor; no nested spawn |
| Accounting | Duration, cost, model/fill, usage and attempt identity retained |

## Process and session lifecycle

- The supervisor launches every model process behind the existing isolation boundary or an equally
  tested role policy.
- A “persistent” seat means resumable model session state, not an immortal OS process.
- Resume keys bind seat, feature, consumed revisions and prior output. Changed authority may force a
  fresh session.
- Cancellation, timeout and crash recovery leave an immutable attempt record and never imply phase
  completion.
- Session state is never passed to an independent reviewer.

## Handoff envelope

Every successful seat result should contain:

```json
{
  "schemaVersion": 1,
  "seat": "pm",
  "feature": "<slug>",
  "consumed": [{"artifact": "<path>", "revision": "<digest>"}],
  "produced": [{"artifact": "<path>", "revision": "<digest>"}],
  "deviations": [],
  "openObligations": [],
  "evidence": [],
  "requestedDispatches": [],
  "status": "complete"
}
```

Typed alternatives to `complete`: `escalated`, `blocked`, `interrupted`. The supervisor validates
actual files and evidence; the envelope cannot self-certify them.

## Security and independence

- Extend sandbox roles explicitly; do not run PM/Designer/Lead through executor permissions by
  naming convention.
- External text remains untrusted input.
- Reviewer source and scratch remain isolated from author sessions.
- Provider diversity is optional configuration until a pilot demonstrates value.
- No role receives publishing, merging or deployment authority merely because it is persistent.
