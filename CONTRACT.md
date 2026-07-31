# Phase Skill Contract

This document is **canonical**: trees and templates are mirrored in `PLAN.md`
and in skill references for convenience — where any copy disagrees, this file
wins, and the disagreement is a bug to fix in the copy.

This document is the interface between the orchestrator and the pluggable phase
skills. A PM or Designer authoring an `ateam-*` skill implements against this
contract. If your skill honors it, it is drop-in — the orchestrator does not need
to change.

## How the orchestrator invokes a phase skill

The orchestrator invokes phase skills by **reserved name**. It does not know or
care about a skill's internals. Reserved names:

| Phase | Reserved skill name | Interaction mode | Gated |
|-------|---------------------|------------------|-------|
| Discovery | `ateam-discovery` | 🔥 grill | no — in-skill read-back |
| Definition | `ateam-definition` | 📝 draft + review | yes — per `gate_policy` (approval before design; provisional under notify-and-continue) |
| Design | `ateam-design` | 📝 draft + review | yes — per `gate_policy` (approval before spec; provisional under notify-and-continue) |
| Design spec | `ateam-spec` | 🚀 autonomous | no |

The `issues`, `dev`, and `pr` phases are owned by the harness (reuse of
`prd-to-issues` / `issue-swarm` + PR glue, with `ticket-writer` enriching
`issues.md` acceptance criteria after decomposition, and `product-report`
writing the durable `docs/product/ateam-product-report.md` at the end of the
pr phase — from the run's artifacts **and the final v0 code**, before the PR
opens) and are not authored via this contract.

Every skill **declares exactly one interaction mode** in its SKILL.md. Mixed modes
are a contract violation: the human cannot tell whether the agent is waiting or
working.

## The two artifact layers

Artifacts split by **lifetime**, not by producer.

| Layer | Path | Lifetime | Rules |
|-------|------|----------|-------|
| Durable | `<target>/docs/product/` | outlives any feature | append/update-only, never silently overwritten |
| Per-feature | `<target>/docs/features/<slug>/` | one run | freely rewritten by its owning phase |

```
docs/product/
  context.md                  # digest, sources, glossary, design + technical context,
                              #   Know/Don't-Know ledger
  jtbd/NN-<slug>.md           # one file per job
  epics/NN-<slug>.md          # one file per epic — durable delivery structures, same lifecycle rules
                              # Citation syntax: bare [[NN]] / [[NN-slug]] ALWAYS cites a job;
                              # epics cite as [[epic:NN]] (any future durable class gets a prefix)
  ateam-plan.md               # the plan built for the A-Team agents: goals + deliverables to reach v0
  research-plan.md            # ships with v0: open questions, assumptions + confidence,
                              #   technical research (services, stack, integration costs)
  ateam-product-report.md     # the PRD for the product — end-of-run report (pr phase):
                              #   product framing, epics on the MoSCoW scope, what actually shipped
  research/<YYYY-MM-DD>-<slug>.md  # append-only synthesis runs — the evidence audit trail
  input/<YYYY-MM-DD-label>/   # raw evidence — human-dropped or skill-staged verbatim pulls; never edited

docs/features/<slug>/
  feature.json                # orchestrator state
  prd.md
  briefs/                     # wireflow + per-screen page briefs
  design.md
  spec.md
  issues.md
  lofi/
```

**Rules for durable artifacts** — these bind every skill that writes to
`docs/product/`:

- **Never delete or silently replace.** A job that is wrong gets
  `status: superseded` plus a pointer to its replacement. Feature artifacts cite
  JTBDs by id, so ids must resolve stably forever.
- **Never write one without human review in the same session.** A durable artifact
  written unreviewed pollutes every future feature.
- **`input/` is append-only evidence.** Humans drop evidence there. A skill may
  **stage** a verbatim connector pull (Notion, Granola, Slack, ops API) as a new
  clearly-labeled batch — `input/<YYYY-MM-DD>-<source>-pulled/` — so the audit
  trail survives the source changing or vanishing. A skill never edits, deletes,
  or summarizes-in-place an existing batch; digests belong in `context.md`.

## Environment given to every phase skill

The orchestrator sets working context before invoking a phase skill:

