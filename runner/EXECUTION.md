# Execution policy and approval evidence

The runner resolves a target policy before changing run state or GitHub state.
Use an existing clone via `--path` or a configured repository path. Prepare and
fetch it explicitly before invoking the runner; execution no longer clones or
fetches implicitly. The resolved base commit stays fixed for that issue.
Ordinary project execution refuses the harness itself, its renamed forks
(the `CONTRACT.md` plus `intake/` signature), mismatched Git identities, and
paths that resolve outside the target. The projection safeguard still applies.

## One target configuration

Keep bindings in the target's existing `CLAUDE.md`, under one `## A-Team Config`
heading. The runner accepts these bullet keys, or a JSON object with their
camelCase names inside a `json` fence under that heading:

```markdown
## A-Team Config
- harness root: /absolute/path/to/the-a-team
- harness revision: <full committed harness SHA>
- target remote: git@github.com:your-org/your-project.git
- base branch: main
- current context: docs/product/context.md
- product context: docs/product/
- design system path: src/design/tokens
- package manager: npm
- verification commands: ["node --test"]
- read paths: ["."]
- write paths: ["src", "test", "docs"]
- output paths: ["docs/features"]
- github issues: off
```

The existing `test command` key remains supported. A project verification
contract wins over team commands, including `--test-cmd` fallbacks. Context,
design, package-manager and path bindings also prefer the project over team
defaults. Missing verification commands are unresolved; agents cannot supply a
replacement that authorizes approval. Missing design bindings stay `null`;
the runner never generates a competing context or token file.

An explicit `--base feature/example` selects that invocation's base. Otherwise
the project base wins over the team/repository default. The local adapter may
advance the next issue's base to a previously approved branch. The resolved SHA
and bindings are recorded for each issue.

SSH and HTTPS remotes normalize to one host/owner/repository identity; a remote
containing embedded HTTP credentials is refused. Relative paths are resolved
against the target and checked through symlinks. A configured harness revision
must match the invoked checkout. Upgrades require changing that pin deliberately;
the runner never fetches or upgrades the harness. An absent pin uses and records
the actual invoked commit. Commit harness changes before operational use so that
the recorded revision identifies the code being run.

`github issues` still governs issue projection: absent means `off`. It does not
grant agent network access. Explicit GitHub `run`/`watch` invocations authorize
the supervisor's branch, PR, verdict, label and comment operations. `review`
authorizes verdict and label operations. Local runs only record local approval.
An optional `supervisor actions` array can restrict these actions; preflight
rejects an invocation that needs a disabled action. It cannot add actions to a
local invocation. Action names are `push-branch`, `open-pr`, `post-verdict`,
`update-labels`, `comment`, and `record-local-approval`.

## Scoped invocation exceptions

Declare requested paths with repeatable `--scope-path`. A protected path is a
preflight conflict unless the supervisor receives an explicit authorization
file for that invocation:

```json
{
  "id": "human-request-ci-maintenance",
  "protectedPaths": [".github/workflows/ci.yml"]
}
```

Pass `--authorization-file /path/to/authorization.json`. The ID and exact paths
are frozen into the policy and approval evidence. Only the named CI file is
writable; unrelated CI files, directory renames, Git configuration, hooks,
`CLAUDE.md`, and agent settings remain protected. No wildcard or directory
exception is accepted. Narrow native exceptions support writing the named file
in place; editors that require a temporary sibling in the protected directory
must use a different write strategy. After execution, changed and output paths
are canonicalized and checked again before importing or publishing a commit.

For documentation-only work, the same supervisor authorization may include
`"documentationExemption": { "reason": "Explain why no executable check applies" }`.
This is an explicit recorded exemption, never inferred from `test command: none`.
It applies only to eligible documentation changes and never excuses an unmet
acceptance criterion, a failed process, or malformed review output.

## Supported native boundary

