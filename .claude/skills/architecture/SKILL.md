---
name: architecture
description: Use when a v0's shape must be decided and recorded before planning can be real — conducted by ateam-discovery right after the dev review and ratified in the grill, or run standalone against an existing job set plus a target repo. The 📝 draft + review beat that answers the board's Dev-lane architecture box — repo shape (monorepo? frontend/backend/smart contracts?), tech stack per surface, where the v0 runs (local-first), and the v0 data strategy (mocked API-shaped vs real integration) — and writes each answer as a durable ADR at docs/product/adr/NN-<slug>.md with alternatives considered, consequences, and a revisit-when trigger. Precedence is the dev bank's: project binding > team default > ask. Decisions that cost money, foreclose an option, or contradict the target repo are ratified by the human, never assumed. Do NOT use for component or schema design, API contracts, library-level picks inside an already-settled stack, or implementation — ateam-spec and the dev phase own those.
metadata:
  version: 0.1.0
  owner: Davide Silva
  provenance: authored 2026-08-27 against CONTRACT.md, from the A-Team board's Dev-lane architecture box (repo shape · default stack unless specified · infrastructure, local-first for v0) and its ADR output card ("tech stack, decisions log"); the v0 data answer is the board's HMW working answer on data. Consumes the dev review's findings (PR #21's slot, filled by the dev-research skill).
---

# architecture

The decisions that must exist before a plan means anything. `ateam-plan.md`
says *"deliverables to reach v0"* — an empty sentence until someone has said
what the v0 *is*: one repo or three, which surfaces, which stack, running where,
with what data.

You make those calls, record them as ADRs, and — for the ones that matter — get
a human to ratify them. You are **above** implementation: you decide the shape,
never the schema.

Interaction mode: 📝 **draft + review** — you always draft first, and a human
always sees the draft before it lands. Conducted by `ateam-discovery`, the grill
and its read-back are that review. Standalone, you run the review yourself.

## Contract (CONTRACT.md is authoritative)

- **Reads**: the **dev review's findings** (your primary input — the
  `dev-research` return, handed to you by the conductor; standalone, run it
  first or say plainly that you are deciding without a sweep);
  `docs/product/jtbd/**`; `context.md` (especially `## Technical context`, the
  settled technical facts); `research-plan.md`'s technical assumptions;
  `docs/product/adr/**` (existing decisions — extend and supersede, never
  re-derive); the target repo; the target's `## A-Team Config`; the dev bank's
  `## Declared defaults` in `intake/dev-intake.md`; the manifest's `run_brief`.
- **Writes**: `docs/product/adr/NN-<slug>.md` — one file per decision. Durable
  rules bind: ids forever, `status: superseded` plus a forward pointer instead
  of deletion, never written without human review in the same session.
  Conducted, you draft and `ateam-discovery` writes at its write movement —
  same as `jobs-to-be-done`.
- **May append** to `research-plan.md`'s `## Assumptions` / `## Open questions`
  under CONTRACT.md's standing exception, tagged `· [architecture]`.
- **Never writes**: jobs, plans, `## Technical context`, or any feature-directory
  artifact. A settled *fact* belongs to the dev review and `## Technical
  context`; you record *decisions*. One fact, one home.

## The four decisions

Answered in this order, because each constrains the next. Not every run produces
four ADRs — a question the target repo has already settled is an **observation**,
already recorded in `## Technical context` by the dev review, and you cite it in
an ADR's Context rather than minting a decision nobody made.

1. **Repo shape** — one repo or a monorepo; which surfaces exist (frontend /
   backend / smart contracts / worker). Driven by what the jobs need, not by
   what is tidy.
2. **Tech stack** — per surface. Precedence below.
3. **Where the v0 runs** — the board's answer is **local-first for v0**, with a
   shared link as an explicit upgrade. `dev-intake.md` already seeds the deploy
   question.
4. **v0 data strategy** — real integration, or mocked **API-shaped** data fit to
   the product context, so the seam is real even when the data is not. A job
   whose whole point is the live data is the exception, and an exception is an
   ADR.

## Precedence — the dev bank's rule, applied to decisions

**Project binding > team default > ask.** Unchanged from
`intake/dev-intake.md`; you are applying it, not inventing a parallel one.

1. **Project binding** — a fact in the target's `## A-Team Config` or in
   `context.md`'s `## Technical context`, including everything the dev review
   just settled from the repo. A real codebase with real conventions binds:
   adding a second frontend framework to a live app needs an extraordinary
   reason *and* a human saying yes.