- **Target repo root**: absolute path. All reads and writes are under it.
- **Feature directory**: `docs/features/<slug>/`.
- **Product directory**: `docs/product/`.
- **Manifest**: `feature.json` in the feature directory. Read it for `slug`,
  `prompt`, `repo`, `base_branch` — and, when set, `gate_policy` and
  `run_brief` (design reads `fidelity`, dev reads `purpose`). Do not hand-edit
  fields other than your own phase entry (see "done-signal").
- **Role intake banks**: the harness repo's `intake/` directory — absolute path
  passed at invocation. Rubric pre-work each role skill reads at run start.
  Three banks, one per role: `pm-intake.md`, `design-intake.md`,
  `dev-intake.md`. Each seeds ledger entries tagged with its role; all three
  route through the same answerability rule. `dev-intake.md` additionally
  carries a **`## Declared defaults`** section (required heading, Dev-owned
  contents) — the team-level technical defaults discovery applies instead of
  asking. Precedence: **project binding > team default > ask**.
- **Target config**: the target repo's `CLAUDE.md`, including the `## A-Team Config`
  block (test command, base branch, design-system path, package manager).
- **Revision notes** (on a `revise` gate loop): the human's feedback is appended to
  your invocation prompt. Re-produce the artifact incorporating it.

### Manifest-optional invocation

A skill may be invoked directly by a human, outside `/feature`. The manifest is a
**branch, not a requirement**:

- Manifest present → read `prompt` from it; set your phase status on exit.
- Manifest absent → take the prompt from invocation args; skip all manifest writes.

Everything else — especially durable writes and their review step — behaves
**identically** in both modes. Standalone is not a back door with weaker review.

## Per-skill contract

### `ateam-discovery` — 🔥 grill

