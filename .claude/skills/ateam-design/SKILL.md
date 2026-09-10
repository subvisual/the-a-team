---
name: ateam-design
description: Use when the A-Team orchestrator invokes the design phase for a feature, or when a human runs design standalone over an existing docs/product/ North Star. The 📝 draft + review phase skill — conducts the ported Design skills (design-system → build-lofi) into one design set: durable tokens at docs/product/design-system/ (create-once), design.md with a Screens & flows section and options-with-reasoning, and a navigable greyscale lofi with runtime-swappable variants under docs/features/<slug>/lofi/. Never interrogates — derives from context.md's ## Design context, drafts with visible TBDs, and reports blocking flags loudly for the gate tripwire. Implemented against CONTRACT.md.
metadata:
  version: 0.1.0
  owner: Design (implemented on their behalf — every design opinion traces to the ported subvisual/harness skills; the conductor is machinery, not taste)
  provenance: authored 2026-08-11 against CONTRACT.md, replacing the wiring stub. Conducts design-system and build-lofi, both ported from subvisual/harness @ 940c86631660 with the design-lead guideline content preserved verbatim.
---

# ateam-design

The design draft. You are a **conductor**: the craft lives in the ported
skills — `design-system`, `build-lofi` — you sequence them into **one
coherent design set** with one honest gate report at the end. You are also
**pure craft**: zero project facts; everything project-specific comes from
`docs/product/`, the manifest, and the target repo. Every *aesthetic* opinion
comes from the ported skills' guidelines or from `## Design context` — never
from you.

Interaction mode: 📝 **draft + review** — you do **not** interrogate. Missing
design inputs become visible `TBD`s and derived calls, never invented taste
and never mid-phase questions; the design gate is where the human corrects
you. The A-Team aims for one HITL moment (the discovery grill) — your job is
to be reviewable, not to be interactive.

**Load discipline — conduct lazily.** Load each craft skill at the movement
that needs it. `generate-scale.mjs` does the token math; never hand-compute
scales or contrast.

## Contract (CONTRACT.md is authoritative)

- **Reads — required floor**: `docs/product/context.md` (its `## Design
  context` is your briefing: users & emotional goals, brand personality,
  aesthetic direction, accessibility, design principles; its `## Technical
  context` is settled fact), every file in `docs/product/jtbd/`, **and
  `research-plan.md`'s technical assumptions + open questions** — required,
  not enrichment: jobs cite technical findings rather than restating them, so
  skipping it means designing past a constraint the dev review already
  surfaced.
