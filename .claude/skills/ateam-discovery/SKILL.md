---
name: ateam-discovery
description: Use when the A-Team orchestrator invokes the discovery phase for a feature, or when a human runs discovery standalone to seed docs/product/ from raw input (a client transcript, a fuzzy prompt) before any feature exists. The 🔥 grill phase skill — conducts the ported PM skills (product-brainstorming, project-context, research-synthesis, jobs-to-be-done, discovery-plan) through challenge → run brief → research → straw-man → dev review → architecture → grill → read-back → independence handoff → write, producing context.md, the JTBD set, the ADRs, ateam-plan.md, and research-plan.md, and writing gate_policy + run_brief to the manifest. Cannot run without a human: escalates via ## Awaiting answers, never guesses. Implemented against CONTRACT.md.
metadata:
  version: 0.1.0
  owner: Alvaro Bezerra
  provenance: authored 2026-07-24 against CONTRACT.md as a conductor over the ported product-craft skills (migration PRs 2–11) plus the independence handoff (PR 12).
---

# ateam-discovery

The discovery grill. You are a **conductor**: the craft lives in the ported
skills — you sequence them into **one coherent conversation** with the human,
one consolidated read-back, one independence handoff, one write. You are also
**pure craft**: zero project facts; everything project-specific comes from the
prompt, the human, `docs/product/`, and the target repo.

Interaction mode: 🔥 **grill** — one question at a time, each with your
recommended answer, never asked unless its answer changes an artifact.

**Load discipline — conduct lazily.** Do not preload all five craft skills.
Load each skill at the movement that needs it, and its references only when
that movement actually uses them (e.g. jobs-to-be-done's interview guide at
the straw-man/grill, not at the challenge). On re-invocation, prefer each
skill's summary sections over full reference re-reads. The grill is the
conversation that must not lose nuance to context pressure — spend context on
the human's answers, not on eager loading.

## Contract (CONTRACT.md is authoritative)

- **Reads**: the feature `prompt` (manifest or invocation args);
  `docs/product/**` including `input/`; the target repo; the harness `intake/`
  banks.
- **Writes** (durable, all rules apply): `context.md` (including its
  `## Design context` and `## Technical context` sections, the `## Sources`
  coverage column and `[conflict]` ledger entries), `jtbd/NN-*.md`,
  `adr/NN-*.md`, `decisions/NN-*.md` (template:
  `references/decision-template.md`), `ateam-plan.md`, `research-plan.md`,
  `input/<YYYY-MM-DD>-grill-digest/`, any `input/<YYYY-MM-DD>-<label>/` batch
  staged for a source the human pointed at, and — on evidence-heavy runs —
  `research/<YYYY-MM-DD>-<slug>.md`. Plus, manifest present: `gate_policy` +
  `run_brief` (the one write beyond your own phase status).
- **Evidence discipline** (CONTRACT, *Citations and coverage*): nothing is
  cited that is not staged on disk; every ingested file has a coverage row and
  prose files are read in full; every domain claim cites a line; conflicts are
  ledger items, never judgements; product-scope calls are decision records
  bound to the `ASM-` records their falsifier rests on, stamped `made` only
  when those are `proceed` with evidence (`runner/ASSUMPTIONS.md`).
- **Done-signal**: successful transition CLI `complete` result. No orchestrator
  gate — your read-back is the gate.
- **Manifest-optional**: absent → prompt from args, skip all manifest writes.
  Standalone is never a weaker-review path.

## The movement sequence

### 1. Challenge (hard-capped, skippable)

Load **`product-brainstorming`** craft for its challenge beat: *does this
request even make sense?* Go / no-go / reshape — you are explicitly allowed to
say "this doesn't make sense" or "this should change," with reasons. Skip when
the prompt already carries a clear problem statement. Cap it: a few exchanges,
not a session.

**Scope guardrail:** first consult current context. A bounded change to an
existing product uses the validated refinement route in `/feature`; reuse its
existing jobs and accepted artifacts. Reopen discovery only when the change
introduces a new job, audience, or load-bearing assumption.

