---
name: feature
description: Use when driving a feature prompt to a production-ready PR through discovery, definition, design, spec, issues, and dev phases, or when the user runs /feature or /feature resume — orchestrates the A-Team agentic pipeline over a target repo.
---

# feature — A-Team orchestrator

Drives one feature from a prompt to a production-ready PR. You are a **state
machine on the main thread**. You do not spawn persistent role-agents; you invoke
role-specific phase skills in sequence, gating at definition, design, and pr
(dispatched per `gate_policy`; the final pr review always blocks).

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

**Artifact commits stage both artifact layers.** `discovery` writes only to
`docs/product/`; later phases write mainly to `docs/features/<slug>/` but also
touch the durable layer (definition's epics, the pr phase's plan refresh and
product report). When committing a phase's artifact (`docs(...)`), staging only
the feature dir silently drops the durable artifacts — `git add` both paths there.

## The two artifact layers

```
<target>/docs/product/           # DURABLE — outlives any feature
  context.md  jtbd/NN-*.md  epics/NN-*.md  ateam-plan.md  research-plan.md
  project-plan.md  ateam-product-report.md  research/  input/<YYYY-MM-DD-label>/
<target>/docs/features/<slug>/   # PER-FEATURE — everything else
  feature.json  prd.md  briefs/  design.md  spec.md  issues.md  lofi/
```

Durable artifacts are cited by feature artifacts and outlive them. You never edit
them yourself — phase skills own them per `CONTRACT.md` (discovery most of the
layer; definition the epics; the pr phase the plan refresh, the project plan,
and the product report), updating in place per the superseding rules there.
One exception you *do* own: the `milestone:` frontmatter key the issues phase
writes back into `epics/NN-*.md`, and nothing else in those files.

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
   base branch, design-system path, package manager, `github issues`). If the
   block is missing, run the **bootstrap** (below) first. **Base branch
   precedence:** A-Team Config value wins over any default. **`github issues`
   absent → treat as `off`** — an older config predating the key is not
   consent.
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
   args, **three** absolute paths — the feature directory, the product
   directory, and the harness `intake/` directory (this skill lives in the
   harness repo; `intake/` sits at its root). The skill reads prior artifacts +
   the manifest and writes its output per `CONTRACT.md`.
4. On return, re-read the manifest. The skill should have set its own
   `status = "complete"` and written its artifact.
   - Artifact missing OR status not `complete` → treat as **failure** (see below).
   - **Exception — escalation (any phase).** If the skill halted for want of a
     human, it leaves `status = "in_progress"` and says what it is waiting on
     (`discovery` writes an `## Awaiting answers` block into
     `docs/product/context.md`; `definition` halts when its North Star is
     missing and reports that discovery must run first). This is a **defined
     output, not a failure**: do not bump `attempts`, do not retry. Commit,
     surface what is needed to the user, and stop. A later `resume` picks up
     from there.
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
unlisted-job signals, `TBD`s inside Must scope, failed self-checks,
qualitative criteria that need a human run). When you process a phase's
return, copy its blocking-flags list into `phases.<phase>.blocking_flags`
(empty list when none) before dispatching the gate — the gate evaluates the
manifest, not the ephemeral report, so a crash-resumed run at
`status == "complete"` still trips correctly. A tripped
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

Three steps, one phase:

1. Invoke `prd-to-issues` against `prd.md` + `spec.md`, with `briefs/` as
   supporting context (the page briefs carry per-page ACs), → `issues.md`
   (decomposition: tracer-bullet slices, dependency order).
2. Invoke `ticket-writer` (AC-only mode, batch across `issues.md`) to enrich
   every issue's acceptance criteria to Gherkin — sourced from the PRD's
   requirement ACs and the spec — and stamp each issue's `[[NN]]` job trace.
   Enrichment edits `issues.md` in place without adding, removing, or
   reordering issues; decomposition gaps it reports are surfaced to the human
   at the next gate, not silently fixed.
3. **GitHub projection (conditional)** — mirror the decomposition into the
   target's GitHub repo. Skipped by default; see the subsection below.

When all three steps are done, set status `complete`, commit, advance to `dev`.

