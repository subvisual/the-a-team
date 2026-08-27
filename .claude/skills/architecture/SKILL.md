---
name: architecture
description: Use when a v0's shape must be decided and recorded before planning can be real — conducted by ateam-discovery right after dev-research and ratified in the grill, or run standalone against an existing job set plus a target repo. The 📝 draft + review beat that answers the board's Dev-lane architecture box — repo shape (monorepo? frontend/backend/smart contracts?), tech stack (house defaults unless the target or the context says otherwise), where the v0 runs (local-first), and the v0 data strategy (mocked API-shaped vs real integration) — and writes each answer as a durable ADR at docs/product/adr/NN-<slug>.md with alternatives considered, consequences, and a revisit-when trigger. Decisions that cost money, foreclose an option, or contradict the target repo are always ratified by the human, never assumed. Do NOT use for component or schema design, API contracts, library-level picks inside an already-settled stack, or implementation — ateam-spec and the dev phase own those.
metadata:
  version: 0.1.0
  owner: Davide Silva
  provenance: authored 2026-08-27 against CONTRACT.md, from the A-Team board's Dev-lane architecture box (repo shape · default stack unless specified · infrastructure, local-first for v0) and its ADR output card ("tech stack, decisions log"); the v0 data answer is the board's HMW working answer on data.
---

# architecture

The decisions that must exist before a plan means anything. `ateam-plan.md` says
*"deliverables to reach v0"* — that sentence is empty until someone has said what
the v0 *is*: one repo or three, which surfaces, which stack, running where, with
what data.

You make those calls, record them as ADRs, and — for the ones that matter — get a
human to ratify them. You are **above** implementation: you decide the shape,
never the schema.

Interaction mode: 📝 **draft + review** — you always draft first, and a human
always sees the draft before it lands. Conducted by `ateam-discovery`, the grill
and its read-back are that review. Standalone, you run the review yourself.

## Contract

- **Reads**: `dev-research`'s findings (**your primary input** — conducted, they
  are handed to you; standalone, run `dev-research` first or say plainly that
  you are deciding without a sweep); `docs/product/jtbd/**`;
  `docs/product/context.md`; `docs/product/adr/**` (existing decisions —
  extend and supersede, never re-derive); the target repo; the target's
  `## A-Team Config` block; the manifest's `run_brief`;
  `references/house-defaults.md`.
- **Writes**: `docs/product/adr/NN-<slug>.md` — one file per decision. Durable
  rules bind: ids forever, `status: superseded` plus a forward pointer instead
  of deletion, never written without human review in the same session.
  Conducted by `ateam-discovery`, you draft and **it** writes at its write
  movement — same as `jobs-to-be-done`.
- **May append** to `research-plan.md`'s `## Assumptions` / `## Open questions`
  under CONTRACT.md's standing exception, tagged `· [architecture]`.
- **Never writes**: jobs, plans, or any feature-directory artifact.

## The four decisions

You answer these, in this order, because each constrains the next. Not every run
produces four ADRs — a question the target repo has already settled is an
**observation**, and you record it in the ADR's Context rather than minting a
decision nobody made.

1. **Repo shape** — one repo or a monorepo; which surfaces exist (frontend /
   backend / smart contracts / worker). Driven by what the jobs actually need,
   not by what is tidy.
2. **Tech stack** — per surface. Precedence below.
3. **Where the v0 runs** — the board's answer is **local-first for v0**, with a
   shared link as an explicit upgrade. Deploy target is a run-brief question,
   and `dev-intake.md` already seeds it.
4. **v0 data strategy** — real integration, or mocked **API-shaped** data fit to
   the product context. The board's working answer is mocked-and-API-shaped by
   default, so the seam is real even when the data is not. A job whose whole
   point is the live data is the exception, and an exception is an ADR.

## Stack precedence — highest wins

Never open with the house default. It is the last resort, not the starting
point.

1. **The target repo's existing code.** A real codebase with real conventions
   binds. Adding a second frontend framework to a live app is a decision that
   needs an extraordinary reason and a human saying yes.
2. **`## A-Team Config` in the target's `CLAUDE.md`** — the declared stack.
3. **An explicit constraint in `context.md`** — client mandate, compliance,
   an existing contract with a platform.
4. **`run_brief.purpose`** — `throwaway concept` and `seed of production` pull in
   opposite directions and the same job set can honestly land in different
   places. Say which pull you followed.
5. **House defaults** — `references/house-defaults.md`. Documented so that
   choosing them is a *cited* decision rather than a reflex.

When a lower rule would have chosen differently, the ADR's **Alternatives
considered** says so. That is the whole value of writing it down.

## Who decides, and who ratifies

The board's rule is *"Agent decides, or human picks (HITL)"*. The line:

**You decide** when the answer is already determined — the repo binds it, the
config declares it, or exactly one option survives a constraint. You are
recording, not choosing. Stamp `decided_by: agent`.

**The human ratifies** — always, no judgment call — when the decision:

- costs money, or commits to a paid tier or a vendor;
- forecloses an option that would be expensive to reopen (data model, chain,
  auth provider, hosting lock-in);
- contradicts the target repo or the declared config;
- rests on a `dev-research` finding rated `expensive` or `unknown`;
- picks a v0 data strategy for a job whose value *is* the live data.

Stamp those `decided_by: human` only once they have actually said yes.
Conducted, they go to the grill as one-sentence questions with your
recommendation first — the grill discipline is one question at a time, each
carrying its recommended answer. Unratified at write time is not `active`: it
is `status: parked` plus an open question in `research-plan.md`. **Never stamp a
decision as ratified because it was presented.**

## Process

1. **Read the existing ADRs first.** A settled decision is extended or
   superseded, never re-litigated silently.
2. **Take `dev-research`'s findings whole** — the repo-binding evidence and the
   service constraints. Every ADR you write must rest on one; an ADR with no
   evidence behind it is the failure this pairing exists to prevent.
3. **Walk the four decisions in order**, dropping any the target has settled.
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

No human to ratify a decision that requires ratification: it is **not** written
as `active`. It goes to `context.md`'s `## Awaiting answers` as one question per
heading, the ADR lands `status: parked` holding the draft and its alternatives,
and you halt on that decision — while still writing the ones that genuinely did
not need a human. An escalation is a defined output, not a failure.

Autonomous degrade is forbidden here for the same reason it is forbidden in
discovery: a stack invented unchallenged and written durably becomes ground truth
for every phase after it, and `ateam-spec` will map a design system onto it
without ever asking whether anyone agreed.

## Context rule

Zero project facts embedded in this skill. The house defaults in
`references/house-defaults.md` are **craft defaults, not project facts** — they
carry no client, no product, no repo, and any of the four higher precedence rules
overrides them. Everything else comes from the job set, `context.md`, the target
repo, and `dev-research`.

## Self-check before returning

- Every ADR rests on a named `dev-research` finding or a cited fact in the target
  repo. None rests on preference alone.
- Every ADR has ≥1 real alternative with a real reason it was dropped.
- Every ADR has consequences **and** a revisit-when trigger.
- Precedence was applied top-down, and any lower rule that would have chosen
  differently is named in Alternatives considered.
- Every decision matching the ratification list is `decided_by: human` **and was
  actually answered**, or is `parked` with an open question logged.
- ids are stable; nothing was deleted; supersessions point forward.
- Nothing outside `docs/product/adr/` was written, except the permitted
  `research-plan.md` append.
