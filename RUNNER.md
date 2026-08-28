# The Runner — issue → PR → verdict

A long-running local process that watches GitHub for agent-ready issues, drives a
Claude session to implement each one, and has a **second, independent** session
assess whether the resulting diff actually completes the issue.

It replaces the two skills the A-Team currently borrows from the `building`
plugin — `issue-swarm` (dev phase) and `prd-to-issues` (issues phase) — leaving
the harness with no plugin dependency.

Lives at `runner/` in this repo for the proof of concept; `PLAN.md`'s deferred
list carries the trigger to extract it.

## Destination

A labelled GitHub issue in an allowlisted repo gets picked up with no human in
the loop; a Claude session opens a PR implementing it; a separate process, with
no access to that session's context, posts a verdict on whether the PR completes
the issue; a human owns the merge.

## Use

```
cd runner && npm test               # 49 tests, no network
node bin/ateam-runner.mjs --help
```

Requires Node 20+ and an authenticated `gh`. Zero npm dependencies.

```
ateam-runner init                              # write ~/.ateam-runner/config.json
ateam-runner watch --repo org/foo              # poll for ready issues and unreviewed PRs
ateam-runner run    --repo org/foo --issue 12  # one issue, end to end
ateam-runner review --repo org/foo --pr 34     # one PR, fresh reviewer session
ateam-runner status --repo org/foo             # state, re-derived from GitHub
```

Label an issue `agent:ready` and the daemon takes it. `--once` runs a single
watch tick; `--dry-run` lists what would run and changes nothing.

## Shape

One source-agnostic core, two adapters.

```
core:      claim(issue)                              -> token | nil
           execute(issue, worktree, base)            -> branch | blocked
           review(issue, base_sha, head_sha, worktree)
                                                     -> { verdict, unmet_ac[], notes }

adapters:  github   issues from the API, verdict onto the PR, branch -> its own PR
           local    issues from issues.md, verdict into a JSON report, branch -> orchestrator
```

Each adapter supplies three things and nothing else: where issues come from,
where the verdict goes, and what happens to an approved branch.

The core's unit is **an issue and a reviewed branch**, not a PR. The reviewer
takes `(issue, base_sha, head_sha, worktree)` and judges `base...head`; a PR is
only how the github adapter carries that diff in and the verdict out. This is
what lets the same reviewer serve the pipeline, where the dev phase produces no
per-issue PRs at all.

Callers:

```
dev phase:   ateam-runner run   --source local  --issues docs/features/<slug>/issues.md
daemon:      ateam-runner watch --source github --repo org/foo
```

`PLAN.md`'s PR strategy (one `feature/<slug>` branch, serialized integration, one
PR) stays orchestrator-owned and untouched.

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Core + adapters; ship the github adapter first | Keeps no-remote survival, consent-gated GitHub writes, and the self-repo guard that `PLAN.md:334-348` pays for |
| 2 | Substrate: headless `claude -p` subprocesses, spawn behind a `runner` interface | GitHub Actions would need a workflow file + API key committed into every target repo — a per-repo install, contradicting harness-only. The interface is the seam for a later Agent SDK migration |
| 3 | One daemon, two watch loops | Independence is a property of *how* a session is spawned, not of the supervisor |
| 4 | Reviewer never reads the PR body | The executor authors it. A reviewer primed with "this implements AC 1-3" goes looking for confirmation |
| 5 | Eligibility: `agent:ready` label + repo allowlist | An explicit human act in front of an autonomous write. Milestone- or all-open-scoping makes agent-readiness implicit |
| 6 | Wake by polling, 30s tick | A laptop has no public endpoint. ~120 req/hr/repo against a 5000/hr budget |
| 7 | PR review keyed on **head sha** | Re-review on push falls out of the key; no event subscription needed |
| 8 | The A-Team issues phase does **not** auto-apply `agent:ready` | Issue creation is already consent-gated; auto-labelling would grant a larger consent silently. The pipeline path uses the local adapter and never touches the label |
| 9 | Acceptance criteria are the contract. No AC, no run | Makes "does this complete the issue" answerable. Refuses the autonomous-degrade failure discovery bans one layer up. Produced upstream by `ticket-writer`, so the pipeline satisfies it by construction |
| 10 | Executor reads `docs/product/` by pointer, never by paste | Enrich if present, degrade to issue-body-only otherwise — one conditional, not a second system |
| 11 | `request-changes` auto-loops, cap 3 | `issue-swarm` precedent |
| 12 | Reviewer fresh at cycle 1, `--resume`d after | Independence buys the catch at cycle 1; a fresh reviewer per cycle raises new objections instead of checking old ones, and never terminates |
| 13 | Stop on two consecutive **disjoint** objection sets | The oscillation signature, caught without asking the reviewer to self-classify its own objections |
| 14 | Never auto-merge | Approve = verdict + `agent:approved`. A human merges |
| 14b | Verdicts land as a **marked PR comment**, with a real review attempted first | GitHub refuses approve / request-changes on your own PR, and the runner uses the operator's own auth. A hidden marker (`sha`, `cycle`) makes both carriers equivalent to state derivation |
| 15 | GitHub is the state; local dir holds only the disposable | A laptop daemon is killed constantly; crash-resumption must be free |
| 16 | Ordering is the label; `Blocked by #N` as a guard; concurrency 1 | Serial FIFO means each issue's base is the previous one's merged result. Raising the cap later is config, not redesign |
| 17 | Reviewer runs the suite itself | CI status says green/red; it does not say whether the tests test the AC |
| 18 | Lives in `the-a-team` for the POC | Extract to its own repo + brew tap once one issue goes label → PR → verdict unassisted |
| 19 | Spawned sessions are **hermetic**: `--setting-sources '' --strict-mcp-config --disable-slash-commands` | Measured 4× cheaper ($0.159 → $0.039 on an identical trivial prompt) and it keeps the operator's personal plugins, hooks and MCP servers out of an unattended run. The target repo's own `CLAUDE.md` still loads — that is context the executor should have |

