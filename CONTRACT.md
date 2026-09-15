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

The `issues`, `dev`, and `pr` phases are owned by the harness (`ticket-writer`
decomposing `prd.md` + `spec.md` into `issues.md` with Gherkin acceptance
criteria, the **runner** implementing and independently reviewing each issue,
PR glue, an optional **GitHub projection** of the decomposed issues, and
`product-report` writing the durable
`docs/product/ateam-product-report.md` at the end of the pr phase — from the
run's artifacts **and the final v0 code**, before the PR opens) and are not
authored via this contract.

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
                              # epics cite as [[epic:NN]], ADRs as [[adr:NN]], decisions as
                              # [[dec:NN]] (any future durable class gets a prefix)
  design-system/              # canonical design tokens — scale.ts, palette.ts, shadcn-theme.css
                              #   (design phase, create-once; the design gate is their review)
  adr/NN-<slug>.md            # one file per architecture decision — repo shape, stack, where the v0
                              #   runs, v0 data strategy; same lifecycle rules; cited as [[adr:NN]]
  decisions/NN-<slug>.md      # one file per product-scope decision — the calls that shape what is
                              #   built and that no later phase may make alone; same lifecycle rules;
                              #   status made | provisional | superseded | parked; cited as [[dec:NN]]
  ateam-plan.md               # the plan built for the A-Team agents: goals + deliverables to reach v0
  research-plan.md            # ships with v0: open questions, assumptions + confidence,
                              #   technical research (services, stack, integration costs)
  ateam-product-report.md     # the PRD for the product — end-of-run report (pr phase):
                              #   product framing, epics on the MoSCoW scope, what actually shipped
  project-plan.md             # the plan for the PROJECT after v0 — what the human team picks up
                              #   (pr phase). Distinct from ateam-plan.md, the plan to REACH v0.
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
- **Nothing is cited that is not on disk.** Anything the human points at that
  lives outside the repo — a file in a parent folder, an attachment in the
  conversation, a board, a shared page — is staged verbatim as
  `input/<YYYY-MM-DD>-<label>/` with a `SOURCE.md` **before** it is cited. The
  batch is labelled by its staging date. `SOURCE.md` records origin, the
  authoring date if stated, what was copied and what was not (keeping the
  original binary alongside is fine, never required), and any fidelity caveat —
  an extraction is not the document. A document that names a companion not in
  hand records the absence in `SOURCE.md` and as a ledger entry; its contents
  are never inferred. Prior human work on the same question — a board, a
  current-state map, a spreadsheet — is an input like any other: staged
  through this rule (a FigJam board via `get_figjam`, verbatim, as
  `input/<YYYY-MM-DD>-figjam-pulled/`), covered, cited, and diffed against at
  discovery's read-back. Citing a source that has no batch on disk is a failed
  self-check.

### Citations and coverage

These bind every skill that writes a domain claim into `docs/product/`. A
**domain claim** is a statement about the client's world — its people, process,
vocabulary, numbers, rules or constraints — as opposed to a statement about the
run itself (a recommendation, a classification, a self-check).

- **Every domain claim cites a line.** Syntax, beside the `[[…]]` id
  convention above:
  - text: `<batch>/<path>:L<start>-L<end>` — e.g.
    `2026-08-20-outsource-design-package/deal-state-mechanics-guide.md:L88-L94`
  - a section, when lines would be brittle to quote: `<batch>/<path> §4.6`
  - PDFs: `<batch>/<file>.pdf:p<N>` · images: `<batch>/<file>` plus the region
  - the grill: `<YYYY-MM-DD>-grill-digest/grill.md:L<start>-L<end>`

  Lines are stable because `input/` batches are never edited. Where a domain
  claim must cite: glossary rows (the Source column), `## Digest` claims,
  ledger Knows, a job's `## Today` and `## Forces`, an ADR's `## Context`, a
  decision record's `## Why`, `## Wrong if` and `## Existing state`.
  `sources:` frontmatter stays batch-level — it is the audit index; the line
  citation sits in the body where the claim is made. **A domain claim with no
  citation is a failed self-check**; a citation that does not resolve on disk
  is a bug, like a dead `## Sources` row.
- **Every ingested file has a coverage row.** `context.md`'s `## Sources`
  carries a **Coverage** column with a fixed vocabulary:
  `full · <date> · conductor` (read end to end in the conversation) ·
  `full · <date> · digest` (read end to end by a one-shot digest subagent
  whose digest cites lines) · `partial <range> · <date> · <method>` (non-prose
  inputs only — a JSON spec, an image set, a binary — with the method stated:
  "diffed programmatically", "rendered and described"). *Prose* is a text file
  meant to be read — markdown, plain text, an extraction; everything else is
  non-prose. **Every file in every ingested batch has a row; prose files are
  `full`.** A long document is read in full by a digest subagent, announced
  before dispatch, so the conductor's load discipline holds without the
  shortest input dominating. A staged batch the run did not ingest has no
  rows, stays out of `ingested:`, and gets a ledger entry naming it and why. A
  run that re-reads a file appends a new row with the new date and coverage;
  the latest row governs, and no earlier row is edited. The coverage record is
  presented at discovery's read-back as its own list; a prose file without a
  `full` row is a failed self-check.
- **Conflicts are items, never judgements.** When two inputs — or an input and
  the existing North Star, an active ADR, or the shipped state — disagree on a
  fact that reaches an artifact, the ledger carries a `[conflict]` entry naming
  both sides with citations and what it blocks (or `[non-blocking]`). It routes
  like any ledger entry: blocking + answerable by this human → asked in the
  grill, recommendation first, the ruling recorded verbatim in the grill digest
  and the entry closed `ruling: human, grill Q<n>`; blocking + not answerable
  → a research activity; non-blocking → survives into `research-plan.md` as an
  open question. A batch's own stated precedence (its `SOURCE.md` says which
  document wins) is a ruling source and is not asked. An unruled conflict is
  carried, never smoothed: every artifact touching it holds both readings
  marked `TBD` with the conflict cited. **Silent resolution is a failed
  self-check.**

