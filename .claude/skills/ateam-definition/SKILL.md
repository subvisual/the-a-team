---
name: ateam-definition
description: Use when the A-Team orchestrator invokes the definition phase for a feature, or when a human runs definition standalone over an existing docs/product/ North Star. The 📝 draft + review phase skill — conducts the ported PM skills (prd-writer → epics → wireflow → page-brief) into one definition set: prd.md with requirement-level ACs traced to job ids, docs/product/epics/ bundling every requirement, and rendered + self-verified briefs (wireflow + per-page cards). Never interrogates — drafts with visible TBDs and lets the gate review; reports blocking flags loudly for the tripwire. Implemented against CONTRACT.md.
metadata:
  version: 0.1.0
  owner: Alvaro Bezerra (PM)
  provenance: authored 2026-07-25 against CONTRACT.md from the F5 dry run, which proved this exact conduct order by hand (docs/dry-run-findings-2026-07.md, F-DR-09).
---

# ateam-definition

The definition draft. You are a **conductor**: the craft lives in the ported
skills — `prd-writer`, `epics`, `wireflow`, `page-brief` — you sequence them
into **one coherent definition set** with one honest gate report at the end.
You are also **pure craft**: zero project facts; everything project-specific
comes from `docs/product/`, the manifest, and the target repo.

Interaction mode: 📝 **draft + review** — you do **not** interrogate. Missing
facts become visible `TBD`s and open questions, never invented answers and
never mid-phase questions; the definition gate is where the human corrects
you. Visible honesty beats a finished-looking document.

**Load discipline — conduct lazily.** Load each craft skill at the movement
that needs it, and its references only when that movement uses them (the PRD
template at the PRD movement, method-decisions/spec-schema at the board
movements). On re-invocation prefer each skill's summary sections over full
reference re-reads.

## Contract (CONTRACT.md is authoritative)

- **Reads**: `docs/product/**` (context.md, `jtbd/`, ateam-plan.md,
  research-plan.md); the manifest (`prompt`, `run_brief`); the target repo.
- **Writes**:
  - `prd.md` in the feature directory — every scoped item traces to a JTBD id.
  - `briefs/wireflow/` + `briefs/pages/` in the feature directory — spec
    (`board.json`), rendered SVG/HTML, and PNG verification copies.
  - `docs/product/epics/NN-<slug>.md` — durable rules apply: ids forever,
    supersede never delete, reviewed at the gate.
  - Appends to `research-plan.md`'s `## Assumptions` / `## Open questions`
    (the contract's one standing exception), phase-tagged `[definition phase]`
    with confidence.
  - Together, `prd.md` (requirements + ACs) and the briefs ARE the ticket
    backlog input `prd-to-issues` consumes later — no separate backlog file.
- **Done-signal**: set `phases.definition.status = "complete"` — nothing else
  in the manifest. The orchestrator flips it to `approved` at the gate.
- **Manifest-optional**: absent → prompt from invocation args, skip manifest
  writes, and the in-conversation review replaces the orchestrator gate.
  Standalone is never a weaker-review path.

## The movement sequence

### 0. Ground

Read `context.md` (glossary is the vocabulary every artifact must speak),
the JTBD set (active jobs are the North Star; parked ones are boundaries),
`ateam-plan.md` + `research-plan.md` (what was promised and what is unknown), the
manifest's `prompt` + `run_brief`, and the target repo lightly (stack,
existing screens). **Consume jobs verbatim by id — never mint, reword, or
paraphrase a job.** A scoped item that traces to no job is either out of
scope or evidence a job is missing: mark it `TBD`, route to `jobs-to-be-done`,
keep it out of Must.

### 1. PRD (conduct `prd-writer`)

