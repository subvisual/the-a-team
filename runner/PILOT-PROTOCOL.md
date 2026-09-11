# Pilot protocol and scorecard

This ships a protocol, templates and a worked synthetic calculation. It grants no
authority to modify a client project, spend on models, recruit participants or
run a live pilot. Current native macOS whole-process-tree containment is unresolved
in #37; evaluation evidence must keep that dependency visible. A live handoff
remains blocked while its dependable-release evidence is ineligible.

Use two separately authorized targets with different stacks and design systems.
Repeat the complete sequence on each. Compare equivalent ordinary assisted work
using the same project, task scope, acceptance obligations and measurement rules.
Choose the matching method and document complexity, learning/order effects,
operator familiarity, time attribution and remaining differences before a run.
The calculator records this accountable judgment; it cannot establish comparability
or validate the truth of an authored observation by itself.

## Executable checklist for a later authorized pilot

- [ ] Fill `runner/examples/pilot/handoff-template.json` in private project evidence.
  Resolve each exact target, stack, design system, existing authority/reference,
  operator, independent reviewer, product decision maker and study lead. Select
  real project obligations and a comparable ordinary-assisted baseline. Record
  reviewed release/corpus evidence and every unresolved dependency.
- [ ] Run `node <harness>/runner/src/pilot-cli.mjs handoff --input <handoff.json>`.
  Any missing authority, role, obligation, comparison method or release dependency
  blocks the handoff. A successful completeness check does not grant authority or
  execute a command. Synthetic authority can never authorize live execution.
- [ ] Under each target's separate existing authority, run the pinned onboarding
  diagnostic and read-only plan. Record harness/skill/CLI/model/config/source/input
  identifiers from `runner/EVALUATION.md`, plus selected acceptance/rubric revisions.
  Complete the same baseline scope and retain its unsuccessful attempts as well.
- [ ] Implement one bounded new-product slice through the feature workflow. Use
  actual project evidence, an active job, versioned assumptions, and independently
  recorded acceptance obligations. Preserve implementation, verification, human
  acceptance, integration, release and product validation as separate milestones.
- [ ] Plan one interruption after a saved step. Retain exact event/action/attempt
  IDs, the current revision, decisions, costs and artifacts. Resume using current
  status and the existing replay/reconciliation controls; do not invent a new
  launch to conceal an uncertain effect. Capture the actual recovery result.
- [ ] Record one human revision with its source and rationale. Preserve earlier
  evidence. Exercise three bounded refinements: recovery, design, and a feature
  delta. Use the corresponding stage and invalidation rules; preserve unaffected
  evidence and assess the crosscutting invariant. Do not silently broaden scope.
- [ ] Repeat those cases on the second separately authorized target. Keep sources,
  output paths, authority and pinned revisions distinct. No project facts enter
  shared harness fixtures; use generalized synthetic reproductions for followups.
- [ ] Fill the measurement cohort including every failed, interrupted, abandoned
  and successful attempt. Record missing values as `null`, observations as
  `unrun`/`unknown`, and uncertain human-time attribution explicitly.
- [ ] Run `node <harness>/runner/src/pilot-cli.mjs scorecard --input <pilot.json>
  --format text` and inspect JSON output as well. Reconcile disagreements with
  retained grader/rubric evidence instead of averaging away the disagreement.
- [ ] At the post-pilot checkpoint, classify corrections as context, requirement,
  design, execution or evaluator errors. Record the changed ASM/version and source
  reference/hash, plus a generalized fixture/skill/contract followup and accountable
  publication review. No source excerpts or arbitrary extra payloads are exported.
- [ ] Append a new checkpoint snapshot with the command below. Keep the previous
  snapshot and append its new reference to the project's research trail. If an
  assumption changed, use `runner/ASSUMPTIONS.md` to advance its version and retain
  the previous ledger; a pilot checkpoint does not silently rewrite research.

