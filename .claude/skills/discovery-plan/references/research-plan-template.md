# research-plan.md template — the research plan

`docs/product/research-plan.md` is the research document that **ships together
with the v0 final outputs**: what we still don't know, what the agents (and
humans) assumed and how confident they were, and the technical research behind
the build. It is the honest disclosure that makes a v0 trustworthy. Goals and
deliverables are NOT here — they live in `ateam-plan.md` (see
`references/plan-template.md`). The two are written together by the
discovery-plan skill so they cannot drift.

Durable artifact: update-only, read-back before every write, kept live as
later phases surface new assumptions.

````markdown
---
updated: <YYYY-MM-DD>
evidence: [research/2026-07-24-onboarding]   # synthesis runs this plan stands on
---

# Research plan: <project / feature area>

## Evidence spine

Cited, not duplicated: the research/ runs this plan stands on, each with a
one-line verdict summary (which jobs stand on solid ground, which need work).

## Open questions

What ships unresolved with the v0 — the ledger's surviving unknowns, including
questions raised by challenges/refinement verdicts, every **unruled
`[conflict]`** (both sides cited, what it blocks), and every decision record's
`## Revisit when` (cited `[[dec:NN]]`). Each tagged with what it would change
if answered. A still-open **blocking** unknown is stated loudly at the top,
never buried mid-list.

## Assumptions

Keep one canonical `ateam-assumptions` JSON block here. Preserve existing prose
and source pointers while indexing actual records; summaries cite stable ASM IDs
instead of maintaining a second ledger. Every assumption retains its confidence,
disproof and cheapest probe, plus risk, dependent decision, required stage,
accountable owner, explicit uncertainty and source-backed evidence/disposition.
Use unresolved actor/role values until known; do not invent ownership or demand.

```ateam-assumptions
{"schemaVersion":1,"revision":1,"assumptions":[]}
```

Populate records using `runner/ASSUMPTIONS.md` in the harness. Before each revision,
preserve the previous parsed block in `assumptions-history/<revision>.json` beside
this plan; retain source bytes, prior decisions and all assumption/evidence IDs.
An evidence-producing prototype can precede its later validation stage. Pending
evidence, authorized deferral, no-go and reshape remain explicit valid outcomes.

## Technical research

Services, tech stack, and integrations: the options considered, what each
costs (money, effort, risk), and what was chosen or still open. This is the
"cost breakdown of every integration the client mentioned" — the genuinely
useful, non-obvious output.

Fed by **`dev-research`**: its blocking-but-not-human-answerable findings land
here as research activities, and its non-blocking ones carry over from the
ledger. Keep each finding's stamps — cost (`cheap` / `moderate` / `expensive` /
`unknown`), confidence, and the evidence pointer — so a reader can tell a swept
fact from a guess. Where a decision was settled, cite the ADR (`[[adr:NN]]`)
rather than restating it; where one was **parked** for want of ratification,
that parked decision is an open question and belongs above.

## Research activities

Question → activity → owner (human or agent) → date. The work of closing the
unknowns above; its outcomes land back in research/ runs and flip ledger
entries to Know. A `provisional` decision record (`[[dec:NN]]`) has its probe, owner and due stage on its pending ASM record; nothing is listed here for it — the ledger's own gates carry it, and a second activity would be the parallel register `runner/ASSUMPTIONS.md` forbids.
````
