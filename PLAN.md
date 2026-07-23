# The A-Team — Plan

An agentic product team: a harness that takes a feature prompt and drives it to a
production-ready PR, passing through discovery, definition, design, design-spec,
issues, and dev phases. An orchestrator sequences role-specific skills (PM,
Design, Dev), gating at the phases where wrong direction is cheapest to catch and
most expensive to let through.

This repo is **harness-only**. It operates on a separate target repository passed
in at invocation. Intended future home: `subvisual/harness`.

The source of truth for team shape is the [Figma board][board] (17 Jul session).
This document is that board made executable; where the two disagree, the board
wins.

[board]: https://www.figma.com/board/5asX8AH51sXf9zTjOsQZDf/The-A-Team

## Principles (from the board)

- **Pure craft + context layer only.** Agents hold no project facts. They read the
  project from the context layer, which is what keeps them project-agnostic.
- **Breadcrumbed / versioned.** Every agent documents its process as internal
  deliverables — rewind to any step, see the options and why.
- **Approval gates.** Nothing passes a stage until a human validates.
- **Agents behave like juniors.** They do real work; an adult validates and refines.
- **Humans fix the agents and the process — not the final outputs.**
- **Scoped for ambitious 0→1 work.** Prototype a new product or feature, not small
  tickets.

## Decisions

| Area | Decision |
|------|----------|
| Execution substrate | Claude Code subagents. *Future: explore Claude Agent SDK for durable autonomous runs.* |
| Orchestrator shape | State machine on the main thread. No persistent role-agents (avoids subagent-nesting limits). |
| Human gates | Gate definition and design only. Discovery self-terminates via in-skill read-back; spec, issues, dev run automatically. |
| Skill strategy | Reuse existing dev skills. PM/Design skills authored against a fixed contract. |
| Handoff contract | `feature.json` manifest for state + markdown files for deliverables. |
| Target codebase | Harness-only; operates on a target repo passed as a parameter. |
| PR strategy | One `feature/<slug>` branch, serialized integration, one PR. |
| Failure handling | Retry 2× at issue granularity, then halt and escalate. Never silent-skip. |
| Concurrency | One feature at a time (v1). |
| Target config | Read target `CLAUDE.md` + first-run bootstrap. |

## Two artifact layers

The board's central idea is a **context layer** the agents read instead of
embedding project facts. That layer is worthless if it is rebuilt per feature, so
artifacts split by lifetime, not by producer:

```
<target>/
  docs/product/                 # DURABLE — outlives any one feature
    context.md                  #   digest, glossary, Know/Don't-Know ledger
    jtbd/NN-<slug>.md           #   one file per job — the North Star
    PLAN.md                     #   deliverables to reach v0 (API research, costs)
    input/<YYYY-MM-DD-label>/   #   raw evidence: images, transcripts, Slack, docs
  docs/features/<slug>/         # PER-FEATURE — scoped to one run
    feature.json                #   orchestrator state (source of truth)
    prd.md
    briefs/                     #   wireflow + per-screen page briefs
    design.md
    spec.md
    issues.md
    lofi/                       #   throwaway design prototype
```

Durable artifacts are **append/update-only** and may never be silently
overwritten — a JTBD that is wrong gets `status: superseded` and a pointer, it
does not disappear. JTBDs are cited by feature artifacts, so they must resolve
stably after a feature dir is archived.

> `docs/product/PLAN.md` lives in the **target** repo and lists deliverables to
> reach v0. It is unrelated to this file, which lives in the harness repo.

## Orchestrator

The orchestrator is a state machine that walks a per-feature manifest:

```
read manifest state -> run phase skill -> gate if required -> advance state
```

It runs on the main thread. It does **not** spawn persistent "PM/Design/Dev"
subagents — in Claude Code, subagents generally cannot spawn their own subagents,
which would deadlock the fan-out phases (`issue-swarm`, lo-fi generation). Instead
each "agent" is a phase: a role-specific skill plus prompt, invoked in sequence.

State persists in `feature.json`, so the pipeline is crash-resumable: re-running
the orchestrator reads the manifest and continues from the current phase.

### Entrypoint

```
/feature "<prompt>" --repo <target>    # start a new feature
/feature resume <slug>                  # resume an in-flight feature
```

## Phases

