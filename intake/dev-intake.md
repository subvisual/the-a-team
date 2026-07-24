# Dev intake bank

*Authored by the Dev role owner — replace and extend these seed questions.
This file is rubric pre-work (locked decision #3): the questions the Dev agent
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
  staging? (Locked decision #14: dev does the v0 deploy.)
- Integrations the prompt implies: which external services/APIs are in play,
  and does anyone have access/credentials — or is mocked data the plan?
  (Locked decision #12: mocked data fit to product context, ideally
  API-shaped.)
- Data sensitivity: does any real data touch the v0, and are there
  PII/compliance constraints on it?
- Are there hard non-functional constraints (auth model, offline, latency)
  that change the architecture even for a prototype?
- What test bar applies to v0 code — the target's full suite, smoke only, or
  none? (A-Team Config carries the test command; this asks what must pass.)
