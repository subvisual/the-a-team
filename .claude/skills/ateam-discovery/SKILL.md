---
name: ateam-discovery
description: Use when the A-Team orchestrator invokes the discovery phase for a feature, or when a human runs discovery standalone to seed docs/product/ from raw input (a client transcript, a fuzzy prompt) before any feature exists. The 🔥 grill phase skill — conducts the ported PM skills (product-brainstorming, project-context, research-synthesis, jobs-to-be-done, discovery-plan) plus the two dev-role beats (dev-research, architecture) through challenge → run brief → research → straw-man → dev-research → architecture → grill → read-back → independence handoff → write, producing context.md, the JTBD set, the ADRs, ateam-plan.md, and research-plan.md, and writing gate_policy + run_brief to the manifest. Cannot run without a human: escalates via ## Awaiting answers, never guesses. Implemented against CONTRACT.md.
metadata:
  version: 0.2.0
  owner: Alvaro Bezerra
  provenance: authored 2026-07-24 against CONTRACT.md as a conductor over the ported product-craft skills (migration PRs 2–11) plus the independence handoff (PR 12). 0.2.0 (2026-08-27) adds the dev-role beats — dev-research and architecture — between the straw-man and the grill, per the board's two cross-lane connectors.
---

# ateam-discovery

The discovery grill. You are a **conductor**: the craft lives in the ported
skills — you sequence them into **one coherent conversation** with the human,
one consolidated read-back, one independence handoff, one write. You are also
**pure craft**: zero project facts; everything project-specific comes from the
prompt, the human, `docs/product/`, and the target repo.

Interaction mode: 🔥 **grill** — one question at a time, each with your
recommended answer, never asked unless its answer changes an artifact.

**Load discipline — conduct lazily.** Do not preload all seven craft skills.
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
- **Writes** (durable, all rules apply): `context.md`, `jtbd/NN-*.md`,
  `adr/NN-*.md`, `ateam-plan.md`, `research-plan.md`. Plus, manifest present:
  `gate_policy` + `run_brief` (the one write beyond your own phase status).
- **Done-signal**: `phases.discovery.status = "complete"`. No orchestrator
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

**Scope guardrail (board):** the A-Team is for **ambitious 0→1 work** — not
small tickets or vague chores. If the prompt is ticket-sized (one concrete
change, no new user-facing capability, definable in a single work item), say
so plainly and route out — `ticket-writer` or the building skills — instead of
running the pipeline. Minting durable jobs for a chore pollutes the North
Star.

### 2. Run brief (in the same beat)

Capture how the human wants the A-Team to run — 3–5 questions, recommended
answers offered: purpose (throwaway concept / client-facing v0 / seed of
production) · fidelity expectation · timebox · what "done" looks like. **The
run brief follows the same grill discipline as everything else: one question
at a time, each with its recommendation — never batched into a single dialog**
(batching proved confusing in the 2026-07 dry run). Check `context.md` for
durable per-project defaults first; don't re-ask what's recorded. Hold the
answers; they're written at the handoff (manifest runs) or into `context.md`
as durable defaults (standalone — see movement 9).

### 3. Research (ingest, never invent)

- Un-ingested `input/` batches + anything the human points at: apply
  **`project-context`** craft to digest into a drafted `context.md` (glossary
  first, Know/Don't-Know ledger, TBD honesty).
- Evidence-heavy runs (transcripts, surveys, tickets): apply
  **`research-synthesis`** craft — themes, contradictions, verdicts against
  any existing jobs, new-job signals — as a drafted `research/` run.
- **Seed the ledger from the `intake/` banks** (`design-intake.md`,
  `dev-intake.md`), each entry tagged `[design]` / `[dev]` / `[pm]`. The
  design bank includes the **design briefing** (migrated from
  teach-impeccable): on a project's first run, its answers synthesize into
  `context.md`'s `## Design context` section (users & emotional goals, brand
  personality, aesthetic direction with references and anti-references,
  accessibility, 3–5 design principles); later runs ask only deltas.
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
forces, honest confidence, parked candidates as real files — *before* asking
the human anything about jobs. A straw-man the human corrects beats a
questionnaire the human authors.

### 5. Dev research (implementation reality, before scope is called)

Load **`dev-research`** craft. The board wires Dev back into discovery twice —
*"What dev needs from grillme"* and *"When building the JTBD get dev
insights"* — because a job set minted with no implementation contact produces a
North Star nobody can build, and the dev phase is where that gets discovered.

It is 🚀 autonomous: it sweeps the target repo and the services the straw-man's
jobs imply, and returns findings that **change a product decision** — a scope
call, a job's feasibility, sequencing, buy-vs-build — each stamped with a cost
(`cheap` / `moderate` / `expensive` / `unknown`), a confidence level, and an
evidence pointer that resolves. It writes nothing. You route its output.

Routing is the ledger's own answerability rule, unchanged: blocking +
human-answerable becomes a grill question in movement 7; blocking + not
human-answerable becomes a technical research activity in `research-plan.md`;
non-blocking joins the ledger tagged `[dev]`. A finding rated `expensive` or
`unknown` against a job the straw-man put in scope is a **scope conversation**,
not a footnote — carry it into the grill.

Depth guard: this beat sizes, it never estimates, and it never designs. Schema,
API contracts, and library picks are dev-phase work.