## Environment given to every phase skill

The orchestrator sets working context before invoking a phase skill:

- **Target repo root**: absolute path. All reads and writes are under it.
- **Feature directory**: `docs/features/<slug>/`.
- **Product directory**: `docs/product/`.
- **Manifest**: `feature.json` in the feature directory. Read it for `slug`,
  `prompt`, `repo`, `base_branch` — and, when set, `gate_policy` and
  `run_brief` (design reads `fidelity`, dev reads `purpose`). Read state and
  request all mutations through `runner/src/feature-cli.mjs`; never hand-edit it.
- **Role intake banks**: the harness repo's `intake/` directory — absolute path
  passed at invocation. Rubric pre-work each role skill reads at run start.
  Three banks, one per role: `pm-intake.md`, `design-intake.md`,
  `dev-intake.md`. Each seeds ledger entries tagged with its role; all three
  route through the same answerability rule. `dev-intake.md` and
  `design-intake.md` additionally carry a **`## Declared defaults`** section
  (required heading, contents owned by that bank's role owner) — the
  team-level standing decisions discovery applies instead of asking (e.g. the
  Design-owned default component library). Precedence: **project binding >
  team default > ask**.
- **Target config**: the target repo's `CLAUDE.md`, including the `## A-Team Config`
  block (test command, base branch, design-system path, package manager,
  `github issues`). `github issues` is `on` or `off` — the human's consent to
  the issues phase writing into the target's GitHub. **Absent means `off`**:
  silence is never consent to an outward-facing write. The orchestrator writes
  the key at bootstrap **from the human's answer**; no agent may set it to `on`
  on its own, infer it, or flip it without an explicit instruction in the
  conversation.
- **Runner execution policy**: before starting agents or mutating run/GitHub
  state, resolve the same target config into an immutable policy. It records the
  invoked harness root/revision, target remote and base SHA, current/product
  context, design-system binding, verification commands, canonical read/write
  and output paths, and supervisor actions. Project values beat team defaults;
  an explicit invocation base may select a feature branch. A pinned harness
  revision must match; upgrades are deliberate. Ordinary runs refuse the harness
  itself and renamed forks. Scope conflicts are reported before launch; exact
  invocation-authorized CI exceptions never grant blanket configuration access.
  See [the execution contract](runner/EXECUTION.md). No duplicate context or
  design authority is generated to satisfy missing configuration.
- **Current authority at every task entry**: resolve `current context` through
  existing target configuration. Its fenced `ateam-context` index identifies
  purpose/audience, current observations, authority order, global invariants,
  design/engineering bindings, commands, unresolved decisions and source links.
  Phase orchestration calls `node <harness>/runner/src/context-cli.mjs select
  --root <target> --task '<task JSON>'` before dispatch; executor and reviewer
  startup enforce the same resolution in code. Missing/legacy indexes require
  project-context bootstrap/revalidation. Stale selected source revisions,
  code/intent conflicts and configured context-budget overruns block progression.
  Always include crosscutting obligations by behavior/risk as well as changed
  paths. Selective reads omit unrelated archives, never applicable invariants.
  Before independent review, the executor uses the supplied scratch context tool's
  `revalidate` command to record inspection of changed code/test source revisions;
  this authored evidence is not approval or integration. Requirement/design/ADR
  changes require existing authorized decision receipts. Intent facts are preserved.
  After integration, the context `refresh` command updates affected observed facts
  with an integration receipt, current hashes and preserved history; it cannot
  rewrite accepted intent. See [the current-context schema](runner/CONTEXT.md)
  for exact fields, instrumentation and the configurable operating budget.
- **Runner approval**: both approval entrypoints validate process results and
  model fields at runtime, then bind review and supervisor-owned checks to a
  fresh detached checkout of the exact committed head. An absent command is not
  a verification exemption. A documentation-only exemption requires explicit
  applicable authorization and never excuses unmet criteria. Approval records
  retain identities, input digests, base/head, evaluator, environment, commands,
  exits and evidence references. Changed inputs invalidate reuse. Approval does
  not establish integration, deployment or human acceptance.
- **Runner machine output**: finite `--json` commands emit one versioned stdout
  envelope, with diagnostics on stderr. Dry-run plans perform no setup or
  mutations. `watch --json` and `watch --dry-run` require `--once`; consumers must
  use the [CLI contract](runner/CLI.md), including status and exit codes.
- **Revision notes** (on a `revise` gate loop): the human's feedback is appended to
  your invocation prompt. Re-produce the artifact incorporating it.

### Manifest-optional invocation

A skill may be invoked directly by a human, outside `/feature`. The manifest is a
**branch, not a requirement**:

- Manifest present → read `prompt` from it; submit phase completion through the CLI.
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
  - `docs/product/adr/NN-<slug>.md` — the architecture decisions the v0's shape
    rests on (repo shape, stack per surface, where the v0 runs, v0 data
    strategy), drafted by the `architecture` beat and ratified in the grill.
    Only decisions that block planning; implementation-level decisions belong to
    the dev phase. A decision requiring ratification the human never answered is
    written `status: parked`, never `active`.
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
  dev review → architecture → grill → read-back → independence handoff →
  write`.
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
- **Architecture of the v0**: after the dev review and **before** the grill,
  discovery conducts the `architecture` skill (📝 draft + review) over the dev
  review's findings. It answers up to four questions — repo shape, tech stack
  per surface, where the v0 runs, the v0 data strategy — and drafts each as an
  ADR. Rules:
  - **Facts vs decisions.** The dev review settles *facts* and they land in
    `## Technical context`; `architecture` records *decisions* and they land in
    `adr/`. One fact, one home — an ADR cites the technical context rather than
    restating it, and a question a project binding already settled is an
    observation, not a decision to mint.
  - **Precedence is the dev bank's**, unchanged: **project binding > team
    default > ask**. An applied `## Declared defaults` entry is named in its ADR
    *and* recorded as a confidence-stamped assumption in `research-plan.md`.
  - **The carve-out does not extend to decisions.** The dev review may resolve a
    fact without a human; `architecture` may not resolve a *decision* that way.
    A decision that costs money, forecloses an expensive-to-reopen option,
    contradicts a project binding, or rests on an `expensive`/`unknown` finding
    is ratified by the human in the grill — **presented is not ratified**, and
    unanswered is `status: parked` with an open question, never `active`.
  - **Depth is bounded.** The v0's shape only: never its schema, component
    breakdown, or library picks inside a settled stack. `ateam-spec` and the dev
    phase own depth.
  - **Optional by absence**, like the dev review: if the skill is unavailable,
    say so, record the gap in `research-plan.md`, and continue. An undecided
    shape is a degraded run, and a recorded degradation is not a dishonest one.
- **Run brief**: capture how the human wants the A-Team to run. The manifest's
  `run_brief` retains `purpose`, `fidelity`, `timebox` and `done_looks_like`
  alongside mode, outcome, assumptions, deliverables, required verification, limits
  and stopping point. The **questions and their answer options** live in
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
  blocks). Submit `gate_policy` + `run_brief` through the CLI's `configure` command
  with the existing human decision and explicit provisional scope. The agent never
  chooses the policy; absent an answer, `block` stands. State explicitly:
  "assumptions made after you leave land in `research-plan.md` with confidence
  levels."
