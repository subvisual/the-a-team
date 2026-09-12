# CLI planning and machine output

`--dry-run` is an outer command mode. It reads available configuration, Git
history, issue/PR data, and claim-file existence to describe proposed work. It
never clones or fetches, writes configuration or labels/comments, acquires
claims, creates run directories/worktrees, pushes, or starts a model.

Supported previews:

```sh
ateam-runner init --dry-run
ateam-runner migrate-issues --issues issues.md --dry-run --json
ateam-runner run --repo org/repo --issue 12 --path /existing/clone --dry-run --json
ateam-runner run --source local --issues issues.md --path /existing/clone --dry-run --json
ateam-runner review --repo org/repo --pr 34 --path /existing/clone --dry-run --json
ateam-runner watch --repo org/repo --once --dry-run --json
```

Missing clones, files, requested local issues, or dependency information appear
as prerequisites. A missing clone is never created to obtain planning context.
GitHub discovery may require network access; local planning uses local files
and Git history only. Discovery failures are errors; unavailable dependency
state blocks that candidate instead of being assumed closed.

Execution planning contains `dryRun: true`, `targets`, `candidates`, `prerequisites`, and
`actions`. Candidates identify their issue or PR, `disposition`, `reason`,
proposed `actions`, and prerequisites. Issue dispositions are `ready`, `blocked`,
`malformed` (no checkable acceptance criteria), or `skipped` (already implemented).
Review candidates report current delivered approval records and missing issue
links. Old head markers alone never suppress evaluation after inputs change.
`ready` describes the available discovery evidence; normal execution still
enforces its policy and may encounter changed remote state.

One watch preview performs one read-only discovery pass over outstanding agent
PRs and all eligible ready-labeled issues. PR review comes first. Each issue has
`selected: true` only if it is the first candidate in its repository, matching
the ordinary tick's one-issue selection. Later issues are described for context;
their action lists are conditional proposals. The preview does not simulate a
successful earlier implementation or update dependent readiness speculatively.

Streaming `watch --dry-run` and `watch --json` are rejected before any discovery
or setup. Add `--once` for a finite plan or result. `status` is already read-only
and does not accept `--dry-run`.

## JSON envelope, version 1

Every finite `--json` invocation writes exactly one JSON document to stdout,
including argument, configuration, discovery, and execution errors. INFO, WARN,
and ERROR progress diagnostics go to stderr, including nested adapter and model
logs. Parse **all** of stdout, never just the final line.

```json
{
  "schemaVersion": 1,
  "command": "run",
  "status": "success",
  "result": { "outcome": "approved", "issue": "12" },
  "error": null
}
```

The top-level fields are always present. `error` is either `null` or
`{ "code": "...", "message": "..." }`. Errors before a result is available
have `result: null`. Failed work can retain partial results alongside the error.

| Status | Exit code | Meaning |
| --- | --- | --- |
| `success` | 0 | Completed successfully, or a plan has ready work with no blocked candidates/prerequisites. |
| `skipped` | 0 | No candidates, all work already handled, or review/claim selection skipped work. |
| `blocked` | 2 | Dependencies, missing prerequisites/detail, or a changes-requested/blocked verdict prevents completion. A mixed plan with any blocked/malformed candidate is blocked. |
| `error` | 1 | Configuration, discovery, or execution failed. |
| `error` | 2 | Invalid arguments, unsupported flags, or an invalid local issue batch. |

For batches, error takes precedence over blocked, then success over skipped.
`status --json` uses `success` even when it discovers no tracked work: returning
the current repository state is the completed operation.

| Command | `result` shape |
| --- | --- |
| Execution `--dry-run` | The plan described above. |
| `migrate-issues` (including preview) | `{ migration: true, dryRun, path, changed, text, issues: [{ id, title, dependsOn }] }`. |
| GitHub `run` | One issue outcome. |
| Local `run` | `{ results: [issue outcomes], report: [local report entries] }`. |
| `review` | One verdict or skipped-review result. |
| `watch --once` | `{ results: [review and issue outcomes] }`; caught discovery/review failures are retained as failed entries with repository and stage. |
| `status` | Array of repository status objects. |
| `init` | `{ path: ".../config.json" }`. |
| Help | `{ usage: "..." }`. |

Consumers migrating from the unversioned output must unwrap `result` first.
For example, local run outcomes are now at `envelope.result.results`, and a
GitHub run outcome is at `envelope.result.outcome`. Successful parsing alone does
not establish completed work: inspect `status`, the command result, and exit code.

