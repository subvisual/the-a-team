# Evidence Discipline for Discovery — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `ateam-discovery` a real iteration entry and an evidence discipline — staging, coverage, line citations, conflict items, decision records with a calibration rule, grounding in what shipped — so a re-shape of an existing product against a new client input runs through discovery and every claim it makes is auditable.

**Architecture:** Docs-only change to the harness. `CONTRACT.md` is canonical and changes first; the ported skills and their templates mirror it; `ateam-discovery` conducts it; `PLAN.md` and `SKILLS.md` mirror last. No orchestrator, manifest or gate changes. Dev-owned skills (`architecture`, `dev-research`) receive a declared slot in the contract and no content edit.

**Tech Stack:** Markdown skill files under `.claude/skills/`, `CONTRACT.md`, `PLAN.md`, `SKILLS.md`; verification by `grep` assertions and two adversarial consistency passes (subagent fan-out); acceptance by re-running the ARC v0.5 re-scope through the new entry.

**Spec:** `docs/superpowers/specs/2026-09-10-ateam-evidence-discipline-design.md` — the plan argues from it; read both.

## Global Constraints

- **Branch:** all work on `harness/evidence-discipline` (already exists, holds the spec). Never commit on `main`.
- **CONTRACT.md wins.** Where any mirror (PLAN.md, a skill, a template) disagrees with CONTRACT.md, the mirror is the bug.
- **Ownership.** PM-owned files only: `CONTRACT.md`, `PLAN.md`, `SKILLS.md`, `ateam-discovery`, `project-context`, `jobs-to-be-done`, `discovery-plan`, `research-synthesis`, `product-report`. **Never edit** `.claude/skills/architecture/**`, `.claude/skills/dev-research/**`, `intake/dev-intake.md`.
- **Citation syntax (verbatim from spec §2.3):** text `<batch>/<path>:L<start>-L<end>` · section `<batch>/<path> §4.6` · PDF `<batch>/<file>.pdf:p<N>` · image `<batch>/<file>` plus the region · grill `<YYYY-MM-DD>-grill-digest/grill.md:L<start>-L<end>`.
- **Coverage vocabulary (verbatim from spec §2.2):** `full · <date> · conductor` · `full · <date> · digest` · `partial <range> · <date> · <method>`. No other values.
- **Ledger classes:** `[blocking → …]` · `[non-blocking]` · `[conflict → …]` (plus `[non-blocking]` on a conflict that blocks nothing).
- **Decision record status vocabulary:** `made | provisional | superseded | parked`. Cited as `[[dec:NN]]`. Path `docs/product/decisions/NN-<slug>.md`.
- **Prose style of the harness docs:** rules are stated as bold-led bullets with the reason attached; templates are fenced `markdown` blocks; every new rule names its failure mode ("… is a failed self-check").
- **Commit messages** end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- **Edits are exact-string replacements.** Each step gives the current text and the replacement; if the current text is not found verbatim, stop and report — do not approximate.

---

## File map

| File | Responsibility after this change |
| --- | --- |
| `CONTRACT.md` | Canonical: durable tree gains `decisions/`; `input/` staging rule; new `### Citations and coverage` section; context/JTBD/ADR template annotations; new `#### Decision record template` + calibration rule; `ateam-discovery` contract gains the iteration entry, decision writes, dev-review slot, read-back lists; `ateam-definition` reads decisions. |
| `.claude/skills/ateam-discovery/references/decision-template.md` | **New.** Annotated decision record template, mirroring CONTRACT's. |
| `.claude/skills/ateam-discovery/SKILL.md` | Conducts the iteration entry and the discipline: Research (stage first, digest subagent, conflict list), Straw-man (classification + candidates), dev-review pass-through, grill routing, read-back lists, write step, self-check. |
| `.claude/skills/project-context/SKILL.md` + `references/context-template.md` | Staging rule; Coverage column; glossary Source column cites lines; `[conflict]` ledger class; rules. |
| `.claude/skills/jobs-to-be-done/SKILL.md` | Line citations in `## Today`/`## Forces`; kept/reshaped/superseded on review-and-extend; Grounding check reads citations. |
| `.claude/skills/discovery-plan/SKILL.md` + `references/research-plan-template.md` | Conflicts and `## Revisit when` → open questions; `provisional` probes → research activities; cite `[[dec:NN]]`. |
| `.claude/skills/research-synthesis/SKILL.md` | Contradictions also entered as `[conflict]` ledger items. |
| `.claude/skills/product-report/SKILL.md` | Reads `decisions/`; reports open `provisional` records. |
| `PLAN.md` | Mirror: tree, a new Discovery-flow subsection, the definition of "the A-Team". |
| `SKILLS.md` | Row updates. |

---

### Task 1: CONTRACT.md — the durable tree, the citation convention, the staging rule

**Files:**
- Modify: `CONTRACT.md:52-57` (tree comments), `CONTRACT.md:86-90` (`input/` rule)

**Interfaces:**
- Produces: the `decisions/` path and the `[[dec:NN]]` citation prefix every later task uses; the staging rule §2.1 that `project-context` (Task 7) and `ateam-discovery` (Task 11) mirror.

- [ ] **Step 1: Add `[[dec:NN]]` to the citation comment**

Current text (lines 52–53):
```
                              # Citation syntax: bare [[NN]] / [[NN-slug]] ALWAYS cites a job;
                              # epics cite as [[epic:NN]] (any future durable class gets a prefix)
```
Replace with:
```
                              # Citation syntax: bare [[NN]] / [[NN-slug]] ALWAYS cites a job;
                              # epics cite as [[epic:NN]], ADRs as [[adr:NN]], decisions as
                              # [[dec:NN]] (any future durable class gets a prefix)
```

- [ ] **Step 2: Add `decisions/` to the tree**

Current text (lines 56–57):
```
  adr/NN-<slug>.md            # one file per architecture decision — repo shape, stack, where the v0
                              #   runs, v0 data strategy; same lifecycle rules; cited as [[adr:NN]]
```
Replace with:
```
  adr/NN-<slug>.md            # one file per architecture decision — repo shape, stack, where the v0
                              #   runs, v0 data strategy; same lifecycle rules; cited as [[adr:NN]]
  decisions/NN-<slug>.md      # one file per product-scope decision — the calls that shape what is
                              #   built and that no later phase may make alone; same lifecycle rules;
                              #   status made | provisional | superseded | parked; cited as [[dec:NN]]
```

- [ ] **Step 3: Add the staging rule after the `input/` rule**

Current text (lines 86–90):
```
- **`input/` is append-only evidence.** Humans drop evidence there. A skill may
  **stage** a verbatim connector pull (Notion, Granola, Slack, ops API) as a new
  clearly-labeled batch — `input/<YYYY-MM-DD>-<source>-pulled/` — so the audit
  trail survives the source changing or vanishing. A skill never edits, deletes,
  or summarizes-in-place an existing batch; digests belong in `context.md`.
```
Replace with:
```
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
```

- [ ] **Step 4: Verify**

Run:
```bash
cd "/Users/alvarobezerra/Documents/Claude/Projects/The A Team/harness" && grep -c "decisions/NN-<slug>.md" CONTRACT.md && grep -c "\[\[dec:NN\]\]" CONTRACT.md && grep -c "Nothing is cited that is not on disk" CONTRACT.md
```
Expected: `1`, `2`, `1`.

- [ ] **Step 5: Commit**

```bash
git add CONTRACT.md && git commit -m "docs(contract): decisions/ in the durable tree, [[dec:NN]], and the staging rule for human-pointed sources

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: CONTRACT.md — the `Citations and coverage` section

**Files:**
- Modify: `CONTRACT.md` — insert a new `### Citations and coverage` subsection immediately before `## Environment given to every phase skill` (line ~107 after Task 1).

**Interfaces:**
- Produces: the definitions of *domain claim*, the citation syntax, the Coverage vocabulary, and the `[conflict]` class. Tasks 3, 7, 8, 9, 10, 11 cite these by name ("per CONTRACT's *Citations and coverage*").

- [ ] **Step 1: Insert the section**

Find the line:
```
## Environment given to every phase skill
```
Insert **before** it (leave one blank line after the inserted block):
```
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

```

- [ ] **Step 2: Verify**

Run:
```bash
grep -n "^### Citations and coverage" CONTRACT.md && grep -c "Every domain claim cites a line" CONTRACT.md && grep -c "Every ingested file has a coverage row" CONTRACT.md && grep -c "Conflicts are items, never judgements" CONTRACT.md && awk '/^### Citations and coverage/{f=1} f&&/^## Environment given/{print "order ok"; exit}' CONTRACT.md
```
Expected: a line number, `1`, `1`, `1`, `order ok`.

- [ ] **Step 3: Commit**

```bash
git add CONTRACT.md && git commit -m "docs(contract): citations and coverage — line citations, the Coverage column, and the [conflict] ledger class

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: CONTRACT.md — template annotations (context, JTBD, ADR)

**Files:**
- Modify: `CONTRACT.md` — the context.md template comments, its load-bearing paragraph, the JTBD template `## Today`/`## Forces`, the ADR template `## Context`, and the ADR load-bearing list.

**Interfaces:**
- Produces: the ADR slot for Davide (decision candidates as an input; `deviates_from` surfaced) — declared here, never edited in `architecture/`.

- [ ] **Step 1: Context template — Sources and ledger comments**

Current text:
```
## Sources             # audit index of everything discovery consumed — one line per source
                       #   (link visited, provided file, connector pull, the grill digest):
                       #   type · pointer (URL or input/ path) · date · what it informed
```
Replace with:
```
## Sources             # audit index of everything discovery consumed — one line per source
                       #   (link visited, provided file, connector pull, the grill digest):
                       #   type · pointer (URL or input/ path) · date · what it informed ·
                       #   coverage (full · date · conductor|digest, or partial <range> · method)
```
Current text:
```
## Know / Don't know   # Don't-Knows tagged blocking (naming what they block) or non-blocking,
                       #   plus a consumer tag ([pm] | [design] | [dev]) when a role's intake seeded it
```
Replace with:
```
## Know / Don't know   # Don't-Knows tagged blocking (naming what they block) or non-blocking,
                       #   plus a consumer tag ([pm] | [design] | [dev]) when a role's intake seeded it;
                       #   [conflict] entries name both sides with citations and their ruling or open status
```