- **May read**: the feature `prompt` (manifest or args); `docs/product/` in full;
  `docs/product/input/**`; the target repo; the harness repo's `intake/` banks
  (`pm-intake.md`, `design-intake.md`, `dev-intake.md` — authored by the role
  owners as rubric pre-work, including the dev bank's `## Declared defaults`).
- **Must write**:
  - `docs/product/context.md` — digest of raw input, the source index, glossary,
    the `## Design context` and `## Technical context` briefing sections, and the
    `Know / Don't Know` ledger. Frontmatter tracks which `input/` batches have
    been ingested.
  - `docs/product/jtbd/NN-<slug>.md` — one file per job (template below).
  - `docs/product/ateam-plan.md` — the **plan built for the A-Team agents**:
    goals (job-traced) and deliverables to reach v0, grouped into initiatives
    with decision criteria.
  - `docs/product/research-plan.md` — the **research plan that ships with the
    v0**: open questions, assumptions made by agents/humans with confidence
    levels, and technical research (services, stack, integration costs) —
    seeded from surviving non-blocking unknowns. Both plans are written
    together (one compile step) and kept live through later phases.
  - `docs/product/input/<YYYY-MM-DD>-grill-digest/` — the verbatim record of
    the grill, staged at the write step like any input batch (per exchange:
    the question · the recommended answer · the human's answer). Grill answers
    are raw input like any other; this is the batch `sources:` cites for
    grill-derived facts, and later runs read it instead of re-asking.
  - `docs/product/research/<YYYY-MM-DD>-<slug>.md` — **evidence-heavy runs
    only**: the append-only synthesis run (themes, contradictions, verdicts
    against existing jobs, new-job signals). Declared here so it is a permitted
    output path rather than a stray write.
- **Process shape**: `challenge (+ run brief) → research → straw-man →
  dev review → grill → read-back → independence handoff → write`.
- **Dev review of the drafted jobs**: after the straw-man and **before** the
  grill, discovery dispatches a **one-shot subagent** running the Dev-owned dev
  research skill, over the drafted job set + the target repo. It is not a phase
  and has no reserved name; the orchestrator is not involved. Rules:
  - **Announce before dispatching.** The skill declares 🔥 grill mode, so
    silent work would break the mode's promise that the human always knows
    whether the agent is waiting or working.
  - **Returns through the ledger, never directly.** Its findings enter the
    `Know / Don't Know` ledger tagged `[dev]` and route by the same
    answerability rule as any bank entry. The return path is **role-agnostic**
    by design, so a future design agent plugs into the same slot.
  - **Three-way answer rule** (the carve-out to *no autonomous degrade*, below):
    verifiable from the target repo → answer it, with its source; a **settled
    technical fact lands in `## Technical context`**, and the ledger entry
    simply closes with a pointer at it (one fact, one home — the ledger records
    that the question is answered, it does not become a second copy) ·
    covered by a `## Declared defaults` entry → apply it, record a
    confidence-stamped assumption in `research-plan.md`, surface at the gate ·
    neither → it is a question, routed by the ledger.
  - **Fires once, re-fires at most once** — only if the grill materially
    reshaped the jobs (headline changed, job added, confidence moved). On the
    re-fire only *blocking* findings may reopen the grill; everything else goes
    to `research-plan.md`. Termination stays defined, not felt.
  - **Optional by absence.** If the dev research skill is not available, say so
    in-conversation, record the gap in `research-plan.md` as an open item, and
    continue. Not a blocking flag, not a halt — an unreviewed job set is a
    degraded run, and a *recorded* degradation is not a dishonest one.
  - **Substance lands in `research-plan.md`; jobs carry citations only** — see
    the JTBD template's technical rule below.
- **Run brief**: capture how the human wants the A-Team to run. The manifest's
  `run_brief` holds four fields — `purpose`, `fidelity`, `timebox`,
  `done_looks_like`. The **questions and their answer options** live in
  `intake/pm-intake.md`; skills read them there rather than carrying copies. Runs alongside the challenge beat but is **not
  skippable with it** — `run_brief` is a required manifest write. Durable
  per-project defaults may live in `context.md` so repeat runs don't re-ask.
- **Intake routing**: seed the ledger from all three `intake/` banks, each entry
  tagged with its consumer role (`[pm]` / `[design]` / `[dev]`), then route by
  **answerability**: blocking + answerable by this human → asked in the grill;
  blocking but not answerable by this human → a research activity in
  `research-plan.md` (never a wasted question); non-blocking → stays in the
  ledger. The grill never asks a bank question raw.
- **Termination**: the blocking set of the `Know / Don't Know` ledger is empty, or
  the human stops it. A question is only asked if its answer changes an artifact.
- **Read-back is mandatory**: present the drafted JTBD set for correction before
  writing durable files. This is in-conversation, not an orchestrator gate.
- **Independence handoff**: after the read-back, present how the run will
  proceed and have the **human** choose the `gate_policy` — `block` (default;
  wait at every gate) / `notify-and-continue` (gates become logged provisional
  checkpoints, reviewed on return) / `run-to-pr` (only the final PR review
  blocks). Write `gate_policy` + `run_brief` to the manifest. The agent never
  chooses the policy; absent an answer, `block` stands. State explicitly:
  "assumptions made after you leave land in `research-plan.md` with confidence
  levels."
- **Done-signal**: set `phases.discovery.status = "complete"`. No gate — the
  orchestrator advances to `definition`.

#### context.md template — the canonical shape

```markdown
---
project: <name>
updated: <YYYY-MM-DD>
ingested: [2026-07-17-client-call, 2026-07-24-granola-pulled]  # digested input/ batches
---

# Context: <project name>

## Overview            # what/why, audience, stage, goals, constraints, key links;
                       # jobs cited by id, headline quoted exactly — never paraphrased
## Digest              # per ingested batch: what the evidence says, pointers into input/
## Sources             # audit index of everything discovery consumed — one line per source
                       #   (link visited, provided file, connector pull, the grill digest):
                       #   type · pointer (URL or input/ path) · date · what it informed
## Glossary            # term | working definition | status (settled/forming/TBD) | source
## Design context      # from the design briefing: users & emotional goals, brand personality,
                       #   aesthetic direction (refs + anti-refs), accessibility, 3–5 design principles
## Technical context   # settled technical facts: stack binding, external dependencies,
                       #   infra/deploy, data sensitivity,
                       #   non-functional constraints, v0 test bar
## Know / Don't know   # Don't-Knows tagged blocking (naming what they block) or non-blocking,
                       #   plus a consumer tag ([pm] | [design] | [dev]) when a role's intake seeded it
## Awaiting answers    # present only while an escalation is open
```

Full annotated template: the `project-context` skill's
`references/context-template.md`. Load-bearing: refresh-never-rebuild (a refresh
that drops content is a forbidden overwrite); TBD stays visible, never smoothed
into prose; renamed glossary terms are never deleted; every `## Sources` row
resolves — a live URL or a path on disk — and `## Overview` keeps only the 2–3
load-bearing product links (Sources is the complete index); the ledger's
**blocking** set is the grill's termination condition — non-blocking unknowns
flow to `research-plan.md` as open questions.

**One fact, one home.** `## Design context` and `## Technical context` hold only
*settled* facts. Uncertainty belongs in `research-plan.md` with a confidence
level; machine-readable config belongs in the target's `## A-Team Config`. No
file restates another — a fact stored twice will disagree with itself, and both
copies are durable.

#### JTBD template — this is the contract design couples to

```markdown
---
id: 03
slug: recover-a-mis-filed-contract
status: active            # active | superseded | parked
confidence: directional   # strong | moderate | directional | hypothesis
sources: [granola-2026-07-17, sketch-03.png]
---

# When <situation>, I want <progress>, so I can <outcome>.

## Context
Who, when, how often. What triggers it.

## Today
How it's solved now, and what that costs.

## Forces
Push / pull / anxiety / inertia — the demand evidence the statement rests on.

## Success
Observable signal the job is done well.

## Don't know
Open questions that survived the grill.

## Related
[[01-...]], supersedes [[02-...]]
```

Load-bearing:

- **The headline is the strict JTBD sentence, never a feature name.** "I want a
  dashboard" is not a job. This is the discipline that keeps the North Star a
  need rather than a solution.
- **`sources` traces every job back to raw input**, so a reviewer can audit what
  the agent was told versus what it inferred. Grill answers count as raw input:
  discovery stages them as an `input/<date>-grill-digest/` batch and jobs cite
  that batch — every `sources:` entry must resolve to something on disk.
- **`status` + `supersedes` are the breadcrumb.** Reshaped jobs flip status and
  point forward; they are not deleted.
- **`confidence` is stamped honestly.** A job built from assertions alone is a
  `hypothesis`; downstream consumers must see how much weight a job can bear
  before building on it.
- **Parked candidates are real files.** Triage writes each unpursued struggle as
  `status: parked` holding only a draft headline and open questions — nothing
  invented — so no candidate evaporates with a conversation.
- **Technical findings are cited, never restated.** A job is demand-side by
  construction. The dev review's substance — API analysis, auth needs, stack
  constraints — lives in `research-plan.md`; what reaches the job file is only
  the *effect on the job*: a moved `confidence:`, a `sources:` entry citing the
  review, and at most a one-line pointer. Solution-side content in a job body
  fails the `jobs-to-be-done` rubric, and a second copy under ids-forever
  semantics is a durable contradiction waiting to happen.

### `ateam-definition` — 📝 draft + review

- **May read**: `docs/product/**` (context, JTBDs, `ateam-plan.md`); the manifest; the target repo.
- **Must write**:
  - `prd.md` in the feature directory — problem, goals/non-goals, scope, user
    stories, acceptance criteria. Every scoped item traces to a JTBD id.
  - `briefs/` in the feature directory — wireflow + per-screen requirements.
  - the ticket backlog input consumed later by `prd-to-issues`.
  - `docs/product/epics/NN-<slug>.md` — the Epics: durable delivery structures
    bundling the PRD's requirement IDs, traced to job ids (durable rules apply —
    ids forever, supersede never delete, human review at the gate).
- **Done-signal**: set `phases.definition.status = "complete"`. The orchestrator
  flips it to `approved` after the human gate.

### `ateam-design` — 📝 draft + review

- **May read**: `docs/product/context.md` + `docs/product/jtbd/**` (**required
  floor** — context.md's `## Design context` section carries the design
  briefing: users & emotional goals, brand personality, aesthetic direction,
  accessibility, design principles; and `## Technical context`, the settled
  technical facts) **plus `research-plan.md`'s technical assumptions and open
  questions** — also a required floor, so a design can never be specced past a
  constraint the dev review already surfaced; `prd.md` and `briefs/`
  (**optional** — consume when present); the target repo's design system (path
  from A-Team Config); the manifest's `run_brief` (`fidelity` calibrates how
  deep the lo-fi goes).