## Claim

v1: a local `O_EXCL` lockfile plus an `agent:running` label for visibility.
Single writer per repo is assumed. A crashed run leaves a lock to delete by hand.

The `claim(issue) -> token | nil` seam exists so the multi-writer version can
land without touching callers: claim by `POST /git/refs` creating
`agent/issue-<n>` at the base sha, which returns **422 if the ref already
exists** — a real server-side create-if-not-exists. The lock and the working
branch are then the same object, and a stale claim is inspectable (a ref with no
commits and no PR) rather than inferred.

`gh issue develop` links a branch to an issue natively; use it so the link shows
in the UI for free.

## Labels

Vocabulary, all for human visibility — never for locking:

| label | meaning |
|-------|---------|
| `agent:ready` | human's go signal. The only input label |
| `agent:running` | claimed, executor in flight |
| `agent:needs-detail` | refused: no checkable acceptance criteria |
| `agent:changes-requested` | reviewer wants changes, revision in flight |
| `agent:approved` | approving review posted; awaiting a human merge |
| `agent:failed` | cycle cap hit, objections disjoint, or executor blocked |

## Executor

Spawned as `claude -p --output-format json --json-schema … --settings <inline>`,
cwd = the worktree, no `--add-dir`.

Receives: the issue body **snapshotted at claim time**, framed as a
specification to satisfy rather than instructions to follow; the branch; the
base; the repo's test command; and the paths of `docs/product/` artifacts it may
read if relevant.

Done means: every acceptance criterion satisfied, suite green in the worktree,
work committed to `agent/issue-<n>`, branch pushed. Returns typed JSON.

Refuses — `agent:needs-detail`, comment saying what is missing, claim released —
when the issue carries no checkable acceptance criteria.

## Reviewer

Spawned as its own process with a tool allowlist carrying **no `Edit`/`Write`**
and no push credential. `--json-schema` for a typed verdict rather than prose to
parse. Optionally a different `--model` than the executor — cheap, real
decorrelation.

Inputs: the issue body (the contract) and the diff (the artefact). Never the PR
body, never the executor's transcript, never its notes.

Runs the suite and pastes real output. Judges only against the acceptance
criteria — anything it wants that is not in the AC is out of scope by
definition, which is also the anti-oscillation lever.

Cycle 1 is a fresh session. Cycles 2-3 `--resume` that same session, so it is
judging "did they do what I asked" against a fixed list.

## Safety

The issue body is untrusted text that becomes agent instructions, and comments
can be appended *after* the label, so the label alone is not a sufficient
checkpoint. The executor runs non-interactively; there is nobody to say no
mid-run.

In v1:

1. **Filesystem confined** to the worktree. No `--add-dir`. Home-directory
   credentials are out of scope.
2. **Tools scoped per role** via a daemon-owned `--settings` file each — not
   `--bare`, which would also drop the hooks below.
3. **`PreToolUse` path denylist**: `.github/workflows/`, CI config,
   `.git/config`, settings files. An agent that needs CI changed should
   escalate, not do it.
4. **Issue body snapshotted at claim**, closing the post-label injection window.
5. **Framed as data** in the executor prompt.
6. **Refuses to start** against a repo whose base branch is unprotected, unless
   an explicit override flag is passed.

