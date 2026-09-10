# CLI planning and machine output

`--dry-run` is an outer command mode. It reads available configuration, Git
history, issue/PR data, and claim-file existence to describe proposed work. It
never clones or fetches, writes configuration or labels/comments, acquires
claims, creates run directories/worktrees, pushes, or starts a model.

Supported previews:

```sh
ateam-runner init --dry-run
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

The plan contains `dryRun: true`, `targets`, `candidates`, `prerequisites`, and
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
| `error` | 2 | Invalid arguments or an unsupported command/flag combination. |

For batches, error takes precedence over blocked, then success over skipped.
`status --json` uses `success` even when it discovers no tracked work: returning
the current repository state is the completed operation.

| Command | `result` shape |
| --- | --- |
| Any supported `--dry-run` | The plan described above. |
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
