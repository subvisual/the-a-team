# Versioned synthetic evaluation corpus

Issue #52 adds 20 explicit scenarios in [`evaluation/catalog.json`](evaluation/catalog.json). They reuse earlier regression fixtures and include actual Node and Python target execution plus native browser interaction. The ordinary `npm test` suite remains required and independent. These checks measure declared deterministic behavior. They do not establish model capability, expert judgment, human usability, production readiness, or a productivity multiplier.

**This synthetic corpus does not establish release eligibility.** The accepted native macOS scope of #37 includes process-group and observed-descendant cleanup; whole-process-tree containment remains unsupported. Every corpus summary retains `releaseEvidence.eligible: false` and an `unresolvedDependencies` entry for that unsupported capability. The field describes a technical limitation, not the GitHub issue state or a requirement to keep #37 open. Passing boundary checks cannot establish full containment. No agent trial or live-provider pilot becomes authorized by a passing corpus.

## Run and inspect

From `runner/`, choose a new evidence directory outside the harness checkout:

```sh
npm test
npm run test:evaluation -- --output /absolute/path/to/new-evidence
```

The default portable profile executes 17 scenarios and explicitly records the two browser cases and native boundary case as `not-run`. A successful portable command means its declared checks and seeded-defect proof passed; it is incomplete native coverage and is never release approval.

On native macOS with the existing Seatbelt backend and a trusted Playwright installation:

```sh
export ATEAM_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs
export ATEAM_BROWSER_CHANNEL=chrome
npm run test:boundary
npm run test:evaluation -- --profile native --output /absolute/path/to/new-native-evidence
```

The native profile requires all 20 scenarios. Missing trusted browser tooling is retained as `not-run` and makes the native command fail. A browser launch or sandbox-control failure is retained as `failed`; it never falls back to an unconfined backend. This command uses synthetic fixtures, local browser pages and stubbed model/remote seams in existing unit tests. It does not call an agent, provider or publishing API.

