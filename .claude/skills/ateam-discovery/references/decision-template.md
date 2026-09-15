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
assumptions: [ASM-012]     # ledger records the falsifier rests on (runner/ASSUMPTIONS.md); required when load-bearing
deviates_from: []           # e.g. [adr:03] — named, never silent
---

# 01. A deal is captured as coarse buckets, and the sheet is attached unopened

## Status
provisional — ratified at the 2026-09-02 grill (Q2); ASM-012 is `pending`.
<!-- made — ratified at …; every linked load-bearing ASM is `proceed` -->
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
The falsifier — the `disproof` of the linked ASM — then its ledger state:
`checked — EVD-<id> on ASM-<id>, <citation>, result support` ·
`checked — result contradict; superseded by [[dec:NN]]` ·
`unchecked — ASM-<id> pending, probe: <its cheapestProbe>`.

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
  checked before the record is stamped `made`, and the check lives on the
  linked ASM record as an `EVD-` entry (source path, SHA-256, reference,
  `origin: observed`, result) — see `runner/ASSUMPTIONS.md`. Every linked
  load-bearing ASM `proceed` → `made`; any `pending`/`defer` → `provisional`;
  `contradict` → reshape before asking, or supersede. The probe is the ASM's
  `cheapestProbe`; this file never carries a second one. A `made` record with
  an unchecked falsifier is a failed self-check.
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
  reports every `provisional` record still open at pr time with its pending
  ASM; the plan refresh mirrors `## Revisit when` as open questions.
