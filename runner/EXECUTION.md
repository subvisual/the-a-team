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
delivered; a retry can try publication again. GitHub review requests explicitly
set `commit_id` and validate the returned commit/state, so a concurrent push
cannot attach the review to unevaluated code. Only GitHub's own-PR restriction
permits a comment fallback; that comment explicitly names the evaluated SHA.
See the [GitHub review API contract](https://docs.github.com/en/rest/pulls/reviews#create-a-review-for-a-pull-request).

Successfully delivered `request-changes` and `blocked` reviews have a separate
negative-review record bound to the same current inputs. Watch and direct review
skip an unchanged delivered review; changed inputs or `review --force` trigger
another evaluation. Negative-review records never authorize approval. A failed
publication creates no delivered record and remains eligible for a retry.

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