### 6. Architecture (the v0's shape, drafted for ratification)

Load **`architecture`** craft. `ateam-plan.md` promises *"deliverables to reach
v0"* — an empty promise until someone has said what the v0 *is*. Working from
dev-research's findings, it drafts up to four decisions: repo shape, tech stack
per surface, where the v0 runs (local-first by default), and the v0 data
strategy (mocked API-shaped by default). A question the target repo has already
settled is an observation, not a decision — it is recorded, not minted.

It is 📝 draft + review, and **your grill is its review**. Split its output:

- **agent-decided** — the repo binds it, the config declares it, or one option
  survives a constraint. These pass through to the write step.
- **needs ratification** — costs money, forecloses an expensive-to-reopen
  option, contradicts the target repo, rests on an `expensive`/`unknown`
  finding, or picks a v0 data strategy for a job whose value *is* the live
  data. These become grill questions in movement 7, recommendation first.

**Presented is not ratified.** A decision the human never actually answered is
written `status: parked` with an open question in `research-plan.md` — never
`active`. Stamping an unanswered ADR active manufactures authority the whole
pipeline then builds on.

### 7. Grill (ledger-driven)

Ask **only blocking Don't-Knows**, one at a time, recommended answer first,
routed by **answerability**:

- blocking + answerable by this human → ask it;
- blocking but this human can't answer it (technical, third-party) → a
  research activity in `research-plan.md` — never a wasted question;
- non-blocking → stays in the ledger.

Intake-bank questions are never asked raw — they enter through the ledger and
this routing.

The queue is one queue. Alongside the ledger's own blockers it carries
movement 5's human-answerable dev findings and movement 6's ratification
questions — same one-at-a-time discipline, same recommendation-first shape, no
separate "technical round". A dev question the human cannot answer was already
routed to research and must not reach here.

**Termination is defined, not felt**: stop when the blocking set is empty — and
the blocking set includes every ADR still awaiting ratification — or when the
human stops you. A human who stops early leaves unratified decisions `parked`,
which is a correct outcome, not a failure.

### 8. Read-back (mandatory, consolidated)

Present, for correction before anything durable is written: the JTBD set in
full (headlines + confidence — this is the North Star, read it carefully), the
**ADR set** as one-line decisions with their `decided_by` stamp (a decision the
human is seeing for the first time here has not been ratified — it is parked),
plus tight summaries of `context.md` (glossary + ledger), the plans, and any
synthesis run. Where a dev-research finding changed the straw-man's scope, say
so explicitly — a job that quietly moved out of v0 between the straw-man and
the read-back is exactly what this beat exists to surface. One consolidated read-back covers every ported skill's
read-back duty. The human corrects; you fix; re-present what changed.

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
(URL or `input/` path) · date · what it informed. Then write everything:
`context.md`, `jtbd/` files (active + parked), the plans, any `research/` run.
Write the **ADRs** as `adr/NN-<slug>.md` — ratified ones `active` with
`decided_by: human`, agent-decided ones `active` with `decided_by: agent`, and
anything the human never actually answered `status: parked` plus a matching open
question in `research-plan.md`. `ateam-plan.md` compiles *after* the ADRs, so
its deliverables are stated against the shape that was actually decided.

Durable rules bind every write: ids forever, supersede never delete, `input/`
verbatim staging only. Manifest present: write `gate_policy` + `run_brief`,
set `phases.discovery.status = "complete"`. Commit with messages naming what
changed and why (`docs(jtbd): 01–02 minted, 03 parked — reporting is a
different job`).

## Re-invocation (revise / resume / review-and-extend)

Idempotent. If `docs/product/` already has jobs, you **review and extend** —
never re-derive: existing ids stand, reshapes supersede. The same holds for the
ADRs: a settled decision is not re-litigated, a `parked` one is picked back up
where the human left it, and a changed one supersedes with a forward pointer.
Re-run `dev-research` only where the job set or the target repo actually moved —
re-sweeping unchanged ground burns the context the grill needs. On resume after an
escalation, read the answers under `## Awaiting answers`, clear what's
answered, continue from the movement you halted in.

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

## Self-check before returning

- Every active job passes the jobs-to-be-done rubric; every job has
  `confidence` + `sources`, and every `sources:` entry resolves to a file —
  grill-derived facts cite the staged grill digest.
- The ledger's blocking set is empty — or serialized under
  `## Awaiting answers`.
- ateam-plan.md and research-plan.md cross-reference cleanly (every resolution
  deliverable points at its question).
- Intake entries are tagged and routed; no bank question was asked raw.
- Every dev-research finding that survived is routed, carries cost +
  confidence + a resolving evidence pointer, and names the jobs it bears on.
  Nothing implementation-deep was minted as a durable artifact.
- Every ADR rests on a dev-research finding or a cited fact in the target repo,
  carries ≥1 real alternative, consequences, and a revisit-when trigger.
- No ADR is `active` with `decided_by: human` unless the human actually
  answered; unratified decisions are `parked` with an open question logged.
- `ateam-plan.md`'s deliverables are consistent with the ADRs — no deliverable
  assumes a shape the ADR set did not decide.
- Manifest (if present): `gate_policy` + `run_brief` written, own status
  `complete`, nothing else touched.