- [ ] **Step 2: Context template — load-bearing paragraph**

Current text:
```
into prose; renamed glossary terms are never deleted; every `## Sources` row
resolves — a live URL or a path on disk — and `## Overview` keeps only the 2–3
load-bearing product links (Sources is the complete index); the ledger's
**blocking** set is the grill's termination condition — non-blocking unknowns
flow to `research-plan.md` as open questions.
```
Replace with:
```
into prose; renamed glossary terms are never deleted; every `## Sources` row
resolves — a live URL or a path on disk — and carries a coverage value (every
file in an ingested batch has a row; prose files are `full` — see *Citations
and coverage*); `## Overview` keeps only the 2–3 load-bearing product links
(Sources is the complete index); glossary rows and ledger Knows cite lines;
the ledger's **blocking** set is the grill's termination condition —
non-blocking unknowns and unruled `[conflict]` entries flow to
`research-plan.md` as open questions.
```

- [ ] **Step 3: JTBD template — Today and Forces cite lines**

Current text:
```
## Today
How it's solved now, and what that costs.

## Forces
Push / pull / anxiety / inertia — the demand evidence the statement rests on.
```
Replace with:
```
## Today
How it's solved now, and what that costs — each domain claim cited to a line.

## Forces
Push / pull / anxiety / inertia — the demand evidence the statement rests on,
each force cited to the line it rests on.
```

- [ ] **Step 4: ADR template — Context cites lines**

Current text:
```
## Context
The forces. The project binding or Declared default that applied, cited not
restated. Which dev review finding this rests on and how it was rated. The jobs
that turn on it: [[03]], [[05]].
```
Replace with:
```
## Context
The forces, each domain claim cited to a line. The project binding or Declared
default that applied, cited not restated. Which dev review finding this rests
on and how it was rated. The jobs that turn on it: [[03]], [[05]].
```

- [ ] **Step 5: ADR load-bearing list — the decision-record slot**

Current text:
```
- **Only decisions that block planning belong here at discovery time.** Schema,
  component breakdown, and library picks inside a settled stack are dev-phase
  depth — minting them as durable ADRs from a grill fabricates authority.
```
Replace with:
```
- **Only decisions that block planning belong here at discovery time.** Schema,
  component breakdown, and library picks inside a settled stack are dev-phase
  depth — minting them as durable ADRs from a grill fabricates authority.
- **Product-scope calls are not ADRs.** They are decision records
  (`[[dec:NN]]`, template below). A decision record that deviates from an
  active ADR names it in `deviates_from:` and is surfaced at discovery's
  read-back; only the `architecture` skill supersedes an ADR. On an iteration
  run the beat also receives the run's **decision candidates** as an input, so
  a deviation is caught here rather than at read-back — a declared slot whose
  contents are the Dev role owner's; until the skill reads it, discovery
  surfaces deviations itself.
```

- [ ] **Step 6: Verify**

Run:
```bash
grep -c "coverage (full · date · conductor|digest" CONTRACT.md && grep -c "\[conflict\] entries name both sides" CONTRACT.md && grep -c "each domain claim cited to a line" CONTRACT.md && grep -c "Product-scope calls are not ADRs" CONTRACT.md
```
Expected: `1`, `1`, `2`, `1`.

- [ ] **Step 7: Commit**

```bash
git add CONTRACT.md && git commit -m "docs(contract): templates cite lines — context sources/ledger, JTBD today+forces, ADR context; the decision-record slot on ADRs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: CONTRACT.md — the decision record template and the `ateam-discovery` contract

**Files:**
- Modify: `CONTRACT.md` — insert `#### Decision record template` before `### \`ateam-definition\``; edit the `ateam-discovery` contract bullets (Must write, Process shape, Dev review, Read-back); edit `ateam-definition`'s May read.

**Interfaces:**
- Produces: the decision record frontmatter and section names Tasks 6, 8, 10, 11 use verbatim: `status`, `confidence`, `decided`, `decided_by`, `sources`, `probe`, `deviates_from`; sections `Status`, `Context`, `Decision`, `Why`, `Cost`, `Wrong if`, `Alternatives considered`, `Existing state`, `Revisit when`.

- [ ] **Step 1: Insert the decision record template**

Find the line:
```
### `ateam-definition` — 📝 draft + review
```
Insert **before** it:
````
#### Decision record template — the shape a product-scope call is recorded in

`docs/product/decisions/NN-<slug>.md` — one file per **product-scope
decision**: the calls that shape what is built and that a definition phase must
not make on its own (the grain of a deal, which gates block, what is pull
versus push, what is out of focus this cycle). Cited as `[[dec:NN]]`. Same
lifecycle as jobs, epics and ADRs: ids forever, supersede never delete, never
written without human review in the same session. Written by discovery;
PM-owned. ADRs stay architecture-only: a decision record that deviates from an
active ADR names it in `deviates_from:` and never silently supersedes it.

```markdown
---
id: 01
slug: deal-grain-is-coarse-buckets
status: provisional         # made | provisional | superseded | parked
confidence: moderate        # strong | moderate | directional | hypothesis
decided: 2026-09-02
decided_by: human           # human | agent — agent only via a Declared default or a project binding
sources: [2026-09-02-build-frame-dealflow, 2026-09-02-grill-digest]
probe: master-list Buying tab columns   # required when provisional; resolves to a research activity
deviates_from: []           # e.g. [adr:03] — named, never silent
---

# 01. A deal is captured as coarse buckets, and the sheet is attached unopened

## Status
provisional — ratified at the 2026-09-02 grill (Q2), pending the probe.
<!-- made — ratified at …, falsifier checked against <citation> -->
<!-- superseded by [[dec:05]] · parked — presented at …, not answered -->

## Context
Jobs it serves: [[01]], [[05]]. The input that forces it, cited to a line.
The conflict it rules, if any.

## Decision
What we will do. Active voice, present tense.

## Why
The reasoning, each load-bearing claim cited to a line.

## Cost
What this gives up, stated as a testable prediction.

## Wrong if
The falsifier, then one of: `checked — <citation> does not meet it` ·
`checked — met; superseded by [[dec:NN]]` · `unchecked — <what would check it> → probe`.

## Alternatives considered
Option · the real reason it was dropped. At least one, always.

## Existing state
Keeps: … · Changes: … · Removes: … — each cited to the product report's
shipped list and the code path. ADR deviations named here.

## Revisit when
The signal that reopens this — mirrored into research-plan.md.
```

Load-bearing:

- **The calibration rule.** A decision whose falsifier is checkable against
  staged inputs is checked **before** it is stamped `made`. Checked and not
  met → `made`, with the citation in `## Wrong if`. Checked and met → the
  candidate is reshaped before it is asked. Not checkable with what is in hand
  → the human's yes still produces `provisional` with a named `probe:` that
  resolves to a research activity in `research-plan.md`; when the probe lands,
  the record flips to `made` or is superseded. A record stamped `made` with an
  unchecked falsifier is a failed self-check.
- **Presented is not ratified**, as for ADRs: unanswered is `parked` with an
  open question in `research-plan.md`. `decided_by: agent` is permitted only
  through a Declared default or a project binding, recorded as an assumption —
  a scope call is demand-side, and the no-autonomous-degrade rule applies to it
  in full.
- **Grounded in what shipped.** `## Existing state` states keeps / changes /
  removes against `ateam-product-report.md`'s shipped list, cited; a
  `deviates_from:` ADR is surfaced at the read-back.
- **Downstream.** The PRD's `## Decision log` cites `[[dec:NN]]` when a row
  derives from one; `product-report` reports every record still `provisional`
  at pr time; the `discovery-plan` refresh mirrors each probe as a research
  activity and each `## Revisit when` as an open question.

Full annotated template: the `ateam-discovery` skill's
`references/decision-template.md`.

````

- [ ] **Step 2: `ateam-discovery` Must write — add the decision records**

Current text:
```
  - `docs/product/research/<YYYY-MM-DD>-<slug>.md` — **evidence-heavy runs
    only**: the append-only synthesis run (themes, contradictions, verdicts
    against existing jobs, new-job signals). Declared here so it is a permitted
    output path rather than a stray write.
- **Process shape**: `challenge (+ run brief) → research → straw-man →
  dev review → architecture → grill → read-back → independence handoff →
  write`.
```
Replace with:
```
  - `docs/product/research/<YYYY-MM-DD>-<slug>.md` — **evidence-heavy runs
    only**: the append-only synthesis run (themes, contradictions, verdicts
    against existing jobs, new-job signals). Declared here so it is a permitted
    output path rather than a stray write.
  - `docs/product/decisions/NN-<slug>.md` — the product-scope decisions the
    run ratified (template below); `provisional` ones carry a `probe:`.
  - `docs/product/input/<YYYY-MM-DD>-<label>/` — anything the human pointed
    at that was not on disk, staged before it is cited (the staging rule
    above); and `input/<YYYY-MM-DD>-figjam-pulled/` for a human board.
- **Process shape**: `challenge (+ run brief) → research → straw-man →
  dev review → architecture → grill → read-back → independence handoff →
  write`.
- **Iteration entry**: when `docs/product/` already holds an active job set
  and either an un-ingested `input/` batch exists or the prompt points at a
  document, board or other artifact, discovery runs the same movements as an
  **iteration** — it reviews and extends, never re-derives. Research stages
  first, digests the new input *against* the existing `context.md` (refresh,
  never rebuild), builds the `[conflict]` list between the new input, the
  existing inputs, the North Star, the active ADRs and the shipped state, and
  reads the shipped state (every active ADR, every epic, the product report's
  shipped list, `project-plan.md`) before any drafting. The straw-man
  classifies every active job **kept / reshaped / superseded** with the
  citation that triggers it and drafts the **decision candidates** the input
  forces. Candidates and conflicts are ledger entries and route by the same
  answerability rule. Every decision record states keeps / changes / removes
  against the shipped list; a deviation from an active ADR is named in
  `deviates_from:`, never a silent supersede. The orchestrator does not
  change; discovery detects the entry itself, in `/feature` and standalone
  alike.
```

- [ ] **Step 3: Dev review — the candidate slot**

