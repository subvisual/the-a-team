---
name: feature
description: Use when driving a feature prompt to a production-ready PR through discovery, definition, design, spec, issues, and dev phases, or when the user runs /feature or /feature resume — orchestrates the A-Team agentic pipeline over a target repo.
---

# feature — A-Team orchestrator

Drives one feature from a prompt to a production-ready PR. You are a **state
machine on the main thread**. You do not spawn persistent role-agents; you invoke
role-specific phase skills in sequence, gating at definition and design.

`PLAN.md` and `CONTRACT.md` in the **harness repo** root hold the full design
rationale. This skill is the executable procedure.

## Preconditions

- You run as the **interactive main thread**. Gates require a human to answer in
  the conversation, and the `discovery` phase is a grill that cannot complete
  without one. If there is no human to prompt (e.g. you are a subagent), do not
  fabricate approval — halt and report.
- You have the `ateam-discovery`, `ateam-definition`, `ateam-design`,
  `ateam-spec`, `prd-to-issues`, and `issue-swarm` skills available. If a required
  phase skill is not available, halt and tell the user to install it — do not
  hand-simulate it.

## Invocation

```
/feature "<prompt>" --repo <target>     # start a new feature
/feature resume <slug> --repo <target>  # resume an in-flight feature
```

`--repo` defaults to the current directory if omitted. `<target>` is the git root
you operate on.

`ateam-discovery` is also **usable standalone**, without you — a human can invoke
it directly to seed `docs/product/` before any feature exists. When you later run
`/feature`, it reviews and extends those jobs rather than re-deriving them.

## The one rule

**The manifest is the source of truth.** Every step reads `feature.json`, acts,
then writes `feature.json` back. Never hold state only in your head — if the
session dies, the next run must reconstruct everything from the manifest.

**Every manifest write is immediately committed**, so a hard reset or crash can
never lose committed state. Commit messages: manifest-only changes use
`chore(<slug>): <what>` (e.g. `advance to design`); artifact changes use
`docs(<slug>): <phase>`.

**Manifest-only commits stage only the manifest.** A `chore(...)` commit is
`git -C <target> add docs/features/<slug>/feature.json && git -C <target>
commit -m "<msg>"` — never the whole feature or product tree. Mid-phase those
trees hold in-progress artifacts, and a broad add silently sweeps them into a
bookkeeping commit, breaking the chore-vs-docs breadcrumb split (proven in the
2026-07 dry run: a gate-policy chore commit swallowed the PRD).

**Artifact commits stage both artifact layers.** `discovery` writes to
`docs/product/`, every other phase writes to `docs/features/<slug>/`. When
committing a phase's artifact (`docs(...)`), staging only the feature dir
silently drops the durable artifacts — `git add` both paths there.

## The two artifact layers

```
<target>/docs/product/           # DURABLE — written by discovery-side skills only
  context.md  jtbd/NN-*.md  epics/NN-*.md  PLAN.md  research-plan.md  research/  input/<YYYY-MM-DD-label>/
<target>/docs/features/<slug>/   # PER-FEATURE — everything else
  feature.json  prd.md  briefs/  design.md  spec.md  issues.md  lofi/
```

Durable artifacts are cited by feature artifacts and outlive them. You never edit
them yourself — `ateam-discovery` owns them, and updates in place per the
superseding rules in `CONTRACT.md`.

## Git and filesystem mechanics

- All file and git operations target the **target repo**, never the harness repo.
- Use absolute paths and `git -C <target>` for every git command. **Never `cd`**
  (CWD resets between calls and `cd` triggers permission prompts).
- The manifest is always the file `<target>/docs/features/<slug>/feature.json`
  (the `manifest-template.json` in this skill dir is only a template — the on-disk
  name is `feature.json`).

## Slug rules

Derive `<slug>` from the prompt deterministically: lowercase, keep `[a-z0-9]`,
replace runs of other characters with a single `-`, trim leading/trailing `-`,
cap at 50 chars, then trim back to the last `-` so no word is cut mid-way (and
strip the trailing `-` that leaves). Example: `"Add saved searches!"` →
`add-saved-searches`; a 50-char cut ending `…-guardians-of-atla` becomes
`…-guardians-of`.

If `<target>/docs/features/<slug>/` already exists on a **new** run, stop and ask
the user (resume it, or pick a different slug) — never silently overwrite.

## Startup

1. Resolve the **target repo** (`--repo`, else CWD).
2. Read `<target>/CLAUDE.md`. Find the `## A-Team Config` block (test command,
   base branch, design-system path, package manager). If missing, run the
   **bootstrap** (below) first. **Base branch precedence:** A-Team Config value
   wins over any default.