2. **Team default** — a `## Declared defaults` entry in the dev bank. Applied
   **openly**: the ADR names the entry, and a confidence-stamped assumption goes
   to `research-plan.md`, surfaced at the definition gate. Never silently
   absorbed.
3. **Ask** — neither applies, so it is a question. `run_brief.purpose` colors
   the recommendation you attach (`throwaway concept` and `seed of production`
   pull in opposite directions, and the same job set can honestly land in
   different places — say which pull you followed), but it does not substitute
   for the answer.

When a lower rule would have chosen differently, **Alternatives considered**
says so. That is the whole value of writing it down.

## Who decides, and who ratifies

The board's rule is *"Agent decides, or human picks (HITL)"*. The line:

**You decide** when the answer is already determined — a project binding settles
it, or a Declared default covers it, or exactly one option survives a
constraint. You are recording, not choosing. Stamp `decided_by: agent`.

**The human ratifies** — always, no judgment call — when the decision:

- costs money, or commits to a paid tier or a vendor;
- forecloses an option expensive to reopen (data model, chain, auth provider,
  hosting lock-in);
- contradicts a project binding;
- rests on a dev review finding rated `expensive` or `unknown`;
- picks a v0 data strategy for a job whose value *is* the live data.

Stamp those `decided_by: human` only once they have actually said yes.
Conducted, they reach the grill as one-sentence questions with your
recommendation first — the grill's discipline is one question at a time, each
carrying its recommendation. **Presented is not ratified**: unanswered at write
time is `status: parked` plus an open question in `research-plan.md`, never
`active`.

## Process

1. **Read the existing ADRs first.** A settled decision is extended or
   superseded, never re-litigated silently.
2. **Take the dev review's findings whole** — repo-binding evidence and service
   constraints. Every ADR must rest on one, or on a fact already in
   `## Technical context`. An ADR resting on preference alone is the failure
   this pairing exists to prevent.
3. **Walk the four decisions in order**, dropping any a project binding settled.
4. **Diverge before you converge.** Every ADR carries at least one real
   alternative with a real reason for dropping it. One option is not a decision;
   it is a preference wearing a decision's clothes.
5. **Draft each ADR** against `references/adr-template.md`.
6. **Split the set** — agent-decided vs needs-ratification — and hand the second
   list up (conducted) or walk it yourself (standalone).
7. **Set `revisit when` on every ADR**, and mirror anything genuinely open into
   `research-plan.md`. An ADR with no revisit trigger is a tombstone.
8. **Write** (standalone) or hand the ratified set to the conductor. Commit
   messages name what changed and why:
   `docs(adr): 02 — monorepo, the contract surface shares types with the app`.

## Escalation

No human to ratify a decision that needs it: it is **not** written `active`. Its
question goes to `context.md`'s `## Awaiting answers`, one per heading; the ADR
lands `status: parked` holding the draft and its alternatives; you halt on that
decision while still writing the ones that genuinely did not need a human. An
escalation is a defined output, not a failure.

Autonomous degrade is forbidden here for the same reason it is forbidden in
discovery. CONTRACT.md's carve-out belongs to the **dev review**, and it covers
*facts* — a repo read, a declared default applied openly. It does not extend to
**decisions**: a stack invented unchallenged and written durably becomes ground
truth for every phase after it, and `ateam-spec` will map a design system onto it
without anyone having agreed.

## Context rule

Zero project facts embedded in this skill, and zero team defaults either — those
live in `intake/dev-intake.md`'s `## Declared defaults`, owned and maintained by
the Dev role owner. You read them; you never carry a copy. Everything else comes
from the job set, `context.md`, the target repo, and the dev review.

## Self-check before returning

- Every ADR rests on a named dev review finding or a fact in `## Technical
  context`. None rests on preference alone.
- Every ADR has ≥1 real alternative with a real reason it was dropped.
- Every ADR has consequences **and** a revisit-when trigger.
- Precedence ran project binding → team default → ask, and any lower rule that
  would have chosen differently is named in Alternatives considered.
- Every applied Declared default is named in its ADR **and** recorded as a
  confidence-stamped assumption in `research-plan.md`.
- Every decision on the ratification list is `decided_by: human` **and was
  actually answered**, or is `parked` with an open question logged.
- ids are stable; nothing was deleted; supersessions point forward.
- Nothing outside `docs/product/adr/` was written, except the permitted
  `research-plan.md` append.
