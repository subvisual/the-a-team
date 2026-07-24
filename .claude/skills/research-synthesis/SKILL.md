---
name: research-synthesis
description: Use when mixed discovery evidence — interview notes, survey comments, support themes, meeting transcripts, analytics summaries, docs/product/input/ batches — must be synthesized into a coherent, durable input for discovery or definition; when evidence is fragmented, contradictory, or blocking discovery and PRD work; or when the existing JTBD set needs checking against fresh evidence before locking scope. Works greenfield (no jobs yet): the output is then themes + raw new-job signals routed to jobs-to-be-done. Writes append-only docs/product/research/<date>-<slug>.md per CONTRACT.md. Do not use for creating, reviewing, or rewriting job statements (jobs-to-be-done owns all job knowledge), when the evidence is already reliably synthesized, or for final ticket drafting.
metadata:
  version: 0.2.0
  owner: Alvaro Bezerra
  provenance: ported 2026-07-24 from product-craft research-synthesis (github.com/ABZerra/product-craft) and adapted to the A-Team contract — hard JTBD precondition relaxed to greenfield mode; output made a durable artifact.
---

# research-synthesis

Consolidate mixed discovery evidence into one durable, discovery-ready
synthesis: surface converging themes, contradictions, and gaps — then, when jobs
exist, judge what the evidence says about each one, without overstating
certainty. This is the PM's digest-the-mess machine: real client input is
spectacular but chaotic, and downstream agents can only be as good as how well
it is organised for them.

This skill **consumes** job knowledge; it never mints or rewrites it.
`jobs-to-be-done` is the single path for creating, refining, or superseding
jobs — even when the evidence on the table screams for a rewrite.

## Framing: jobs when they exist, greenfield when they don't

- **Jobs exist** (`docs/product/jtbd/` has `active` jobs): they are the required
  framing. Read them; preserve their wording verbatim. The synthesis renders a
  **job verdict** per active job in scope.
- **Greenfield** (no jobs yet — day-one discovery): synthesize anyway. The
  primary output becomes converging themes and **raw new-job signals**, and the
  synthesis routes straight to `jobs-to-be-done` to mint the first jobs from
  them. Guard the drift risk explicitly: a greenfield synthesis organises
  evidence *for job creation* — it does not quietly become the product's list of
  needs.

## Where it writes

- **`docs/product/research/<YYYY-MM-DD>-<slug>.md`** — one append-only file per
  synthesis run, in the target repo (repo-first-and-always; a Cowork folder is a
  valid target, never a blocker). Never edit or delete a previous run — a
  superseding synthesis says so in its own header and points back. This is the
  stable citation target: PRDs, jobs, and plans cite
  `research/2026-07-24-onboarding` forever.
- **`docs/product/context.md` Digest** — a 2–4 line summary of the run plus a
  pointer to the research file, so the one file every agent reads stays current
  without bloating.
- Evidence not yet in `docs/product/input/` that you pulled from a connector
  (Notion, Granola, Slack, ops API) is **staged verbatim first** as
  `input/<YYYY-MM-DD>-<source>-pulled/`, then synthesized from there — per the
  contract, skills never edit or delete batches. Pasted evidence works the same;
  never block on a connector.
- No target repo/folder at all → deliver the synthesis conversationally and
  offer to save; no durable claims.

## Inputs

- The research question, opportunity area, or decision the synthesis supports.
- `docs/product/jtbd/` (framing, when present) and `context.md` (glossary — use
  its settled terms; flag term drift you notice, don't silently coin new ones).
- Evidence: un-ingested `input/` batches, pasted notes, staged connector pulls.
- Optional: hypotheses or segment assumptions worth testing. (No personas as
  framing — the A-Team works situation-and-struggle, not demographics.)

## Outputs — the synthesis file

Use `references/research_synthesis_input_template.md` (same section order):
research question · input jobs (ids + verbatim headlines) · source inventory ·
evidence-strength notes · converging themes · contradictions · gaps ·
frequency × impact matrix · job verdicts · new-job signals · discovery
questions · handoff. Plus, A-Team-specific:

- **`sources:` frontmatter** tracing every batch/file the run consumed, so a
  reviewer can audit what you were told versus what you inferred.
- **Job verdict** per in-scope active job — `supports` / `challenges` /
  `suggests refinement` — citing the specific evidence. The job files stay
  untouched: verdicts are routed to `jobs-to-be-done` (REVIEW), which owns any
  confidence change or superseding rewrite.
- **New-job signals**: recurring struggles, workarounds, switching behavior
  that fit no input job. Recorded raw, with source and why they smell like a
  different job — explicitly **not** job statements.

## Workflow

Use `references/research-synthesis-framework.md` for the full method. The shape:

1. **Frame.** Confirm the research question. Load active jobs (or declare
   greenfield mode out loud). Load the glossary.
2. **Gather & stage.** Collect un-ingested `input/` batches and pasted
   evidence; stage any connector pulls verbatim into `input/` first.
3. **Normalize.** Record source type, segment, timing, and caveats per source
   before combining, so strength labels stay honest.
4. **Theme.** Group repeated findings into converging themes, keeping the
   supporting evidence visible instead of flattening it away.
5. **Contradict.** Call out contradictions, segment differences, and outliers
   explicitly; never smooth them into false agreement — they become discovery
   questions and ledger entries.
6. **Label strength** qualitatively (`Strong` / `Moderate` / `Directional` /
   `Unknown`) and explain each label. No numeric scores; if numbers are absent,
   do not fabricate them.
7. **Prioritize** on the frequency × impact matrix — qualitatively.
   High-frequency + high-impact leads; low-frequency + high-impact stays
   attached to its segment; high-frequency + low-impact is quality-of-life;
   low-frequency + low-impact is noted and deprioritized.
8. **Judge** (jobs mode): render each job verdict with its evidence. Keep job
   wording untouched.
9. **Signal** (both modes): collect raw new-job signals.
10. **Draft** the synthesis file in template order, ending with the discovery
    questions that follow from contradictions and gaps.
11. **Read-back — mandatory before writing.** The research file and the
    context.md digest note are durable: present both for correction in this
    session, then write and commit (one commit, message naming what the run
    found — e.g. `docs(research): onboarding synthesis — 03 challenged, 2 new
    signals`).
12. **Route.** Challenged/refinement verdicts and new-job signals →
    `jobs-to-be-done`. All-supporting verdicts → `discovery-plan` (unknowns
    into a plan) or `prd-writer` (scope is concrete). Close with **Next likely
    skill(s)** · **What to pass forward** · **Suggested next prompts**.

## No human present

Synthesis itself needs no grilling, but the read-back gate does need a human.
With nobody present: produce the full synthesis **in your report only**, write
nothing durable, and state that the run awaits review — an escalation is a
defined output, not a failure. Never commit an unreviewed synthesis: it would
become audit-grade evidence nobody audited.

## Examples

- Input: `examples/example-input.md` · Output: `examples/example-output.md`