### 2. Run brief (alongside the challenge — but never skipped with it)

Capture how the human wants the A-Team to run. **The questions live in
`intake/pm-intake.md`'s `## Run brief`** — read them there; do not carry a copy
here. This movement owns only how to conduct them.

**Runs even when movement 1 is skipped.** The challenge beat is skippable; the
run brief is not — `run_brief` is required transition input. A skipped
challenge means going straight to the run brief, never past it.

**Same grill discipline as everything else: one question at a time, each with
its recommendation — never batched into a single dialog** (batching proved
confusing in the 2026-07 dry run). Check `context.md` for durable per-project
defaults first; don't re-ask what's recorded. Hold the answers; they're written
at the handoff (manifest runs) or into `context.md` as durable defaults
(standalone — see movement 9).

### 3. Research (ingest, never invent)

- **Stage first.** Anything the human points at that is not on disk — a PDF
  in a parent folder, an attachment, a board, a shared page — becomes an
  `input/<YYYY-MM-DD>-<label>/` batch with a `SOURCE.md` before you read it
  for content (a FigJam board via `get_figjam` as
  `input/<YYYY-MM-DD>-figjam-pulled/`). A named companion not in hand is a
  `SOURCE.md` note and a ledger entry, never inferred.
- Un-ingested `input/` batches: apply **`project-context`** craft to digest
  into a drafted `context.md` (glossary first, Know/Don't-Know ledger, TBD
  honesty) — on an iteration run, *against* the existing file: refresh, never
  rebuild. **Every prose file is read in full.** Announce and dispatch a
  one-shot **digest subagent** per long document (pass the path and the
  current glossary; expect a digest whose every claim cites lines, plus terms
  and conflicts found), so its coverage row reads `full · <date> · digest`;
  read the rest yourself for `full · <date> · conductor`. Non-prose inputs get
  `partial <range> · <date> · <method>` with the method stated.
- **Build the conflict list before drafting.** Where the new input disagrees
  with another input, the glossary, a Know, an active job, an active ADR or —
  on an iteration run — the shipped state, enter a `[conflict]` ledger item
  with both citations and what it blocks; a batch's `SOURCE.md` precedence is
  a ruling, everything else is `ruling: open` for the grill.
- **Iteration runs read the implemented state here:** the `ateam-context`
  index resolved by `context-cli.mjs select` (its `currentState`, `bindings`,
  `unresolvedDecisions` and observed facts), every active ADR, every epic and
  its status, `ateam-product-report.md` §"What actually shipped" (verdicts
  `implemented` / `partial` / `not implemented`), `project-plan.md`, and the
  surfaces the report names as implemented. This is what `## Existing state`
  on every decision record cites.
- Evidence-heavy runs (transcripts, surveys, tickets): apply
  **`research-synthesis`** craft — themes, contradictions, verdicts against
  any existing jobs, new-job signals — as a drafted `research/` run.
- **Seed the ledger from all three `intake/` banks** (`pm-intake.md`,
  `design-intake.md`, `dev-intake.md`), each entry tagged `[pm]` / `[design]` /
  `[dev]`. Three banks, one seeding mechanism, one routing rule. The **PM bank**
  holds your own topics — problem, who for, how it's solved today, switching
  forces, success signal, v0 scope boundary — plus the run-brief questions: it
  holds the *questions*, you hold *how to conduct them*, and neither restates
  the other. The **design bank** includes the design briefing (migrated from
  teach-impeccable): on a project's first run, its answers synthesize into
  `context.md`'s `## Design context` section (users & emotional goals, brand
  personality, aesthetic direction with references and anti-references,
  accessibility, 3–5 design principles); later runs ask only deltas. The **dev
  bank**'s answers synthesize the same way into `## Technical context` (stack
  binding, external dependencies, infra/deploy, data sensitivity,
  non-functional constraints, v0 test bar), and its `## Declared defaults`
  section is what
  movement 5's three-way rule applies instead of asking.
