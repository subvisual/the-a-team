# context.md template — the canonical shape

This is the durable `docs/product/context.md` every A-Team skill reads. The
structure below is the contract (see `CONTRACT.md`); the annotations are guidance.

```markdown
---
project: <name>
updated: <YYYY-MM-DD>
ingested:                          # input/ batches digested into this file
  - 2026-07-17-client-call         # one line on what the batch held
  - 2026-07-24-granola-pulled      # staged connector pull (verbatim)
---

# Context: <project name>

## Overview

<One paragraph: what this project is and why it exists. If jobs are defined,
cite them by id ([[01-...]]) and quote headline language exactly — never
paraphrase a job, never restate the jtbd/ files here. If none exist:
"Core job: TBD — define via jobs-to-be-done.">

- **Audience / users:** <primary users, buyers, stakeholders — TBD is fine>
- **Current stage:** <exploration / discovery / definition / building / live>
- **Goals:** <goal 1; goal 2 — or TBD>
- **Constraints:** <budget, timeline, tech, team, contractual>
- **Key links:** <repo · Notion · Figma · tracker · Slack channel — or TBD>

## Digest

<Per ingested batch, newest first: what the evidence actually says, compressed,
with pointers back to the input/ files. The digest is the readable form of the
raw mess — it never replaces the raw files and never embellishes them. On an
iteration run the batch's digest ends with the job classification: one line
per active job — kept / reshaped / superseded — with the citation that
triggers it.>

### 2026-07-17-client-call
<...>

## Sources

<The audit index of everything discovery consumed — one line per source: links
visited during agent research, human-provided files, connector pulls, the
grill digest batch. Every row resolves — a live URL or a path on disk.
Overview's Key links stay the 2–3 load-bearing product links; this table is
the complete index. Coverage says how much of the file was read and by whom:
`full · <date> · conductor` · `full · <date> · digest` (a one-shot digest
subagent whose digest cites lines) · `partial <range> · <date> · <method>`
(non-prose inputs only — a JSON spec, an image set, a binary — with the
method stated). `legacy · <date>` marks a row written before this column
existed — never for a new read. Every evidence file in every ingested batch
has a row (the batch's own `SOURCE.md` none); prose files are `full`. A
re-read appends a new row with the new date; the latest row governs.>

| Type | Source | Date | What it informed | Coverage |
| --- | --- | --- | --- | --- |
| link | <URL the agent consulted> | <YYYY-MM-DD> | <the fact or section it fed> | full · <YYYY-MM-DD> · conductor |
| file | <input/<batch>/<file> — human-provided> | <YYYY-MM-DD> | <...> | full · <YYYY-MM-DD> · digest |
| file | <input/<batch>/<spec>.json — human-provided> | <YYYY-MM-DD> | <...> | partial paths+schemas · <YYYY-MM-DD> · diffed programmatically |
| pull | <input/<YYYY-MM-DD>-<source>-pulled/> | <YYYY-MM-DD> | <...> | full · <YYYY-MM-DD> · conductor |
| grill | <input/<YYYY-MM-DD>-grill-digest/> | <YYYY-MM-DD> | <...> | full · <YYYY-MM-DD> · conductor |

## Glossary

Status: **settled** — team-wide agreement, safe to use in artifacts ·
**forming** — best current definition, may still shift · **TBD** — in play,
undefined.

| Term | Working definition | Status | Source (cited to a line) / notes |
| --- | --- | --- | --- |
| <term> | <what the team means by it today> | settled | `<batch>/<file>:L<start>-L<end>` |
| <term> | <best current definition> | forming | `<batch>/<file> §<n>` · competing name: "<other>" |
| <term> | <unknown — heard in kickoff> | TBD | <who to ask> |

Never delete a renamed term — note the rename in Source / notes so old
documents stay readable.

## Design context

<Captured once via the design briefing (intake/design-intake.md), then kept
current with deltas. The design phase reads this as its floor.>

- **Users & emotional goals:** <who + what the interface should evoke>
- **Brand personality:** <3 words, voice/tone>
- **Aesthetic direction:** <visual tone · references (and what about them) ·
  anti-references · light/dark · color constraints>
- **Accessibility:** <WCAG level, accommodations — or TBD>
- **Design principles:** <3–5 principles derived from the answers; every
  downstream design decision should be defensible against these>

## Technical context

<The settled technical facts about this project, captured from the grill (the
dev intake bank's entries reach it via the ledger) and kept current with
deltas. Dev reads it; design reads it as part of its floor.

Home rule — one fact, one home, others cite:
**settled + durable + project-level → here** · **uncertain or assumed →
research-plan.md, confidence-stamped** · **machine-readable → the target's
`## A-Team Config`**. Never restate across files.>

- **Stack binding:** <does the target's stack bind the v0, or is the team
  default fine? — cite the binding, or "team default applies">