Current text:
```
  - **Substance lands in `research-plan.md`; jobs carry citations only** — see
    the JTBD template's technical rule below.
```
Replace with:
```
  - **Substance lands in `research-plan.md`; jobs carry citations only** — see
    the JTBD template's technical rule below.
  - **On an iteration run it also receives the decision candidates** and may
    return, per candidate, what it would remove or coarsen in the shipped code,
    cited to paths. A declared slot, optional by absence like the review
    itself: if the skill does not act on the candidates, discovery records
    "candidates not reviewed against the code" in `research-plan.md` and
    continues.
```

- [ ] **Step 4: Read-back — the three lists and the coverage diff**

Current text:
```
- **Read-back is mandatory**: present the drafted JTBD set for correction before
  writing durable files. This is in-conversation, not an orchestrator gate.
```
Replace with:
```
- **Read-back is mandatory**: present the drafted JTBD set for correction before
  writing durable files — plus three lists, each its own: the **coverage
  record** (every ingested file with its coverage value), the **conflicts**
  with their rulings or open status, and the **decision records** with status
  and probe; and, when a human artifact of the same kind was staged, the
  **coverage diff** against it — items on the artifact the run's set does not
  cover and items in the set the artifact does not, each a ledger entry or an
  explicit "deliberately not covered" with a reason. This is in-conversation,
  not an orchestrator gate.
```

- [ ] **Step 5: `ateam-definition` reads decisions**