3. **New feature:**
   - Compute `<slug>`. Check that neither the feature dir nor the branch
     `feature/<slug>` already exists (`git -C <target> rev-parse --verify
     feature/<slug>`); if either exists, stop and ask the user (resume, or pick a
     different slug) — never silently overwrite.
   - `git -C <target> checkout -b feature/<slug> <base_branch>` (create the branch
     **before** writing artifacts, so they land on the feature branch).
   - Create `<target>/docs/features/<slug>/` and `<target>/docs/product/`. Write
     `feature.json` from the template with `state: "discovery"`, all phases
     `pending`, `attempts: 0`, filling `slug`, `prompt`, `repo`, `base_branch`,
     `branch`.
   - `git -C <target> add docs/features/<slug> && git -C <target> commit -m "chore(<slug>): init feature manifest"`.
     (`docs/product/` is empty at this point and git cannot stage an empty
     directory — expected; never add placeholder files to the durable layer to
     force it in.)
   **Resume:**
   - Read `<target>/docs/features/<slug>/feature.json`. Do not reset anything.
   - Ensure HEAD is on the feature branch: `git -C <target> checkout feature/<slug>`.
4. Enter the phase loop.

## Phase loop

Read `manifest.state`, then dispatch by the current phase's `status`. Apply these
rules in order (they resolve every resume case unambiguously):

- `status == "failed"` → **terminal.** Do not re-run. Surface `last_error` and the
  failed phase to the human and stop. Only proceed after the human fixes the cause
  and resets the phase `status` to `pending` (and, for dev, the offending issue's
  `status`/`attempts`).
- `status == "approved"` → the gate already passed; advance `state` to the next
  phase and continue. (Handles a crash between "approve" and the state bump.)
- `status == "complete"` **and phase is gated** (`definition`/`design`) → do **not**
  re-run; go straight to that phase's gate.
- `status == "complete"` **and phase is ungated** → advance `state`.
- `status == "in_progress"` → an interrupted run; re-invoke the phase skill (skills
  are idempotent).
- `status == "pending"` → run the phase.

| state | action | gate (HITL) | on success → |
|-------|--------|------|--------------|
| `discovery` | `ateam-discovery` | — (grill + in-skill read-back) | `definition` |
| `definition` | `ateam-definition` | ✅ | `design` |
| `design` | `ateam-design` | ✅ | `spec` |
| `spec` | `ateam-spec` | — | `issues` |
| `issues` | `prd-to-issues` + `ticket-writer` (AC enrich) | — | `dev` |
| `dev` | `issue-swarm` | — | `pr` |
| `pr` | integrate + open PR | ✅ final review | `done` |

`discovery` has **no orchestrator gate**. It is a 🔥 grill: the human is present
throughout and the skill ends with its own read-back of the JTBD set. Adding a
gate would cost a manifest state and a second approval ritual to guard a document
the human has just read. Do not add one.

### Running a phase skill (`discovery`, `definition`, `design`, `spec`)

1. (You only reach here for `status` `pending` or `in_progress` — the dispatch
   rules above handle `complete`/`approved`.)
2. Set `phases.<phase>.status = "in_progress"`, save + commit manifest. (Do **not**
   touch `attempts` here — `attempts` counts failure-retries only, see Failure.)
3. **Invoke the reserved skill via the Skill tool by name** (`ateam-discovery` /
   `ateam-definition` / `ateam-design` / `ateam-spec`). Pass, in the invocation
   args, **both** absolute paths — the feature directory and the product
   directory. The skill reads prior artifacts + the manifest and writes its output
   per `CONTRACT.md`.
4. On return, re-read the manifest. The skill should have set its own
   `status = "complete"` and written its artifact.
   - Artifact missing OR status not `complete` → treat as **failure** (see below).
   - **Exception — `discovery` escalation.** If the skill halted for want of a
     human, it leaves `status = "in_progress"` and writes an `## Awaiting answers`
     block into `docs/product/context.md`. This is a **defined output, not a
     failure**: do not bump `attempts`, do not retry. Commit, surface the pending
     questions to the user, and stop. A later `resume` picks up from there.
5. Commit the artifact:
   `git -C <target> add docs/features/<slug> docs/product && git -C <target> commit -m "docs(<slug>): <phase>"`.
   For `discovery`, prefer the skill's own commit message naming what changed and
   why (e.g. `docs(jtbd): 03 reshaped — contract recovery is the job, not search`);
   only fall back to `docs(<slug>): discovery` if it left the work uncommitted.

### Gates (`definition`, `design`, `pr`)

Gate behavior is governed by `manifest.gate_policy` — chosen by the **human**
during discovery's independence handoff (never by an agent), default `"block"`:

- **`block`** (default) — the safety valve. Present the artifact inline and
  wait for approve / revise / abort (below).