- **External dependencies:** <services/APIs in play · access or credentials ·
  mocked vs real — or TBD>
- **Infrastructure & deploy:** <where the v0 runs; local-first unless stated>
- **Data sensitivity:** <real data? PII/compliance constraints — or "none">
- **Non-functional constraints:** <auth model, offline, latency — anything that
  changes the architecture even for a prototype>
- **v0 test bar:** <the target's full suite / smoke only / none — what must
  pass. A-Team Config carries the *command*; this is what must go green.>

## Know / Don't know

### Know
- <fact> — <source: batch, meeting, person>
- <a Don't-Know the dev review closed> — answered, see `## Technical context`

A Know that a briefing section already holds is recorded as **closed with a
pointer**, never re-stated: the ledger tracks whether a question is open, the
briefing sections hold the fact. Two copies inside one file drift as surely as
two copies across files.

### Don't know
- **[blocking → <the JTBD id or scope call it blocks>] [pm|design|dev]** <question>
- **[non-blocking] [dev]** <question — survives into research-plan.md as an open question>
- **[conflict → blocks [[03]] / dec:02] [pm]** <A says X> (`<batch>/<file> §2`) · <B says Y> (`<batch>/<file> §4.6`) · **ruling:** open
- **[conflict] [non-blocking] [pm]** <A says X> (`…:L12-L14`) · <B says Y> (`…:L88-L90`) · **ruling:** SOURCE.md precedence — A wins

The role tag is carried whenever an `intake/` bank seeded the entry — it is
what the answerability routing keys off, and with three banks feeding one
ledger an untagged entry loses its consumer. A `[conflict]` entry names both
sides with citations and what it blocks; it routes like any entry and closes
with its ruling source (`ruling: human, grill Q<n>` · `SOURCE.md precedence`
— the latter only for a conflict between files of one batch);
an unruled one is carried into research-plan.md as an open question and every
artifact touching it holds both readings marked `TBD`. Knows cite lines too:
`- <fact> — `<batch>/<file>:L<start>-L<end>``.

## Awaiting answers

<Present only while an escalation is open — one blocking question per heading,
serialised by a skill that found no human to grill. Answer inline and re-invoke;
the skill removes the section when resolved.>
```

Rules that bind every writer of this file:

- **Refresh, never rebuild.** Preserve what is still true; update what changed.
  A refresh that silently drops content is an overwrite, and overwrites are
  forbidden for durable artifacts.
- **TBD stays visible.** Uncertainty lives as explicit `TBD` / ledger entries,
  never hidden inside polished prose.
- **Sources is append-mostly and every row resolves.** A source that shaped a
  fact but never reaches the index is an audit hole; a row pointing at nothing
  (dead path, vanished URL with no staged pull) is a bug.
- **Every evidence file in an ingested batch has a coverage row; prose files
  are `full`.** The batch's own `SOURCE.md` is provenance, not evidence, and
  gets no row. A row that predates the column carries `legacy · <original
  date>`; a legacy file the run re-reads gets a fresh row. A prose file in an
  ingested batch without a `full` (or `legacy`) row is a failed self-check. A
  staged batch not ingested this run has no rows, stays out of `ingested:`,
  and gets a ledger entry naming it and why.
- **Nothing is cited that is not on disk.** A source the human pointed at
  outside the repo is staged as an `input/` batch with a `SOURCE.md` before
  the digest cites it; a named-but-absent companion is a `SOURCE.md` note and
  a ledger entry, never inferred.
- **Domain claims cite lines.** Glossary rows, digest claims and Knows this
  run writes, moves or re-asserts carry `<batch>/<file>:L<start>-L<end>` (or
  `§<n>`, `:p<N>` for PDFs); a claim without one is a failed self-check. An
  inherited claim without a citation is tagged `[legacy]` and named in the
  coverage record — never back-filled.
- **Conflicts are items.** Two sources disagreeing on a fact that reaches this
  file is a `[conflict]` ledger entry with both citations, never a smoothed
  sentence.
- **The ledger drives the grill.** Only blocking Don't-Knows justify questions;
  non-blocking ones flow into `research-plan.md` as open questions, so stopping
  loses nothing.
- **One fact, one home.** `## Design context` and `## Technical context` hold
  *settled* briefing facts; uncertainty belongs in `research-plan.md` with a
  confidence level, and machine-readable config in the target's
  `## A-Team Config`. A fact restated in two files will disagree with itself.


## Machine-readable current authority

Add exactly one fenced `ateam-context` JSON index to the configured current-context
file. Follow [the versioned schema](../../../../runner/CONTEXT.md). The surrounding
narrative, original evidence and previous source history remain intact. This is an
index of existing product/design/engineering authorities, not a second set of
requirements. Current observations and accepted intent must remain distinguishable.
