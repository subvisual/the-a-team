# Dev intake bank

*Authored by the Dev role owner — replace and extend these seed questions.
This file is rubric pre-work (a locked decision): the questions the Dev agent
wishes had been asked before it starts.*

The discovery grill **never asks these raw**. Each entry seeds the
`context.md` Know/Don't-Know ledger tagged `[dev]`, then routes by
answerability (see CONTRACT.md): blocking + human-answerable → asked in the
grill · blocking but not answerable by this human → research activity in
`research-plan.md` · non-blocking → stays in the ledger.

**The dev review answers several of these outright.** `dev-research` — the
skill discovery dispatches at that movement — sweeps the target repo and the
implied services before the grill, so a question like "which integrations are in
play" or "does the repo bind the stack" should reach the human already answered,
or not at all. What survives the sweep is what genuinely needs a person, and
that is the version of the question worth asking. Entries that turn into
*decisions* rather than facts belong to `architecture`, which records them as
ADRs under `docs/product/adr/`.

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
- For each behavioral obligation, what accepted literal or worked example fixes
  the expected value, which public workflow must exercise it, and which external
  boundaries may be substituted? If the answer exists in current authority,
  carry its source ID/revision instead of asking the human again.
- Does any proposed check weaken a baseline expectation? A changed expectation
  needs a new positive requirement version and an explicit authorized decision
  in accepted canonical history. An implementation cannot write its own authority
  or make its output the oracle.

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

Source: the A-Team board (17 Jul session), Dev lane — *"Techstack default,
unless specified"* — plus its HMW working answer on v0 data. These are standing
team decisions, not aspirations; each names when it does not apply.

| Area | The default | When it does not apply |
|---|---|---|
| Frontend | **React + Tailwind** | A project binding says otherwise. Tailwind is also the downstream design-system assumption — `ateam-spec` maps to tokens, never raw px/hex. |
| Backend | **Elixir** | No job needs a backend (see below), or a project binding says otherwise. |
| Quick visual prototype | **Astro-style static** | The v0's purpose is not visual review — `context.md` indicates server-side or genuinely complex behavior. The carve-out is about *audience*, not size. |
| Infrastructure | **Local-first for v0** | The run brief's deploy answer asks for a shared link or real staging. |
| v0 data | **Mocked, API-shaped** | A job's whole value *is* the live data — then it is an `architecture` decision, ratified by the human. |

**Defaults answer "which", never "whether".** If no job needs a backend, the
default backend is not a reason to have one. Shape follows the jobs.

There is no team test-count target. A low-impact text or styling correction may
use existing checks and rendered evidence when those cover the accepted result;
do not add an assertion that merely mirrors the implementation.

**A default is not a ratification.** Applying one still records a
confidence-stamped assumption in `research-plan.md`, surfaced at the definition
gate — and a decision on `architecture`'s ratification list still needs the
human, cheap and defaulted though it may be.
