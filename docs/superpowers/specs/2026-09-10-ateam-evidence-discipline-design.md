# Evidence discipline for discovery — design

**Date:** 2026-09-10, revised 2026-09-15 after PRs #55–#61 · **Status:** approved; plan revised ·
**Owner:** Alvaro (PM surface) · **Origin:** the ARC v0.5 capability test
(report: <https://claude.ai/code/artifact/99dec1a6-58a0-48d4-b6df-eab49eb1661e>)

## What this changes, in one paragraph

Discovery gains a real **iteration entry** for re-shaping an existing product
against a new client input, and every discovery write gains an **evidence
discipline**: inputs staged before they are cited, coverage recorded per file,
domain claims cited to lines, conflicts between inputs emitted as ledger items
rather than resolved silently, product-scope calls recorded as a new durable
class of **decision records** with a calibration rule, and every call grounded
in what already shipped. Nothing changes in what the A-Team is good at; the
changes constrain what it may assert and make each assertion auditable.

## Decisions taken in the design conversation

1. **Subject.** The improvements target the A-Team's processes, skills and
   flows — whatever fits the harness. The boards were the test fixture: one
   made by the A-Team, one by humans as the control. *(Alvaro, 2026-09-10.)*
   A definition follows from the answer and is recorded here: **the A-Team is
   however the agent works over a target's `docs/product/` layer**, not only a
   `/feature` run. The 2026-09-02 board was produced by `building:grill-me`
   over the ARC repo's durable artifacts, not by `ateam-discovery`; Alvaro
   counts that session as the A-Team, so the harness must make its evidence
   rules hold on that path too — by giving the path a home inside discovery.
2. **Flow home.** The re-shape flow lives in `ateam-discovery`'s re-invocation
   clause, made real as a named entry — not a new reserved skill, not a
   vendored grill-me.
3. **Calls home.** Product-scope calls get a new durable class,
   `docs/product/decisions/NN-<slug>.md`, cited as `[[dec:NN]]`. ADRs stay
   architecture-only and Dev-owned.
4. **Out of scope this round.** A FigJam projection of the discovery set. The
   `wireflow` skill's FigJam rebuild reference is the seed if it is wanted
   later.
5. **Decision records bind to the assumption ledger.** *(Alvaro, 2026-09-15.)*
   Between the design and the plan, PRs #55–#61 landed a versioned
   `ateam-assumptions` JSON ledger in `research-plan.md` (stable `ASM-` ids,
   disproof, cheapest probe, required stage, owner, evidence entries that
   snapshot a source with its SHA-256, and a disposition of `pending` ·
   `proceed` · `defer` · `no-go` · `reshape`), enforced by the feature command
   layer at phase entry and completion, with an explicit rule against a
   parallel assumption register. A decision record therefore carries no
   `probe:` of its own: it lists the `ASM-` ids its falsifier rests on, and its
   status derives from them (§4.3). In plain terms: the ledger is where the
   harness checks whether a call has been tested; the decision record is where
   a human reads what was decided, why, at what cost, and what it changes in
   the built product.

## What the test established, and what the harness verifies

The report's seven findings were re-checked against the harness and the target
repo on 2026-09-10. What stands, with where to verify it:

| Finding | Against `ateam-discovery` as written | Where |
| --- | --- | --- |
| Inputs not exhausted; shortest input dominated | No coverage record exists. `## Sources` records *that* a file informed something, never *how much* was read. The Aug 28 pipeline run did capture most of what the board dropped (sort-and-settle, Finance, QuickBooks, award-before-commit are all in ARC's `context.md`), but missed anonymisation, WeChat and the three-buyer cap. | `ateam-discovery/SKILL.md` §Self-check; ARC `docs/product/context.md` L357, L499 |
| Conflicts resolved silently | Contradictions exist only inside `research-synthesis`, which evidence-light runs skip. The ledger has no conflict class. | `research-synthesis/SKILL.md` step 5; context template ledger |
| Calls committed past an unverified falsifier | Assumptions carry *disproof + cheapest probe*, but nothing checks a disproof that is checkable against staged inputs before a call is stamped. No durable class holds a product-scope call at all. | research-plan template §Assumptions; CONTRACT §durable layer |
| Unauditable source ("the frame") | The staging rule covers connector pulls. A human-attached file outside the repo has no rule. On Sep 2 the side session staged the PDF properly on an unmerged branch (`claude/charming-booth-36fcd6`, `input/2026-09-02-build-frame-dealflow/`); the session that built the board never read it. | CONTRACT §`input/` rule; `project-context/SKILL.md` §Inputs |
| Shipped state not read | The re-invocation clause covers jobs only: "review and extend — never re-derive". Nothing requires reading `adr/`, `epics/`, the product report or the shipped code before a call. | `ateam-discovery/SKILL.md` §Re-invocation |
| Human artifact not consumed | The connector-pull rule already permits staging a board; nothing asks for a diff against it. | CONTRACT §`input/` rule |
| Claims uncited to lines | `sources:` is batch-level on jobs and ADRs; `## Sources` is file-level; the glossary has a source column with no line convention. | CONTRACT JTBD template; context template |

## Goals and non-goals

**Goals.** (1) A defined path for "existing v0 + new client document" that
runs through discovery and hands to definition unchanged. (2) Every domain
claim in a durable artifact auditable to a staged input and a line. (3) Every
conflict between inputs visible as an item with a ruling or an open question.
(4) Every product-scope call durable, cited, calibrated against its own
falsifier, and grounded in what shipped. (5) A printed coverage record per run.

**Non-goals.** No orchestrator state changes. No new manifest fields. No new
gate. No change to definition, design, spec, issues, dev or pr phases beyond
one read-list line in `product-report`. No FigJam projection. No change to
Dev-owned contents (`dev-research`, `dev-intake.md`, `adr/`) beyond one
declared input slot.

## 1. The iteration entry

**Trigger.** `ateam-discovery` is invoked (by `/feature` or standalone) and
`docs/product/` already holds an active job set, and either (a) an
un-ingested `input/` batch exists, or (b) the prompt points at a document,
board, or other artifact. This is the **reopen-discovery** route the merged
scope guardrail names — a new job, audience or load-bearing assumption; a
bounded change takes the `/feature` **refinement** route
(`configure-refinement`) and never enters here. The orchestrator does not
change: startup and the phase loop are as today; discovery detects the entry
itself.

**Sequence.** The ten movements stand. Inside them:

- **Research.** Stage first (§2.1), then digest the new input *against* the
  existing `context.md` — refresh, never rebuild. Build the conflict list (§3)
  between the new input, the existing inputs, the existing North Star and the
  shipped state, before any drafting. Read the shipped state (§5.1).
- **Straw-man.** Read every active job, ADR, epic, the product report and the
  project plan. Classify each active job **kept / reshaped / superseded**, with
  the citation that triggers the classification. Draft the **decision
  candidates** (§4) that the new input forces — scope calls a definition phase
  cannot make on its own.
- **Dev review.** Pass the decision candidates alongside the jobs (§5.2).
- **Architecture.** Unchanged in shape. The contract declares one new input
  to the beat — the decision candidates — so an ADR deviation is caught here
  rather than at read-back. The `architecture` skill is Davide's; until it
  reads the input, discovery surfaces deviations itself at the read-back.
- **Grill.** Conflicts and decision candidates are ledger entries and route by
  the same answerability rule: blocking + this human can answer → asked, one
  at a time, recommendation first; blocking + not answerable → research
  activity; non-blocking → ledger. A human "yes" on a candidate whose
  falsifier is unchecked yields `provisional`, not `made` (§4.3).
- **Read-back.** Three lists join the current read-back (jobs, context,
  plans, ADRs): the **coverage record** (§2.2), the **conflicts** with their
  rulings or open status (§3), and the **decision records** with their status
  and probe (§4). Plus, when a human artifact of the same kind was staged, the
  **coverage diff** against it (§5.3).
- **Write.** The standard set plus `decisions/NN-*.md`, the refreshed
  `context.md` (Sources with coverage, glossary, conflicts in the ledger), and
  reshaped/superseded jobs per the durable rules. The grill digest is staged
  as today and now also records each conflict ruling and each decision
  ratification verbatim.

**Hand-off.** Unchanged: `phases.discovery.status = "complete"`, the
orchestrator advances to definition, which produces journeys and the rest.
Standalone runs end at the read-back and write, as today.

## 2. Evidence discipline

Three rules. Each is a CONTRACT.md clause, mirrored in the skill that writes.

### 2.1 Staging — nothing is cited that is not on disk

CONTRACT §`input/` gains: *Anything the human points at that lives outside the
repo — a file in a parent folder, an attachment in the conversation, a board,
a shared page — is staged verbatim as `input/<YYYY-MM-DD>-<label>/` with a
`SOURCE.md` before it is cited. The batch is labelled by staging date; the
`SOURCE.md` records origin, authoring date if stated, what was copied, what
was not (an original binary kept alongside is fine, never required), and any
fidelity caveat (an extraction is not the document). A document that names a
companion not in hand records the absence in `SOURCE.md` and as a
`[non-blocking]` or `[blocking → …]` ledger entry; its contents are never
inferred.* This generalises the connector-pull rule; the connector wording
stays.

`project-context` §Inputs gains the same rule; `ateam-discovery` Research
movement says "stage first".

### 2.2 Coverage — what was read, how much, by whom

`context.md`'s `## Sources` table gains one column, **Coverage**, with a
fixed vocabulary:

| Value | Meaning |
| --- | --- |
| `full · <date> · conductor` | read end to end in the conversation |
| `full · <date> · digest` | read end to end by a one-shot digest subagent whose digest cites lines |
| `partial <range> · <date> · <method>` | allowed only for non-prose inputs (a JSON spec, an image set, a binary) with the method stated — "diffed programmatically", "rendered and described" |

*Prose* means a text file meant to be read: markdown, plain text, an
extraction. Everything else is non-prose. A staged batch the run did not
ingest has no coverage rows, stays out of `ingested:`, and gets a ledger entry
naming it and why — a batch cannot be silently skipped either.

Coverage is recorded **at ingestion**. Later tasks select context through
the `ateam-context` index (`runner/CONTEXT.md`) and do not re-read batches; a
deliberate re-ingest appends a row.

Rule: **every file in every ingested batch has a row; prose files are `full`.**
A long document is read in full by a digest subagent, announced before
dispatch (the grill-mode promise), whose digest lands in `## Digest` with line
citations — so the conductor's load discipline holds without the shortest
input dominating. The self-check fails on any prose file without a `full` row.
The coverage record is presented at the read-back as its own list.

`## Sources` remains append-mostly: a run that re-reads a file appends a new
row for that file with the new date and coverage; the latest row governs, and
no earlier row is edited.

### 2.3 Line citations — every domain claim resolves to a line

Citation syntax, added to CONTRACT's citation convention beside `[[NN]]` /
`[[epic:NN]]` / `[[adr:NN]]` / `[[dec:NN]]`:

- text: `<batch>/<path>:L<start>-L<end>` — e.g.
  `2026-08-20-outsource-design-package/deal-state-mechanics-guide.md:L88-L94`
- a section when lines would be brittle to quote: `<batch>/<path> §4.6`
- PDFs: `<batch>/<file>.pdf:p<N>`; images: `<batch>/<file>` plus what region
- the grill: `<date>-grill-digest/grill.md:L…` (it is a text file)

Lines are stable because `input/` batches are never edited. A *domain claim*
is a statement about the client's world — its people, process, vocabulary,
numbers, rules or constraints — as opposed to a statement about the run
itself (a recommendation, a classification, a self-check). Where a domain
claim must cite is fixed: glossary rows (the existing Source column now carries the
citation), `## Digest` claims, ledger Knows, a job's `## Today` and
`## Forces`, an ADR's `## Context`, a decision record's `## Why` / `## Wrong
if` / `## Existing state`. `sources:` frontmatter on jobs, ADRs and decisions
stays batch-level (it is the audit index); the line citations sit in the body
where the claim is made. **A domain claim with no citation is a failed
self-check.** A citation that does not resolve on disk is a bug, like a dead
`## Sources` row today.

## 3. Conflicts as ledger items

The `Know / Don't know` ledger gains a third class, `[conflict]`:

```markdown
- **[conflict → blocks [[03]] / dec:02] [pm]** guide says award before commit,
  soft gate (`…/deal-state-mechanics-guide.md §2`) · brief says commit before
  award, hard (`…/slice-1-product-brief.md §4.6`) · **ruling:** open
```

Rules:

- A conflict names both sides with citations and what it blocks (a job, a
  decision candidate, a scope call) or `[non-blocking]`.
- **Routing is the ledger's.** Blocking + answerable by this human → asked in
  the grill, recommendation first; the ruling is recorded verbatim in the
  grill digest and the entry closes with `ruling: human, grill Q7`.
  Blocking + not answerable → research activity. Non-blocking → stays, and
  survives into `research-plan.md` as an open question.
- **A batch's own stated precedence is a ruling source.** When a `SOURCE.md`
  states which document wins (ARC's design package does: guide over diagrams,
  kernel-vocabulary over glossary), the conflict is recorded with that
  precedence as its ruling and is not asked.
- **An unruled conflict is carried, never smoothed.** Every artifact touching
  it carries both readings marked `TBD` with the conflict cited.
- **Silent resolution is a failed self-check.** Two inputs disagreeing on a
  fact that reaches an artifact without a `[conflict]` entry is the defect the
  test found.
- Conflicts are detected at the digest step for the new input against: the
  other inputs, the existing glossary and Knows, the active jobs, the active
  ADRs, and — on iteration runs — the shipped state (§5.1).
  `research-synthesis` keeps its
  contradictions section for evidence-heavy runs; its contradictions are
  entered in the ledger as `[conflict]` items too, so there is one class.

## 4. Decision records and calibration

### 4.1 The class

`docs/product/decisions/NN-<slug>.md` — one file per product-scope decision:
the calls that shape what is built and that a definition phase must not make
on its own (grain of a deal, which gates block, what is pull versus push,
what is out of focus this cycle). Cited as `[[dec:NN]]`. Same lifecycle as
jobs, epics and ADRs: ids forever, supersede never delete, never written
without human review in the same session. PM-owned; written by discovery.
The PRD's per-feature `## Decision log` stays for feature-level decisions and
cites `[[dec:NN]]` when a row derives from one. ADRs stay architecture-only;
a decision record that deviates from an ADR names it and does not silently
supersede it — superseding an ADR is the `architecture` skill's act. If the
Dev-owned decision-log work lands later, it cites `[[dec:NN]]` rather than
duplicating the class.

### 4.2 Template

```markdown
---
id: 01
slug: deal-grain-is-coarse-buckets
status: provisional         # made | provisional | superseded | parked
confidence: moderate        # strong | moderate | directional | hypothesis
decided: 2026-09-02
decided_by: human           # human | agent (agent only via a Declared default or a project binding)
sources: [2026-09-02-build-frame-dealflow, 2026-09-02-grill-digest]
assumptions: [ASM-012]     # the ledger records the falsifier rests on; required when load-bearing
deviates_from: []           # [adr:03] when it does — named, never silent
---

# 01. A deal is captured as coarse buckets, and the sheet is attached unopened

## Status
provisional — ratified at the 2026-09-02 grill (Q2); ASM-012 is `pending`.
<!-- made — ratified at …; every linked load-bearing ASM is `proceed` -->
<!-- superseded by [[dec:05]] / parked — presented at …, not answered -->

## Context
Jobs it serves: [[01]], [[05]]. The input that forces it, cited. The
conflict it rules, if any.

## Decision
What we will do. Active voice, present tense.

## Why
The reasoning, each load-bearing claim cited to a line.

## Cost
What this gives up, stated as a testable prediction.

## Wrong if
The falsifier, as the `disproof` of the linked ASM. Then its state in the
ledger: `checked — EVD-<id> on ASM-<id>, <citation>, result support` ·
`checked — result contradict; superseded by [[dec:NN]]` · `unchecked —
ASM-<id> pending, probe: <its cheapestProbe>`.

## Alternatives considered
Option · the real reason it was dropped. At least one.

## Existing state
Keeps: … · Changes: … · Removes: … — each cited to the product report's
implemented list and the code path. ADR deviations named here.

## Revisit when
The signal that reopens this — mirrored into research-plan.md.
```

### 4.3 Calibration rule

*A decision whose falsifier is checkable against staged inputs is checked
before it is stamped `made`* — and the check is an **evidence entry on the
linked ASM record**, never a note in the decision file. Each load-bearing
falsifier is an `ASM-` record in `research-plan.md`'s `ateam-assumptions`
block (`runner/ASSUMPTIONS.md`): its `disproof` is the falsifier, its
`cheapestProbe` is the probe, its `requiredStage` says when it falls due.
Checking it against a staged input records an `EVD-` entry with the input's
target-relative path, SHA-256, original reference, `origin: observed` and a
`result` of `support` or `contradict`. Then:

- every linked load-bearing ASM is `proceed` (supporting evidence recorded) or
  the record has no load-bearing assumption → `status: made`;
- any linked ASM is `pending` or `defer` → `status: provisional`, and the
  ledger's own gates carry the deadline — no second probe field, no second
  research activity;
- evidence `contradict` → the candidate is reshaped before it is asked, or an
  existing record is superseded.

A `made` record whose ASM later gains contradicting evidence is reopened
through `## Revisit when` and superseded. **Presented is not ratified**, as for
ADRs: unanswered is `parked` with an open question. `decided_by: agent` is
permitted only through a Declared default or a project binding, recorded as an
assumption, exactly as ADRs do — a scope call is demand-side and the
no-autonomous-degrade rule applies to it in full.

### 4.4 Where decisions surface downstream

`ateam-definition` reads `decisions/` as part of `docs/product/**` (already
permitted) and the PRD's scope traces a scoped item to a `[[dec:NN]]` where
one governs it. `product-report` adds `decisions/` to its read list so a
`provisional` record still open at pr time is reported as such, with its
pending ASM. The `discovery-plan` refresh mirrors each `## Revisit when` as an
open question; probes already live on the ASM records, so nothing is
duplicated.

## 5. Existing state and human artifacts

### 5.1 Read what shipped before any call

On the iteration entry, discovery reads before drafting: the `ateam-context`
index resolved through `context-cli.mjs select` (`currentState`, `bindings`,
`unresolvedDecisions`, the observed facts), every active ADR, every epic with
its status, `ateam-product-report.md` §"What actually shipped" (its verdicts
are `implemented` / `partial` / `not implemented` since PR #59),
`project-plan.md`, and the surfaces the report names as implemented (the
screen/page list, not the code). Every decision record states keeps /
changes / removes against that list, cited. A deviation from an active ADR is
named in `deviates_from:` and surfaced at the read-back; it is never a silent
supersede. A reshaped or superseded job cites the input line that reshapes it.

### 5.2 The dev-research slot, widened by one input

`ateam-discovery` passes the decision candidates to the dev review alongside
the jobs. CONTRACT records the slot: *on an iteration run the dev review also
receives the decision candidates and may return, per candidate, what it would
remove or coarsen in the shipped code, cited to paths.* The heading is
specified here; the contents of `dev-research` are Davide's to fill. Optional
by absence, like the review itself: if the skill does not act on the
candidates, discovery records "candidates not reviewed against the code" in
`research-plan.md` and continues.

### 5.3 Human artifacts of the same kind are inputs

When the human points at prior human work on the same question — a board, a
current-state map, a spreadsheet — it is staged through the connector-pull
rule (a FigJam board via `get_figjam`, verbatim, as
`input/<date>-figjam-pulled/`) and consumed like any input: coverage row,
line citations. The read-back then includes a **coverage diff**: items on the
human artifact the run's set does not cover, and items in the run's set the
artifact does not — each a ledger entry or an explicit "deliberately not
covered" with a reason. This turns the control-board comparison from a
forensic exercise into a printed list, and it applies to any client-supplied
artifact, not only test controls.

## 6. Files touched and mirrors

All PM-owned unless marked. Two Dev-owned skills, `architecture` and
`dev-research`, receive a declared slot in CONTRACT.md and no content edit.

| File | Change |
| --- | --- |
| `CONTRACT.md` | `decisions/` in the tree and citation convention; staging clause (§2.1); coverage rule (§2.2); citation syntax and where claims must cite (§2.3); `[conflict]` ledger class (§3); decision record template + calibration rule (§4); iteration entry in the `ateam-discovery` contract (§1); dev-review slot line (§5.2); human-artifact rule (§5.3); `product-report` read-list line (§4.4). |
| `PLAN.md` | Mirror: artifact tree gains `decisions/`; a "Discovery iteration and evidence discipline (2026-09-10)" subsection under Discovery flow; the definition from decision 1 above. |
| `.claude/skills/ateam-discovery/SKILL.md` | Iteration entry (replaces the re-invocation paragraph); Research "stage first", digest subagent, conflict list; Straw-man classification + decision candidates; dev-review pass-through; grill routing for conflicts/candidates; read-back's three lists + coverage diff; write step; self-check additions (below). |
| `.claude/skills/project-context/SKILL.md` + `references/context-template.md` | Staging rule; Coverage column and vocabulary; citation syntax in glossary Source column; `[conflict]` ledger class; refresh rules for Sources. |
| `.claude/skills/jobs-to-be-done/SKILL.md` | Line citations required in `## Today` / `## Forces`; kept/reshaped/superseded classification on review-and-extend; rubric Grounding check reads citations. |
| `.claude/skills/discovery-plan/SKILL.md` + `references/research-plan-template.md` | Decision `## Revisit when` → open questions; unruled conflicts → open questions; cite `[[dec:NN]]`. The `## Assumptions` section is the `ateam-assumptions` JSON ledger since PR #60 and is not touched; a `provisional` decision's probe already lives on its ASM record. |
| `.claude/skills/architecture/SKILL.md` + `references/adr-template.md` | **Davide's.** The slot is declared in CONTRACT.md's ADR section (line citations in `## Context`; the beat receives the decision candidates; a `deviates_from` on a decision record is surfaced, never a silent supersede) and in CONTRACT's own copy of the ADR template, which is canonical. The skill's mirror is Davide's to bring in line; discovery treats the beat as optional by absence for the new input, as it does today. |
| `.claude/skills/research-synthesis/SKILL.md` | Contradictions also entered as `[conflict]` ledger items. |
| `.claude/skills/product-report/SKILL.md` | Reads `decisions/`; reports open `provisional` records. |
| `.claude/skills/ateam-discovery/references/decision-template.md` | **New** — the §4.2 template, annotated. |
| `SKILLS.md` | Row updates for the skills above. |
| `.claude/skills/dev-research/SKILL.md` | **Davide's** — the §5.2 slot is declared in CONTRACT; no edit here beyond a pointer if he wants one. |

`ateam-discovery` self-check additions, verbatim intent:

- Every file in every ingested batch has a `## Sources` coverage row; every
  prose file is `full`.
- Every domain claim in the glossary, digest, Knows, job bodies, ADR contexts
  and decision records carries a citation that resolves on disk.
- Every source the human pointed at is staged before it is cited; every named
  companion not in hand is a `SOURCE.md` note and a ledger entry.
- No `[conflict]` entry is closed without a ruling source; every open one has
  a research-plan open question and `TBD` markers where it lands.
- No decision record is `made` with an unchecked falsifier; every
  `provisional` record names a probe that resolves to a research activity;
  every `deviates_from` is surfaced at the read-back.
- Iteration runs: every active job is classified kept / reshaped / superseded
  with its trigger cited; every decision record states keeps / changes /
  removes against the implemented list.
- A staged human artifact has a coverage diff in the read-back.

## 7. Verification

1. **Two adversarial consistency passes** over every mirrored copy —
   CONTRACT.md, PLAN.md, the context template, the decision template, the
   research-plan template, each SKILL.md above, SKILLS.md — before merge. The
   2026-07 and 2026-08 rounds caught real breakage both times with this
   pass; a docs-only change is under-verified until a fan-out has read every
   copy.
2. **A template dry-run**: instantiate one decision record from the Sep 2
   run's Call 2 and one `[conflict]` entry from the award-order conflict,
   by hand, to prove the templates carry what the test needed.
3. **The real capability test, re-run**: the v0.5 re-scope through the
   iteration entry on the ARC repo, on a branch, with the Build Frame staged
   and the control board pulled as a human artifact. Compare against the
   control with the report's seven properties. This is the acceptance test
   for the whole change; the round is not done until it has run.
4. **Acceptance criteria** for the harness change itself: every self-check
   line above is executable from the skill text alone; no reserved name,
   manifest field, or gate is added; the branch is rebased on the merged runner
   PRs (#55–#61) and no Dev-owned file is touched.

## 8. Sequencing

One PR stack, bottom-up, mirroring earlier rounds: (1) CONTRACT.md + the
decision template + the context and research-plan templates; (2) the ported
skills (`project-context`, `jobs-to-be-done`, `discovery-plan`,
`research-synthesis`, `architecture`, `product-report`); (3) `ateam-discovery`
with the iteration entry; (4) PLAN.md + SKILLS.md mirrors. Merge before the
`test-round-1` tag is cut, so the round runs on the disciplined discovery.

## 9. Open questions carried forward

Answered 2026-09-15 by the merged PRs: where a probe lives (on the ASM record,
§4.3) and whether coverage is per task (no — per ingestion, §2.2).

None that block the plan. Two that the re-run will answer: whether `full`
coverage of a 1,376-line glossary via a digest subagent holds the nuance the
conductor needs (if not, the digest gains a "load-bearing lines" section the
conductor reads verbatim), and whether the coverage diff against a human
artifact needs its own template or a read-back list suffices.
