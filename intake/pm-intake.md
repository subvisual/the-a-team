# PM intake bank

*Authored by the PM role owner. This file is rubric pre-work, the same shape as
`design-intake.md` and `dev-intake.md`: the questions the grill must always
**consider**, so they live in a bank rather than only in the conductor skill's
head.*

Unlike the other two banks, PM is not an absent stakeholder — the PM skill
**is** the grill. So the split to hold is: **this file holds the questions, the
skill holds how to conduct them.** A question that appears here must not be
restated as prose inside `ateam-discovery`; a conducting rule (ordering,
recommended-answer discipline, termination) must not be smuggled in here as a
question.

The grill **never asks these raw**. Each entry seeds the `context.md`
Know/Don't-Know ledger tagged `[pm]`, then routes by answerability (see
CONTRACT.md): blocking + human-answerable → asked in the grill · blocking but
not answerable by this human → research activity in `research-plan.md` ·
non-blocking → stays in the ledger.

**Explore before asking**, same rule as the design bank: if the prompt, the
target repo, or an existing `docs/product/` already answers an entry, it enters
the ledger as a **Know with its source** and is never asked.

**Ask once, then deltas**: entries already settled in `context.md` on a previous
run are not re-asked; only deltas are.

## Problem space

These are the board's own grill topics — the PM half of them. The board's
`core dependency on external services?` lives in `dev-intake.md` and
`branding or design system established?` in `design-intake.md`; they reach the
same ledger from there.

- What problem does this solve? (If the prompt asserts a solution, the problem
  behind it is the question — a straw-man job cannot be built from a feature
  name.)
- Who is it for? Which of them feel the problem most acutely today?
- How is it solved today — competitors, incumbents, workarounds, spreadsheets,
  doing nothing? (This is the JTBD `Today` force; without it a job has no
  demand evidence.)
- What would have to be true for someone to switch from that? What holds them
  back? (Push / pull / anxiety / inertia.)
- What is the observable signal that this worked? (Feeds each job's `Success`.)
- What is explicitly **out** of scope for the v0? (An unstated boundary becomes
  an invented one downstream.)

## Run brief

*How and when these are conducted — ordering, recommendation discipline,
whether the beat is skippable, where the answers are stored — belongs to
`ateam-discovery`'s run-brief movement, not here.*

- Purpose of this run — throwaway concept / client-facing v0 / seed of
  production?
- Fidelity expectation for the design phase output?
- Timebox — how long should this run take?
- What does "done" look like for this run, concretely?

*(The scope guardrail — is this ambitious 0→1 work, or a ticket that should
route out? — is a conducting rule, not a question, so it lives in
`ateam-discovery`'s challenge movement and deliberately not here.)*