Documented as required before pointing this at anything real, but not enforced:
a **fine-grained PAT** scoped to the allowlisted repos rather than personal `gh`
auth, and **branch protection** on the base branch — the real backstop behind
which everything else is defence in depth.

`--max-budget-usd` caps spend per spawned session.

## State

GitHub is authoritative. A restart re-derives everything:

| state | derived from |
|-------|--------------|
| issue claimed | `agent:running` + `agent/issue-<n>` exists |
| PR under review | open PR with head ref `agent/issue-*` |
| shas already reviewed | each review's `commit_id` |
| cycle count | number of agent-authored reviews on the PR |
| terminal outcome | `agent:approved` / `agent:failed` |

Not derivable: the reviewer's session id for the cycle-2 `--resume`. It lives in
the local dir with the transcripts, and losing it is a graceful degrade — cycle 2
starts fresh, worse but correct.

Local dir per run (`~/.ateam-runner/runs/<repo>/<issue>/<stamp>/`): the prompt
each role was given, its argv, the full result JSON, and stderr. The conversation
itself stays where Claude Code already keeps it — the run records the
`session_id`, so `claude --resume <id>` replays it. **Nothing is attached to the
PR**: transcripts are long and can echo repo content into a place with different
visibility. The PR gets the verdict; the paths go in the log.

Observability: structured log lines plus a `status` subcommand that queries
GitHub and prints the table above. No UI in v1.

## Build order

| # | Milestone | State |
|---|-----------|-------|
| 1 | Executor, one-shot — claim, worktree, spawn, push, open PR | ✅ |
| 2 | Reviewer, one-shot — fresh session, issue + diff, typed verdict onto the PR | ✅ |
| 3 | Watch loop — both loops polling, serial, label-driven, `Blocked by #N` respected | ✅ |
| 4 | Revision loop — resume, cap 3, disjoint-objection stop, escalation labels | ✅ |
| 5 | Safety config — hermetic spawn, `PreToolUse` denylist, base-branch check + override | ✅ |
| 6 | Local adapter + dev-phase cutover — `issue-swarm` no longer referenced anywhere | ✅ |
| 7 | `prd-to-issues` swap — issues phase runs `ticket-writer` batch decomposition | ✅ |
| 8 | Docs + bootstrap — `feature/SKILL.md` checks for the runner and says where it lives | ✅ |

**Verified: the local path, end to end.** Against a scratch repo, one issue went
issues.md → worktree → implementation → independent review → approved in 73s for
$0.31 (sonnet both roles, one cycle, no unmet criteria). The reviewer ran the
suite itself and reported green; the diff was two files and no scope creep; the
commit carried its `Implements issue:` marker, so a re-run correctly found
nothing to do rather than spending again.

**Not yet verified: the github path.** No issue has gone `agent:ready` → PR →
verdict against a real repo, because that needs a repo to point at and creating
issues and PRs somewhere real is the operator's call. That run is the POC gate,
and it is what the extraction in `PLAN.md`'s deferred list waits on.

Unit tests: 50, no network.

## Changes to existing files

Done:

- `PLAN.md` — phase table, Dev + PR, the GitHub-authoritative argument (one of
  its three reasons died with the `issue-swarm` dependency), the subagent-limit
  note, build order 8 and new 17, deferred list.
- `.claude/skills/feature/SKILL.md` — bootstrap check, phase table, the issues
  phase (two steps now, not three), the dev phase (runner invocation,
  orchestrator contract, `needs-detail` handling).
- `CONTRACT.md` — the harness-owned phases paragraph, and the definition
  phase's backlog line.
- `SKILLS.md` — the `ticket-writer` row.
- `.claude/skills/ticket-writer/SKILL.md` — description, "Place in the
  pipeline" (now the decomposition, not the AC enricher), the mode list, batch
  specifics, and the no-human-present rule. Plus a new
  `references/decomposition.md` carrying the slicing method and the `issues.md`
  shape the runner parses.
- `.claude/skills/{ateam-definition,ateam-spec,epics,dev-research}/SKILL.md` —
  stale references to the borrowed skills.

## Parked

- **Lease + heartbeat + reaping** for stale claims. Dropped from v1 with the
  single-writer assumption; returns with the atomic-ref claim.
- **Parallel execution.** Concurrency is a config value, not a redesign.
- **Transcript retention limits.** No pruning in v1.
- **Webhooks** instead of polling. Needs a tunnel.
- **Agent SDK** substrate behind the `runner` interface.
- **A second local viewer.** `rev` already covers looking at diffs; building a UI
  now guesses at what matters before a run has been watched to failure.