The supported backend is **macOS Seatbelt through `/usr/bin/sandbox-exec`**.
Node 20+, Git, Claude Code and that executable must be installed. Other operating
systems and environments that prevent applying the profile fail closed; there
is no unsandboxed fallback. Seatbelt's third-party interface is undocumented
and deprecated by Apple: this is a harness-tested backend, not a claim of Apple
support or portability. Run the boundary suite after an OS/toolchain upgrade.

The supervisor's `~/.ateam-runner/config.json` may set:

```json
{
  "sandbox": {
    "backend": "macos-seatbelt",
    "claudeExecutable": "/absolute/path/to/claude",
    "toolchainPaths": ["/opt/homebrew/opt/node/bin"],
    "modelAuthorities": ["api.anthropic.com:443"]
  }
}
```

These are trusted operator settings, not target-config privileges. Each
toolchain path grants read/execute access to that directory and puts it on
`PATH`; declare the narrow installation locations needed by the target. System
reads include macOS frameworks/libraries, `/usr`, `/bin`, `/sbin`, command-line
developer tools, system certificates/resolver files, randomness devices, and
the Node/Claude executables. Only the runner's two hook source files are added
from the harness. Other operator files, credential stores and arbitrary home
directories are outside the read boundary. Git history and deliberately
declared source/toolchain files are inputs, not a secret-scanning service.
Because Git objects contain complete source and history, this backend requires
`read paths: ["."]`; narrower confidential subdirectory scopes are refused.
Credential-named paths (`.env*`, `.npmrc`, `.netrc`, `id_rsa`, `id_ed25519`) in
reachable Git history are also refused before launch, even if deleted at HEAD.
Prepare a sanitized repository explicitly when that prerequisite applies.
These name checks do not claim to detect arbitrary secrets embedded in source.

Executor and reviewer processes, including their shell descendants, inherit the
same enforced profile. Executor writes are restricted to authorized source
paths, its private Git objects/refs/index, and separate scratch. Reviewer and
supervisor-check source is read-only; temporary/build outputs must use the
provided scratch directory (`TMPDIR`, `HOME`, and XDG directories point there).
Tests must support output outside source. Dependencies must already be available
as declared inputs; package installation or unrestricted registry access is not
implicitly enabled. A command that requires additional access fails with its
actual output. Agent `PreToolUse` hooks remain defense in depth.

Each agent gets an independent Git store, with no shared hardlinks, supervisor
Git metadata, remote configuration or hooks. Only validated commits are imported
by the supervisor. Common-directory redirects are denied in the executor and
refused before supervisor Git inspection; Git, common and object-store paths
must resolve inside the independent checkout. Source/scratch paths are disjoint; run records are outside
agent-writable scratch. Reviewer sessions cannot read executor transcripts.

The child environment is replaced, not merged. Only `ANTHROPIC_API_KEY` and
`CLAUDE_CODE_OAUTH_TOKEN`, when supplied, are passed as model credentials. `gh`
credentials, unrelated environment variables, shell initialization, Git global
configuration and `NODE_OPTIONS` are excluded. No operator Claude settings or
MCP configuration is inherited. Claude Code uses its scratch config directory.

Model traffic goes through a supervisor-owned CONNECT proxy allowing exact
declared host/port pairs. Direct outbound traffic, undeclared destinations and
publication endpoints are denied. Supervisor verification has no network access
and no model credentials. Authenticated GitHub work remains in the supervisor.

## Approval means an exact revision was verified

Raw model fields and normalized process results are validated before disposition.
Missing/unknown fields, non-boolean test flags, failed processes, inconsistent
results or approval with unmet criteria cannot produce an approved outcome.
An executor's replacement test command does not change the declared contract.

Every approval uses a fresh detached checkout of the committed head. Dirty or
untracked executor corrections are absent. The reviewer reads that checkout and
the supervisor independently executes the declared checks there. Source mutation
or a failed command invalidates the result. A direct PR review records existing
committed-PR provenance; it does not invent an executor process result.