- **Must write**:
  - `design.md` in the feature directory — IA, user flows, screen/layout
    direction, visual approach, and the options considered with reasoning.
  - a throwaway lo-fi prototype under `docs/features/<slug>/lofi/` — visual
    reference only, not production code.
- **Diverge by default**: produce multiple options, not one. Record why the
  non-chosen ones were dropped.
- **Done-signal**: set `phases.design.status = "complete"`. Orchestrator flips to
  `approved` after the human gate.

### `ateam-spec` — 🚀 autonomous

- **May read**: `prd.md`, `design.md`, the lo-fi prototype, `docs/product/**`, and
  the target repo's design system.
- **Must write**: `spec.md` in the feature directory.
- **Content expectations** — this is the dev-facing contract, so it must be explicit:
  - Component breakdown.
  - Every state per component: empty / loading / error / populated.
  - Responsive behavior.
  - **Design-system mapping (required)**: for each component/piece, which existing
    design-system components and tokens it uses. This is what makes dev output
    production-grade instead of bespoke. No raw px/hex — reference tokens.
  - Interactions and edge cases.
- **Done-signal**: set `phases.spec.status = "complete"`. No gate; orchestrator
  advances automatically.

## Rules for all phase skills

- **Write only to your declared output path(s).** Do not touch other phases' artifacts.
  **One standing exception — the assumption ledger**: any phase skill may
  **append** new entries to `docs/product/research-plan.md`'s `## Assumptions`
  and `## Open questions` sections (never edit or delete existing ones), each
  entry tagged with the writing phase — e.g. `· [design phase]` — and carrying
  a confidence level. This is the mechanism behind the independence promise:
  assumptions made while no human is present must land there, not in a report
  that scrolls away.