```sh
node <harness>/runner/src/pilot-cli.mjs checkpoint --input <generalized-correction.json> --previous <retained-trail.json> --output <new-trail-snapshot.json>
```

The command requires a new output path, retains the input snapshot unchanged,
records its SHA-256 and preserves all earlier checkpoint entries. Each entry
carries a sequence, previous-entry hash and its own content hash. It rejects
rewritten history and duplicate IDs. Source truth and the generalized-text review
remain accountable human judgments; hashes are integrity evidence, not proof that
the underlying observation occurred. Publishing into the harness still requires
the existing project-specific authority and review.

## Measurement rules

The schema is demonstrated in `runner/examples/pilot/synthetic.json`. Every
increment has a project/case ID and all attempts, including failures and
interruptions. Human acceptance binds a completed attempt's exact accepted review,
actor and reference. An implementation or integration record cannot substitute.

| Measure | Numerator, denominator and missing evidence |
| --- | --- |
| Accepted increments per human hour | Current human-accepted increments divided by total attributable human hours across the full increment cohort. Failed and unaccepted work stays in the denominator. Any missing time or unknown attribution makes the rate unknown; estimated attribution stays labeled. Zero time gives no rate. |
| First-pass acceptance | Increments accepted on their first attempt divided by increments with a recorded human review. Earlier failed/interrupted attempts prevent a first-pass claim. Unreviewed increments are outside this denominator and remain in total cost/time. |
| Full spend and human effort | Sum all attempts. Spend includes context cost; human minutes include active review and context minutes. Those subsets are reported separately and never added a second time. Missing values are unknown, not zero. |
| Escaped defects | Counts by critical/high/medium/low/unknown severity with evidence references; absent inventories are counted explicitly. |
| Recovery correctness | Correct observed recoveries over observed recoveries, with unrun/unknown counts. A saved protocol alone is no observation. |
| Primary-job success | Observed successful trials over observed trials; retain the accountable study evidence in the target. Unrun/unknown entries never become failures or successes. |
| Human supervision and context | Active review minutes, decisions requested, context spend/minutes and sufficient/insufficient/unknown assessments, including unsuccessful attempts. |
| Ordinary-assisted comparison | Matched full baseline cohort using the same targets/cases and evidence origin, explicit method, accountable comparability decision and limitations. No artifact/test/PR count is used as a productivity measure. |

Each numeric measure reports known totals, missing counts and a complete total
only when available. All six milestones remain visible. The descriptive rate
ratio does not establish a repeatable productivity multiplier or causal speedup.
Use repeated real evidence under separate authority before making adoption claims.

## Worked synthetic interruption and correction

The supplied cohort has eight increments across two synthetic stacks/design
systems, ten attempts, one failed attempt and one interrupted attempt. It records
seven human-accepted increments, USD 27 total spend and 175 human minutes: **2.4
accepted increments per human hour**. First-pass acceptance is **5/8** under the
definition above. Context cost of USD 2.7 is already included in total spend.
There is one recorded integration and no product-validation or release evidence.
The ordinary-assisted baseline and target-user trials are unrun.

The example interruption preserves the failed/interrupted attempt and its cost;
the later completed attempt has its own retained review. The checkpoint describes
a generalized missing-context correction and the next assumption version. These
are authored synthetic records, not evidence that an actual process or human
study was interrupted. The CLI regression exercises calculation, blocked handoff,
new snapshot creation and preservation of the prior snapshot.

```sh
node runner/src/pilot-cli.mjs scorecard --input runner/examples/pilot/synthetic.json --format text
node runner/src/pilot-cli.mjs handoff --input runner/examples/pilot/handoff-template.json
node runner/src/pilot-cli.mjs checkpoint --input runner/examples/pilot/correction.json --previous runner/examples/pilot/empty-trail.json --output /absolute/path/new-synthetic-checkpoint.json
```

The handoff template deliberately exits 2 until real fields and release evidence
are resolved. The synthetic calculation and checkpoint require no model call,
client repository, external service or live study.