- **Done-signal**: invoke `feature-cli.mjs complete` with `phase: "discovery"`
  and the actual JTBD artifacts. The selected run brief determines whether to stop
  or advance to definition.

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

#### ADR template — the shape a decision is recorded in

```markdown
---
id: 02
slug: monorepo-with-contract-surface
status: active            # active | superseded | parked
confidence: moderate      # strong | moderate | directional | hypothesis
decided: 2026-08-27
decided_by: human         # human | agent
sources: [2026-08-27-grill-digest, dev-review]
---

# 02. One monorepo, with the contract surface beside the app

## Status
active — ratified by the human at the 2026-08-27 grill.   # or: superseded by [[adr:07]]

## Context
The forces. The project binding or Declared default that applied, cited not
restated. Which dev review finding this rests on and how it was rated. The jobs
that turn on it: [[03]], [[05]].

## Decision
What we will do. Active voice, present tense.

## Alternatives considered
Option · the real reason it was dropped. At least one, always.

## Consequences
What gets easier, what gets harder, what this forecloses.

## Revisit when
The signal that reopens this — mirrored into research-plan.md as an open question.
```

Load-bearing:

- **The headline is the decision, not the topic.** "02. Stack" is not auditable;
  "02. One monorepo, with the contract surface beside the app" is. Same
  discipline as the JTBD headline rule.