**Path mapping (steps 1–2):** `prd-to-issues`' own PRD-location/output defaults
(`prds/`, `docs/agents/prds.md`) do **not** apply in-pipeline — the input is
`docs/features/<slug>/prd.md` (+ `spec.md`) and the output is
`docs/features/<slug>/issues.md`. Pass both explicitly in the invocation args.

**Files-touched notes (step 1):** each issue's technical notes must name the
files it expects to touch, so the dev phase can sequence file-colliding issues
up front instead of discovering conflicts at integration.

**Requirement trace (step 1):** each issue must also record the **PRD
requirement IDs** it implements. Ask for it explicitly in the `prd-to-issues`
invocation args — it decomposes *from* the PRD, so the mapping exists at that
moment and is expensive to reconstruct later. It is what step 3 resolves an
issue's epic through (epics bundle requirement IDs), and what lets a reviewer
check coverage: a requirement no issue claims is a hole in the decomposition.

#### Step 3 — the GitHub projection

**`issues.md` remains the source of truth.** The swarm reads it, not GitHub.
This is a projection: everything downstream keeps working when it is skipped,
which is what lets the skip conditions below be safe.

**Fire it only when all three hold:**

- `## A-Team Config` says `github issues: on`. **Absent or `off` → skip.**
  Silence is not consent to write into a shared repo, and skipping costs
  nothing recoverable.
- The target has a GitHub remote and `gh` is authenticated
  (`gh auth status`). Otherwise skip.
- **Hard guard — the target is not the A-Team's own repo.** Skip if either
  holds: the target's `origin` remote resolves to **`subvisual/the-a-team`**
  (host-agnostic, `.git` suffix and protocol ignored), or the target root
  contains **both `CONTRACT.md` and an `intake/` directory** at its top level —
  the harness's own signature, which also catches a fork or a rename. A
  `/feature` run pointed at the A-Team must **never** create issues in it: it
  is a harness that operates on *other* repos, and dry runs would litter it.
  **Not overridable by config** — `github issues: on` does not lift it.
  The second test can false-positive on an unrelated repo that happens to have
  both. It fails **safe** — the projection is skipped and `issues.md` is
  untouched — and the skip is reported with its reason, so a legitimate
  collision is visible rather than silent.

**What it creates**, in this order:

- **Milestones from epics.** One per `active` epic in `docs/product/epics/`,
  titled from the epic. `done` epics keep any `milestone:` they already have —
  reconcile (close it if still open), never create a new one. `parked` epics
  get no milestone until they go active. Write the returned number back as a `milestone:`
  frontmatter key in the epic file — the one cross-owner write CONTRACT.md
  permits, and what makes re-runs reconcile instead of duplicate. A **re-titled**
  epic still matches by number; a **superseded** epic's milestone is **closed**
  with its description pointing at the replacement, never deleted.
- **Labels from job ids**, `jtbd:NN-slug` (e.g. `jtbd:03-recover-a-mis-filed-contract`)
  — id first, since the id is the stable part and the slug can be re-worded.
  Created if missing. A **superseded** job's label **stays**: closed issues
  wear it, and deleting it would strip their history. New issues use the
  replacement's label.
- **Issues from `issues.md`**, each carrying a label per job it traces to and
  its epic's milestone. **Deriving the epic**: an issue's `[[NN]]` job stamps
  and the PRD requirement IDs it implements resolve to an epic via that epic's
  bundled requirement IDs (`Requirements realized`) — requirement match first,
  job match only as a fallback. An issue resolving to **two** epics means the
  decomposition crosses an epic boundary; assign the requirement-matched one
  and surface the overlap. An issue resolving to **none** gets no milestone,
  which is itself a flag worth reporting.
  An issue tracing to **no job** is a decomposition defect — surface it to the
  human at the next gate rather than creating an untraceable issue.

**Write every returned issue number back into `issues.md`.** Without it the
step is not idempotent, and a revise loop or crash resume silently duplicates
the whole set in GitHub. With the numbers on disk it becomes reconcile-not-create:
re-runs update existing issues and create only what is genuinely new.

**Never fatal, never a blocking flag.** A skipped or failed projection does not
make an artifact wrong, and blocking flags halt the run regardless of
`gate_policy` — that power is reserved for correctness defects. State the skip
and its reason in the phase report and in the PR body, then continue.

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

