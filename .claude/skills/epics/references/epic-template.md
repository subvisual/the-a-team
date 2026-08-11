# Epic template — docs/product/epics/NN-<slug>.md

Epics are **durable**: they outlive any one feature run, are cited by feature
artifacts, and follow the same lifecycle rules as jobs — ids are forever,
reshaped epics are superseded (never deleted), and nothing is written without
human review in the same session.

```markdown
---
id: 01
slug: assisted-triage
status: active            # active | done | superseded | parked
owner: <human or agent — or TBD>
jobs: [01]                # JTBD ids this epic serves
features: [assisted-triage-v0]   # feature slugs realizing parts of this epic
milestone: 7              # GitHub milestone number — WRITTEN BY THE ISSUES PHASE.
                          # Omit until it exists; never author or edit it by hand.
                          # PRESERVE IT ON EVERY REVISE — dropping it makes the
                          # next run duplicate the milestone in GitHub.
---

# Epic: <title>

## Summary

One paragraph: the epic's objective, the user/business outcome, and why it
exists now.

## Objective and success signal

- Objective: <clear outcome statement>
- Success signal: <metric + target, or TBD>

## Jobs served

- [[01-<slug>]] — "<verbatim headline>"

Prefer validated upstream jobs and keep their language; unclear or unvalidated
→ `TBD`, routed to jobs-to-be-done. More than one distinct primary job → split
the epic or name the primary explicitly.

## Initiatives

Outcome-oriented, ordered by how directly each unlocks the jobs served —
dependency-constrained ordering made visible. Optional time windows, never
mandatory dates.

- Initiative: <description> (window: <period, optional>)

## Requirements realized

Per contributing feature, the requirement IDs from its prd.md this epic
bundles: `assisted-triage-v0: R1–R3`.

## Dependencies

- <dependency — epic, capability, external>

## Prioritization

- Approach: MoSCoW (default when shaping scope) | 2x2 (impact-vs-effort data
  exists) | Eisenhower | RICE — state the choice and the rationale.
- Priority: <e.g. Must Have · high impact / medium effort>

## Open questions

Kept visible; genuinely open ones mirror into the context.md ledger.

## Related

supersedes [[epic:NN-<slug>]] · related [[epic:NN-<slug>]]

(Citation syntax, per CONTRACT.md: bare `[[NN]]`/`[[NN-slug]]` always cites a
job; epics carry the `epic:` prefix everywhere — including here.)
```