- **`decided_by: human` means they said yes** — not that a recommendation was
  presented and nobody objected. Presented-but-unanswered is `status: parked`
  plus an open question in `research-plan.md`.
- **Facts are cited, not copied.** A settled technical fact lives in
  `## Technical context`; the ADR points at it. One fact, one home — the same
  rule the dev review follows, and for the same reason: two copies under
  ids-forever semantics is a durable contradiction waiting to happen.
- **Alternatives are the artifact's value.** The code already records what was
  picked; only the ADR records what was ruled out and why. That is the
  breadcrumb the board asks for.
- **`revisit when` is mandatory.** An ADR with no reopening trigger is a
  tombstone, and a v0's decisions are provisional by construction.
- **Only decisions that block planning belong here at discovery time.** Schema,
  component breakdown, and library picks inside a settled stack are dev-phase
  depth — minting them as durable ADRs from a grill fabricates authority.

Full annotated template: the `architecture` skill's
`references/adr-template.md`. The team defaults it falls back to live in
`intake/dev-intake.md`'s `## Declared defaults`, owned by the Dev role owner.

### `ateam-definition` — 📝 draft + review

- **May read**: `docs/product/**` (context, JTBDs, the ADRs, `ateam-plan.md`); the manifest; the target repo.
- **Must write**:
  - `prd.md` in the feature directory — problem, goals/non-goals, scope, user
    stories, acceptance criteria. Every scoped item traces to a JTBD id.
  - `briefs/` in the feature directory — wireflow + per-screen requirements.
  - the ticket backlog input the issues phase decomposes later.
  - `docs/product/epics/NN-<slug>.md` — the Epics: durable delivery structures
    bundling the PRD's requirement IDs, traced to job ids (durable rules apply —
    ids forever, supersede never delete, human review at the gate).