Current text:
```
- **May read**: `docs/product/**` (context, JTBDs, the ADRs, `ateam-plan.md`); the manifest; the target repo.
```
Replace with:
```
- **May read**: `docs/product/**` (context, JTBDs, the ADRs, the decision records, `ateam-plan.md`); the manifest; the target repo. A scoped item a `[[dec:NN]]` governs traces to it.
```

- [ ] **Step 6: Verify**

Run:
```bash
grep -n "^#### Decision record template" CONTRACT.md && grep -c "The calibration rule" CONTRACT.md && grep -c "^- \*\*Iteration entry\*\*" CONTRACT.md && grep -c "also receives the decision candidates" CONTRACT.md && grep -c "coverage diff" CONTRACT.md && grep -c "the decision records, \`ateam-plan.md\`" CONTRACT.md && awk '/^#### Decision record template/{f=1} f&&/^### `ateam-definition`/{print "order ok"; exit}' CONTRACT.md
```
Expected: a line number, `1`, `1`, `2` (ADR slot + dev-review slot), `≥1`, `1`, `order ok`.

- [ ] **Step 7: Commit**

```bash
git add CONTRACT.md && git commit -m "docs(contract): decision records with the calibration rule; discovery's iteration entry, dev-review candidate slot, and read-back lists

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: The annotated decision template

**Files:**
- Create: `.claude/skills/ateam-discovery/references/decision-template.md`

**Interfaces:**
- Consumes: the CONTRACT template from Task 4 verbatim (frontmatter keys and section names must match character for character).
- Produces: the file `ateam-discovery` (Task 11) tells the conductor to read at the write step.

- [ ] **Step 1: Write the file**

````markdown
# Decision record template — the canonical shape

One file per product-scope decision at `docs/product/decisions/NN-<slug>.md`.
Durable: the same lifecycle rules as `jtbd/`, `epics/` and `adr/` — ids
resolve forever, a wrong decision is superseded rather than deleted, nothing
lands without human review in the same session. The structure below is the
contract (see `CONTRACT.md`, *Decision record template*); the annotations are
guidance.

Cited elsewhere as `[[dec:NN]]` (bare `[[NN]]` always means a job, `[[adr:NN]]`
an architecture decision, `[[epic:NN]]` an epic).

**What belongs here.** The calls that shape what is built and that a
definition phase must not make on its own: the grain at which a thing is
captured, which guardrails block versus record, what is pull versus push, what
is deliberately out of focus this cycle, which of two conflicting inputs wins.
**What does not.** Architecture (an ADR), a job (a JTBD), a requirement (the
PRD), an assumption nobody decided (research-plan.md).

```markdown
---
id: 01
slug: deal-grain-is-coarse-buckets
status: provisional         # made | provisional | superseded | parked
confidence: moderate        # strong | moderate | directional | hypothesis
decided: 2026-09-02
decided_by: human           # human | agent — agent only via a Declared default or a project binding
sources: [2026-09-02-build-frame-dealflow, 2026-09-02-grill-digest]
probe: master-list Buying tab columns   # required when provisional; resolves to a research activity
deviates_from: []           # e.g. [adr:03] — named, never silent
---

# 01. A deal is captured as coarse buckets, and the sheet is attached unopened

## Status
provisional — ratified at the 2026-09-02 grill (Q2), pending the probe.
<!-- made — ratified at …, falsifier checked against <citation> -->
<!-- superseded by [[dec:05]] · parked — presented at …, not answered -->

## Context
Jobs it serves: [[01]], [[05]]. The input that forces it, cited to a line —
e.g. `2026-09-02-build-frame-dealflow/build-frame-dealflow.txt:L31-L35`. The
conflict it rules, if any, by its ledger wording.

## Decision
What we will do. Active voice, present tense, one paragraph. A reader who
stops here can act.

## Why
The reasoning, each load-bearing claim cited to a line. A quote from the
client is a citation, not a paraphrase.

## Cost
What this gives up, stated as a testable prediction — "the guardrail knows
400 of 1,381 are committed, not which 400" is a cost; "less precision" is not.

## Wrong if
The falsifier, then one of: `checked — <citation> does not meet it` ·
`checked — met; superseded by [[dec:NN]]` · `unchecked — <what would check it> → probe`.

## Alternatives considered
Option · the real reason it was dropped. At least one, always.

## Existing state
Keeps: … · Changes: … · Removes: … — each cited to the product report's
shipped list (`ateam-product-report.md` §"What actually shipped") and the code
path. ADR deviations named here and in `deviates_from:`.

## Revisit when
The signal that reopens this — mirrored into research-plan.md as an open
question.
```

## Rules that bind every writer of this file

- **The headline is the decision, not the topic.** "01. Deal grain" is not
  auditable; "01. A deal is captured as coarse buckets, and the sheet is
  attached unopened" is.
- **The calibration rule.** A falsifier checkable against staged inputs is
  checked before the record is stamped `made`. Checked and not met → `made`,
  citation in `## Wrong if`. Checked and met → reshape the candidate before
  asking. Not checkable with what is in hand → the human's yes still yields
  `provisional` with a `probe:` that resolves to a research activity in
  `research-plan.md`. A `made` record with an unchecked falsifier is a failed
  self-check.
- **Presented is not ratified.** Unanswered is `parked` with an open question
  in `research-plan.md`. `decided_by: agent` only through a Declared default
  or a project binding, recorded as an assumption; a scope call is demand-side
  and the no-autonomous-degrade rule applies in full.
- **Grounded in what shipped.** `## Existing state` is mandatory on an
  iteration run and cites the shipped list; on a first run it reads "nothing
  shipped yet".
- **Superseding.** The old record flips `status: superseded` with `superseded
  by [[dec:NN]]` in `## Status`; the new one says `supersedes [[dec:NN]]`.
  Nothing else in the old file changes.
- **Downstream.** The PRD's decision log cites `[[dec:NN]]`; `product-report`
  reports every `provisional` record still open at pr time; the plan refresh
  mirrors probes as research activities and `## Revisit when` as open
  questions.
````

- [ ] **Step 2: Verify the template mirrors CONTRACT**

Run (extracts the fenced template from both files and diffs them):
```bash
cd "/Users/alvarobezerra/Documents/Claude/Projects/The A Team/harness" && diff <(awk '/^#### Decision record template/{f=1} f&&/^```markdown/{g=1;next} g&&/^```$/{exit} g' CONTRACT.md | grep -E "^(id:|slug:|status:|confidence:|decided:|decided_by:|sources:|probe:|deviates_from:|## )") <(awk '/^```markdown/{g=1;next} g&&/^```$/{exit} g' .claude/skills/ateam-discovery/references/decision-template.md | grep -E "^(id:|slug:|status:|confidence:|decided:|decided_by:|sources:|probe:|deviates_from:|## )") && echo "keys and sections match"
```
Expected: `keys and sections match` (no diff lines).

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/ateam-discovery/references/decision-template.md && git commit -m "docs(discovery): the annotated decision record template

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `project-context` — staging, coverage, citations, conflicts

**Files:**
- Modify: `.claude/skills/project-context/references/context-template.md:39-68, 104-121, 137-140`
- Modify: `.claude/skills/project-context/SKILL.md:66-76, 89-101`

**Interfaces:**
- Consumes: CONTRACT *Citations and coverage* (Task 2) and the staging rule (Task 1).
- Produces: the exact `## Sources` table shape (five columns) and the `[conflict]` ledger line shape that `ateam-discovery` (Task 11) and `research-synthesis` (Task 10) write.

- [ ] **Step 1: Template — Sources table with Coverage**

Current text:
```
<The audit index of everything discovery consumed — one line per source: links
visited during agent research, human-provided files, connector pulls, the
grill digest batch. Every row resolves — a live URL or a path on disk.
Overview's Key links stay the 2–3 load-bearing product links; this table is
the complete index.>

| Type | Source | Date | What it informed |
| --- | --- | --- | --- |
| link | <URL the agent consulted> | <YYYY-MM-DD> | <the fact or section it fed> |
| file | <input/<batch>/<file> — human-provided> | <YYYY-MM-DD> | <...> |
| pull | <input/<YYYY-MM-DD>-<source>-pulled/> | <YYYY-MM-DD> | <...> |
| grill | <input/<YYYY-MM-DD>-grill-digest/> | <YYYY-MM-DD> | <...> |
```
Replace with:
```
<The audit index of everything discovery consumed — one line per source: links
visited during agent research, human-provided files, connector pulls, the
grill digest batch. Every row resolves — a live URL or a path on disk.
Overview's Key links stay the 2–3 load-bearing product links; this table is
the complete index. Coverage says how much of the file was read and by whom:
`full · <date> · conductor` · `full · <date> · digest` (a one-shot digest
subagent whose digest cites lines) · `partial <range> · <date> · <method>`
(non-prose inputs only — a JSON spec, an image set, a binary — with the
method stated). Every file in every ingested batch has a row; prose files are
`full`. A re-read appends a new row with the new date; the latest row
governs.>

| Type | Source | Date | What it informed | Coverage |
| --- | --- | --- | --- | --- |
| link | <URL the agent consulted> | <YYYY-MM-DD> | <the fact or section it fed> | full · <YYYY-MM-DD> · conductor |
| file | <input/<batch>/<file> — human-provided> | <YYYY-MM-DD> | <...> | full · <YYYY-MM-DD> · digest |
| file | <input/<batch>/<spec>.json — human-provided> | <YYYY-MM-DD> | <...> | partial paths+schemas · <YYYY-MM-DD> · diffed programmatically |
| pull | <input/<YYYY-MM-DD>-<source>-pulled/> | <YYYY-MM-DD> | <...> | full · <YYYY-MM-DD> · conductor |
| grill | <input/<YYYY-MM-DD>-grill-digest/> | <YYYY-MM-DD> | <...> | full · <YYYY-MM-DD> · conductor |
```

- [ ] **Step 2: Template — glossary Source column cites lines**

Current text:
```
| Term | Working definition | Status | Source / notes |
| --- | --- | --- | --- |
| <term> | <what the team means by it today> | settled | <where defined> |
| <term> | <best current definition> | forming | <competing name: "<other>"> |
| <term> | <unknown — heard in kickoff> | TBD | <who to ask> |
```
Replace with:
```
| Term | Working definition | Status | Source (cited to a line) / notes |
| --- | --- | --- | --- |
| <term> | <what the team means by it today> | settled | `<batch>/<file>:L<start>-L<end>` |
| <term> | <best current definition> | forming | `<batch>/<file> §<n>` · competing name: "<other>" |
| <term> | <unknown — heard in kickoff> | TBD | <who to ask> |
```

- [ ] **Step 3: Template — ledger conflict class**

Current text:
```
### Don't know
- **[blocking → <the JTBD id or scope call it blocks>] [pm|design|dev]** <question>
- **[non-blocking] [dev]** <question — survives into research-plan.md as an open question>

The role tag is carried whenever an `intake/` bank seeded the entry — it is
what the answerability routing keys off, and with three banks feeding one
ledger an untagged entry loses its consumer.
```
Replace with:
```
### Don't know
- **[blocking → <the JTBD id or scope call it blocks>] [pm|design|dev]** <question>
- **[non-blocking] [dev]** <question — survives into research-plan.md as an open question>
- **[conflict → blocks [[03]] / dec:02] [pm]** <A says X> (`<batch>/<file> §2`) · <B says Y> (`<batch>/<file> §4.6`) · **ruling:** open
- **[conflict] [non-blocking] [pm]** <A says X> (`…:L12-L14`) · <B says Y> (`…:L88-L90`) · **ruling:** SOURCE.md precedence — A wins

The role tag is carried whenever an `intake/` bank seeded the entry — it is
what the answerability routing keys off, and with three banks feeding one
ledger an untagged entry loses its consumer. A `[conflict]` entry names both
sides with citations and what it blocks; it routes like any entry and closes
with its ruling source (`ruling: human, grill Q<n>` · `SOURCE.md precedence`);
an unruled one is carried into research-plan.md as an open question and every
artifact touching it holds both readings marked `TBD`. Knows cite lines too:
`- <fact> — `<batch>/<file>:L<start>-L<end>``.
```

- [ ] **Step 4: Template — rules**

Current text:
```
- **Sources is append-mostly and every row resolves.** A source that shaped a
  fact but never reaches the index is an audit hole; a row pointing at nothing
  (dead path, vanished URL with no staged pull) is a bug.
```
Replace with:
```
- **Sources is append-mostly and every row resolves.** A source that shaped a
  fact but never reaches the index is an audit hole; a row pointing at nothing
  (dead path, vanished URL with no staged pull) is a bug.
- **Every ingested file has a coverage row; prose files are `full`.** A prose
  file in an ingested batch without a `full` row is a failed self-check. A
  staged batch not ingested this run has no rows, stays out of `ingested:`,
  and gets a ledger entry naming it and why.
- **Nothing is cited that is not on disk.** A source the human pointed at
  outside the repo is staged as an `input/` batch with a `SOURCE.md` before
  the digest cites it; a named-but-absent companion is a `SOURCE.md` note and
  a ledger entry, never inferred.
- **Domain claims cite lines.** Glossary rows, digest claims and Knows carry
  `<batch>/<file>:L<start>-L<end>` (or `§<n>`, `:p<N>` for PDFs); a claim
  without one is a failed self-check.
- **Conflicts are items.** Two sources disagreeing on a fact that reaches this
  file is a `[conflict]` ledger entry with both citations, never a smoothed
  sentence.
```

- [ ] **Step 5: SKILL — Inputs gain the staging rule**

Current text:
```
- Whatever the user tells you directly.
- **Connectors (pull, then stage).** If Notion, Granola, Slack, or the ops API
```
Replace with:
```
- Whatever the user tells you directly.
- **Anything the human points at outside the repo — stage first.** A file in
  a parent folder, an attachment in the conversation, a board, a shared page:
  copy it verbatim as `input/<YYYY-MM-DD>-<label>/` with a `SOURCE.md`
  (origin · authoring date if stated · what was copied and what was not · any
  fidelity caveat — an extraction is not the document) **before** citing it.
  A document that names a companion not in hand: record the absence in
  `SOURCE.md` and as a ledger entry; never infer its contents. Prior human
  work on the same question (a board, a current-state map) is staged the same
  way — a FigJam board via `get_figjam` as `input/<YYYY-MM-DD>-figjam-pulled/`.
- **Connectors (pull, then stage).** If Notion, Granola, Slack, or the ops API
```

- [ ] **Step 6: SKILL — workflow steps 4, 5, 7**

Current text:
```
4. **Digest.** Per new batch: compress what the evidence actually says, with
   pointers back to the raw files. The digest is written knowing how Design and
   Dev will later consume it — organised, not just summarized.
5. **Sources.** Index everything this refresh consumed — links visited,
   human-provided files, connector pulls, the grill digest batch: type ·
   pointer (URL or `input/` path) · date · what it informed. Every row
   resolves; Overview's Key links stay the 2–3 load-bearing ones.
```
Replace with:
```
4. **Digest.** Per new batch: compress what the evidence actually says, each
   claim cited to a line (`<batch>/<file>:L<start>-L<end>`, `§<n>`, or
   `:p<N>` for a PDF). **Read every prose file in full.** A long one goes to
   a one-shot digest subagent — announce it, pass the file path and the
   current glossary, expect back a digest whose every claim cites lines plus
   the terms and conflicts it found — so coverage is `full · digest` rather
   than the conductor skimming. The digest is written knowing how Design and
   Dev will later consume it — organised, not just summarized. **Conflicts
   are items:** where this batch disagrees with another batch, the glossary,
   a Know, an active job, an active ADR or the shipped state, write a
   `[conflict]` ledger entry with both citations (step 7); never smooth it.
5. **Sources.** Index everything this refresh consumed — links visited,
   human-provided files, connector pulls, the grill digest batch: type ·
   pointer (URL or `input/` path) · date · what it informed · **coverage**
   (`full · <date> · conductor` · `full · <date> · digest` · `partial
   <range> · <date> · <method>`, the last for non-prose only). Every file in
   every ingested batch gets a row; prose files are `full`. Every row
   resolves; Overview's Key links stay the 2–3 load-bearing ones.
```
Current text:
```
7. **Ledger.** Update Know / Don't-Know. Tag each Don't-Know **blocking**
   (naming the JTBD or scope call it blocks) or **non-blocking** (destined for
   `research-plan.md` as an open question). Uncertainty stays visible as TBD — a
   confident-sounding guess is a landmine for every skill that reads this file.
```
Replace with:
```
7. **Ledger.** Update Know / Don't-Know. Tag each Don't-Know **blocking**
   (naming the JTBD or scope call it blocks) or **non-blocking** (destined for
   `research-plan.md` as an open question). Enter each conflict from step 4 as
   a **`[conflict]`** entry — both sides cited, what it blocks, and its ruling
   if a batch's `SOURCE.md` precedence settles it (`ruling: SOURCE.md
   precedence — <which>`); otherwise `ruling: open`, for the grill. Knows cite
   lines. Uncertainty stays visible as TBD — a confident-sounding guess is a
   landmine for every skill that reads this file.
```

- [ ] **Step 7: Verify**

Run:
```bash
cd "/Users/alvarobezerra/Documents/Claude/Projects/The A Team/harness" && grep -c "| Type | Source | Date | What it informed | Coverage |" .claude/skills/project-context/references/context-template.md && grep -c "^\- \*\*\[conflict" .claude/skills/project-context/references/context-template.md && grep -c "Every ingested file has a coverage row" .claude/skills/project-context/references/context-template.md && grep -c "stage first" .claude/skills/project-context/SKILL.md && grep -c "digest subagent" .claude/skills/project-context/SKILL.md && grep -c "\[conflict\]" .claude/skills/project-context/SKILL.md
```
Expected: `1`, `2`, `1`, `1`, `1`, `≥2`.

- [ ] **Step 8: Commit**

```bash
git add .claude/skills/project-context && git commit -m "docs(project-context): stage before citing, Coverage column, line-cited glossary and Knows, [conflict] ledger entries

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: `discovery-plan` — probes, revisits and conflicts into the plans

**Files:**
- Modify: `.claude/skills/discovery-plan/references/research-plan-template.md:27-40, 56-60`
- Modify: `.claude/skills/discovery-plan/SKILL.md:109-128`

**Interfaces:**
- Consumes: decision record keys `status: provisional`, `probe:`, `## Revisit when` (Task 4); `[conflict]` entries (Task 6).

- [ ] **Step 1: Template — Open questions**

Current text:
```
What ships unresolved with the v0 — the ledger's surviving unknowns, including
questions raised by challenges/refinement verdicts. Each tagged with what it
would change if answered. A still-open **blocking** unknown is stated loudly at
the top, never buried mid-list.
```
Replace with:
```
What ships unresolved with the v0 — the ledger's surviving unknowns, including
questions raised by challenges/refinement verdicts, every **unruled
`[conflict]`** (both sides cited, what it blocks), and every decision record's
`## Revisit when` (cited `[[dec:NN]]`). Each tagged with what it would change
if answered. A still-open **blocking** unknown is stated loudly at the top,
never buried mid-list.
```

- [ ] **Step 2: Template — Research activities**

Current text:
```
Question → activity → owner (human or agent) → date. The work of closing the
unknowns above; its outcomes land back in research/ runs and flip ledger
entries to Know.
```
Replace with:
```
Question → activity → owner (human or agent) → date. The work of closing the
unknowns above; its outcomes land back in research/ runs and flip ledger
entries to Know. Every `provisional` decision record's `probe:` is an activity
here, cited `[[dec:NN]]` — when it lands, the record flips to `made` or is
superseded.
```

- [ ] **Step 3: SKILL — step 4 and step 7**

Current text:
```
4. **Split the ledger.** Surviving unknowns → research-plan **open questions**
   (each tagged with what changes if answered; a still-open blocking unknown
   is stated loudly at the top). Ledger and brainstorm assumptions →
   research-plan **assumptions**, each with confidence, disproof, cheapest
   probe. Never let an assumption hide inside polished prose.
```
Replace with:
```
4. **Split the ledger.** Surviving unknowns → research-plan **open questions**
   (each tagged with what changes if answered; a still-open blocking unknown
   is stated loudly at the top). Unruled `[conflict]` entries → open questions
   with both citations. Ledger and brainstorm assumptions → research-plan
   **assumptions**, each with confidence, disproof, cheapest probe. Decision
   records (`docs/product/decisions/`): each `provisional` record's `probe:` →
   a **research activity** cited `[[dec:NN]]`; each `## Revisit when` → an
   open question. Never let an assumption hide inside polished prose, and
   never restate a decision — cite it.
```
Current text:
```
7. **Cross-check.** Every research activity has a home in an initiative or is
   explicitly deferred; every resolution deliverable points at its question.
```
Replace with:
```
7. **Cross-check.** Every research activity has a home in an initiative or is
   explicitly deferred; every resolution deliverable points at its question;
   every `provisional` decision record has exactly one activity carrying its
   probe.
```

- [ ] **Step 4: Verify**

Run:
```bash
grep -c "unruled" .claude/skills/discovery-plan/references/research-plan-template.md && grep -c "\[\[dec:NN\]\]" .claude/skills/discovery-plan/references/research-plan-template.md && grep -c "\[\[dec:NN\]\]" .claude/skills/discovery-plan/SKILL.md && grep -c "exactly one activity carrying its" .claude/skills/discovery-plan/SKILL.md
```
Expected: `1`, `2`, `1`, `1`.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/discovery-plan && git commit -m "docs(discovery-plan): provisional probes become research activities; conflicts and revisit-when become open questions

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: `jobs-to-be-done` — line citations and the iteration classification

**Files:**
- Modify: `.claude/skills/jobs-to-be-done/SKILL.md:84-86, 174-192`

**Interfaces:**
- Consumes: CONTRACT JTBD template (Task 3); the kept / reshaped / superseded vocabulary from the iteration entry (Task 4).
- Produces: the classification `ateam-discovery` (Task 11) asks this craft for at the straw-man.

- [ ] **Step 1: Where jobs live — citation rule**

Current text:
```
- **`sources:` traces every job to raw input** — `docs/product/input/` batch
  names, transcripts, sketches — so a reviewer can audit what you were told
  versus what you inferred.
```
Replace with:
```
- **`sources:` traces every job to raw input** — `docs/product/input/` batch
  names, transcripts, sketches — so a reviewer can audit what you were told
  versus what you inferred.
- **`## Today` and `## Forces` cite lines.** Every domain claim in them carries
  `<batch>/<file>:L<start>-L<end>` (or `§<n>` / `:p<N>`), per CONTRACT's
  *Citations and coverage*. `sources:` says which batches; the body says which
  lines. A force with no line is a guess wearing evidence's clothes — a failed
  self-check.
```

- [ ] **Step 2: REVIEW workflow — grounding reads citations; iteration classification**

Current text:
```
   - **Grounding** — is there evidence behind it? In a target repo, check
     `sources:` against `docs/product/input/`; from bare text, flag
     *"unverifiable — needs grounding"* rather than guessing.
```
Replace with:
```
   - **Grounding** — is there evidence behind it? In a target repo, check
     `sources:` against `docs/product/input/` and that every line citation in
     `## Today` / `## Forces` resolves and says what the job says it says;
     from bare text, flag *"unverifiable — needs grounding"* rather than
     guessing.
```
Current text:
```
4. **Deliver.** In a target repo, a reshaped job is a **new file** that
   supersedes the old (old flips `status: superseded` + pointer; nothing else in
   the old file changes). A statement rejected as not-a-job flips to
   `superseded` or `parked` with the verdict noted in `## Don't know`. Read-back
   before writing, one commit per run — identical to CREATE.
```
Replace with:
```
4. **Deliver.** In a target repo, a reshaped job is a **new file** that
   supersedes the old (old flips `status: superseded` + pointer; nothing else in
   the old file changes). A statement rejected as not-a-job flips to
   `superseded` or `parked` with the verdict noted in `## Don't know`. Read-back
   before writing, one commit per run — identical to CREATE.
5. **Iteration runs (A-Team review-and-extend).** When a new input batch lands
   on an existing job set, classify **every** active job, with the citation
   that triggers the class: **kept** (the input leaves it standing — say which
   lines confirm it, or "not touched by this input"), **reshaped** (a new file
   supersedes it, citing the reshaping lines), **superseded** (no replacement;
   the reason and citation in `## Don't know`). An unclassified job is a
   failed self-check: a North Star that shrinks between input and read-back
   without a stated trigger is exactly the drift the classification exists to
   surface.
```

- [ ] **Step 3: Verify**

Run:
```bash
grep -c "cite lines" .claude/skills/jobs-to-be-done/SKILL.md && grep -c "^5\. \*\*Iteration runs" .claude/skills/jobs-to-be-done/SKILL.md && grep -c "every line citation" .claude/skills/jobs-to-be-done/SKILL.md
```
Expected: `1`, `1`, `1`.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/jobs-to-be-done && git commit -m "docs(jobs-to-be-done): today and forces cite lines; kept/reshaped/superseded on iteration runs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: `research-synthesis` and `product-report`

**Files:**
- Modify: `.claude/skills/research-synthesis/SKILL.md:93-95`
- Modify: `.claude/skills/product-report/SKILL.md:56-62`

- [ ] **Step 1: research-synthesis — contradictions become conflict items**

Current text:
```
5. **Contradict.** Call out contradictions, segment differences, and outliers
   explicitly; never smooth them into false agreement — they become discovery
   questions and ledger entries.
```
Replace with:
```
5. **Contradict.** Call out contradictions, segment differences, and outliers
   explicitly; never smooth them into false agreement — they become discovery
   questions and ledger entries. Each contradiction between sources is also
   entered in `context.md`'s ledger as a **`[conflict]`** item — both sides
   cited to lines, what it blocks — so evidence-light runs and evidence-heavy
   runs share one conflict class and one routing (CONTRACT, *Citations and
   coverage*).
```

- [ ] **Step 2: product-report — reads decisions**

Current text:
```
realized), `adr/NN-*.md` (the decided shape — and any decision still `parked`,
which is a live open item, not a footnote), `ateam-plan.md` (goals,
deliverables, status),
```
Replace with:
```
realized), `adr/NN-*.md` (the decided shape — and any decision still `parked`,
which is a live open item, not a footnote), `decisions/NN-*.md` (the
product-scope calls — every record still `provisional` at pr time is reported
as such with its probe, never as settled), `ateam-plan.md` (goals,
deliverables, status),
```

- [ ] **Step 3: Verify**

Run:
```bash
grep -c "\[conflict\]" .claude/skills/research-synthesis/SKILL.md && grep -c "decisions/NN-\*.md" .claude/skills/product-report/SKILL.md
```
Expected: `1`, `1`.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/research-synthesis .claude/skills/product-report && git commit -m "docs(research-synthesis, product-report): contradictions as [conflict] items; the report reads decision records

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: `ateam-discovery` — conducting the iteration entry and the discipline

**Files:**
- Modify: `.claude/skills/ateam-discovery/SKILL.md` — Contract section (lines 29–44), Research (79–113), Straw-man (115–120), Dev review pass-it (132–135), Grill (211–221), Read-back (225–235), Write (255–281), Re-invocation (283–288), Self-check (308–338).

**Interfaces:**
- Consumes: every rule from Tasks 1–9 by name; the decision template path from Task 5.
- Produces: the conductor behaviour the re-run (Task 12) exercises.

- [ ] **Step 1: Contract section — writes**

Current text:
```
- **Writes** (durable, all rules apply): `context.md` (including its
  `## Design context` and `## Technical context` sections), `jtbd/NN-*.md`,
  `adr/NN-*.md`, `ateam-plan.md`, `research-plan.md`, `input/<YYYY-MM-DD>-grill-digest/`, and
  — on evidence-heavy runs — `research/<YYYY-MM-DD>-<slug>.md`. Plus, manifest
  present: `gate_policy` + `run_brief` (the one write beyond your own phase
  status).
```
Replace with:
```
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
  ledger items, never judgements; product-scope calls are decision records,
  calibrated against their own falsifier before they are stamped `made`.
```

- [ ] **Step 2: Research movement — stage first, digest subagent, conflicts, shipped state**

Current text:
```
- Un-ingested `input/` batches + anything the human points at: apply
  **`project-context`** craft to digest into a drafted `context.md` (glossary
  first, Know/Don't-Know ledger, TBD honesty).
```
Replace with:
```
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
- **Iteration runs read the shipped state here:** every active ADR, every
  epic and its status, `ateam-product-report.md` §"What actually shipped",
  `project-plan.md`, and the surfaces the report names as shipped. This is
  what `## Existing state` on every decision record cites.
```

- [ ] **Step 3: Straw-man — classification and decision candidates**

Current text:
```
Draft the JTBD set using **`jobs-to-be-done`** craft — house-format headlines,
forces, honest confidence, parked candidates as real files — *before* asking
the human anything about jobs. A straw-man the human corrects beats a
questionnaire the human authors.
```
Replace with:
```
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
the shipped list. **Check each falsifier now** against what is staged: met →
reshape the candidate; not met → note the citation; not checkable → name the
probe. Candidates enter the ledger as blocking entries.
```

- [ ] **Step 4: Dev review — pass the candidates**

Current text:
```
**Pass it**: the drafted jobs, the target repo path, `context.md`, and the dev
bank's `## Declared defaults`. **Expect back**: technical findings shaped as
`research-plan.md` assumptions with confidence, per-job confidence deltas, and
any new questions.
```
Replace with:
```
**Pass it**: the drafted jobs, the target repo path, `context.md`, the dev
bank's `## Declared defaults`, and — on an iteration run — the decision
candidates. **Expect back**: technical findings shaped as `research-plan.md`
assumptions with confidence, per-job confidence deltas, any new questions,
and, per candidate, what it would remove or coarsen in the shipped code, cited
to paths. The candidate slot is declared in CONTRACT and optional by absence:
if nothing comes back on it, record "candidates not reviewed against the
code" in `research-plan.md` and continue.
```

- [ ] **Step 5: Grill — conflicts and candidates route the same way**

Current text:
```
Intake-bank questions are never asked raw — they enter through the ledger and
this routing. **Termination is defined, not felt**: stop when the blocking set
is empty or the human stops you.
```
Replace with:
```
Intake-bank questions are never asked raw — they enter through the ledger and
this routing. **`[conflict]` entries and decision candidates route the same
way** — asked one at a time, recommendation first, the ruling or ratification
recorded verbatim in the grill digest. A human "yes" on a candidate whose
falsifier is unchecked yields `provisional` with a probe, never `made`; a
conflict the human cannot rule stays open and both readings are carried as
`TBD`. **Termination is defined, not felt**: stop when the blocking set is
empty or the human stops you.
```

- [ ] **Step 6: Read-back — the three lists and the coverage diff**

Current text:
```
Present the **ADR set** too — one line per decision with its `decided_by`
stamp. A decision the human is seeing for the first time here has not been
ratified; say so plainly and let it park. Where a dev review finding moved a job
out of v0, name it: a straw-man that quietly shrinks between draft and read-back
is exactly what movement 5 exists to surface.
```
Replace with:
```
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
```

- [ ] **Step 7: Write — decisions and the coverage column**

Current text:
```
(ask-once-then-deltas). In `context.md`, compile `## Sources` — the audit
index of everything this run consumed: one line per source (link visited,
provided file, connector pull, the grill digest batch) with type · pointer
(URL or `input/` path) · date · what it informed.
```
Replace with:
```
(ask-once-then-deltas). In `context.md`, compile `## Sources` — the audit
index of everything this run consumed: one line per source (link visited,
provided file, connector pull, the grill digest batch) with type · pointer
(URL or `input/` path) · date · what it informed · coverage. Every file in
every ingested batch has a row; a re-read appends a new row.

Write the **decision records** as `decisions/NN-<slug>.md` per
`references/decision-template.md` — ratified with a checked falsifier `made`;
ratified with an unchecked one `provisional` with its `probe:`; unanswered
`parked` with an open question; each with `## Existing state` cited to the
shipped list and any ADR deviation in `deviates_from:`. Ids continue from the
existing set; a reshaped call supersedes, never overwrites.
```
Current text:
```
Then write everything:
`context.md`, `jtbd/` files (active + parked), the ADRs, the plans, any
`research/` run.
```
Replace with:
```
Then write everything:
`context.md`, `jtbd/` files (active + parked; on iteration runs the
reshaped/superseded ones per the durable rules), the ADRs, the decision
records, the plans, any `research/` run.
```

- [ ] **Step 8: Re-invocation — the iteration entry**

Current text:
```
Idempotent. If `docs/product/` already has jobs, you **review and extend** —
never re-derive: existing ids stand, reshapes supersede. On resume after an
escalation, read the answers under `## Awaiting answers`, clear what's
answered, continue from the movement you halted in.
```
Replace with:
```
Idempotent. If `docs/product/` already has jobs, you **review and extend** —
never re-derive: existing ids stand, reshapes supersede. On resume after an
escalation, read the answers under `## Awaiting answers`, clear what's
answered, continue from the movement you halted in.

**The iteration entry.** When `docs/product/` holds an active job set and
either an un-ingested `input/` batch exists or the prompt points at a
document, board or other artifact, say so — "this is an iteration over an
existing North Star" — and run the ten movements as an iteration: stage first
and digest against the existing context (movement 3), read the shipped state
(3), classify every active job and draft the decision candidates (4), pass the
candidates to the dev review (5), route conflicts and candidates through the
grill (7), present the three lists and the coverage diff (8), write the
decision records (10). Nothing about the orchestrator changes; you detect the
entry yourself, under `/feature` and standalone alike. A re-shape that reaches
definition without decision records and a classified job set is the drift
this entry exists to prevent.
```

- [ ] **Step 9: Self-check additions**

Current text:
```
- Manifest (if present): `gate_policy` + `run_brief` written, own status
  `complete`, nothing else touched.
```
Replace with:
```
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
- No decision record is `made` with an unchecked falsifier; every
  `provisional` one names a `probe:` that resolves to a research activity;
  every `deviates_from:` was surfaced at the read-back; none is `made` or
  `provisional` with `decided_by: human` unless the human actually answered.
- Iteration runs: every active job is classified kept / reshaped / superseded
  with its trigger cited; every decision record states keeps / changes /
  removes against the shipped list; a staged human artifact has its coverage
  diff in the read-back.
- Manifest (if present): `gate_policy` + `run_brief` written, own status
  `complete`, nothing else touched.
```

- [ ] **Step 10: Verify**

Run:
```bash
cd "/Users/alvarobezerra/Documents/Claude/Projects/The A Team/harness" && f=.claude/skills/ateam-discovery/SKILL.md && grep -c "Evidence discipline" $f && grep -c "^\- \*\*Stage first" $f && grep -c "digest subagent" $f && grep -c "Build the conflict list before drafting" $f && grep -c "decision candidates" $f && grep -c "Coverage record" $f && grep -c "coverage diff" $f && grep -c "The iteration entry" $f && grep -c "decisions/NN-<slug>.md" $f && grep -c "references/decision-template.md" $f
```
Expected: `1`, `1`, `≥2`, `1`, `≥4`, `1`, `≥2`, `1`, `1`, `2`.

- [ ] **Step 11: Commit**

```bash
git add .claude/skills/ateam-discovery/SKILL.md && git commit -m "docs(discovery): the iteration entry — stage first, full coverage, conflicts, decision candidates, three read-back lists, self-checks

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: `PLAN.md` and `SKILLS.md` mirrors

**Files:**
- Modify: `PLAN.md:62-63` (tree), `PLAN.md` after the "Termination is defined, not felt" paragraph (line ~167)
- Modify: `SKILLS.md` rows for `jobs-to-be-done`, `project-context`, `research-synthesis`, `discovery-plan`, `ateam-discovery`, `product-report`

**Interfaces:**
- Consumes: everything above. PLAN.md mirrors CONTRACT; it never introduces a rule CONTRACT lacks.

- [ ] **Step 1: PLAN.md tree**

Current text:
```
    adr/NN-<slug>.md            #   one file per architecture decision — repo shape, stack,
                                #   where v0 runs, v0 data strategy; cited as [[adr:NN]]
```
Replace with:
```
    adr/NN-<slug>.md            #   one file per architecture decision — repo shape, stack,
                                #   where v0 runs, v0 data strategy; cited as [[adr:NN]]
    decisions/NN-<slug>.md      #   one file per product-scope decision — the calls that shape
                                #   what is built; made | provisional | superseded | parked;
                                #   cited as [[dec:NN]]
```

- [ ] **Step 2: PLAN.md — the new subsection**

Current text (end of the Discovery flow section):
```
`research-plan.md` as open questions — so stopping loses nothing. A question is
only asked if its answer changes an artifact.
```
Replace with:
```
`research-plan.md` as open questions — so stopping loses nothing. A question is
only asked if its answer changes an artifact.

#### Iteration and evidence discipline (2026-09-10)

The ARC v0.5 capability test (2026-09-02 board versus a human control) showed
the A-Team's re-shape of an existing product was done with `building:grill-me`
over the target's `docs/product/` because discovery had no entry for it — and
that the durable rules did not bind that path: a client PDF cited seven times
was never staged, the longest inputs were not exhausted, a documented conflict
was resolved silently, and calls were committed past their own falsifiers.
Two definitions came out of it. **"The A-Team" is however the agent works over
a target's `docs/product/` layer**, not only a `/feature` run; and the boards
were the test fixture, not the product.

So discovery gains an **iteration entry** — when a North Star exists and a new
input lands, it stages first, digests against the existing context, reads what
shipped (ADRs, epics, the product report), classifies every active job
kept / reshaped / superseded, drafts the **decision candidates** the input
forces, and hands definition a classified job set plus decision records — and
every discovery write gains an **evidence discipline** that CONTRACT.md states
under *Citations and coverage*: nothing is cited that is not staged on disk
(human-pointed sources included), every ingested file has a coverage row and
prose is read in full (a digest subagent for long documents), every domain
claim cites a line, conflicts between inputs are `[conflict]` ledger items
that route like any entry, and product-scope calls are a new durable class —
**decision records** at `docs/product/decisions/NN-<slug>.md`, `[[dec:NN]]` —
with a **calibration rule**: a falsifier checkable against staged inputs is
checked before a call is stamped `made`; otherwise the human's yes yields
`provisional` with a named probe. The read-back presents three lists — the
coverage record, the conflicts, the decision records — and a coverage diff
against any human artifact staged as input. ADRs stay architecture-only and
Dev-owned; the `architecture` and `dev-research` skills receive the decision
candidates as a declared slot, filled by the Dev role owner.

Nothing changes in the orchestrator, the manifest or the gates. The
acceptance test is the v0.5 re-scope re-run through the entry and compared to
the control on the report's seven properties.
```

- [ ] **Step 3: SKILLS.md rows**

For each row, replace the current text with the new text (whole line).

`jobs-to-be-done` — current:
```
| `jobs-to-be-done` | Creates and reviews JTBDs (Klement, Jobs-as-Progress) via a one-question-at-a-time grill. In a target repo it writes durable `docs/product/jtbd/NN-<slug>.md` files — forces sketch, honest confidence, sources — parks unpursued candidates as real files, and supersedes rather than deletes. Technical findings are **cited, never restated**: a dev review moves a job's `confidence:` and `sources:`, while the substance stays in research-plan.md. | Discovery — mints and maintains the North Star every downstream artifact traces to. | ported |
```
New:
```
| `jobs-to-be-done` | Creates and reviews JTBDs (Klement, Jobs-as-Progress) via a one-question-at-a-time grill. In a target repo it writes durable `docs/product/jtbd/NN-<slug>.md` files — forces sketch with every force cited to a line, honest confidence, sources — parks unpursued candidates as real files, and supersedes rather than deletes. On an iteration run it classifies every active job kept / reshaped / superseded with the citation that triggers it. Technical findings are **cited, never restated**: a dev review moves a job's `confidence:` and `sources:`, while the substance stays in research-plan.md. | Discovery — mints and maintains the North Star every downstream artifact traces to. | ported |
```

`project-context` — current:
```
| `project-context` | Seeds or refreshes the durable `docs/product/context.md` — overview, digest of `input/` evidence, glossary (settled/forming/TBD), source index, design context (the design briefing's synthesis), technical context (the dev bank's settled facts — uncertainty goes to research-plan.md, machine-readable config to A-Team Config), Know/Don't-Know ledger. Repo-first-and-always; Cowork folders valid, never a blocker. Connector pulls are staged verbatim into `input/` before digesting. | Discovery / Stage-0 — the entry door every project fact walks through. | ported |
```
New:
```
| `project-context` | Seeds or refreshes the durable `docs/product/context.md` — overview, digest of `input/` evidence (every claim cited to a line; long documents read in full by a digest subagent), glossary (settled/forming/TBD, sources cited to lines), source index with a **coverage** column (every ingested file has a row; prose is `full`), design context, technical context, Know/Don't-Know ledger with **`[conflict]`** items where sources disagree. Repo-first-and-always; Cowork folders valid, never a blocker. Anything the human points at outside the repo — and every connector pull — is staged verbatim into `input/` with a `SOURCE.md` before it is cited. | Discovery / Stage-0 — the entry door every project fact walks through. | ported |
```

`research-synthesis` — current:
```
| `research-synthesis` | Digests mixed evidence into an append-only `docs/product/research/<date>-<slug>.md`: themes, contradictions, evidence strength, frequency×impact, job verdicts (supports/challenges/refine), raw new-job signals. Greenfield-capable — with no jobs yet, its signals feed `jobs-to-be-done`. | Discovery — the PM's digest-the-mess machine; the evidence audit trail. | ported |
```
New:
```
| `research-synthesis` | Digests mixed evidence into an append-only `docs/product/research/<date>-<slug>.md`: themes, contradictions (each also entered in the context.md ledger as a `[conflict]` item with both sides cited), evidence strength, frequency×impact, job verdicts (supports/challenges/refine), raw new-job signals. Greenfield-capable — with no jobs yet, its signals feed `jobs-to-be-done`. | Discovery — the PM's digest-the-mess machine; the evidence audit trail. | ported |
```

`discovery-plan` — current:
```
| `discovery-plan` | Compiles the ledger, syntheses, and jobs into TWO durable artifacts in one pass: `ateam-plan.md` (the plan built for the A-Team agents — job-traced goals, deliverables to reach v0, initiatives, decision criteria) and `research-plan.md` (ships with the v0 — open questions, assumptions + confidence + cheapest probes, technical research: services, stack, integration costs). Re-runnable at any phase to keep both live; at the pr phase's plan refresh it also writes `project-plan.md` — the plan for the **project after v0**, kept apart from the backward-looking product report. | Discovery exit — why stopping discovery loses nothing. | ported |
```
New:
```
| `discovery-plan` | Compiles the ledger, syntheses, jobs and decision records into TWO durable artifacts in one pass: `ateam-plan.md` (the plan built for the A-Team agents — job-traced goals, deliverables to reach v0, initiatives, decision criteria) and `research-plan.md` (ships with the v0 — open questions including unruled `[conflict]`s and every decision's revisit-when, assumptions + confidence + cheapest probes, technical research, and a research activity for every `provisional` decision's probe). Re-runnable at any phase to keep both live; at the pr phase's plan refresh it also writes `project-plan.md` — the plan for the **project after v0**, kept apart from the backward-looking product report. | Discovery exit — why stopping discovery loses nothing. | ported |
```

`ateam-discovery` — current:
```
| `ateam-discovery` | The 🔥 grill phase skill — conducts the ported discovery skills through challenge → run brief → research → straw-man → **dev review** → **architecture** → grill → consolidated read-back → independence handoff → write. Seeds the ledger from all three `intake/` banks; dispatches a one-shot dev-review subagent over the drafted jobs (announced, returns through the ledger, fires once + at most one re-fire, optional by absence) under a technical-only carve-out to the no-autonomous-degrade rule. Conducts `architecture` over the review's findings and carries its unratified decisions into the grill as ratification questions. Produces context.md (source index, `## Design context` + `## Technical context`), the JTBD set, the ADRs, ateam-plan.md + research-plan.md; writes `gate_policy` + `run_brief` to the manifest; escalates via `## Awaiting answers`, never guesses. | Discovery phase — the one human-present block that makes independence safe. | authored |
```
New:
```
| `ateam-discovery` | The 🔥 grill phase skill — conducts the ported discovery skills through challenge → run brief → research → straw-man → **dev review** → **architecture** → grill → consolidated read-back → independence handoff → write. Seeds the ledger from all three `intake/` banks; dispatches a one-shot dev-review subagent over the drafted jobs (announced, returns through the ledger, fires once + at most one re-fire, optional by absence) under a technical-only carve-out to the no-autonomous-degrade rule. Conducts `architecture` over the review's findings and carries its unratified decisions into the grill as ratification questions. **Evidence discipline:** stages anything the human points at before citing it, reads every prose input in full (digest subagents for long ones) with a coverage row per file, cites every domain claim to a line, carries conflicts as `[conflict]` ledger items, and records product-scope calls as **decision records** calibrated against their own falsifier (`made` only when checked; else `provisional` with a probe). **Iteration entry:** over an existing North Star plus a new input, it classifies every job kept / reshaped / superseded, drafts the decision candidates the input forces, reads what shipped, and presents the coverage record, the conflicts, the decisions and any coverage diff against a human artifact at the read-back. Produces context.md (source index with coverage, `## Design context` + `## Technical context`), the JTBD set, the ADRs, the decision records, ateam-plan.md + research-plan.md; writes `gate_policy` + `run_brief` to the manifest; escalates via `## Awaiting answers`, never guesses. | Discovery phase — the one human-present block that makes independence safe. | authored |
```

`product-report` — current:
```
| `product-report` | The PRD for the product: durable `docs/product/ateam-product-report.md` — product framing, jobs served, every epic on the MoSCoW scope with a code-grounded verdict (shipped / partial / not shipped + evidence), what actually shipped, open items pointing into research-plan.md; each section links the final artifacts it draws on and a closing `## Supporting documentation` gathers them all (one hop to any artifact). Invoked by the pr phase after integration + refreshes, before the PR opens (report ships inside the PR); standalone refresh for humans. Reads all run artifacts **and the final v0 code** — never reports intentions as shipped. | End of run — the product-level PRD a newcomer reads first; per-feature prd.md stays requirement-level. | authored |
```
New:
```
| `product-report` | The PRD for the product: durable `docs/product/ateam-product-report.md` — product framing, jobs served, every epic on the MoSCoW scope with a code-grounded verdict (shipped / partial / not shipped + evidence), what actually shipped, open items pointing into research-plan.md (every decision record still `provisional` reported with its probe, never as settled); each section links the final artifacts it draws on and a closing `## Supporting documentation` gathers them all (one hop to any artifact). Invoked by the pr phase after integration + refreshes, before the PR opens (report ships inside the PR); standalone refresh for humans. Reads all run artifacts **and the final v0 code** — never reports intentions as shipped. | End of run — the product-level PRD a newcomer reads first; per-feature prd.md stays requirement-level. | authored |
```

- [ ] **Step 4: Verify**

Run:
```bash
cd "/Users/alvarobezerra/Documents/Claude/Projects/The A Team/harness" && grep -c "decisions/NN-<slug>.md" PLAN.md && grep -c "^#### Iteration and evidence discipline" PLAN.md && grep -c "\[\[dec:NN\]\]" PLAN.md && for s in jobs-to-be-done project-context research-synthesis discovery-plan ateam-discovery product-report; do printf "%s " $s; grep -E "^\| \`$s\`" SKILLS.md | grep -cE "coverage|conflict|decision|cited to a line|provisional"; done
```
Expected: `1`, `1`, `≥1`, then `1` for each of the six skills.

- [ ] **Step 5: Commit**

```bash
git add PLAN.md SKILLS.md && git commit -m "docs(plan, skills): mirror the iteration entry, evidence discipline and decision records

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Note: `PLAN.md` also carries an older uncommitted edit (the independence wording, lines 9–14 and the Skill-strategy row). It is intended and may ride in this commit — Alvaro's call from 2026-08-27; mention it in the PR body.

---

### Task 12: Adversarial consistency passes

**Files:**
- Read-only over: `CONTRACT.md`, `PLAN.md`, `SKILLS.md`, every file under `.claude/skills/{ateam-discovery,project-context,jobs-to-be-done,discovery-plan,research-synthesis,product-report}/`, plus `.claude/skills/architecture/references/adr-template.md` and `.claude/skills/dev-research/SKILL.md` (to confirm the declared slots do not contradict them).
- Modify: whichever file a confirmed finding names.

- [ ] **Step 1: Dispatch pass one — mirror drift**

Dispatch two `general-purpose` subagents in parallel with this prompt (substitute the group):

```
You are auditing a docs-only change in the harness repo at
"/Users/alvarobezerra/Documents/Claude/Projects/The A Team/harness", branch
harness/evidence-discipline. CONTRACT.md is canonical. Read
docs/superpowers/specs/2026-09-10-ateam-evidence-discipline-design.md first,
then CONTRACT.md in full, then every file in your group:
  group A: PLAN.md, SKILLS.md, .claude/skills/ateam-discovery/** (SKILL.md and references/)
  group B: .claude/skills/{project-context,jobs-to-be-done,discovery-plan,research-synthesis,product-report}/** and .claude/skills/architecture/references/adr-template.md and .claude/skills/dev-research/SKILL.md
Report, as a numbered list with file:line for each: (1) any rule, vocabulary
value, path, frontmatter key, section name or status word that differs between
CONTRACT.md and a mirror; (2) any rule the spec states that no file implements;
(3) any instruction a skill gives that its own self-check does not verify or
that another skill contradicts; (4) any edit that touched a Dev-owned file
(architecture/, dev-research/, intake/dev-intake.md) — there must be none.
Quote the two disagreeing passages verbatim. Do not fix anything. Say
"no findings" per category when that is true.
```

- [ ] **Step 2: Fix confirmed findings**

For each finding: fix the mirror (never CONTRACT.md unless CONTRACT itself contradicts the spec), then re-run the affected task's verify command. Commit:
```bash
git add -A CONTRACT.md PLAN.md SKILLS.md .claude/skills && git commit -m "docs: consistency pass 1 — <one line per fix>

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 3: Dispatch pass two — executability**

Dispatch one `general-purpose` subagent:

```
Repo "/Users/alvarobezerra/Documents/Claude/Projects/The A Team/harness",
branch harness/evidence-discipline. Read .claude/skills/ateam-discovery/SKILL.md
and its references/decision-template.md, then CONTRACT.md's "Citations and
coverage", "Decision record template" and "ateam-discovery" sections. Simulate,
on paper, an iteration run over the ARC repo at
"/Users/alvarobezerra/Documents/Professional Projects/rarerecapture/v0" with
the new input /Users/alvarobezerra/Documents/Professional Projects/rarerecapture/build-frame-dealflow-extracted.txt:
walk every movement and, at each, state exactly which sentence of the skill
tells you what to do, what you would write, and where. Then instantiate by
hand, in your report only (write no files): (a) one decision record for
"the physical world is a link, not a mirror" whose falsifier is "wrong if the
master list carries live inventory columns" — the master list is not staged,
so show the provisional shape with its probe; (b) one [conflict] ledger entry
for the award-order disagreement between the mechanics guide §2 and the
slice-1 brief §4.6 in docs/product/input/. Report every place the skill text
left you guessing, as file:line plus the question you could not answer from
the text. Write nothing to either repo.
```

- [ ] **Step 4: Fix and commit**

Resolve every "left me guessing" item by editing the skill text (and CONTRACT if the gap is canonical). Re-run all verify commands from Tasks 1–11:
```bash
cd "/Users/alvarobezerra/Documents/Claude/Projects/The A Team/harness" && grep -c "^### Citations and coverage" CONTRACT.md && grep -c "^#### Decision record template" CONTRACT.md && grep -c "^\- \*\*Iteration entry\*\*" CONTRACT.md && grep -c "The iteration entry" .claude/skills/ateam-discovery/SKILL.md && grep -c "| Type | Source | Date | What it informed | Coverage |" .claude/skills/project-context/references/context-template.md && grep -c "^5\. \*\*Iteration runs" .claude/skills/jobs-to-be-done/SKILL.md && grep -c "^#### Iteration and evidence discipline" PLAN.md
```
Expected: all `1`.
```bash
git add -A CONTRACT.md PLAN.md SKILLS.md .claude/skills && git commit -m "docs: consistency pass 2 — <one line per fix>

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Open the PR

**Files:** none new.

- [ ] **Step 1: Confirm no Dev-owned file changed and the runner PR does not collide**

Run:
```bash
cd "/Users/alvarobezerra/Documents/Claude/Projects/The A Team/harness" && git diff --name-only main...HEAD | grep -E "architecture/|dev-research/|intake/dev-intake" ; echo "exit=$? (1 means none touched)" && git fetch origin && git merge-tree $(git merge-base HEAD origin/codex/dependable-runner-first-tranche) HEAD origin/codex/dependable-runner-first-tranche | grep -c "^<<<<<<<" 
```
Expected: `exit=1`, and `0` conflict markers.

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin harness/evidence-discipline && gh pr create --base main --title "Discovery: the iteration entry and the evidence discipline — staging, coverage, citations, conflicts, decision records" --body "$(cat <<'EOF'
Implements docs/superpowers/specs/2026-09-10-ateam-evidence-discipline-design.md.

From the ARC v0.5 capability test: the re-shape ran through grill-me because discovery had no entry for it, and the durable rules did not bind that path. This PR gives discovery an **iteration entry** (existing North Star + new input → stage first, digest against context, read what shipped, classify every job, draft decision candidates) and an **evidence discipline** stated once in CONTRACT.md (*Citations and coverage*): nothing cited that is not staged, a coverage row per ingested file with prose read in full, line citations on every domain claim, `[conflict]` ledger items, and a new durable class — **decision records** at `docs/product/decisions/NN-<slug>.md`, `[[dec:NN]]`, with a calibration rule (`made` only when the falsifier was checked; else `provisional` with a probe).

No orchestrator, manifest or gate changes. Dev-owned skills receive a declared slot (decision candidates) and no edit. PLAN.md also carries the 2026-08-27 independence wording.

Verification: grep assertions per task; two adversarial consistency passes (mirror drift, executability with an on-paper ARC iteration). **Acceptance test still owed:** re-run the ARC v0.5 re-scope through the iteration entry and compare to the control board on the report's seven properties — see the plan's Task 14.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

### Task 14: The acceptance test — re-run ARC v0.5 through the iteration entry

This task runs in a **separate session on the ARC repo**, after the PR merges (or from the branch, for an early read). It is the real capability test; the round is not done until it has run.

**Files (ARC repo, `/Users/alvarobezerra/Documents/Professional Projects/rarerecapture/v0`):**
- Create branch: `feature/arc-v05-dealflow-rerun` from `main`
- Expected writes: `docs/product/input/2026-09-<dd>-build-frame-dealflow/` (staged from the extraction and PDF in the parent folder), `docs/product/input/2026-09-<dd>-figjam-pulled/` (the control board, node `0:1` of file `5ZkItMEc6OE6RZRES21Ckq`, read-only pull), `docs/product/decisions/01…`, refreshed `context.md`, reshaped/superseded jobs, `research-plan.md`, the grill digest.

- [ ] **Step 1: Invoke discovery standalone with the harness from the branch**

In a Claude Code session whose CWD is the ARC repo, with the harness checked out at `harness/evidence-discipline`:
```
/ateam-discovery "Re-shape ARC against the Build Frame: Dealflow (PDF in the parent folder, extraction beside it). Treat the human Product Discovery board (Figma 5ZkItMEc6OE6RZRES21Ckq, node 0:1) as a human artifact of the same kind." --repo "/Users/alvarobezerra/Documents/Professional Projects/rarerecapture/v0" --intake "/Users/alvarobezerra/Documents/Claude/Projects/The A Team/harness/intake"
```
Expected during the run: the skill announces the iteration entry; stages both inputs before citing them; announces digest subagents for the 1,376-line glossary and the 173-line guide (or reads them itself, recorded `full · conductor`); enters `[conflict]` items including the award-order one; drafts decision candidates with checked or probed falsifiers; the read-back shows the coverage record, conflicts, decision records and the coverage diff against the board.

- [ ] **Step 2: Score against the control**

Use the report's seven properties (artifact `99dec1a6-58a0-48d4-b6df-eab49eb1661e`). Record, per property, the verdict and the file:line evidence, in a new artifact or a markdown note beside the report. Specifically check:
- the seven original misses (four deal types; Finance as a base role; master-list contents; three-buyer cap; anonymisation; WeChat/QuickBooks; the award-order conflict) each appear in `context.md`, a job, a conflict or a decision record with a line citation;
- the physical-world call ships `provisional` with a probe, not `made`;
- every source cited on the produced set is on disk under `input/`;
- every file in every ingested batch has a coverage row.

- [ ] **Step 3: Feed findings back**

Anything the re-run still gets wrong is a finding against the skill text, not the run: open an issue on `subvisual/the-a-team` per finding with the file:line and the evidence, and link it from the memory note `ateam-capability-test-2026-09`.

---

## Self-review

**Spec coverage.** §1 iteration entry → Tasks 4 (contract), 10 (skill), 8 (job classification). §2.1 staging → Tasks 1, 6, 10. §2.2 coverage → Tasks 2, 3, 6, 10. §2.3 citations → Tasks 2, 3, 6, 8, 10. §3 conflicts → Tasks 2, 6, 7, 9, 10. §4 decision records + calibration → Tasks 4, 5, 7, 9, 10. §5.1 existing state → Tasks 4, 10. §5.2 dev-research slot → Task 4 (contract bullet), Task 10 (pass-through). §5.3 human artifacts → Tasks 1, 4, 6, 10. §6 files → all; `architecture` handled as a declared slot in Task 3 and 4, no edit. §7 verification → Tasks 12, 14. §8 sequencing → task order. §4.4 downstream (`ateam-definition`, `product-report`, `discovery-plan`) → Tasks 4, 9, 7.

**Placeholder scan.** No "TBD/TODO/similar to Task N". Every edit carries current and replacement text. Task 12's subagent prompts are complete. Task 14 names the exact invocation, paths, node and file key.

**Type consistency.** Frontmatter keys everywhere: `status`, `confidence`, `decided`, `decided_by`, `sources`, `probe`, `deviates_from`. Status words: `made | provisional | superseded | parked`. Coverage values: `full · <date> · conductor`, `full · <date> · digest`, `partial <range> · <date> · <method>`. Ledger classes: `[blocking → …]`, `[non-blocking]`, `[conflict → …]`. Citation prefix `[[dec:NN]]`. Ruling sources: `human, grill Q<n>`, `SOURCE.md precedence`. Template path `.claude/skills/ateam-discovery/references/decision-template.md` in Tasks 4, 5, 10. Task 5's verify diffs the CONTRACT and template keys/sections mechanically.