Pipeline mode: no question pass — draft with explicit `TBD`s. Stories grouped
by job (situational actors, never personas); MoSCoW with every item traced
`[[NN]]`; requirement-level acceptance criteria (testable, outcome-oriented —
ticket-level Gherkin belongs to the issues phase, don't write it here); open
questions mirrored into the ledger/research-plan, never forked into a
PRD-only list. Keep Must lean and honest: **a `TBD` inside Must scope is a
blocking flag, not a formatting problem** — either demote the item or carry
the flag to the gate. Record scope decisions in the decision log (e.g. why an
adoption-critical item is Should, not Must, when it's externally blocked).

### 2. Epics (conduct `epics`)

Read the existing `docs/product/epics/` set first — extend and supersede,
never re-derive or renumber. Shape each epic around one job-outcome, bundle
the PRD's requirement IDs per epic, cite epics as `[[epic:NN]]` (bare
`[[NN]]` is always a job). **Every requirement id must land in exactly one
epic — an unbundled requirement is a gate flag, not a silent drop.**

### 3. Wireflow (conduct `wireflow`, pipeline mode)

Derive the method decisions from `references/method-decisions.md` defaults —
journey set, spine, lanes, locked cuts as Stop nodes — and keep a written
summary as the gate breadcrumb. Build `briefs/wireflow/board.json`, generate
with the engine (`--rasterize`), then **Read every journey's PNG and iterate
until clean — no blind delivery**. Every PRD requirement is embodied by a
node or branch (presentation-quality requirements ride the screen nodes —
note that in the coverage summary). Headline the two riskiest derived calls
— journey set and spine — for the gate.

### 4. Page briefs (conduct `page-brief`, pipeline mode)

Run the job gate first (even A-Team jobs get rechecked — defense in depth;
if the whole board hangs on one job, say the checklist audit has no
discriminating power this run). Derive one card per **unique** page from the
wireflow's page set — states are variants inside cards, never extra cards.
Tasks tagged to `[[NN]]`; an untagged task is a "serves an unlisted job?"
flag headlined at the gate. **Every qualitative acceptance criterion (cotton
test) ships marked "not yet run with a human"** — never self-certified — and
running them lands in the research plan as an activity. Generate, **Read the
board PNG, iterate until every card is clean**.

### 5. Assumption ledger (the independence promise)

Append every assumption this phase made to `research-plan.md` —
`[definition phase]`-tagged, each with confidence, disproof, and cheapest
probe (dry-run examples: the route map, the import file format) — plus the
cotton-test activity. An assumption that lives only in your report is a
broken promise to the absent human.

### 6. Commit & manifest

Commit per craft with breadcrumb messages naming what changed and why
(`docs(<slug>): definition — PRD R1–R8 …`, `docs(epics): 01–03 defined …`,
`docs(<slug>): wireflow — 3 journeys, spine J1 …`, `docs(<slug>): page
briefs — P1–P5 …`). Artifact commits stage both layers (`docs/features/<slug>`
+ `docs/product`); never sweep artifacts into a chore commit. Manifest
present: set **only** `phases.definition.status = "complete"`.

### 7. Gate report (what the tripwire reads)

Return, as distinct sections: **produced** (the artifact list), **riskiest
calls** (journey set, spine, scope demotions, single-job concentration),
**where assumptions landed** in research-plan.md, and — separately and
honestly — **blocking flags**: `TBD`s inside Must scope, unlisted-job
signals, unbundled requirements, failed render self-checks, jobs that failed
the page-brief gate. Provisional gate passage depends on this list; an empty
list is a claim you are accountable for, not a default. At the gate the PRD
is presented **together with the JTBD set it scopes against**.

## Re-invocation (revise / resume)

Idempotent. Per-feature artifacts (`prd.md`, `briefs/`) are overwritten
cleanly — never appended twice. Durable epics follow the superseding rules:
a revise that reshapes an epic writes a new file and flips the old to
`superseded`. Revision notes arrive appended to your invocation args:
re-produce the artifacts incorporating them, and say in the commit message
what the revision changed and why.

## No human present

You are draft + review — the absent human is the normal case, and the gate
reviews you. There is nothing to escalate mid-phase: missing facts become
`TBD`s and open questions per movement 1. What you must **never** do is fill
a `TBD` with an invented fact to look finished, mint a job to make a scoped
item trace, or self-certify a cotton test. If the North Star itself is
missing or empty (`docs/product/jtbd/` has no active jobs), do not fabricate
one — leave `status` as `in_progress` and report that discovery must run
first.

## Self-check before returning

- Every scoped item (story, MoSCoW entry, requirement) traces to an existing
  job id; anything unattributable is `TBD` + routed, and out of Must.
- Requirement-level ACs are testable statements; no ticket-level Gherkin.
- Every requirement id is bundled in exactly one epic; epic ids extend the
  existing set (no renumbering); citations use `[[epic:NN]]`.
- Both boards were rasterized and their PNGs actually Read; defects found
  were fixed or carried as flags — never shipped silently.
- Cotton tests are marked human-run; the activity is in the research plan.
- `[definition phase]` assumptions are appended to research-plan.md with
  confidence.
- Manifest (if present): own status `complete`, nothing else touched.
- The gate report's blocking-flags list is complete and honest.
