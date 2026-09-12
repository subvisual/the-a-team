---
name: ticket-writer
description: Use when concrete requirements, bug reports, maintenance needs, or research questions must become structured, implementation-ready delivery tickets; when a larger source (a PRD, spec, epic, or scoped request) needs splitting into multiple cohesive tickets; or when a ticket, story, or issues.md entry already exists and needs testable Gherkin acceptance criteria pasted straight in. In the A-Team pipeline, tickets are for agents and enter via the dev boundary: the issues phase runs this skill's batch decomposition mode over prd.md + spec.md to produce the whole issues.md — tracer-bullet vertical slices in dependency order, each with Gherkin acceptance criteria the runner's independent reviewer judges against. Do not use for writing a full PRD (prd-writer), for planning discovery (discovery-plan), for structuring epics (epics), or for creating or rewriting Jobs to be Done (jobs-to-be-done).
metadata:
  version: 0.2.0
  owner: Alvaro Bezerra
  provenance: ported 2026-07-24 from product-craft ticket-writer (github.com/ABZerra/product-craft) and adapted to the A-Team contract — AC-enricher role in the issues phase, durable job/epic ids, agent-consumable output.
---

# ticket-writer

Produce implementation-ready delivery output: a single ticket, a batch of
tickets decomposed from a larger source, or a pasteable acceptance-criteria
block for a ticket that already exists. Every mode embeds **Gherkin checklist
acceptance criteria**, because criteria a tester — or an implementing agent —
can't verify are the main reason work bounces back.

In the A-Team, **tickets are written for agents first**: the reader who picks
one up cold is a fresh unattended session with no conversation context, and the
independent reviewer that judges its diff has nothing to judge against but the
acceptance criteria written here. Implementation-ready means *agent*-ready — explicit scope, explicit
ACs, explicit dependencies, nothing implied.

## Place in the A-Team pipeline — the decomposition

The issues phase is one step, and it is this skill in **batch decomposition
mode**: `prd.md` + `spec.md` in (with `briefs/` as supporting context), the
whole `docs/features/<slug>/issues.md` out — tracer-bullet vertical slices with
immutable `**ID:** ISS-...` identities and explicit ID dependencies, in dependency order, each carrying Gherkin acceptance criteria sourced from the
PRD's requirement-level ACs (R-ids), the spec's per-state expectations, and the
constraints behind known edge cases, and each stamped with the `[[NN]]` job it
rolls up to.

`references/decomposition.md` carries the slicing method — tracer bullet first,
vertical over horizontal, expand → contract for wide mechanical changes, and the
file shape the runner parses.

**The acceptance criteria are the dev phase's contract, not documentation.** The
runner refuses any issue whose `### Acceptance criteria` section has no checkable
items — it will not hand an unverifiable issue to an implementer, because the
independent reviewer downstream would have nothing to judge the diff against. An
issue that reaches the dev phase without them costs a round trip and surfaces as
a decomposition gap at the next gate.

## Acceptance coverage is a required issues-phase gate

Read `acceptance.json` before decomposition. Its canonical schema and revision
rules are in `../prd-writer/SKILL.md` under **Acceptance obligation ledger**.
`**Requirements:** R-...` metadata links a ticket to requirements; it does not
prove that all their obligations are covered or accepted.

After the ticket sections, add a separate top-level `# Acceptance coverage`
section containing exactly one `acceptance-obligations` fenced JSON array. Carry
every canonical obligation definition exactly, with `requirementId` and
`requirementVersion`, and add one explicit `disposition`:

- `{ "kind": "ticket", "ticketId": "ISS-..." }` maps implementable or validation
  work to a real parsed ticket whose `**Requirements:**` includes that requirement.
- `{ "kind": "outstanding" }` retains work outside the code ticket batch. Its
  pending/blocked/deferred status, accountable owner, evidence, required stage,
  and any authorized deferral remain visible in the canonical ledger.

Example: a requirement needs automated behavior, a rendered review, and a
comparative human study. Code-only tickets may cover the automated obligation;
the other two must survive as explicit outstanding entries. Do not turn them
into code checks, mark the requirement accepted, or invent a study/owner.
A later-stage obligation remains pending until its own evidence or authorized
deferral is recorded. Deferrals require actor, explicit authorization reference,
rationale, consequence, and next decision stage; the writer cannot grant them.

From the A-Team checkout, run the actual read-only gate before reporting the
issues phase complete:

```sh
node runner/src/obligations-cli.mjs issues --feature /absolute/target/docs/features/<slug>
```

Exit `2` blocks advancement: repair every missing/changed obligation field,
unknown ticket mapping, invalid deferral, or version/history error. Exit `0`
permits the issues stage only. Return the JSON report's `pending`, `blocked`,
`deferred`, `unresolvedOwners`, and requirement `accepted` values in the handoff.
Automated tickets passing later still do not certify rendered or human acceptance.
The ordinary ticket parser and Gherkin gate remain mandatory and unchanged.

## Modes

- **Mode 1 — single ticket**: one concrete request in, one
  implementation-ready ticket out.
- **Mode 2 — batch decomposition**: a larger source (PRD, spec, epic, scoped
  request) in, multiple cohesive tickets out with explicit sibling
  dependencies. **This is the pipeline mode** — see `references/decomposition.md`.
- **Mode 3 — AC-only**: an existing ticket/story/issue in, a pasteable Gherkin
  acceptance-criteria block out. Serves tickets that already exist — a
  hand-written GitHub issue the runner refused for want of criteria, or a
  backlog entry being made agent-ready.