- **`notify-and-continue`** — do not wait: set
  `phases.<phase>.status = "approved"` with `"provisional": true`, emit a
  checkpoint summary (what was produced, the riskiest calls, where assumptions
  landed in `research-plan.md`), commit, continue. The returning human reviews
  provisional phases at the next blocking moment (or on `resume`): accepting
  clears the flag; requesting changes triggers the revise flow below, and
  downstream phases re-run from there.
- **`run-to-pr`** — lunch mode: same provisional mechanics at every gate; the
  **final `pr` review always blocks** regardless of policy.

**Tripwire — bad signal closes the valve.** A gate may pass provisionally
**only when the phase's report lists no blocking flags** (per CONTRACT.md:
unlisted-job signals, `TBD`s inside Must scope, failed self-checks). A tripped
gate **blocks and waits regardless of policy**, stating exactly what tripped
it. The human's chosen policy governs the happy path; it never overrides bad
signal.

**Assumption relay.** When a phase's report names assumptions it made, verify
they were appended to `research-plan.md` (phase-tagged, with confidence — the
CONTRACT append exception). If the skill failed to append them, append them
yourself from the report before committing the phase. An assumption that lives
only in a report is a broken promise to the absent human.

On `resume`, if any phase carries `"provisional": true`, present those
artifacts for review **before** continuing past the next gate.

At the `definition` gate (blocking or checkpoint), present `prd.md` **together
with the JTBD set it scopes against** — the PRD's claims are only checkable
against the jobs they trace to.

Blocking-gate responses:

- **approve** → set `phases.<phase>.status = "approved"`, advance `state`, save +
  commit, continue.
- **revise** → re-invoke the phase skill with the human's notes appended to its
  args. Loop the gate. Revisions **do not** touch `attempts` (they are not failures).
  Revising an already-passed (provisional) phase additionally resets every
  downstream phase to `pending` — they re-derive from the revised artifact.
- **abort** → set `state = "aborted"`, save + commit, stop. Leave all artifacts. No cleanup.
  **Never delete an aborted feature branch**: the durable `docs/product/`
  updates (jobs, context, plans) live on it until merged — deleting the branch
  deletes North Star history (accepted trade-off of branching before writes;
  decision 2026-07-24).

Gates block within the session. Because the manifest persists (and status is
checked on resume), a killed session resumes at the same gate.

### `issues` phase

Two steps, one phase:

1. Invoke `prd-to-issues` against `prd.md` + `spec.md` → `issues.md`
   (decomposition: tracer-bullet slices, dependency order).
2. Invoke `ticket-writer` (AC-only mode, batch across `issues.md`) to enrich
   every issue's acceptance criteria to Gherkin — sourced from the PRD's
   requirement ACs and the spec — and stamp each issue's `[[NN]]` job trace.
   Enrichment edits `issues.md` in place without adding, removing, or
   reordering issues; decomposition gaps it reports are surfaced to the human
   at the next gate, not silently fixed.

**Path mapping:** `prd-to-issues`' own PRD-location/output defaults (`prds/`,
`docs/agents/prds.md`) do **not** apply in-pipeline — the input is
`docs/features/<slug>/prd.md` (+ `spec.md`) and the output is
`docs/features/<slug>/issues.md`. Pass both explicitly in the invocation args.

**Files-touched notes:** each issue's technical notes must name the files it
expects to touch, so the dev phase can sequence file-colliding issues up front
instead of discovering conflicts at integration.

Then set status `complete`, commit, advance to `dev`.

### `dev` phase

Invoke `issue-swarm` on `issues.md`, each issue in its own worktree, gated by the
swarm's reviewer.

**Scope the swarm explicitly (in its invocation args).** The swarm implements
and reviews only — it must **skip its own reconcile/cleanup phase**: branches
stay unmerged for the `pr` phase; it never edits or deletes `issues.md` or
`prd.md` (both are persistent contract artifacts — the PR body is assembled
from `prd.md`); no push, no PRs. Followed verbatim, the building skill's own
cleanup step merges into the base branch itself and then deletes both files.

**Branch naming:** the orchestrator supplies **full branch names** in the swarm
args (overriding the swarm's `branch_prefix` default): each issue branch is
`feature/<slug>-issue-<id>` (flat). **Never** `feature/<slug>/issue-<id>` —
git refuses a nested ref when `feature/<slug>` already exists as a branch
(ref-as-file vs ref-as-dir conflict).

**Dependencies:** an issue that `depends-on` another must be based on its
dependency's branch, not the bare `feature/<slug>` branch. Two issues branched
independently that touch the same file are guaranteed to conflict at integration.
Sequence dependent issues; only truly independent issues run in parallel.

**Orchestrator ↔ swarm contract (avoids double-counting retries):**
- The orchestrator invokes `issue-swarm` and **owns** `phases.dev.issues`
  (`{ "<id>": {status, attempts} }`). Record each issue's outcome there from the
  swarm's report — the swarm does not write the manifest.
- One `issue-swarm` invocation of an issue = **one orchestrator attempt**, whatever
  the swarm does internally (its reviewer gate and any internal fixups are part of
  that single attempt — do not count them separately).
- On failure, re-invoke `issue-swarm` **scoped to only the failed issue id(s)**,
  feeding the error back. Never re-run `complete` issues. Bump only the failed
  issue's `attempts`.

Retry a failed issue up to **2×** (per-issue `attempts`); never skip a failed
issue silently. Issue still failing after 2 retries → escalate: set that issue's
`status = "failed"` **and** `phases.dev.status = "failed"`, set `last_error`, save +
commit, halt (see Failure). Completed issues' branches are **preserved** (not
discarded) for the human to integrate after resolving the failure.