The GitHub Actions workflow `.github/workflows/evaluation.yml` runs on `macos-15`, keeps ordinary tests and `test:boundary` as separate steps, and installs the locked Playwright 1.58.2 tooling outside the source checkout. Browser installation follows the [official Playwright CI workflow](https://playwright.dev/docs/ci); the declared hosted image is documented by [GitHub runner images](https://github.com/actions/runner-images/blob/main/images/macos/macos-15-Readme.md). Hosted CI is verified only when an actual job receipt exists; local native evidence alone is not such a receipt.

Each new run retains:

- `summary.json`: scenario outcomes, counts, explicit not-run trials/studies, seeded-defect result, and release limitations.
- `source-manifest.json` and `source/`: exact Git revision, worktree status, per-file SHA-256 hashes, full source bundle digest, and skill bundle digest. An uncommitted snapshot is identified by its bytes as well as HEAD. No linked `.git` metadata is copied.
- `configuration.json`: actual runtime, platform, browser tooling/configuration, and profile identifiers.
- `<scenario>/record.json`, `outcome.json`, `trace.json`, and `subjective.json`: input/rubric/version identifiers, result, unedited process output, and separate unscored expert status.
- Browser screenshots and observations, and the two targets' source revisions, own test output, rendered output, context selections and handoffs.
- `seed-proof.json`, `seeded-defect/`, and `seeded-context.mjs`: a retained defect mutation and its expected assertion failure. The source snapshot is restored to the original bytes afterward.

`crosscutting-invariant` is the mutation probe. It removes only the production global-invariant selector in the retained source copy, without changing the regression assertion. The seeded behavior must fail with `GLOBAL_INVARIANT_DROPPED`; the corresponding unmodified case must pass. Empty or skipped test-name selections cannot count as a pass. Renaming a referenced regression requires an explicit catalog revision.

The two-target fixture uses Node ES modules with Cedar compact-card tokens and Python server-rendered HTML with Quartz booking-row tokens. Each target executes its own tests and produces its own HTML and handoff. The scenario checks both directions for target facts and output paths and rejects a mismatched harness pin. This is deterministic data isolation evidence, not proof of model behavior across projects or full process containment.

## Agent trials and expert calibration

The corpus never launches models. Only after explicit spend authorization, run a small capability sample using the intended executor/reviewer environment: for example, three separate trials for narrow refinement and three for contradictory evidence, with identical input, model, CLI, configuration, source and rubric within each group. Keep failures and blocked attempts. A changed model, input, source or rubric starts a new group; deterministic scenarios do not need repeated trials to imply variance.

Use [`evaluation/agent-trial.example.json`](evaluation/agent-trial.example.json) as a **synthetic schema example**, not a run receipt. Replace its identifiers with the exact authorized run identifiers and observations. Save each completed or blocked attempt separately:

```sh
node src/evaluation-cli.mjs record-trial /absolute/path/to/evidence /absolute/path/to/actual-trial.json
```

Saving requires a full harness revision and bundle digest, skill bundle digest, actual model identifier, CLI name/version, configuration ID/hash, source commit, input ID/hash, rubric ID/hash, scenario version, group identity, trial ordinal, outcome, trace and independent subjective status. The writer executes no models. It retains `record.json`, `outcome.json`, `trace.json` and `subjective.json` separately under `agent-trials/<id>/` and refuses to overwrite a record or reuse a trial ordinal. Provider settings and exact model revision belong in the configuration artifact; an alias without a recorded actual model identity is insufficient for a reproducibility claim.

Trial imports use one exclusive filesystem writer per evidence root. A busy writer rejects simultaneous imports; a later retry still checks immutable group identity and ordinal. Object key order is irrelevant to identical metadata, while array order and actual model/configuration/input/rubric changes remain significant. Complete trial files are fsynced in a private candidate directory and published together through a same-filesystem rename. Readers never observe an accepted trial directory containing only part of the record.

Each acquired import retains `trial-imports/<import-id>/intent.json`, the submitted `request.json`, and a `result.json` marked `published`, `rejected`, or `uncertain` when that result can be written. A candidate that was interrupted before publication remains in that import directory. Invalid input is rejected before the writer starts. Competing requests rejected as busy do not become trials.

The `.agent-trial-writer.lock` file identifies the owning process and import. Only a known completed or rejected import releases its own lock. A crash, ambiguous storage failure, or pre-existing partial trial leaves the writer blocked; the importer never guesses that a stale lock is safe, repeats an uncertain publication, or deletes retained evidence. For recovery, first establish that the writer has stopped, retain the lock and import evidence, and inspect the requested group/ordinal and all four published or staged files. Record the operator's reconciliation before moving the stale lock aside. If publication completed, preserve the existing trial and do not submit it again; if it did not, preserve the failed candidate and start a separately identified import only after the state is understood. A PID check alone is not reconciliation. This is a bounded local-filesystem protocol, not a distributed writer or execution service.

Use [`evaluation/capability-rubric-v1.json`](evaluation/capability-rubric-v1.json) for the initial explicit judgment criteria. Inspect outcomes separately from traces: an efficient-looking trace cannot override a wrong outcome, and a correct outcome does not make the trace safe or reproducible. `subjective.status: not-scored` remains until named expert assessments are supplied. Synthetic grader examples never become human study results.

When experts disagree, retain each grader's verdict, rationale and rubric ID. Record a reasoned reconciliation with the original and revised rubric text/digests and accepted **and** rejected calibration examples:

```sh
node src/evaluation-cli.mjs reconcile /absolute/path/to/evidence /absolute/path/to/reconciliation.json
```

See [`evaluation/reconciliation.example.json`](evaluation/reconciliation.example.json). Reconciliation refers to an existing trial and adds a new immutable record; it does not edit either grader's assessment, revise the trial outcome, or average their judgments. The rubric list must be one chronological chain rooted in the exact trial rubric: its first entry has `supersedes: null`, and each later entry supersedes the immediately preceding ID. A second root or fork cannot justify a resolution. Every calibration example retains inspectable `input` and `output` text with matching SHA-256 digests, its disposition, rubric ID and rationale. Explicit empty text is allowed with the hash of that empty string; missing payloads and opaque references are rejected. A revised rubric may require a separately identified rescore or new trial group. Both old and new versions remain reviewable.

All checked-in examples and targets are synthetic. Do not copy client data into this corpus. Real publishing, client/provider pilots, model spend and human studies need their own authority and evidence; this suite does not grant them.