## When NOT to use

- A full PRD (`prd-writer`) · discovery planning (`discovery-plan`) · epic
  structuring (`epics`) · defining or sharpening the underlying job
  (`jobs-to-be-done` first, then return).
- Inputs too vague to define a concrete, verifiable ticket — say so and list
  what's missing rather than padding a template.

## Inputs

- Source material: requirements, bug reports, maintenance or research scopes —
  or, for mode 3, the existing ticket/story/issues.md text.
- The context layer when in a target repo: `docs/product/jtbd/` (jobs by id,
  verbatim), `epics/` (the epic a ticket belongs to), the feature's `prd.md`
  (requirement ACs to refine — never copied verbatim) and `spec.md`
  (component states, edge cases).
- Constraints, dependencies, known risks, edge-case notes.
- Optional preferences: owner, priority, component, estimate, due date.
- Connectors (Notion, Figma, Granola, Slack, ops API) if available — material
  a ticket leans on is staged verbatim into `input/<date>-<source>-pulled/`
  per contract. Never block on a connector.

## Workflow

1. **Pick the mode** (above). Mode 3 → skip to step 6.
2. **Determine ticket type** (`feature`, `bug`, `chore`, `spike`) from the
   primary outcome. Templates: `references/ticket_feature_template.md`,
   `ticket_bug_template.md`, `ticket_chore_template.md`. Spikes follow the
   feature shape with research-outcome framing — the Story states the question,
   Scope carries the timebox, and the definition of done is the decision the
   spike enables, not code shipped.
3. **Anchor one primary job per ticket.** `[[NN]]` id + verbatim headline from
   `docs/product/jtbd/` (or upstream text standalone). Unknown or ambiguous →
   `JTBD: TBD`, route to `jobs-to-be-done`; never derive a job inline. A
   ticket solving multiple distinct jobs gets split or its primary named —
   mixed jobs are how scope creep hides in a "single" ticket.
4. **Draft sections in template order**, ACs as checklist items with explicit
   `Given …, when …, then …` phrasing. Dependencies and blockers in their
   dedicated section, never buried in prose.
5. **Batch mode specifics**: one primary outcome and one primary job per
   ticket; sibling dependencies explicit ("blocks" / "depends on"); batch
   ordered so the dependency chain is obvious. Note the epic each ticket
   belongs to (`[[epic:NN]]` — bare `[[NN]]` always cites a job) when epics
   exist. **In-pipeline**, follow `references/decomposition.md`: tracer bullet
   first, vertical slices, and every issue records an immutable `**ID:**`,
   `**Depends on:**` IDs (or `none`), the files it expects to touch, and
   `**Requirements:**` PRD IDs it implements. Preserve IDs on rename or reorder;
   legacy files use the explicit `migrate-issues` command before execution. Continue to step 7.
6. **AC-only mode** (`references/acceptance_criteria_template.md`): parse the
   source into the primary job (preserved, or `TBD`), discrete user outcomes,
   and failure paths. State preconditions; tie edge cases to the constraints
   behind them — edge cases invented without a constraint are noise. Refine
   the PRD's requirement-level ACs downward into per-ticket Gherkin; never
   copy them verbatim (two levels, no duplication). The finished block must
   drop into an `## Acceptance Criteria` / `### Acceptance criteria` section
   without editing.
7. **Quality pass, all modes**: in pipeline batch mode, run the acceptance
   coverage gate above and report its outstanding obligations. Every criterion specific, observable,
   testable — strip "fast", "properly", "works correctly" for observable
   behavior. For each behavioral criterion, make the obligation-to-check map
   recoverable from the ticket: state independent literal/worked expected values,
   the public workflow that exercises them, and any external boundary that may be
   substituted. Preserve the canonical requirement ID/version and source
   authority. Do not weaken a baseline without a versioned authorized decision
   in accepted canonical history; implementation-authored authority is invalid,
   and do not add an implementation-mirroring criterion or a test-count target.
   Low-impact text/styling may name existing checks and rendered evidence instead
   of requiring an artificial new test. Each ticket agent-ready: someone (or something) with zero
   conversation context could pick it up and start.
8. **Close with the handoff**: `Next likely skill(s)` (`jobs-to-be-done` for
   TBD jobs · `epics` when a batch needs structuring · `prd-writer` if
   decomposition exposed a definition gap) · `What to pass forward` ·
   `Suggested next prompts`. In-pipeline: report enrichment stats (issues
   touched, ACs upgraded, gaps flagged) back to the orchestrator.

## No human present

Mode 1 with missing facts: draft with explicit `TBD`s and list the blocking
questions — never invent owners, estimates, or constraints. Mode 2 in-pipeline
is autonomous by design: it decomposes and derives ACs from artifacts the human
already gated (PRD, spec, briefs). When those don't support a testable
criterion, flag the issue in the report rather than writing an untestable one —
an untestable criterion is worse than a missing one, because the dev phase's
gate accepts it and the reviewer then has nothing real to check.

## References & examples

- `references/decomposition.md` — the pipeline decomposition method and the
  `issues.md` shape the runner parses.
- `references/ticket_feature_template.md` · `ticket_bug_template.md` ·
  `ticket_chore_template.md` — the ticket shapes.
- `references/acceptance_criteria_template.md` — the pasteable AC block.
- `examples/example-input.md` · `examples/example-output.md`.
- `examples/issues.md` — synthetic runnable pipeline batch, validated by the real
  local adapter in `runner/test/local-issues.test.mjs`. That required test also
  checks ticket-writer reference files exist.