- Read the target repo enough to ground technical unknowns (stack, existing
  screens) — grounding, not a code audit.
- **Track every source you consume as you go** — each link visited (search
  hits, docs, review pages), each human-provided file, each connector pull,
  and what it informed. These become `context.md`'s `## Sources` index at the
  write step; a source that shaped a fact but never reaches the index is an
  audit hole.
- **Connector-gated sources need pre-run authorization.** If ingestion depends
  on a connector (Notion, Granola, Slack), the human authorizes it before the
  run; an unauthorized or unreachable source routes to a research activity in
  `research-plan.md` (as designed) — say plainly which source degraded and why.

### 4. Straw-man (committed first pass)

Draft the JTBD set using **`jobs-to-be-done`** craft — house-format headlines,
forces cited to lines, honest confidence, parked candidates as real files —
*before* asking the human anything about jobs. A straw-man the human corrects
beats a questionnaire the human authors.

**Iteration runs.** Classify every active job **kept / reshaped / superseded**
with the citation that triggers the class (the craft's iteration step). Then
draft the **decision candidates** the new input forces — the product-scope
calls a definition phase must not make alone: grain, which gates block, pull
versus push, out-of-focus lines, which side of a conflict wins. Each candidate
is drafted in the decision record shape with a recommendation, its cost as a
testable prediction, its falsifier, and its keeps / changes / removes against
the implemented list. **Bind each falsifier to an `ASM-` record** in the
`ateam-assumptions` block (its `disproof`, `cheapestProbe`, `requiredStage`,
owner or unresolved owner) and **check it now** against what is staged,
recording an `EVD-` entry (path, SHA-256, reference, `origin: observed`,
result): `contradict` → reshape the candidate; `support` → the ASM can be
`proceed`; not checkable → the ASM stays `pending`. Candidates enter the
ledger as blocking entries.

### 5. Dev review (subagent, before the grill)

Dispatch a **one-shot subagent** running the Dev-owned dev research skill —
**`dev-research`** — over the drafted job set + the target repo. It is not a phase and has no reserved
name — you dispatch it, the orchestrator is not involved.

**Announce before dispatching.** You declare 🔥 grill mode; silent work breaks
the promise that the human always knows whether you are waiting or working.
Say what you are sending and why, then dispatch.

**Pass it**: the drafted jobs, the target repo path, `context.md`, the dev
bank's `## Declared defaults`, and — on an iteration run — the decision
candidates. **Expect back**: technical findings shaped as `research-plan.md`
assumptions with confidence, per-job confidence deltas, any new questions,
and, per candidate, what it would remove or coarsen in the shipped code, cited
to paths. The candidate slot is declared in CONTRACT and optional by absence:
if nothing comes back on it, record "candidates not reviewed against the
code" in `research-plan.md` and continue.

**Everything returns through the ledger**, never straight into an artifact.
Findings enter the `Know / Don't Know` ledger tagged `[dev]` and route by the
same answerability rule as any bank entry — so dev's questions and design's
bank questions reach the grill by one mechanism. Keep this path
**role-agnostic**: a future design agent plugs into the same slot.

**Three-way answer rule** — this is the carve-out to *autonomous degrade is
forbidden*, and it does not widen:

- **verifiable from the target repo** → answer it, with its source (a read is a
  fact; the design bank already holds this rule). A **settled technical fact
  lands in `## Technical context`**; the ledger entry closes with a pointer at
  it rather than restating it — one fact, one home, inside `context.md` too;
- **covered by a `## Declared defaults` entry** → apply it, record a
  confidence-stamped assumption in `research-plan.md`, surface at the gate;
- **neither** → it is a question, routed by the ledger like any other.

**The dev reviewer never answers a demand-side question** — user need, who it
is for, priority, scope, business context. No confidence flag mitigates that.

**Fires once here; re-fires at most once**, and only if the grill materially
reshaped the jobs (headline changed, job added, confidence moved) — a review of
a job whose framing changed is stale. On the re-fire only *blocking* findings
may reopen the grill; everything else goes to `research-plan.md`. Hard cap at
one re-fire, so termination stays defined, not felt.

**Substance goes to `research-plan.md`; jobs carry citations only** — a moved
`confidence:`, a `sources:` entry, at most a one-line pointer. Never
solution-side content in a job body.

**Optional by absence.** If the dev research skill is not available, say so
in-conversation, record the gap in `research-plan.md` as an open item
("jobs not reviewed for technical feasibility — dev reviewer unavailable"),
and continue. Not a blocking flag, not a halt. You are not answering the dev
questions yourself; you are declaring them unanswered.

### 6. Architecture (the v0's shape, drafted for ratification)

Conduct **`architecture`** craft over what the dev review just returned.
`ateam-plan.md` promises *"deliverables to reach v0"* — an empty promise until
someone has said what the v0 *is*. It drafts up to four decisions: repo shape,
tech stack per surface, where the v0 runs, and the v0 data strategy.

**Facts versus decisions.** Movement 5 settled *facts*, and they live in
`## Technical context`. This movement records *decisions*, and they live in
`adr/`. A question a project binding already settled is an observation — the ADR
cites it rather than minting a decision nobody made. Precedence is the dev
bank's, unchanged: **project binding > team default > ask**, and an applied
`## Declared defaults` entry is named in its ADR *and* recorded as a
confidence-stamped assumption in `research-plan.md`.

**The carve-out does not extend here.** Movement 5's three-way rule lets the dev
reviewer resolve a *fact* without a human. It does not let anyone resolve a
*decision* that way. Split the drafted set:

- **agent-decided** — a project binding settles it, a Declared default covers
  it, or one option survives a constraint. These pass to the write step.
- **needs ratification** — costs money, forecloses an expensive-to-reopen
  option, contradicts a project binding, rests on an `expensive`/`unknown`
  finding, or picks a v0 data strategy for a job whose value *is* the live data.
  These become grill questions in movement 7, recommendation first.

**Presented is not ratified.** A decision the human never actually answered is
written `status: parked` with an open question in `research-plan.md` — never
`active`. Stamping an unanswered ADR active manufactures authority the whole
pipeline then builds on.

**Depth is bounded**: the v0's shape only, never its schema, component
breakdown, or library picks inside a settled stack. **Optional by absence**, like
the dev review: if the skill is unavailable, say so, record the gap in
`research-plan.md`, and continue.

### 7. Grill (ledger-driven)

Ask **only blocking Don't-Knows**, one at a time, recommended answer first,
routed by **answerability**:

- blocking + answerable by this human → ask it;
- blocking but this human can't answer it (technical, third-party) → a
  research activity in `research-plan.md` — never a wasted question;
- non-blocking → stays in the ledger.

Intake-bank questions are never asked raw — they enter through the ledger and
this routing. **`[conflict]` entries and decision candidates route the same
way** — asked one at a time, recommendation first, the ruling or ratification
recorded verbatim in the grill digest. A human "yes" on a candidate whose
falsifier is unchecked yields `provisional` with a probe, never `made`; a
conflict the human cannot rule stays open and both readings are carried as
`TBD`. **Termination is defined, not felt**: stop when the blocking set is
empty or the human stops you.

### 8. Read-back (mandatory, consolidated)

Present, for correction before anything durable is written: the JTBD set in
full (headlines + confidence — this is the North Star, read it carefully),
plus tight summaries of `context.md` (glossary + ledger), the plans, and any
synthesis run. One consolidated read-back covers every ported skill's
read-back duty. The human corrects; you fix; re-present what changed.

Present the **ADR set** too — one line per decision with its `decided_by`
stamp. A decision the human is seeing for the first time here has not been
ratified; say so plainly and let it park. Where a dev review finding moved a job
out of v0, name it: a straw-man that quietly shrinks between draft and read-back
is exactly what movement 5 exists to surface.

Then three lists, each on its own, before anything is written:

- **Coverage record** — every file in every ingested batch with its coverage
  value; a prose file not `full` is named as a gap, not hidden.
- **Conflicts** — each `[conflict]` with both citations and its ruling
  (`human, grill Q<n>` · `SOURCE.md precedence`) or `open`.
- **Decision records** — each with `status`, `decided_by`, `probe` where
  provisional, `deviates_from` where it deviates, and its keeps / changes /
  removes line.

And, when a human artifact of the same kind was staged (a board, a
current-state map): the **coverage diff** — items on it the run's set does not
cover, and items in the set it does not, each a ledger entry or an explicit
"deliberately not covered — <reason>".

### 9. Independence handoff (the human opens the valve)

Present how the run will proceed and have the **human** choose the
`gate_policy` — recommended default first:

- **`block`** (default) — wait at every gate; today's behavior.
- **`notify-and-continue`** — gates become logged provisional checkpoints;
  review on return.
- **`run-to-pr`** — lunch mode; only the final PR review blocks.

Say explicitly: *"any assumption made after you leave lands in
`research-plan.md` with a confidence level."* You never choose the policy; no
answer → `block` stands. Standalone (no manifest): skip the policy — there is
no run to govern — but record the run-brief answers in `context.md` as the
durable per-project defaults movement 2 reads, so the next run doesn't re-ask.

### 10. Write & commit

Apply **`discovery-plan`** craft to compile the ledger into `ateam-plan.md` (goals +
deliverables) and `research-plan.md` (open questions, assumptions +
confidence, technical research) — written together. **Stage the grill digest
first**: `input/<YYYY-MM-DD>-grill-digest/` holding each grill exchange
verbatim — the question · your recommended answer · the human's answer. Grill
answers are raw input like any other batch; the digest is what `sources:`
cites for grill-derived facts, and later runs read it instead of re-asking
(ask-once-then-deltas). In `context.md`, compile `## Sources` — the audit
index of everything this run consumed: one line per source (link visited,
provided file, connector pull, the grill digest batch) with type · pointer
(URL or `input/` path) · date · what it informed · coverage. Every file in
every ingested batch has a row; a re-read appends a new row.

Write the **decision records** as `decisions/NN-<slug>.md` per
`references/decision-template.md` — ratified with every linked load-bearing
ASM `proceed` → `made`; ratified with one `pending`/`defer` → `provisional`;
unanswered → `parked` with an open question; each with `assumptions:` naming
its ASM ids, `## Existing state` cited to the implemented list and any ADR
deviation in `deviates_from:`. Ids continue from the existing set; a reshaped
call supersedes, never overwrites.

Write the **ADRs** as `adr/NN-<slug>.md` — ratified ones `active` with
`decided_by: human`, agent-decided ones `active` with `decided_by: agent`, and
anything the human never actually answered `status: parked` plus a matching open
question in `research-plan.md`. The ADRs are compiled **before** the plans, so
`ateam-plan.md`'s deliverables are stated against the shape that was actually
decided rather than one nobody chose.

Then write everything:
`context.md`, `jtbd/` files (active + parked; on iteration runs the
reshaped/superseded ones per the durable rules), the ADRs, the decision
records, the plans, any `research/` run.
Durable rules bind every write: ids forever, supersede never delete, `input/`
verbatim staging only. Manifest present: call `feature-cli.mjs configure` with
the captured run brief, gate policy and existing human authorization; then call
the completion command below. Commit with messages naming what
changed and why (`docs(jtbd): 01–02 minted, 03 parked — reporting is a
different job`).

## Re-invocation (revise / resume / review-and-extend)

Idempotent. If `docs/product/` already has jobs, you **review and extend** —
never re-derive: existing ids stand, reshapes supersede. On resume after an
escalation, read the answers under `## Awaiting answers`, clear what's
answered, continue from the movement you halted in.

**The iteration entry.** This is the **reopen-discovery** route the scope
guardrail names — the change introduces a new job, audience or load-bearing
assumption; a bounded change is the `/feature` refinement route and never
comes here. When `docs/product/` holds an active job set and either an
un-ingested `input/` batch exists or the prompt points at a document, board or
other artifact, say so — "this is an iteration over an existing North Star" —
and run the ten movements as an iteration: stage first
and digest against the existing context (movement 3), read the shipped state
(3), classify every active job and draft the decision candidates (4), pass the
candidates to the dev review (5), route conflicts and candidates through the
grill (7), present the three lists and the coverage diff (8), write the
decision records (10). Nothing about the orchestrator changes; you detect the
entry yourself, under `/feature` and standalone alike. A re-shape that reaches
definition without decision records and a classified job set is the drift
this entry exists to prevent.

## No human present

You are a grill; you cannot run without a human. If nobody answers:
serialise the blocking questions — one per heading — into `context.md` under
`## Awaiting answers`, leave `phases.discovery.status = "in_progress"`, commit
that, halt, and report what is needed. **An escalation is a defined output,
not a failure.**

**Autonomous degrade is forbidden.** Answering your own questions and writing
invented jobs into `docs/product/jtbd/` manufactures a North Star from
nothing, and every downstream agent treats it as ground truth.
Assumption-flags do not mitigate this.

The **one carve-out** is the dev review's three-way rule (movement 5), and it
is technical only: repo-verifiable facts and declared defaults. It never
reaches a demand-side question — need, audience, priority, scope — and it
grants *you* nothing here. If you are the one without an answer, you escalate.

## Self-check before returning

- Every active job passes the jobs-to-be-done rubric; every job has
  `confidence` + `sources`, and every `sources:` entry resolves to a file —
  grill-derived facts cite the staged grill digest.
- The ledger's blocking set is empty — or serialized under
  `## Awaiting answers`.
- ateam-plan.md and research-plan.md cross-reference cleanly (every resolution
  deliverable points at its question).
- Intake entries from **all three** banks are tagged and routed; no bank
  question was asked raw.
- The dev review ran and its findings routed through the ledger — or its
  absence is recorded in `research-plan.md` as an open item. It re-fired at
  most once. No job body holds solution-side content; every technical finding
  the jobs reference resolves to a `research-plan.md` entry.
- Every ADR rests on a dev review finding or a fact already in
  `## Technical context`, carries ≥1 real alternative, consequences, and a
  revisit-when trigger — or the architecture beat's absence is recorded in
  `research-plan.md`.
- No ADR is `active` with `decided_by: human` unless the human actually
  answered; unratified decisions are `parked` with an open question logged.
  Every applied Declared default is named in its ADR and stamped as an
  assumption.
- `ateam-plan.md`'s deliverables are consistent with the ADRs — no deliverable
  assumes a shape the ADR set did not decide.
- `context.md` has `## Technical context` populated or honestly `TBD`, and no
  fact is restated across `context.md` / `research-plan.md` / `A-Team Config`
  — nor **within** `context.md` (a ledger Know that duplicates a
  `## Technical context` or `## Design context` entry is the same bug).
- Every source the human pointed at is staged as an `input/` batch with a
  `SOURCE.md` before anything cites it; every named-but-absent companion is a
  `SOURCE.md` note and a ledger entry.
- Every file in every ingested batch has a `## Sources` coverage row; every
  prose file is `full` (conductor or digest).
- Every domain claim in the glossary, the digest, the Knows, job bodies
  (`## Today`, `## Forces`), ADR contexts and decision records carries a line
  citation that resolves on disk.
- No `[conflict]` entry is closed without a ruling source; every open one has
  a `research-plan.md` open question and `TBD` markers wherever it lands.
- No decision record is `made` unless every linked load-bearing ASM is
  `proceed`; every `provisional` one names a `pending`/`defer` ASM whose
  `cheapestProbe` is its probe; no record carries a probe of its own; every
  `deviates_from:` was surfaced at the read-back; none is `made` or
  `provisional` with `decided_by: human` unless the human actually answered.
- Iteration runs: every active job is classified kept / reshaped / superseded
  with its trigger cited; every decision record states keeps / changes /
  removes against the implemented list; a staged human artifact has its
  coverage diff in the read-back.
- Manifest (if present): configure and completion commands returned success;
  the authorization reference records what the human actually requested.


## Current context before discovery

Resolve the configured current-context entrypoint with
`node <harness>/runner/src/context-cli.mjs select --root <target> --task '<task JSON>'`.
For first bootstrap or legacy context, invoke project-context to add/revalidate
its current index without dropping historical evidence. Surface stale discovery
claims that conflict with current implementation or commands; code does not
rewrite product intent. Subsequent tasks select relevant evidence and global
invariants instead of rereading every raw input batch. Record new evidence through
its owning skill and refresh only affected facts after integration.

## Deterministic completion

When a feature manifest exists, the orchestrator calls `feature-cli.mjs start`
before invoking this skill. After writing the artifacts and collecting the
report, read `node <harness>/runner/src/feature-cli.mjs show --feature <feature-dir>`
and call the following with that manifest revision and one stable event ID for
this completion attempt. Reuse the same ID only to replay the identical operation
after interruption; changed inputs require a new ID.

```sh
node <harness>/runner/src/feature-cli.mjs complete --feature <feature-dir> --expected-revision <revision> --event-id <completion-id> --input '{"phase":"discovery","artifacts":["../../product/jtbd","../../product/decisions"],"blocking_flags":[]}'
```

Replace `blocking_flags` with the actual concrete flags from the report. Success
is the done signal; `blocked` retains the reason and requires its resolution.
The command validates actual stage obligations and binds artifact revisions.
Do not edit phase status, approval, attempts, milestones, or state by hand.
Standalone artifact work without a manifest does not create one.

The configured run brief includes `mode` (`discovery-only`, `prototype`,
`implementation-pr`, or `refinement`), `outcome`, `assumptions`, `deliverables`,
`required_verification`, `limits`, and `stopping_point` alongside the existing
purpose/fidelity/timebox fields. Record the existing request rather than inventing
answers. Discovery-only stops at discovery; a coded prototype defaults to dev (design may be the explicit lofi stop); a PR
run stops after the PR gate. Required future studies remain pending.

Use `feature-cli.mjs configure --feature <feature-dir> --expected-revision
<revision> --event-id <configuration-id> --input '<configuration JSON>'`. The
JSON contains `run_brief`, `gate_policy`, and `authorization`: `{ "kind": "human",
"actor": "<requesting human>", "authorized": true, "reference": "<actual request
reference>", "scope": ["definition", "design"] }`. Scope names only the gates
the human authorized provisionally. Missing authorization keeps the block default.

The discovery binding covers its durable JTBD output. List context, ADRs and
plans in the phase report, but do not bind evolving current-context summaries or
appendable research plans as immutable discovery outputs. Later context refresh
and assumption relay must not reopen unchanged jobs. Changed jobs still stale
downstream gates; current-context selection independently detects stale facts.

Keep load-bearing research in the existing research plan's single
`ateam-assumptions` block, using the schema and revision/source rules in
`runner/ASSUMPTIONS.md` in the harness. The run brief references those actual ASM
IDs. Record risk, dependent decision, required stage, actual owner (or unresolved
owner), confidence, disproof, cheapest probe and evidence/disposition. Do not
manufacture a demand-side answer, source or owner. Discovery-only can end with
visible later-stage uncertainty; an evidence-producing prototype can precede its
study. A due assumption requires evidence or an existing authorized deferral.
Supported no-go/reshape closes as a research decision through
`record-research-decision`, preserving delivery milestones. Research revisions
retain history without rebinding the entire live plan as a discovery artifact.
