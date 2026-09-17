# Open questions

[← Packet index](README.md) · [Audit](ISSUE.md) · [Authority map](AUTHORITY-MAP.md) · [Runtime contract](RUNTIME-CONTRACT.md) · [Skill integration](SKILL-REVISIONS.md)

Only unresolved questions whose answers could change adoption or runtime design belong here.
Resolved questions are removed—not struck through—and their disposition moves to
[`ISSUE.md`](ISSUE.md#proposal-disposition) or the canonical authority from
[`AUTHORITY-MAP.md`](AUTHORITY-MAP.md).

The audit already settles the comparison arms, first seat, binding-verifier rule, authority model,
and publication sequence. They are intentionally absent below.

## Blocking the PM pilot

| ID | Open question | Why unresolved | Evidence that closes it |
|---|---|---|---|
| Q1 | Which existing target/input becomes the fixed pilot fixture? | Arms are comparable only against identical source material, target revision and human answers. | Named fixture, immutable source revisions, and reuse authorization |
| Q2 | Who grades the outputs, and what score constitutes a go? | The dimensions are known; accountable graders and thresholds are not. | Versioned rubric, named graders, reconciliation rule, and numeric stop/go threshold |
| Q3 | How many repetitions are required? | One run cannot distinguish architecture effect from model variance. | Variance rule tied to the existing evaluation schema and a fixed trial count |
| Q4 | What supervisor-enforced sandbox and read/write policy does the PM seat receive? | The candidate agent declares host tools, but current native policies cover executor/reviewer roles and do not constrain PM artifact writes or connectors. | Reviewed supervisor role policy, exact path/connector boundaries, and boundary tests before automated dispatch |

## Runtime architecture

| ID | Open question | Why unresolved | Evidence that closes it |
|---|---|---|---|
| Q5 | Does a Lead seat earn its cost? | The deterministic supervisor already dispatches routine transitions; no recurring exception set has been demonstrated. | Classified exception corpus showing measurable benefit over direct supervisor routing |
| Q6 | Which authority changes invalidate a resumed seat session? | Stale memory can survive changed decisions, jobs, context selection, gate revisions or tool policy. | Explicit invalidation matrix with recovery tests |
| Q7 | What is the typed supervisor protocol for specialist fan-out? | PM needs dev-research and evidence-digest siblings without nested agent spawning. | Versioned request/result schemas, limits, cancellation and retained evidence behavior |
| Q8 | Do cold definition/design reviewers improve the gates? | Independence is plausible; detection gain and revision churn are unmeasured. | Matched findings, false-positive rate, human acceptance rate and added cost/time |
| Q9 | Is a second semantic review worth piloting for disputes? | Current approval remains binding and human escalation is safe; adjudicator value is unknown. | Comparative dispute set showing correction rate without evidence or authority bypass |

## Separate experiments

| ID | Open question | Why unresolved | Evidence that closes it |
|---|---|---|---|
| Q10 | What, if anything, should replace lofi at the design gate? | The proposed running app does not exist at that phase. | Comparison of current lofi, cheaper interactive artifact and explicit implementation-first topology |
| Q11 | Does cross-provider review outperform same-provider review? | Diversity is plausible but unsupported by comparative results. | Same cases, equivalent capability tier, repeated blinded scoring |
| Q12 | Does Builder session persistence help? | Current executor revisions are fresh; continuity benefit and anchoring cost are unknown. | Fresh-versus-resumed revision trials under the same verifier contract |
| Q13 | When is parallel issue execution safe and worthwhile? | Current serialization protects dependency ancestry and file collisions. | Planner proof of independence plus latency gain without integration regressions |

## Governance

| ID | Open question | Why unresolved | Evidence that closes it |
|---|---|---|---|
| Q14 | Who maintains each seat mandate as team policy? | Skill provenance records authorship, not runtime roster governance. | Named maintainers and an accepted change/review rule for agent manifests |