- **Reads — optional enrichment**: `prd.md` and `briefs/` (consume when
  present; the phase must run without them); the target repo (existing
  screens, design system per A-Team Config's `design system path`); the
  manifest (`prompt`, `run_brief.fidelity`, `gate_policy`).
- **Writes**:
  - `docs/product/design-system/` — `scale.ts`, `palette.ts`,
    `shadcn-theme.css`. **Durable**: create-once, gate-reviewed, never
    silently overwritten (the `design-system` skill owns the semantics).
  - `design.md` in the feature directory — Screens & flows, visual approach,
    options considered with reasoning, derived calls.
  - `docs/features/<slug>/lofi/` — the throwaway prototype (`build-lofi`
    owns the engine).
  - Appends to `research-plan.md`'s `## Assumptions` / `## Open questions`
    (the contract's standing exception), tagged `· [design phase]` with
    confidence.
- **Done-signal**: successful transition CLI `complete` result — nothing else in
  the manifest. The orchestrator flips it to `approved` at the gate.
- **Manifest-optional**: absent → prompt from invocation args, skip manifest
  writes, and the in-conversation review replaces the orchestrator gate.
  Standalone is never a weaker-review path — durable token writes still get
  a read-back.

## The movement sequence

### 0. Ground

Read the required floor. Active jobs are the North Star; `## Design context`
is the briefing the grill captured for you; `## Technical context` +
research-plan's technical assumptions are constraints (a v0 that must run on
the client's design system, an offline requirement that changes layout — you
design inside them, you don't rediscover them). Read the target repo lightly:
existing tokens, components, patterns this feature must feel consistent with.
**Consume jobs verbatim by id — never mint, reword, or paraphrase a job.**

If `docs/product/jtbd/` has no active jobs, stop: leave `status` as
`in_progress` and report that discovery must run first. A design without a
North Star is decoration.

### 1. Tokens (conduct `design-system`, pipeline mode)

Create-once check first: existing `docs/product/design-system/` or a real
system at A-Team Config's path → **consume, don't regenerate**; note any
contradiction with `## Design context` as a gate flag. Otherwise generate per
the skill's derivation table: typography preset from the briefing (variants
when derived), palette from the brand seed or the briefing's vibe fields,
WCAG nudge loop, the shadcn bridge. No seed anywhere → the skill's
**TBD-draft** (neutral + semantics + typography, brand `TBD`) and a
**blocking flag** — never an invented brand.

### 2. Screens & flows (into `design.md`)

The lofi's only input, so it exists in both paths:

- **`briefs/` present** → derive from the wireflow: its screens, purposes,
  and stable graph IDs, conditions and transitions, cited. You may diverge where design craft says
  the flow reads wrong on a screen — every divergence is an explicit call in
  `## Derived calls`, with reasoning, never a silent re-decision.
- **`briefs/` absent** → draft from the JTBDs (+ `prd.md` if present): the
  screens each job's progress needs, purposes phrased as what the user does
  there, a proposed stable-ID graph per job. Mark the section
  `derived without briefs` — the gate reviews it as a proposal.

Keep `## Screens & flows` readable, but carry the complete executable handoff in
one top-level `flow-contract` JSON fence. Compile it from the current wireflow and
a feature-local prototype scenario using `<harness>/runner/PROTOTYPES.md`.
Preserve every node/page/edge ID, condition and transition; never reconstruct
navigation from display names. Choose `navigation` or `interactive` fidelity
explicitly according to the obligations being assessed. Branching validation and
recovery require interactive local fixtures; navigation sketches remain useful
with those capabilities explicitly unverified.

### 3. Lofi (conduct `build-lofi`, pipeline mode)

`run_brief.fidelity` calibrates depth (`flows` → skeletons; `lofi` → full
mock content + variants; `hifi-direction` → recommended palette preloaded).
`JOURNEY.md` derives from the jobs' Context sections, cited by id.
Ambiguities resolve conservatively and land in the report; >3 ambiguous
screens is a gate flag. The lint must pass — fix leaks, never bypass.

### 4. Assemble `design.md`

```markdown
# Design — <slug>

## Screens & flows        # movement 2's output — the lofi's input
## Visual approach        # tokens chosen and why: preset, seed hues, principles applied;
                          #   cites docs/product/design-system/ — never restates values
## Options considered     # each scale/palette variant: what it argues, why it exists,
                          #   which is recommended and why the others were dropped;
                          #   the lofi's comparison URLs (?scale= / ?palette=)
## Derived calls & flags  # every derivation the briefing didn't settle, wireflow
                          #   divergences, ambiguity resolutions — the gate reads this first
## Lofi                   # path, dev command, screen count, variant URLs
## Revision notes         # only on a revise loop — what changed and why
```

**Diverge by default**: `## Options considered` presents real, clickable
alternatives (the variants), not prose about alternatives. Under a non-block
`gate_policy`, self-select the recommended variant **only if** the design
bank's self-select consent was captured at the grill — recorded as a
provisional call in `research-plan.md`; otherwise the choice stays open for
the returning human.

### 5. Assumption ledger (the independence promise)

Append every assumption this phase made to `research-plan.md` — `[design
phase]`-tagged, each with confidence and cheapest probe: derived typography
preset, derived seed hues, ambiguity resolutions, the dark-mode and
`--radius` open items from the shadcn bridge. An assumption that lives only
in your report is a broken promise to the absent human.

### 6. Commit & manifest

Commit per craft with breadcrumb messages (`docs(design-system): tokens —
Balanced/16, brand 240° from briefing seed`, `docs(<slug>): design — screens
& flows from wireflow, 2 palette variants`). Artifact commits stage both
layers; never sweep artifacts into a chore commit. Manifest present: call
the completion command below.

### 7. Gate report (what the tripwire reads)

Return, as distinct sections: **produced** (tokens, design.md, lofi + variant
URLs), **riskiest calls** (variant recommendation, screen draft when briefs
were absent, wireflow divergences), **where assumptions landed** in
research-plan.md, and — separately and honestly — **blocking flags**: no
brand seed (TBD-draft ran), token/briefing contradictions, >3 ambiguous
screens, lint failures you could not fix, a missing North Star. Provisional
gate passage depends on this list; an empty list is a claim you are
accountable for, not a default.

## Re-invocation (revise / resume)

Idempotent. `design.md` is overwritten cleanly; the lofi revises through
`build-lofi regen <screen>` mapped from the human's notes (layout-level notes
→ full regenerate, say so). Durable tokens follow `design-system`'s rules:
edits are deltas to the source files, regeneration only on an explicit
instruction in the revision notes — a revise note about screens never
triggers a token rewrite.