| Phase | Artifact | Gate | Skill |
|-------|----------|------|-------|
| `discovery` | `context.md` + `jtbd/` + `PLAN.md` (durable) | in-skill read-back | `ateam-discovery` |
| `definition` | `prd.md` + `briefs/` | human | `ateam-definition` (stub now) |
| `design` | `design.md` + lo-fi prototype | human | `ateam-design` (stub now) |
| `spec` | `spec.md` (incl. design-system mapping) | auto | `ateam-spec` (stub now) |
| `issues` | `issues.md` | auto | reuse `prd-to-issues` |
| `dev` | code on `feature/<slug>` | auto | reuse `issue-swarm` |
| `pr` | one open PR | final human review | glue we write |

### The PM phase, split in two

The board lists six PM outputs. They are split across two skills, because the
SKILL.md backbone requires each skill to declare exactly one interaction mode and
these two are different modes:

- **`ateam-discovery` — 🔥 grill.** Cannot proceed without the human. Produces
  `context.md`, the JTBD set, and `PLAN.md`.
- **`ateam-definition` — 📝 draft + review.** Derives from approved JTBDs.
  Produces `prd.md`, wireflow + page briefs, and the ticket backlog.

The split line is where the *conversation* splits, not where the files split:
`context.md`, JTBDs, and `PLAN.md` all fall out of one grill, so they ship
together.

### Discovery flow

```
challenge  ->  research  ->  straw-man  ->  grill  ->  read-back  ->  artifacts
(go/no-go)     (ingest +     (committed     (ledger-   (human
               codebase)     first pass)    driven)    corrects)
```

The challenge beat exists because a straw-man cannot ask "should this feature
exist at all" — the board puts `critical request → go/no-go/reshape` first and as
a distinct goal. It is hard-capped and skippable when the prompt already carries a
clear problem statement.

**Termination is defined, not felt.** The grill maintains a `Know / Don't Know`
ledger and asks only the Don't-Knows that *block* a JTBD or a scope call. It stops
when the blocking set is empty. Surviving non-blocking unknowns are written into
the artifacts as open questions and into `PLAN.md` as deliverables — so stopping
loses nothing. A question is only asked if its answer changes an artifact.

### Gates

Discovery ends with an **in-skill read-back**: the drafted JTBD set is presented
for the human to read and correct. This is a correction loop inside a
conversation, not an orchestrator state — answering questions is not the same act
as reading the synthesis those answers produced, and the synthesis is where jobs
get subtly mis-stated.

Formal gates are state transitions with resume semantics, and fire at
`definition`, `design`, and `pr`. The orchestrator presents the artifact inline
and waits for one of:

- **approve** — flip manifest status, continue to next phase in the same session.
- **revise** — re-invoke the phase skill with the human's notes appended; loop until approved.
- **abort** — mark manifest `aborted`, leave artifacts in place (no auto-cleanup), stop.

Gates block within a session; the manifest makes them resumable across sessions.

### Standalone use

Every role skill is **standalone-usable** — the board asserts this as a property.
For discovery it is load-bearing: its outputs are project-level, so it needs no
feature to exist. Point it at a client transcript on day one and get the North
Star, with no `/feature` ceremony.

Mechanically, the manifest is a *branch*, not a requirement: present → read
`prompt` from it and set phase status on exit; absent → take the prompt from
invocation args and skip manifest writes. Project-level writes behave identically
in both modes — standalone is not a back door with weaker review.

### Design → dev contract

Design's floor is **JTBDs + `context.md`**; it consumes `prd.md` and page briefs
when present. The board assigns `Information architecture (with Design)` to PM —
*with*, not *for* — so neither side hard-blocks the other, and design keeps room
to diverge rather than executing a fixed screen list.

Design output is not shippable code. Lo-fi prototypes are a throwaway greyscale
visual reference only. Dev builds the production UI against the **target repo's
existing design system**. Therefore `spec.md` must include a **design-system
mapping**: for every component/state, which existing components/tokens it uses.
This is what makes dev output production-grade rather than bespoke.
*Figma integration (Figma MCP) optional later.*

### Dev + PR

- One feature branch `feature/<slug>`.
- `issue-swarm` implements issues in parallel worktrees.
- **Serialized integration**: merge completed+reviewed issues into the feature
  branch one-by-one, run the full test suite, flag conflicts — rather than N
  parallel merges.
- One PR `feature/<slug> -> <base>`, body assembled from PRD + design + issue list.

### Failure handling