### `pr` phase — serialized integration

1. Merge completed+reviewed issues into `feature/<slug>` **one at a time, in
   dependency order** (dependencies before dependents), with plain
   `git merge --no-edit`. **Do not attempt fast-forward merges — they are
   structurally impossible here**: the manifest-commit discipline puts chore
   commits on the feature branch at every issue-status change, so by pr time it
   has always diverged from every issue branch. After each merge run the
   target's test command (if dev introduced a suite the config doesn't yet
   name, run the real suite — and refresh the config in step 3). On conflict or
   red tests, halt and escalate naming the offending issue — never commit a
   broken or conflicted merge.
2. **Plan refresh** (the PM's keep-artifacts-live duty, locked decision #11):
   invoke `discovery-plan` once to fold every phase-appended assumption and
   open question into current `PLAN.md` + `research-plan.md` — the v0 ships
   with plans that reflect what was actually built, not what discovery
   predicted. Commit.
3. **Config refresh** (keep-artifacts-live, extended to config): update any
   `## A-Team Config` fact the run invalidated — e.g. dev introduced a test
   suite, so `test command: none` becomes the real command. Commit as `chore`.
4. When all issues are integrated and the full suite is green, open one PR
   `feature/<slug> → <base_branch>` (via `gh`). Body assembled from `prd.md` +
   `design.md` + the issue list — and link `research-plan.md` as the run's
   honest disclosure.
5. Present the PR link for final human review. Set `state = "done"`, save + commit.

## Failure handling

A phase "fails" when its skill errors, produces no artifact, or leaves an
incorrect status. `attempts` counts **failure-retries only** (starts at 0).

- On failure: if `phases.<phase>.attempts >= 2` → escalate (below). Otherwise bump
  `phases.<phase>.attempts`, save, and re-invoke feeding the error back. (Dev phase:
  same rule at **issue granularity** on `phases.dev.issues.<id>.attempts`.)
- Escalate: set the failed unit's `status = "failed"`,
  `manifest.last_error = "<what/why>"`, save + commit, **stop and surface to the
  human**. Do not proceed. Do not silent-skip.
- **An environment-killed subagent is not a phase failure.** If a subagent dies
  on an infrastructure error (session limit, API outage) rather than failing
  the work itself: verify its workspace is clean, resume or re-dispatch it, and
  do **not** bump `attempts` (proven recovery path, 2026-07 dry run).

## Bootstrap (missing target config)

If the target `CLAUDE.md` lacks `## A-Team Config`:

1. If no `CLAUDE.md` at all, generate one **for the target repo**: apply the
   `/init` skill's analysis to `<target>` (read the target's files, write
   `<target>/CLAUDE.md`). The bare `/init` command analyzes the session's CWD —
   never rely on it when `--repo` points elsewhere.
2. Append (never overwrite) an `## A-Team Config` block with detected values;
   ask the user for any you cannot detect:
   ```
   ## A-Team Config
   - test command: <cmd>
   - base branch: <default branch>
   - design system path: <path>
   - package manager: <from lockfile>
   ```
3. Commit the new/updated `CLAUDE.md` to the **base branch, before the feature
   branch is created** (`git -C <target> add CLAUDE.md && git -C <target>
   commit -m "chore: bootstrap A-Team Config"`). Config is repo infrastructure
   every future run needs — not feature work riding a deletable branch.
4. Continue startup.

## Manifest

See `manifest-template.json` in this skill directory. Status vocabulary:
`pending → in_progress → complete → approved | failed | aborted`.
Phase skills only ever set `complete`. You (the orchestrator) own `approved`,
`failed` escalation, `aborted`, all `state` transitions, and `attempts`.

`gate_policy` and `run_brief` are written **once by `ateam-discovery`** from
the human's answers at the independence handoff (default `gate_policy:
"block"` when unset). You read them — gates dispatch on `gate_policy`; phases
may read `run_brief` (design reads fidelity, dev reads purpose). Never change
either without an explicit human instruction in the conversation.

## Concurrency

One feature at a time (v1). Do not start a second feature while one is in flight.