## No human present

You are draft + review — the absent human is the normal case, and the gate
reviews you. Missing design inputs become TBDs, derived calls, and flags per
the movements above. What you must **never** do: invent a brand seed to look
finished, mint or reword a job, silently regenerate durable tokens, or ship
a lint bypass. The one hard stop is a missing North Star (movement 0).

## Self-check before returning

- Required floor actually read — including research-plan's technical
  assumptions; no design call contradicts `## Technical context`.
- Tokens: create-once respected; WCAG checks ran (palette + shadcn bridge
  pairs); TBD-draft honest if seedless; no raw hex without OKLCH source.
- `## Screens & flows` validates: every flow reference exact-matches a
  screen; derivation source (wireflow vs JTBDs) stated. Stable flow contracts match
  the actual wireflow and generated data under `prototype-cli.mjs validate`.
- Lofi: lint passes; sentinel touched; JOURNEY.md cites job ids; variant CSS
  actually mounted (URLs listed); fidelity honored.
- Every derived call is in `## Derived calls & flags` AND
  `research-plan.md` — not just one.
- Manifest (if present): completion command returned success; no direct manifest assignments.
- The gate report's blocking-flags list is complete and honest.

## Deterministic completion

When a feature manifest exists, the orchestrator calls `feature-cli.mjs start`
before invoking this skill. After writing the artifacts and collecting the
report, read `node <harness>/runner/src/feature-cli.mjs show --feature <feature-dir>`
and call the following with that manifest revision and one stable event ID for
this completion attempt. Reuse the same ID only to replay the identical operation
after interruption; changed inputs require a new ID.

```sh
node <harness>/runner/src/feature-cli.mjs complete --feature <feature-dir> --expected-revision <revision> --event-id <completion-id> --input '{"phase":"design","artifacts":["design.md"],"blocking_flags":[]}'
```

Replace `blocking_flags` with the actual concrete flags from the report. Success
is the done signal; `blocked` retains the reason and requires its resolution.
The command validates actual stage obligations and binds artifact revisions.
Do not edit phase status, approval, attempts, milestones, or state by hand.
Standalone artifact work without a manifest does not create one.

The completion command automatically binds `design.md`, the entire existing
`lofi/` output tree (screens, styles, variants, assets and rendered output), and
the actual token source selected by A-Team Config's `design system path`. When
there is no configured target source, it binds the existing durable
`docs/product/design-system/` tree. The gate approves those exact bytes; changing
a screen or accepted token afterward makes design stale and blocks spec until
revalidation. Mutable context and research-plan prose are not design bindings.

## Rendered implementation obligations

Preserve accepted design obligations as `rendered-review` entries in the
acceptance ledger, mapped to the current-context design source's `obligationIds`.
Before implementation, bind a declarative rendered plan through the project's
`renderedReview` configuration. Cover the primary journey; empty, loading, error
and populated states; long content; keyboard/focus; relevant narrow/wide
viewports; actual scrolling and sticky behavior. Missing required coverage stays
explicitly pending. Use an authorized ledger deferral for a deliberate disposition,
never a generated green status. Default web target is WCAG 2.2 AA unless the
project binds another target.

Follow `runner/RENDERED-REVIEW.md` for the plan and evidence contract. Review the
running implementation at the exact verified SHA against accepted tokens and
layout intent: component/class correspondence alone cannot pass a computed token,
clipping, focus, retry or layout discrepancy. Use bounded automation plus actual
interaction. Record SHA, route, fixture, viewport, screenshot, observed result and
obligation. Keep the existing independent reviewer seam and component library;
this stage does not authorize a wholesale redesign. Retain bounded iteration
history and the best evidenced candidate under its original SHA. Agent critique
and automated accessibility checks never satisfy a human usability study or claim
full accessibility conformance.
