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
cd runner && npm test               # synthetic agents/GitHub; loopback proxy
npm run test:boundary               # real macOS process isolation
node bin/ateam-runner.mjs --help
```

Requires Node 20+, Git and Claude Code. Execution requires the tested macOS
Seatbelt backend; GitHub commands also require an authenticated supervisor `gh`.
Zero npm dependencies. Follow [execution setup](runner/EXECUTION.md) before use.
Prepare an existing target clone and pass `--path` (or configure its path).
For a first run, follow the [synthetic onboarding walkthrough](runner/ONBOARDING.md).
`doctor --path DIR --json` checks local prerequisites, references, pinned target
bindings, isolation and permissions without installation, model starts or remote
calls. It reports blocked conditions with repairs and withholds configuration
values and raw process errors. Its native availability probe does not resolve
the whole-process-tree containment limitation in #37.

```
ateam-runner init                              # write ~/.ateam-runner/config.json
ateam-runner watch --repo org/foo              # poll for ready issues and unreviewed PRs
ateam-runner run    --repo org/foo --issue 12  # one issue, end to end
ateam-runner review --repo org/foo --pr 34     # one PR, fresh reviewer session
ateam-runner status --repo org/foo             # state, re-derived from GitHub
ateam-runner doctor --path /absolute/target --json # read-only local setup checks
```

Label an issue `agent:ready` and the daemon takes it. `--once` runs a single
watch tick; `--dry-run` lists what would run and changes nothing.
`watch --json` and `watch --dry-run` require `--once`. Every finite `--json`
command emits one versioned envelope; logs go to stderr. See the
[CLI contract](runner/CLI.md) for result shapes, migration and exit codes.

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
daemon:      ateam-runner watch --repo org/foo --path /existing/clone
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
| 14b | Verdicts use a commit-pinned review, with a marked comment only for GitHub's own-PR restriction | Immutable evidence records the numeric server publication/actor IDs and body digest. Reuse fetches and authenticates that exact publication; markers alone have no authority. Blocked attempts remain pending evaluation |
| 15 | GitHub carries workflow state; local immutable records carry approval evidence | Labels and comments alone cannot establish verification of the current revision |
| 16 | Stable local IDs and dependency ancestry; concurrency 1 | Local continuation selects a verified approved chain without merging. A dependency is ready only when its current approved revision is present in the selected base |
| 17 | Reviewer assesses criteria; supervisor independently runs declared checks | An approval requires both a valid review and successful checks on the exact committed head |
| 18 | Lives in `the-a-team` for the POC | Extract to its own repo + brew tap once one issue goes label → PR → verdict unassisted |
| 19 | Spawned sessions use native role policies, minimal environment and isolated settings | Hooks and settings suppress unintended context; Seatbelt enforces child filesystem and network access |

## Claim

A local `O_EXCL` claim records the repository, issue, host, PID, process identity
and an unguessable ownership token. Single writer per repository remains the
execution contract. Release checks the token so an old owner cannot remove a
replacement's claim.

A same-host claim can be recovered only after its owner is proven dead (or its
observed process-start identity proves that the PID was reused). A successful
liveness check without a comparable process-start identity remains live. Age
alone never authorizes recovery. Foreign-host, legacy, malformed and unreadable
owners remain blocked. Recovered claim metadata is archived beside the claim;
its failed branch and checkout are retained.

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

The executor reports a strictly validated result and commits its work. It cannot
push. The supervisor checks scope, imports the commit, and owns publication.
An executor completion report alone is not approval.

Refuses — `agent:needs-detail`, comment saying what is missing, claim released —
when the issue carries no checkable acceptance criteria.

## Reviewer

Spawned as its own process with read-only source in a fresh detached private Git
checkout of the exact head. Its separate writable scratch supports temporary
test/build output. Native policy applies to Bash and descendants as well as
tools. Schema-constrained output is also validated at runtime.

Inputs: the issue body (the contract) and the diff (the artefact). Never the PR
body, never the executor's transcript, never its notes.

Runs the suite and pastes real output. Judges only against the acceptance
criteria — anything it wants that is not in the AC is out of scope by
definition, which is also the anti-oscillation lever. For each criterion it
returns a concise obligation-to-check map covering independent expected values,
the exercised public behavior, substituted system boundaries, current
requirement source revision, baseline version/authorization, and its semantic
adequacy judgment. The supervisor binds those identifiers to the accepted base
revision; only complete canonical ledger history with an actual authorized
definition change can authorize a changed baseline. Green machine checks do not
supply the semantic judgment. Approval records retain the map and authority
binding and fail closed when either is absent or admits a known gap.

Cycle 1 is a fresh session. Cycles 2-3 `--resume` that same session in stable
reviewer-only scratch, with a new source checkout and explicit current paths.
The reviewer checks its previous objections and guards already satisfied
criteria against regressions, without adding requirements.

## Safety

The issue body is untrusted text that becomes agent instructions, and comments
can be appended *after* the label, so the label alone is not a sufficient
checkpoint. The executor runs non-interactively; there is nobody to say no
mid-run.

The [execution contract](runner/EXECUTION.md) defines the actual guarantees and
supported environment. Preflight freezes target identity, harness revision,
bindings, scope and verification commands. It refuses harness targets and
canonical path escapes before mutation. Explicit invocation exceptions name
individual CI files and are retained in evidence.

Seatbelt restricts executor writes to authorized source/private Git and scratch;
reviewer and supervisor-check source is read-only. An explicit minimal child
environment excludes publishing credentials. Model networking uses an exact
authority proxy; supervisor checks are offline. The backend fails closed when
unavailable. Tool settings and path hooks are defense in depth.

The issue is snapshotted and framed as untrusted data. Strict result gates and
independent checks on committed source prevent approval from malformed output,
dirty worktree corrections or reviewer claims unsupported by supervisor checks.
A documentation-only exemption must be explicit, applicable and recorded.

GitHub credentials and branch publication stay with the supervisor. Existing
branch-protection preflight refuses known unprotected bases unless explicitly
overridden; an unknown protection state is still reported as unknown. Narrow
PAT provisioning and stronger unknown-state handling remain separate work.

`--max-budget-usd` caps spend per spawned session.

## State

GitHub supplies workflow state. Approval additionally requires a current local
record binding repository, criteria, policy, base/head and verification evidence:

| state | derived from |
|-------|--------------|
| issue claimed | ownership-checked local claim; GitHub running label is workflow visibility |
| PR under review | open PR with head ref `agent/issue-*` |
| review provenance | exact GitHub publication and numeric author identity matching immutable review evidence; head/cycle markers are display pointers |
| current approval | valid local approval record matching current inputs |
| claimed terminal label | `agent:approved` / `agent:failed`; a stale approval is reported invalid |

Attempt checkpoints retain the reviewer session ID, current cycle, unmet criteria,
private checkout, imported head and completed evaluation. Interrupted execution
can continue from those exact artifacts after rechecking the current issue,
base, dependencies and approval inputs.

Local run records (`~/.ateam-runner/runs/<repo>/<issue>/<stamp>/`) retain prompts,
argv, results, stderr, independent check output and versioned approval evidence.
Agent session storage lives in isolated role scratch; it does not use operator
Claude state. Keep approval records and their referenced output. Transcripts
are not attached to the PR; the PR gets the verdict and evidence identity.

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

**Historical proof before native isolation and supervisor verification:** Against a scratch repo, one issue went
issues.md → worktree → implementation → independent review → approved in 73s for
$0.31 (sonnet both roles, one cycle, no unmet criteria). The reviewer ran the
suite itself and reported green; the diff was two files and no scope creep; the
commit carried its `Implements issue:` marker, so a re-run correctly found
nothing to do rather than spending again.

**Not yet verified: the github path.** No issue has gone `agent:ready` → PR →
verdict against a real repo, because that needs a repo to point at and creating
issues and PRs somewhere real is the operator's call. That run is the POC gate,
and it is what the extraction in `PLAN.md`'s deferred list waits on.

Current verification uses synthetic agents/GitHub and real native boundary probes;
it does not repeat that authenticated proof or establish production readiness.

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

- **Distributed leases and heartbeats.** Current recovery only proves local
  process ownership/liveness; foreign-host claims require explicit reconciliation.
- **Parallel execution.** Concurrency is a config value, not a redesign.
- **Transcript retention limits.** No pruning in v1.
- **Webhooks** instead of polling. Needs a tunnel.
- **Agent SDK** substrate behind the `runner` interface.
- **A second local viewer.** `rev` already covers looking at diffs; building a UI
  now guesses at what matters before a run has been watched to failure.


## Durable local continuation

Local issue titles and `Implements issue:` commit messages are display text.
Neither a failed branch nor an unrelated commit can complete an issue or unblock
its dependents. The adapter and dry-run planner reconstruct current status from
stable issue IDs/content versions, immutable approval records, current policy,
verification evidence and Git ancestry. Renames, criteria changes, missing Git
objects, exhausted attempts, stale claims and uncertain actions remain distinct.

The selected continuation is an existing approved descendant chain. Its head is
pinned by SHA before the next executor starts, and each required dependency SHA
must already be an ancestor of that base. A reviewed branch can be available
without being integrated into the human-selected delivery base. Divergent
approved branches remain available but cannot unblock work on another chain.
The runner does not merge or cherry-pick them.

Supervisor-owned history under `~/.ateam-runner/history/` consists of immutable,
fsynced event files. Events retain issue/version/attempt identity, selected base,
dependency heads, checkout/branch/head, stage, outcome, failure category, evidence
paths and available cost/duration. Status is replayed from these events. New
recovery windows append to lifetime history; they do not erase attempts or costs.

Each supervisor adapter action has a stable intent/result identity. An action
with no confirmed result stays uncertain and blocks automatic repetition until
its exact result is reconciled. Local report/base projections and missing local
delivery receipts can be rebuilt from current approval evidence. Remote actions
require their own authoritative receipt. Failed or unaccounted checkouts and
branches are kept; successful checkout cleanup follows the recorded delivery.


Aggregate allowance and timeout work ([#37](https://github.com/subvisual/the-a-team/issues/37))
is partial. Accounting and explicit recovery are covered; unobserved detached
orphans can escape macOS ancestry-based cleanup. See the precise
[execution limitation](runner/EXECUTION.md#retained-allowances-and-process-timeouts).

## Synthetic evaluation corpus

The runner provides `npm run test:evaluation -- --output <new-directory-outside-harness>` for the portable corpus and `--profile native` for all 20 cases on native macOS with trusted browser tooling. See [runner/EVALUATION.md](runner/EVALUATION.md) for native setup, retained source digests, seeded-defect proof, two-target isolation, and separate agent/expert records. Keep `npm test` and `npm run test:boundary` as independent checks. No provider/model launch or publishing is performed. Model trials and human evaluations remain explicitly not run until separately authorized and evidenced, and #37 keeps release eligibility false.