## Stable local tickets and migration

Local `run` requires a fully validated batch of immutable `**ID:** ISS-...`
identities, comma-separated `**Depends on:**` IDs (or `none`), and nonempty
`### Acceptance criteria`. Select by ID with `--issue ISS-EXAMPLE`, preserving
that ID across title changes. The adapter validates all siblings before selection
or launch and executes in deterministic dependency order. Duplicate IDs, unknown
dependencies, cycles and empty criteria return `invalid-local-issues` with exit 2.
Planning can read legacy files, but reports their missing IDs as prerequisites.

`**Requirements:** R-1, R-2` preserves requirement trace. The parser exposes
SHA-256 `criteriaVersion` and `contentVersion` values: criteria edits change both;
a title change affects content version while retaining identity. Neither value
is approval evidence. See the [decomposition reference](../.claude/skills/ticket-writer/references/decomposition.md)
and the checked-in [runnable synthetic batch](../.claude/skills/ticket-writer/examples/issues.md).

```sh
ateam-runner migrate-issues --issues issues.md --dry-run --json
ateam-runner migrate-issues --issues issues.md --json
```

Migration preview returns the exact proposed text without writes or external
programs. Explicit migration writes IDs once and converts unambiguous legacy
title dependencies. It flushes a same-directory temporary file and atomically
renames it into place while preserving the original file mode. Changed source
metadata or bytes abort replacement with `issues-file-changed`; inspect the
current file and retry. A failed save removes only its own temporary file. A subsequent migration is unchanged (`skipped`, exit 0).
Collisions, ambiguous/unknown dependencies and invalid batches are diagnosed
before writing; fix the named ambiguity with explicit IDs and references.
Migration never reads Git history, creates run state or infers prior approval.

## Local bases and network boundaries

Local mode uses exactly the requested local branch or commit SHA. Explicit
`--base` overrides the project's `A-Team Config` base, which overrides configured
fallbacks and the locally known default branch. Approved serial continuation
branches take precedence for subsequent tickets. A local branch is resolved as
`refs/heads/<name>` so a same-named tag or divergent `origin/main` cannot replace
it. Policy records the display `base`, exact `baseRef` and immutable `baseSha`.
Explicit SHA input and repositories without `origin` are supported. An absent
local base returns `missing-local-base` before creating implementation state;
prepare the branch or commit locally and retry. The preview uses this same
resolver and reports a missing base as a prerequisite.

Local run and planning perform no remote Git fetch/push or GitHub calls. The
supervisor may clone the source locally and import a validated private commit
through a filesystem-only Git fetch. This is distinct from model execution:
an actual run may contact the model-service endpoints explicitly permitted by
its sandbox policy; `--dry-run` never starts a model.

GitHub mode also uses an existing prepared clone without an implicit fetch or
clone. Prepare or refresh its refs explicitly before invoking the runner. GitHub
discovery and publication require network access, and new implementation work
may push a validated branch and open a PR according to the supervisor policy.

## Allowances and recovery

Issue #37 accepts native macOS process-group and observed-descendant cleanup.
Fast-orphaned detached descendants may survive; absolute whole-tree containment
is outside the accepted scope. See the reproduced limitation in
[EXECUTION.md](EXECUTION.md#retained-allowances-and-process-timeouts).

`--run-budget USD`, `--budget USD` and `--reviewer-budget USD` select the aggregate
and per-role allowances. `--run-timeout-ms N` and `--session-timeout-ms N` select
wall-time limits. Defaults are $45/$10/$5, two hours per retained repository
window and twenty minutes per process. Project policy can declare the matching
numeric fields. Zero, negative, non-finite and fractional time limits fail
preflight. Each process gets at most the remaining time and spend.

The `budget` result/status field reports window limits, spent/remaining allowance,
remaining time, pending launches, and lifetime known spend/unknown accounting.
Budget exhaustion, timeout and accounting uncertainty produce failed/blocked
outcomes with `failureCategory`; they never imply approval. Dry-runs report
retained budget conflicts without opening a window or writing accounting events.

An explicitly approved new window uses `--authorization-file` with both a unique
`recoveryWindow` string and an authorization `id`. It retains all earlier history
and known/unknown charges. Reuse of that same window does not replenish it. See
[execution and recovery limits](EXECUTION.md#retained-allowances-and-process-timeouts).