- Transient/mechanical failures retry up to **2×** with the error fed back.
- Retry at **issue granularity** (retry the failed issue, not the whole phase).
- On retry exhaustion: manifest state `failed`, halt, surface what/why, wait for human.
- Never silently skip a failed issue — a dropped issue in a "production-ready PR" is a landmine.

### No human present

A grill blocked with no human to answer does **not** guess. It serialises its
blocking questions into `context.md` under `## Awaiting answers`, sets status, and
halts with a report. The human answers inline and re-invokes; the skill reads the
answers and continues. Per the SKILL.md backbone, *an escalation is a defined
output, not a failure* — and this is exactly the board's "stop, gather more, rerun
`/feature <same name>`" loop.

Autonomous degrade (the agent answering its own questions and flagging
assumptions) is **forbidden** for discovery. An agent inventing user needs
unchallenged and writing them into durable `docs/product/jtbd/` manufactures a
North Star from nothing, and every downstream agent then treats it as ground truth.

## Breadcrumb

Git history is the breadcrumb. The JTBD template already encodes rewind —
`status: superseded | parked`, `supersedes [[NN-...]]`, `sources:` — so a reshaped
job does not vanish, it flips status and points at its replacement. That is "the
options and why", stored where the decision lives instead of in a parallel log
that drifts.

The discipline that makes this work is commit-message-shaped: **one commit per
grill run**, message naming what changed and why —
`docs(jtbd): 03 reshaped — contract recovery is the job, not search`.

A *rendered* trail (the board's open item) is deliberately out of scope: it is a
viewer, buildable later over git, and building it now guesses at a UI nobody has
needed yet.

## Manifest

`feature.json` (orchestrator state; markdown files are the deliverables):

```json
{
  "slug": "saved-searches",
  "prompt": "add saved searches",
  "repo": "../myapp",
  "base_branch": "main",
  "branch": "feature/saved-searches",
  "state": "definition",
  "phases": {
    "discovery":  { "status": "complete",    "artifact": "../../product/jtbd/", "attempts": 1 },
    "definition": { "status": "in_progress", "artifact": "prd.md",     "attempts": 1 },
    "design":     { "status": "pending",     "artifact": "design.md",  "attempts": 0 },
    "spec":       { "status": "pending",     "artifact": "spec.md",    "attempts": 0 },
    "issues":     { "status": "pending",     "artifact": "issues.md",  "attempts": 0 },
    "dev":        { "status": "pending",     "attempts": 0, "issues": {} },
    "pr":         { "status": "pending",     "attempts": 0 }
  },
  "last_error": null
}
```

Phase `status`: `pending | in_progress | complete | approved | failed | aborted`.

## Target config

The orchestrator learns the target's stack/conventions from the target's
`CLAUDE.md`. If absent, a first-run bootstrap runs `/init` to generate one, then
appends a small structured block under a known heading that phases can grep:

```
## A-Team Config
- test command: <cmd>
- base branch: <branch>
- design system path: <path>
- package manager: <pm>
```

## Pluggable phase skills

The orchestrator invokes skills by **reserved name** (`ateam-discovery`,
`ateam-definition`, `ateam-design`, `ateam-spec`) and stays dumb/stable. The
interface each skill implements is fixed in [`CONTRACT.md`](./CONTRACT.md): inputs
it may read, output paths it must write, manifest fields it sets, and its
done-signal.

Until PM/Design deliver, `ateam-definition`, `ateam-design`, and `ateam-spec` are
**no-op stubs** (write a placeholder file, set the manifest status). This tests
orchestration wiring only, not real output. Real skills are drop-in — same name,
same contract.

## Build order (our scope)

1. Manifest schema + artifact layout. ✅
2. Orchestrator state machine skill (`/feature`, `resume`). ✅
3. `CONTRACT.md` (skill interface spec). ✅
4. `ateam-discovery` — the real grill skill. ✅
5. Orchestrator rewire: single `prd` phase → `discovery` + `definition`. ✅
6. No-op stubs for `ateam-definition` / `ateam-design` / `ateam-spec`. ✅
7. End-to-end dry run of `/feature` against a scratch target repo. ← current
8. Wire `prd-to-issues` + `issue-swarm`.
9. `pr` phase glue (serialized integration + PR body assembly).
10. Bootstrap step (CLAUDE.md target config).

## Deferred (not blocking v1)

- Claude Agent SDK migration (durable autonomous runs past gates).
- Figma integration for the design phase.
- Concurrent features in flight.
- Rendered breadcrumb / rewind viewer.
- Service-architecture artifact (board: disagreement, parked).
