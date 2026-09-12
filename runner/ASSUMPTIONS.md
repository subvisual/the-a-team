# Stage-bound research decisions

Keep research in `docs/product/research-plan.md`. Its existing assumptions,
confidence, disproof and cheapest probes gain a single top-level
`ateam-assumptions` JSON block. This is the canonical record, alongside the
plan's evidence spine, open questions and activities. Do not create a parallel
assumption register or re-run discovery for routine refinements.

```ateam-assumptions
{"schemaVersion":1,"revision":1,"assumptions":[]}
```

An empty array declares no recorded assumptions; it does not claim that research
or customer validation happened. Preserve legacy prose while indexing its actual
assumptions. `run_brief.assumptions` references existing `ASM-...` IDs, never
automatically invented mappings from prose.

Each record contains:

- `id`: stable project-owned `ASM-...`; `version`: positive integer.
- `statement`, `dependentDecision`, `disproof`, `uncertainty`: explicit authored
  text. Preserve absent, conflicting and inconclusive evidence in these records.
- `risk`: `value`, `usability`, `feasibility` or `business-viability`;
  `loadBearing`: boolean; `features`: feature slugs, or `["*"]` for a global
  assumption.
- `requiredStage`: an acceptance stage from discovery through product-validation
  (see `src/obligations.mjs`). `owner`: `{ "actor": null, "role": null }` until an
  existing person or accountable role is known. An unresolved owner is visible
  before the stage and blocks a due load-bearing assumption.
- `confidence`: `strong`, `moderate`, `directional` or `hypothesis`.
- `cheapestProbe`: `{ "method": "<actual method>", "description": "<smallest
  discriminating probe>" }`. Optional `evidenceProducingStage` names an earlier
  stage when an artifact or prototype is needed to produce evidence. For example,
  a design prototype can precede a study due at human-acceptance. The prototype
  leaves the study pending; changing confidence does not supply evidence.
- `evidence`: an explicit array, empty while absent. Each entry has stable
  `EVD-...` `id`, original `assumptionVersion`, an actual target-relative source
  snapshot `path`, its `sha256`, original `reference` (such as the source URL or
  input batch), `method`, recorded `actor`, `origin` (`observed`, `synthetic`,
  `declared-default` or `inference`), and `result` (`support`, `contradict` or
  `inconclusive`). Keep synthetic and inferred sources explicit. Synthetic
  results, inference or an applied default cannot support a proceed disposition.
- `disposition`: `pending`, `proceed`, `defer`, `no-go` or `reshape`. Every
  non-pending disposition has a `decision` with the actual `actor`, `reference`,
  `authorized: true`, `rationale` and `consequence`. This records existing
  authority; the validator does not grant it. `proceed` requires current-version
  supporting evidence with the declared probe method, and a `contradictionIds`
  list naming every contradictory current-version source addressed in its
  rationale. `defer` additionally names a future `nextDecisionStage` and blocks
  again when that stage arrives. No-go or reshape can be supported by the explicit
  absence of demand evidence; never fabricate sources to fill an empty array.

Before changing the block, preserve its exact parsed record in
`docs/product/assumptions-history/<revision>.json` and increment the current
`revision`. Retain every prior revision, assumption and evidence entry. A changed
statement, risk, scope, load-bearing status, required stage, dependent decision,
disproof or probe requires the next assumption `version` and a `changeDecision`
using the same explicit authorization fields. Old evidence keeps its original
version and cannot become support for a changed assumption. A source snapshot is
immutable: changed source content gets a new file and evidence ID, preserving the
original reference and source history.

Validate the actual plan, history and source bytes without writing or starting a
study:

```sh
node <harness>/runner/src/assumptions-cli.mjs --root <target> --feature <feature-dir> --stage implementation
```

The report separates source/schema/decision/history integrity (`recordsValid`),
due stage evidence (`ok`), and permission to advance dependent work (`canAdvance`).
A valid no-go or reshape appears in `outcomes` and prevents advancement. It can
still be recorded as a stop decision when other research is unfinished: those
advancement diagnostics remain visible with `ok: false`, while `recordsValid`
must stay true. Malformed records, missing sources or invalid history always
block the stop command. An unsupported due assumption names the missing evidence
or authorized deferral. `effectiveRequiredStage` uses the authorized deferral's
deadline where applicable. Source receipts
contain the research plan's target-relative path, SHA-256, revision and canonical
ledger digest; downstream comparisons bind this receipt and exact assumption IDs.
Existing feature receipts prevent rewriting or deleting already-consumed history.

The feature command layer consumes these reports at phase entry, completion and
approval. Record a supported no-go/reshape with
`feature-cli.mjs record-research-decision` and input
`{"assumptionIds":["<actual ASM ID>"]}`; it successfully records the research
outcome and stops dependent work while preserving implementation, verification,
acceptance, integration and release records. It does not label the decision as
failed delivery. A later authorized research revision and explicit `revise`
command can reopen affected work; prior decisions remain in history.

Human-acceptance and product-validation milestones enforce every applicable
research deadline already reached, including expired deferrals and earlier
unresolved gates, both when recorded and on reload. Later pending studies do not
invalidate earlier valid milestones. Independently observed implementation,
integration and release receipts remain separate from those validation claims.
Expiry only gates load-bearing assumptions. A valid optional (`loadBearing:
false`) follow-up remains non-blocking whether pending or deferred, including at
its revisit stage; its source, history and authorization records still validate.
