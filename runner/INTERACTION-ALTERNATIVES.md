# Compare a consequential interaction choice

Use this when a load-bearing task-sequence, information-architecture or user-control
assumption calls for an `interaction-comparison` cheapest probe in the canonical
research plan. Preserve the project’s active job, components and token semantics.
An established visual system is a constraint on both options, not a reason to
ignore an unresolved interaction question. Routine corrections need no variants;
record why the settled interaction can be retained.

At design completion/approval, the artifact gate requires
`docs/features/<slug>/interaction-comparison.json` for every applicable load-bearing
assumption with that probe method. Existing projects without this declaration do
not acquire an automatic novelty quota. The file is bound to the reviewed design;
changed comparison bytes or changed referenced evidence invalidate reuse.
When an option is selected, `design.md` must carry that exact compiled flow.

The version 1 record declares:

- `id`, `featureSlug`, `mode: "compare"`, and `risk: {level: "high", uncertainty, path, revision}`.
  The bound authored risk source explains the concrete choice.
- `riskSource: {path: "docs/product/research-plan.md", sha256, revision, assumptionIds}`.
  These are actual applicable ASM IDs from the valid current research ledger.
  A declared load-bearing interaction comparison cannot become a routine skip.
- `job: {id, path, revision}` pointing to the same active canonical job in
  `docs/product/jtbd/`; `designSystem: {path, revision}` binding existing conventions.
  File revisions are SHA-256 hashes of exact bytes.
- One shared `scenario`, a nonempty `constraints` list, and shared `criteria` with
  stable IDs, questions and methods: `interactive-prototype`, `expert-review` or
  `human-study`. Interactive criteria list exact `obligationIds` from each flow.
- Two or three `options`, each with ID/title, a compiled `flow` path/revision,
  explicit benefits and costs, and exactly one observation per shared criterion.
  Options use the same scenario, job set, method and design-system binding.
- Observations state `unrun` with a reason or `observed` with a real evidence
  path/revision and note. Interactive receipts must demonstrate the declared
  transitions at the exact current flow revision. Subjective receipts identify
  the accountable observer and exact option, flow, job, scenario, rubric and criterion.
- An optional `selection` names one option, states `status: "provisional"`, explains
  its rationale and retains `pendingUsabilityObligations`. A comparison cannot
  set human acceptance or product validation. Recorded expert opinion does not
  establish target-user success.

A routine record uses `mode: "skip"`, `risk.level: "routine"`, a concrete `reason`,
current research/design-system bindings, and no options or selection. This is an
optional recorded explanation, not a requirement to create comparisons for copy fixes.

```sh
node <harness>/runner/src/alternatives-cli.mjs --root <target> --record docs/features/<slug>/interaction-comparison.json
```

The readonly command returns one JSON envelope and exits 2 for invalid sources,
cosmetic-only variants, incomparable methods or unsupported evidence. Its structural
signature compares fields, states and transitions; it does not claim to solve
arbitrary graph equivalence or choose the better experience automatically. It
explores only transitions reachable under the exact finite scenario outcomes;
disconnected screens, impossible outcomes and decorative metadata cannot count
as interaction variety. Complex scenarios exceeding the supported exploration
bound are reported for repair. Feature-local paths infer their feature directory;
standalone records use `featureSlug` (or an explicit `--feature` directory), so an
unrelated feature's research disposition does not block this comparison.

## Worked synthetic comparison

`runner/examples/alternatives/` creates guided steps and a direct workspace. Both
require a request name and owner, simulate one failed save and one successful retry,
and use the same CSS tokens/components. The guided version separates decisions and
supports back navigation; the workspace exposes both fields together. Both retain
input after failure. These are synthetic accepted constraints, not client facts.

```sh
node runner/examples/alternatives/setup.mjs /absolute/path/new-comparison-target
ATEAM_PLAYWRIGHT_MODULE=/absolute/path/playwright/index.mjs node runner/test/browser/alternatives.mjs /absolute/path/evidence-outside-harness
```

The browser proof creates its own disposable fixture and one temporary loopback
server, exercises required input, back navigation, failure, retry, keyboard submit
and reset, captures desktop/mobile views, then invokes the actual comparison CLI.
The retained receipts explicitly describe simulated persistence. The human-study
criterion remains unrun and the choice provisional. No study, model execution,
production backend, merge or publication is performed by this example.