- **Report blocking flags loudly.** Your return report must surface, as a
  distinct list, every blocking flag your run produced: "serves an unlisted
  job?" signals, `TBD`s inside committed (Must) scope, failed self-checks,
  qualitative criteria that need a human run. The orchestrator's provisional
  gates depend on this list being honest — an empty flags list is a claim,
  not a default.
- **Only set your own phase's `status` field** in the manifest. The orchestrator owns
  everything else (state transitions, approvals, attempts, errors). One
  exception: `ateam-discovery` also writes `gate_policy` and `run_brief` —
  once, from the human's answers at the independence handoff.
- **Be idempotent.** A skill may be re-invoked (revise loop, resume after crash).
  Overwrite per-feature artifacts cleanly rather than appending duplicates; update
  durable artifacts in place per the superseding rules above.
- **Read project facts from the context layer only.** Zero project facts embedded in
  the skill. This is what keeps the agent project-agnostic.
- **Fail loudly.** On an unrecoverable error, do not write a partial artifact and
  claim success. The orchestrator handles retries and escalation.
- **Respect target conventions.** Follow the target repo's `CLAUDE.md` (e.g. Tailwind
  tokens over px/hex, import style, test command).
- **Self-check before returning.** Verify your output against your own quality bar.
  "Done" is defined in the skill, not felt by the agent.

## No human present

A skill whose declared mode requires a human (🔥 grill, 📝 review) and that finds
no human to answer must **escalate as a written artifact, never guess**:

1. Serialise the blocking questions — one per heading — into `context.md` under
   `## Awaiting answers`.
2. Leave the phase `status` as `in_progress`.
3. Halt and report what is needed.

The human answers inline and re-invokes; the skill reads the answers and
continues. An escalation is a defined output, not a failure.

**Autonomous degrade is forbidden for discovery.** An agent that answers its own
questions and writes invented user needs into `docs/product/jtbd/` manufactures a
North Star from nothing, and every downstream agent treats it as ground truth.
Assumption-flags do not mitigate this.

**The one carve-out — the dev review.** The dev reviewer may resolve a question
two ways without a human: when it is **verifiable from the target repo** (a read
is a fact, not a guess — the design bank already holds this rule: *a question the
codebase already answers is never asked*), or when it is **covered by a
`## Declared defaults` entry** (a standing team decision applied openly, recorded
as a confidence-stamped assumption and surfaced at the gate — not an invention).

The carve-out is **technical only and does not widen**. No agent may answer a
demand-side question — user need, who it is for, priority, scope, business
context — under any confidence flag. The prohibition above stands undiminished
for everything job-shaped; reading `package.json` is not manufacturing a North
Star, and the two must never be conflated to justify each other.

## Status vocabulary

`pending` → `in_progress` → `complete` → (`approved` for gated phases) | `failed` | `aborted`

Phase skills only ever set `complete` (or leave `in_progress`/`failed` on error).
`approved`, `failed`-escalation, and `aborted` are set by the orchestrator.
