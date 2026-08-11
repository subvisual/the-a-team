# Dev intake bank

*Authored by the Dev role owner — replace and extend these seed questions.
This file is rubric pre-work (a locked decision): the questions the Dev agent
wishes had been asked before it starts.*

The discovery grill **never asks these raw**. Each entry seeds the
`context.md` Know/Don't-Know ledger tagged `[dev]`, then routes by
answerability (see CONTRACT.md): blocking + human-answerable → asked in the
grill · blocking but not answerable by this human → research activity in
`research-plan.md` · non-blocking → stays in the ledger.

## Seed questions

- Stack: does the target project's stack bind the v0, or is the default
  fast-prototype stack fine? (A-Team Config carries the declared stack; this
  asks whether the v0 must use it.)
- Deploy target for the v0 — local only, shared link, or the project's real
  staging? (Locked decision: dev does the v0 deploy.)
- Integrations the prompt implies: which external services/APIs are in play,
  and does anyone have access/credentials — or is mocked data the plan?
  (Locked decision: mocked data fit to product context, ideally
  API-shaped.)
- Data sensitivity: does any real data touch the v0, and are there
  PII/compliance constraints on it?
- Are there hard non-functional constraints (auth model, offline, latency)
  that change the architecture even for a prototype?
- What test bar applies to v0 code — the target's full suite, smoke only, or
  none? (A-Team Config carries the test command; this asks what must pass.)

## Declared defaults

*Owned by the Dev role owner — fill and maintain. This heading is required by
CONTRACT.md; its contents are not the PM's to author.*

The **team-level** technical defaults for a v0. Discovery reads them so that a
question already answered by a standing team decision is never put to the
human: a default that applies is **applied openly** — recorded as a
confidence-stamped assumption in `research-plan.md` and surfaced at the
definition gate — rather than asked.

Precedence: **project binding > team default > ask.** A project binding is a
fact in the target's `## A-Team Config` or `context.md`'s `## Technical
context`; it always wins. A *project-level* defaults layer (per-client standing
choices) is deliberately deferred until the A-Team runs on live projects.

A default only belongs here if it is a real standing decision. An entry nobody
has agreed to is worse than an absent one: it converts an open question into a
silent assumption.

<!-- Fill in. Shape, one line each: area — the default — when it does not apply. -->