- **Done-signal**: invoke `feature-cli.mjs complete` with `phase: "definition"`.
  Invoke `approve` only with the recorded human decision bound to current artifacts.

### `ateam-design` — 📝 draft + review

- **May read**: `docs/product/context.md` + `docs/product/jtbd/**` (**required
  floor** — context.md's `## Design context` section carries the design
  briefing: users & emotional goals, brand personality, aesthetic direction,
  typography preferences, accessibility, design principles; and `## Technical
  context`, the settled technical facts) **plus `research-plan.md`'s technical
  assumptions and open questions** — also a required floor, so a design can
  never be specced past a constraint the dev review already surfaced; `prd.md`
  and `briefs/` (**optional** — consume when present; when the wireflow
  exists, design.md's screen section derives from it, divergences recorded as
  explicit calls); the target repo's design system (path from A-Team Config);
  the manifest's `run_brief` (`fidelity` calibrates how deep the lo-fi goes).
- **Must write**:
  - `docs/product/design-system/` — canonical design tokens (`scale.ts`,
    `palette.ts`, `shadcn-theme.css`). **Durable rules apply**; the design
    gate is the human review that covers them. **Create-once**: an existing
    system (here or at A-Team Config's `design system path`) is consumed,
    never regenerated — regeneration only on an explicit human instruction; a
    contradiction between existing tokens and `## Design context` is a gate
    flag, not an auto-rewrite. With no brand seed in `## Design context`, the
    phase ships a TBD-draft (seed-free scales generated, brand marked TBD)
    and a **blocking flag** — never an invented brand.
  - `design.md` in the feature directory — a `## Screens & flows` section
    (the lo-fi's single input: derived from the wireflow when `briefs/`
    exists, drafted from the JTBDs when not, marked as such), visual
    approach, and the options considered with reasoning.
  - a throwaway lo-fi prototype under `docs/features/<slug>/lofi/` — visual
    reference only, not production code. Greyscale by default; token
    variants mounted behind `?scale=` / `?palette=` for comparison.
  - (standalone debrief only) `docs/product/input/<YYYY-MM-DD>-lofi-debrief-<slug>/`
    — user-test sessions staged as append-only evidence batches, declared
    here so they are a permitted output path rather than a stray write.
- **Diverge by default**: produce multiple options, not one — as mounted,
  clickable variants, with `design.md` recording why the non-chosen ones were
  dropped. Under a non-block `gate_policy` the skill self-selects the
  recommended variant only if the design bank's self-select consent was
  captured at the grill, recorded as a provisional call in `research-plan.md`.
- **Done-signal**: invoke `feature-cli.mjs complete` with `phase: "design"`.
  Invoke `approve` only with the recorded human decision bound to current artifacts.

### `ateam-spec` — 🚀 autonomous

- **May read**: `prd.md`, `design.md` (its `## Screens & flows` is the
  coverage checklist), the lo-fi prototype, `docs/product/**` (including
  `design-system/` and `adr/` — the settled stack and v0 data strategy bind the
  spec), the target repo's design system, and the design bank's
  `## Declared defaults`.
- **Must write**: `spec.md` in the feature directory.
- **Component-library resolution** — binding > default > TBD: the target's
  own library always wins; with none, the declared default (**shadcn/ui**)
  applies openly — recorded as a confidence-stamped assumption in
  `research-plan.md`; unresolvable → `TBD` + a flag, never a guess.
- **Content expectations** — this is the dev-facing contract, so it must be explicit:
  - Component breakdown, per screen — full coverage of `## Screens & flows`.
  - Every state per component: empty / loading / error / populated.
  - Responsive behavior.
  - **Design-system mapping (required)**: for each component/piece, which
    design-system component and tokens it uses — the target library's names
    under a binding, shadcn registry names under the default; tokens as role
    vars or scale steps. This is what makes dev output production-grade
    instead of bespoke. No raw px/hex — reference tokens. A piece no
    primitive covers is specced as a composite first; a truly bespoke
    `custom:` component is a loud flag in the phase report.
  - Interactions and edge cases.
  - **`## Components to install`** — the deduplicated list dev needs. Spec
    *names*, dev *installs*: this phase never writes code or touches the
    target repo.
- **Done-signal**: invoke `feature-cli.mjs complete` with `phase: "spec"`.
  Current artifacts and obligations due at this stage must pass before advancement.

## Rules for all phase skills

- **Write only to your declared output path(s).** Do not touch other phases' artifacts.
  **One standing exception — the assumption ledger**: any phase skill may
  **append** new entries to `docs/product/research-plan.md`'s `## Assumptions`
  and `## Open questions` sections (never edit or delete existing ones), each
  entry tagged with the writing phase — e.g. `· [design phase]` — and carrying
  a confidence level. This is the mechanism behind the independence promise:
  assumptions made while no human is present must land there, not in a report
  that scrolls away.
  (For the harness's own exception to this rule, see **The milestone
  back-reference** below — it binds a phase this section does not govern.)
- **Report blocking flags loudly.** Your return report must surface, as a
  distinct list, every blocking flag your run produced: "serves an unlisted
  job?" signals, `TBD`s inside committed (Must) scope, failed self-checks,
  qualitative criteria due at this stage that need a human run. Report later-stage
  obligations as visible outstanding work, not as an earlier-stage blocker. The orchestrator's provisional
  gates depend on this list being honest — an empty flags list is a claim,
  not a default.
- **Use the manifest command layer for every state mutation.** Phase skills invoke
  `complete`, `fail`, or `revise`; the orchestrator invokes `start`, `approve`, and
  milestone commands. Discovery submits the human's run brief and gate decision
  through `configure`. Every mutation requires the expected revision and a unique
  event ID; retries reuse the same ID and identical command.
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

## The milestone back-reference (harness-owned phases)

The rules above bind **authored phase skills**. The `issues` phase is
harness-owned and not authored via this contract, so its one durable-layer
write is recorded here instead:

> The `issues` phase may write the single frontmatter key `milestone:` into
> `docs/product/epics/NN-*.md` — and nothing else in those files.

It lives in the epic rather than in `issues.md` because a milestone outlives a
feature directory exactly as its epic does; keeping the mapping per-feature
would lose it on the next run and duplicate every milestone in GitHub. The
`epics` skill still owns those files: it never authors or edits `milestone:`,
but **must preserve it across a REVISE** — a rewrite that drops the key breaks
the back-reference the projection depends on.

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

These are command-layer states, never instructions to edit JSON. Changed bound
artifacts produce `stale` state. Legacy `done`/provisional data is retained as
history and migrated without inventing approval or acceptance.

At run level, `paused` is a cooperative scheduling hold and `aborted` is terminal.
Pause blocks new phase dispatch and gate advancement while retaining in-flight
observations, artifacts, branches, event IDs and decisions. Resume derives the
current stage from verified evidence; it launches nothing and replays no external
action. Revision seeds the named phase dependency graph even without live artifact
bindings, invalidating affected downstream phases while preserving independent
milestone receipts. Native macOS detached-child containment is an accepted limitation in #37;
these commands do not suspend or terminate a process tree.

`feature-cli.mjs status --feature <feature-dir> --format text|json|html` projects
current manifest/evidence through the same revalidation as `show`. The local HTML
snapshot and CLI include reason/next action, gate recommendation/decision/consequence,
provisional versus accepted phase decisions, changed review inputs, run-brief
assumptions and current obligations, independent milestones and safe existing
artifact/runtime links. Runtime availability and live execution remain unverified
unless separately observed. Exact runner-history identities must be recorded before
dispatch to expose interrupted actions without guessing associations. Status reads
the existing repository budget ledger; unknown accounting stays unknown and no
allowance is opened or reset. See `runner/FEATURE-STATUS.md` for the command contract.

## Executable phase and acceptance gates

`runner/src/feature-cli.mjs` owns manifest schema version 2. Each command reads
actual artifacts, checks their hashes and obligations, and atomically appends an
event. See the feature skill for complete command inputs. A run brief records
mode, outcome, assumptions, deliverables, required verification, limits and a
stopping point. Discovery-only stops after discovery; prototype can stop at design
or proceed to coded dev; implementation-PR and refinement stop at PR review.

`acceptance.json` is the feature's versioned obligation ledger. Product, design
and engineering obligations retain their IDs, statement, method, required stage,
owner, evidence and status across PRD, specification, page briefs and tickets.
The issues gate reads those actual files through `obligations-cli.mjs issues`.
An automated check does not satisfy a rendered review or a human study. Unknown
owners and authorized deferrals remain visible; a deferral needs an actor,
decision reference, rationale, consequence and next decision stage. Revised
requirements and performance benchmarks retain contiguous immutable history and
invalidate old evidence; workload, units, threshold, method and scope are versioned.

Implementation, verification, human acceptance, integration, release and product
validation are six independent milestone records. An observed merge can record
integration while later human acceptance remains pending. Neither phase approval
nor a passing test implies release, product validation or delivery to the intended
target. GitHub projections remain open until integration into that target is
observed and explicitly recorded.

## Existing-product refinement

Use `configure-refinement` with a short authorized change record to select the
smallest route supported by current context and uncertainty. It retains linked
obligations, invariants, delta, surfaces, dependencies, risks, selected revisions,
verification methods, dispositions and result. Known defects reuse accepted
discovery, PRD, boards and conventions. New audiences, jobs or load-bearing
assumptions reopen discovery; interaction/accessibility changes require design
review; architecture, authorization, business rules and migrations require the
corresponding review regardless of diff size.

Behavior changes require meaningful regression evidence and independent review.
Low-impact copy/styling may use existing checks and rendered review. Save/retry
fixtures cover failed first save followed by retry, edits in flight, blocked
dependent submission and unsaved navigation. Accepted tokens and architecture
remain bound unless the authorized delta and relevant review explicitly change
them. Scope auditing compares actual file changes against the recorded baseline,
preserves inherited work and permits refresh only of affected artifacts.

Runner review carries one concise obligation-to-check entry for every current
acceptance criterion. The independent reviewer records whether expected values
come from an accepted literal or worked example, whether the public behavior is
exercised, which external boundaries are substituted, and the current requirement
source ID/revision. It also records whether the baseline is preserved or changed
by a versioned authorized decision. A passing implementation-mirroring check,
an unexercised behavioral contract, an inappropriate substituted boundary, or an
unauthorized weakening cannot approve. Runtime validation checks that this map is
complete and binds every cited source, version, and authorization to the accepted
base revision. A changed baseline requires a real definition change in complete,
valid canonical ledger history; files added by the implementation cannot authorize
that implementation. The reviewer remains responsible for the semantic judgment.
Deterministic checks verify provenance and known contradictions, not test adequacy.

`finish-refinement` reuses a delivered local runner approval for the current
ticket and exact reviewed revision, validates current context and method-specific
evidence, and records the result. It leaves human acceptance, integration, release
and product validation independent. See [runner/REFINEMENT.md](runner/REFINEMENT.md)
for the change and completion formats.

## Strict artifact handoffs

Before advancing definition or any later interface phase, validate the actual
wireflow and page-brief JSON, canonical job/requirement/obligation references,
both acceptance layers, and (from spec onward) per-component empty/loading/error/
populated states. Reasoned not-applicable dispositions are allowed.
`feature-cli.mjs` runs this gate on completion, approval and reload. A rendered
draft cannot establish eligibility. Standalone permissive rendering must be
explicit and retains warnings. See [runner/ARTIFACTS.md](runner/ARTIFACTS.md) for
commands, exact IDs, component schema and source-bound headless exemptions.

## Prototype fidelity and flow continuity

Design, generated prototype data and spec carry the same versioned flow contract,
including the current wireflow graph and stable node/page/edge IDs. The design
and later feature gates validate their actual content. Interaction fidelity is
explicit: navigation sketches cannot verify validation or recovery; interactive
prototypes use deterministic local scenarios and reset, without real backend
requests. Record browser observations separately from production and human-study
acceptance. See [runner/PROTOTYPES.md](runner/PROTOTYPES.md).

### Independent rendered implementation review

Applicable accepted design/spec obligations must be independently reviewed in
running code on the exact verified revision, through the established reviewer
seam. A-Team Config `renderedReview` binds the declarative browser plan; accepted
base requirement/design authority and plan bytes cannot be weakened by executor
head changes. The plan covers required journeys, states, fixtures and relevant
viewports, including primary interaction, empty/loading/error/populated states,
long content, keyboard/focus, actual scrolling and sticky behavior. Missing
required evidence remains pending or has an explicit authorized ledger
disposition. Clipped controls, keyboard traps, broken retry, or computed token
and layout deviations record a route/fixture/SHA finding and cannot satisfy their
obligation even when class-level checks are green.

Retain screenshots and machine observations with SHA, route, fixture, viewport,
result and obligation. Verify their hashes and revision before reuse. Refinement
is bounded by the run's cycle limits and retains the best evidenced candidate
under its actual SHA; an older pass is not a current pass. Web accessibility
defaults to WCAG 2.2 AA unless project-bound. Use bounded automation and actual
interaction, with limitations visible. Agent critique cannot satisfy a human
usability study, and an automated pass cannot claim full accessibility
conformance. See `runner/RENDERED-REVIEW.md` for the executable contract.

## Stage-bound research decisions

`docs/product/research-plan.md` remains the canonical research home. Its single
`ateam-assumptions` block records stable assumption IDs and versions, risk
category, load-bearing status, applicable features, dependent decision, required
stage, accountable owner (or explicit unresolved owner), confidence, disproof,
cheapest probe, uncertainty, and evidence/disposition. Run-brief assumptions
reference those actual IDs. No customer facts, owners, evidence or authorization
are inferred from code or filled in to satisfy a gate.

Each evidence entry retains its source snapshot path and SHA-256, original
reference, actor, method, origin and support/contradict/inconclusive result.
Preserve every prior revision under `docs/product/assumptions-history/`; retain
all assumption/evidence IDs. Changing a definition or reopening no-go/reshape
requires the next assumption version and an explicit authorized change decision.
Old evidence cannot be relabelled to the new version. Feature receipts protect
already-consumed source/history identity; current source bytes are rechecked.

Actual feature entry, completion and approval validate due load-bearing research.
Missing evidence or an unresolved due owner names the blocker. Deferral requires
existing authority, rationale, consequences and a future decision stage; it blocks
again when that stage arrives. An evidence-producing prototype can precede its
later study, preserving pending status. Synthetic, inferred and default sources
do not establish observed validation. New later-stage uncertainty does not
automatically invalidate earlier valid gates or re-run discovery for a routine
refinement.

Supported no-go/reshape is recorded through `record-research-decision` as a
successful research outcome that stops dependent work, retaining all milestone
receipts and event history. A later authorized research revision plus explicit
`revise` can reopen affected work. Independently observed implementation, merge
and release remain separate facts; human/product validation requires its own due
research evidence. See [runner/ASSUMPTIONS.md](runner/ASSUMPTIONS.md).
Human/product validation enforces all applicable deadlines already reached,
including a deferral's effective deadline, during recording and reload. Later
pending studies do not invalidate earlier valid milestones. Stop decisions require
valid source/schema/decision/history records, while unrelated unfinished research
stays visible instead of blocking the decision to stop that work.

## Pilot protocol boundaries

Pilot reporting uses `runner/PILOT-PROTOCOL.md`: all attempts remain in cost and
human-effort totals, unknown/unrun evidence stays visible, and implementation,
verification, human acceptance, integration, release and product validation remain
independent. Ordinary-assisted comparisons require matched scope and accountable
limitations; output counts are not productivity evidence. Post-pilot corrections
retain source references/hashes and assumption versions in immutable snapshots,
with a generalized followup and publication review. Live execution requires
separate target authority, roles, obligations, comparison method and eligible
release evidence; protocol completeness grants no authority.

## Harness evaluation evidence

Use the versioned synthetic corpus described in [runner/EVALUATION.md](runner/EVALUATION.md) alongside ordinary runner tests. Retain exact harness/skill/source/configuration/input/rubric identifiers, independent outcomes and traces, repeated agent trials where variance matters, and individual expert disagreements with calibration revisions. Deterministic checks are not human or model capability evidence. Whole-process-tree containment remains unsupported under the accepted native scope of #37; passing current native boundary controls does not establish that guarantee or authorize a release.