The versioned approval record binds target and harness identities, issue/criteria
digest, base/head, policy, evaluator, verification command, environment ID,
exit code and output references. Evidence reuse checks these inputs again. A
changed head, base or criteria requires new evidence; a GitHub label or old
comment alone is not proof. Keep these local records: they are required evidence,
not disposable cache. Approval does not establish merge, deployment, user
validation or the correctness of a later combined revision.

Successful delivery has a separate receipt bound to the immutable approval
file. An evaluation record created before a failed publication is not treated as
delivered. A recorded action with an uncertain remote outcome must be reconciled before another publication is attempted. GitHub review requests explicitly
set `commit_id` and validate the returned commit/state, so a concurrent push
cannot attach the review to unevaluated code. Only GitHub's own-PR restriction
permits a comment fallback; that comment explicitly names the evaluated SHA.
See the [GitHub review API contract](https://docs.github.com/en/rest/pulls/reviews#create-a-review-for-a-pull-request).

Review reuse starts from immutable `review-evidence` and `review-receipt` files.
The supervisor records GitHub's numeric publication and actor IDs, the exact
body digest and a review-evidence pointer. On restart, it fetches that exact
review/comment and matches the author ID, PR, body, evaluated commit and outcome.
It also matches current issue/content version, base/head, policy and evaluator
model/session identity. Display names and copied head/cycle markers cannot
authenticate a review or increase the trusted cycle count. Missing, edited or
untrusted evidence appears in `ignoredEvidence` with a reason.

Authenticated completed `approve` and `request-changes` reviews can be reused.
Blocked/failed attempts cannot suppress required evaluation; changed inputs or
`review --force` also require evaluation. A request for changes never authorizes
approval. Local records from before this provenance format remain history but
cannot authenticate remote review reuse.

The implementation follows GitHub's [review](https://docs.github.com/en/rest/pulls/reviews)
and [issue-comment](https://docs.github.com/en/rest/issues/comments) API identity
fields. Tests use synthetic server responses; an authenticated production pilot
is a separate operation.

## Verification

```sh
cd runner
npm test
npm run test:boundary
```

The ordinary suite uses synthetic repositories and stubbed agents/GitHub. The
proxy fixture binds a loopback endpoint. `test:boundary` runs actual native
processes, shells, nested commands, symlink/rename probes, environment canaries
and loopback networking with fake model executables. It must run outside a
parent sandbox that blocks nested Seatbelt or local binding. It never needs real
secrets or live provider/GitHub writes. Passing these tests does not assert a
successful authenticated end-to-end Claude/GitHub run.

See [CLI.md](CLI.md) for pure dry-runs and the versioned stdout envelope.

## Retained allowances and process timeouts

**Issue #37 remains partial.** Spend accounting, recovery windows and observed
process cleanup are implemented. This macOS backend does not yet guarantee the
issue's whole-process-tree termination criterion: a detached descendant can
orphan itself between ancestry snapshots and survive a timeout. A synthetic
three-generation process reproduced this limitation. Keep #37 open until a
supported lifecycle containment mechanism passes that regression. Run the local diagnostic explicitly with `node runner/test/fixtures/orphan-timeout-probe.mjs` from the repository root; it cleans up its own synthetic descendant and is excluded from the passing acceptance suite. A single non-reproduction does not establish containment.

Resolved policy includes `limits`: aggregate `runBudgetUsd` (45 by default),
`executorBudgetUsd` (10), `reviewerBudgetUsd` (5), `runTimeoutMs` (7,200,000),
`sessionTimeoutMs` (1,200,000), and `maxCycles` (3). Values must be positive,
finite numbers; times and cycle counts must be bounded integers. Project config
may declare these numeric fields; effective values are frozen into the policy.

One repository allowance window covers all attempts and both model roles,
including direct PR reviews. Restart and a new issue do not reset it. Before each
model launch, the supervisor records an intent and caps its provider allowance to
the lesser of the role limit and remaining aggregate spend. Verification commands
also receive the lesser of the remaining run time and session time. The run clock
starts when the window opens, so time between retries counts. Exhaustion stops
new launches. A live process timeout tracks PID/start identity and parent ancestry, suspends
and discovers the observed tree across process groups, then sends TERM/CONT and
KILL after a one-second grace period. It also always signals the original group;
partial output and timeout disposition are retained. Execution requires the
supported native POSIX backend; this is not a Windows process-control contract.

`budgets/<repository>/events.jsonl` retains window, launch, accounting and stop
events. Its claim serializes reservations across supervisors. Failed processes
still contribute any reported cost. Missing, invalid or interrupted accounting is
unknown, never zero; a pending launch or unknown cost blocks continuation. Status
and command results expose the current allowance and lifetime known totals plus
unknown costs/pending launches. Keep the ledger with attempt and approval history.

These are provider-reported costs and the provider's session allowance, not a
billing guarantee. The supervisor cannot determine charges omitted after a crash
or force a provider to honor a dollar cap. Reported overspend is retained and
stops the run; unknown charges remain visible even after recovery. Resumed-session
costs are conservatively counted as reported, without inventing a deduction.

A fresh allowance requires an explicit invocation authorization file, for example:

```json
{"id":"operator-approved-recovery-2026-09-10","recoveryWindow":"recovery-2"}
```

Pass it with `--authorization-file`. A new `recoveryWindow` opens one new window
under the newly resolved limits; reusing the same value resumes that window.
An older consumed value cannot reset it. Changed limits alone cannot replenish
an existing window. Recovery preserves earlier attempts, costs and uncertainty;
it does not reconcile an uncertain publication or approve retained source.


## Restart evidence and retained attempts

The local adapter and local dry-run planner share read-only reconstruction from
stable issue versions, current immutable approvals and Git ancestry. Title
markers in any Git ref have no authority. Both expose approved branch
availability separately from integration into the selected delivery base.
Dependencies require the current approved prerequisite revision in the selected
continuation; missing commits, changed criteria/policy, and divergent histories
cannot silently satisfy them. Selecting an existing descendant SHA introduces
no merge, cherry-pick or duplicate implementation revision.

Before creating an executor checkout, the supervisor appends its issue/version,
attempt ID, branch, source path, base and dependency heads to immutable event
history. Execution, imported commits, review/verification and delivery add
checkpoints with retained evidence and available duration/cost. Recovery reuses
only the matching issue version and base/dependency revisions. A saved executor
result or complete evaluation is reused after the matching interruption, so
resume retains the checkout and does not repeat completed implementation or
review. Missing or corrupt history/checkouts block recovery instead of erasing
an attempt. Failed checkouts are not removed.

Adapter side effects use stable action IDs and append an intent before invocation
and a result after confirmation. An interrupted or failed publication whose
outcome cannot be proven remains `action-uncertain`; it is not automatically
posted again. Local adapter report/base actions can be projected from history,
and a missing local receipt can be written from a revalidated approval record.
A current receipt resolves its original action rather than inventing a second
publication. Cycle exhaustion remains exhausted across retries until an
explicitly authorized recovery window is supplied; lifetime attempt and budget
records remain intact.

Claim files record host, PID, process identity and ownership token. Recovery
requires proven same-host process death or a comparable changed process-start
identity. Live, foreign-host and unknown ownership are never reclaimed because
of elapsed time. Release verifies the token and stale claim metadata is retained
alongside the original branch/worktree evidence. Dry-run performs none of these
claim, event, receipt or checkout mutations.

Direct PR review retains action results separately from their projections into
receipts and labels. An unfinished attempt, or a failed attempt with an
acknowledged publication, reports `delivery-incomplete` before either a completed
review skip or another launch, including `--force`. The recorded publication and
attempt remain available for explicit delivery reconciliation. This bounded
command does not automatically repair incomplete GitHub labels or replay an
uncertain publication.

A recovery guard left by an interrupted claim-recovery operation is
`recovery-uncertain`, even when the original claim's process is dead. The guard
and original owner evidence are retained for explicit reconciliation; their age
or an empty guard file cannot prove another recovery operation is absent.