**Closing the projected GitHub issue** (only when step 3 actually ran): as each
issue reaches `complete`, close its mapped GitHub issue, referencing the branch.
Read the number from `issues.md` — never re-derive it by searching GitHub by
title. If the number is absent, the projection was skipped; do nothing and say
so once in the phase report rather than per issue.

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
2. **Plan refresh** (the PM's keep-artifacts-live duty — a locked decision):
   invoke `discovery-plan` once to fold every phase-appended assumption and
   open question into current `ateam-plan.md` + `research-plan.md` — the v0
   ships with plans that reflect what was actually built, not what discovery
   predicted. The same step writes **`docs/product/project-plan.md`**: the plan
   for the **project after v0** — what is left undone, what the epics say comes
   next, what the research plan's open questions imply for the roadmap. Durable
   rules apply.

   Keep the three plans distinct; conflating them is what made this file
   necessary. `ateam-plan.md` is the plan to **reach** v0 (the agents' own
   plan) · `research-plan.md` is the honest disclosure **shipping with** v0 ·
   `project-plan.md` is the plan for what happens **after** v0, for the human
   team. Keep it separate from `ateam-product-report.md` too: the report is
   backward-looking and code-grounded, the project plan is forward-looking and
   necessarily speculative, and mixing verified claims with speculation is how
   a report loses its authority. Commit.
3. **Config refresh** (keep-artifacts-live, extended to config): update any
   `## A-Team Config` fact the run invalidated — e.g. dev introduced a test
   suite, so `test command: none` becomes the real command. Commit as `chore`.
4. **Product report** (durable): invoke `product-report`. It reads the run's
   artifacts — `context.md`, jobs, epics, `ateam-plan.md`, `research-plan.md`
   (post-refresh), `prd.md`, `design.md`, `spec.md`, `issues.md` — **and the
   final v0 code** on `feature/<slug>`, and writes
   `docs/product/ateam-product-report.md`: the PRD for the product — product
   framing, the epics on the MoSCoW scope, and what actually shipped. Durable
   rules apply (update in place, supersede — never silently replace). Commit as
   `docs(<slug>): product report`. This runs **before** the PR opens so the
   report ships inside it and the final human review covers it.
5. When all issues are integrated and the full suite is green, open one PR
   `feature/<slug> → <base_branch>` (via `gh`). Body assembled from `prd.md` +
   `design.md` + the issue list — and link `research-plan.md` as the run's
   honest disclosure. If the GitHub projection ran, reference the milestone;
   if it was **skipped**, say so and why, so nobody assumes issues exist.
6. Present the PR link for final human review. Set `state = "done"`, save + commit.

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
   - github issues: <on|off — ask; write the literal word, not the choice list>
   ```
   **`github issues` must be asked, never detected.** Creating issues is an
   outward-facing write to a shared repo, and bootstrap is the one moment a
   human is reliably present — under `notify-and-continue` or `run-to-pr`
   nobody is there when the issues phase runs, so an interactive prompt then
   would either hang or defeat the policy. This line is that consent, given
   once and recorded durably. If you cannot ask, write `off`.
3. Commit the new/updated `CLAUDE.md` to the **base branch, before the feature
   branch is created** (`git -C <target> add CLAUDE.md && git -C <target>
   commit -m "chore: bootstrap A-Team Config"`). Config is repo infrastructure
   every future run needs — not feature work riding a deletable branch.
4. Continue startup.

## Manifest

See `manifest-template.json` in this skill directory. Status vocabulary:
`pending → in_progress → complete → approved | failed | aborted`.
Phase skills only ever set `complete`. You (the orchestrator) own `approved`,
`failed` escalation, `aborted`, all `state` transitions, `attempts`, and each
gated phase's `blocking_flags` (copied from its report at return-processing;
like `"provisional"`, it is written when relevant, not templated).

`gate_policy` and `run_brief` are written **once by `ateam-discovery`** from
the human's answers at the independence handoff (default `gate_policy:
"block"` when unset). You read them — gates dispatch on `gate_policy`; phases
may read `run_brief` (design reads fidelity, dev reads purpose). Never change
either without an explicit human instruction in the conversation.

## Concurrency

One feature at a time (v1). Do not start a second feature while one is in flight.
