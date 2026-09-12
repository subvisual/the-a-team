# First local plan

This walkthrough uses a new synthetic Node target. It does not need a client
repository, remote account, model call or publication. Run commands from the
reviewed harness checkout and replace the two absolute paths with new locations.

```sh
node runner/examples/onboarding/setup.mjs /absolute/path/new-synthetic-target
export ATEAM_RUNNER_HOME=/absolute/path/new-synthetic-evidence
node runner/bin/ateam-runner.mjs doctor --path /absolute/path/new-synthetic-target --json
node runner/bin/ateam-runner.mjs run --source local --path /absolute/path/new-synthetic-target --issues /absolute/path/new-synthetic-target/issues.md --base main --dry-run --json
```

The setup command explicitly creates and commits only the new target; it refuses
an existing directory. `doctor` and `--dry-run` do not create configuration,
supervisor records, branches or model sessions. The dry-run should show
`ISS-NOTE` as ready and list the actions a later authorized run would take.
Missing Claude Code can block doctor while this read-only plan still works:
planning does not start that binary. `gh` is optional for local mode.

The target's `CLAUDE.md` pins the exact harness commit and declares its base,
context and test command. The sample has no origin and GitHub issue publication
is disabled. Nothing about a ready plan approves execution or a spend limit.
The next step is to review its target, scope and budget with the accountable
operator; execute only within project authority already granted.

## Simulate an interrupted orchestration step

This exercises saved feature state and event replay, without claiming that a
model process was interrupted. Use the same feature directory and event IDs on
restart. The initial empty directory was created by setup.

```sh
node runner/src/feature-cli.mjs init --feature /absolute/path/new-synthetic-target/docs/features/sample --expected-revision 0 --event-id sample-init --input '{"slug":"sample","repo":"/absolute/path/new-synthetic-target","run_brief":{"mode":"discovery-only","outcome":"Inspect a synthetic note workflow","deliverables":["context"],"required_verification":["read current sources"]}}'
node runner/src/feature-cli.mjs start --feature /absolute/path/new-synthetic-target/docs/features/sample --expected-revision 1 --event-id sample-start --input '{"phase":"discovery"}'
node runner/src/feature-cli.mjs show --feature /absolute/path/new-synthetic-target/docs/features/sample
```

Close the terminal after `start`, then repeat that exact `start` command. The
result has `replayed:true`; revision, artifacts and history are retained. Do not
invent a new event ID for an action whose result is uncertain. `show` exposes
the in-progress discovery phase and prior events. Use the operator controls
documented with the feature CLI to pause, resume or revise; abort retains files
and branches. A real interrupted executor additionally needs the runner's
retained action and accounting records; the local dry-run reports unresolved
launches instead of starting replacement work blindly.

The feature commands explicitly save a manifest and event history. Those files
make this sample dirty; doctor correctly reports them. Preserve or commit them
deliberately before an execution requiring a clean target. Never reset a real
project merely to make doctor green.

## Artifacts and recovery

- Target: versioned `docs/product/` context and research, then
  `docs/features/<slug>/feature.json`, acceptance ledger, definition, design,
  prototype, spec and stable-ID issues as the chosen run reaches those stages.
- Supervisor: `ATEAM_RUNNER_HOME` holds claims, action events, private checkouts,
  complete attempt accounting, approval records and combined verification.
  Keep it outside target source; retain failures and incomplete attempts.
- Local mode retains issue branches and approvals without remote Git/GitHub.
  GitHub mode additionally requires authenticated `gh`, explicit target identity
  and publishing authority; doctor never calls remote APIs or tests credentials.
- Passing checks, human acceptance, integration, release and product validation
  are separate milestones. A draft PR establishes none of the latter four.

## Diagnose and upgrade deliberately

`doctor --json` always returns one result envelope. Each blocked check has an
actionable repair; configuration values, remote credentials and raw subprocess
errors are withheld. It checks local binaries, Node/Git/Python versions, tracked
harness references, config/pin/identity, source boundary, current context/design
bindings, dirty state, isolation availability and filesystem access without
writing probe files. Provider authentication/compatibility and actual execution
permissions remain explicitly unverified by this read-only diagnostic.

Git diagnostics use the inspected absolute executable, an allowlist of read-only
operations, and a scrubbed environment. A relative PATH entry cannot select a
different target program after a cwd change. Resource inventory comes from the
pinned HEAD tree, so staged deletions cannot hide missing files and directories
cannot stand in for guides. Setup also scrubs inherited Git repository/config
redirects before touching its new target.

Doctor blocks dirty-state inspection when executable Git filters or submodules
are configured. It does not run those filters or inspect nested repositories.
History reads disable signature verification and external diff programs; partial
or promisor repositories are blocked because doctor never fetches missing objects.
Prepare a complete supported target explicitly instead of changing its Git
configuration merely to make the diagnostic pass.

The native macOS backend is currently required. Whole-process-tree containment
is an accepted limitation documented in #37; a successful Seatbelt availability
probe does not establish that guarantee. Do not enable an unsandboxed fallback. Missing isolation, source credentials
in Git history, mismatched origin and escaping bindings require repair before
execution. No VM or container is started by this workflow.

For an upgrade, retain the old harness checkout and evidence, inspect the diff
to an explicit new commit, update the target pin under project authority, rerun
doctor and the dry-run, then run the target's own tests, rendered checks and
combined verification under their existing authority. Record the old/new
revisions and observations. Old approvals bound to an earlier harness or policy
are revalidated, never relabeled as current. Do not use a moving branch as a pin.

Walkthrough evidence should identify whether the operator was a real unfamiliar
human or a fresh-context simulated operator, record mistakes and revisions, and
leave human onboarding validation unrun when no human session occurred.
