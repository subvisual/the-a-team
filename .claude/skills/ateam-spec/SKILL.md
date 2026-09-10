---
name: ateam-spec
description: Use when the A-Team orchestrator invokes the design-spec phase for a feature, or when a human runs it standalone over an approved design.md — produces spec.md, the dev-facing contract: component breakdown per screen, every state (empty/loading/error/populated), responsive behavior, interactions and edge cases, and the design-system mapping that resolves every piece to real component names (the target's own library, or shadcn/ui registry names under the declared default) and token role variables — no raw px/hex. 🚀 autonomous: no gate, no questions; gaps become TBDs and flags in the phase report. Do not use for visual direction (ateam-design), for writing tickets (the issues phase), or to install or write any code — spec names, dev installs.
metadata:
  version: 0.1.0
  owner: Design (implemented on their behalf — the mapping vocabulary comes from the design team's choices: the ported design-system tokens and the shadcn/ui declared default)
  provenance: authored 2026-08-11 against CONTRACT.md, replacing the wiring stub. No upstream source exists for a spec skill; the content list is CONTRACT.md's, the component vocabulary is the design team's.
---

# ateam-spec

The dev-facing contract. `design.md` says what the screens are and how they
should feel; `spec.md` says exactly what dev builds — component by component,
state by state, every piece resolved against the design system. This is what
makes dev output production-grade instead of bespoke. You are **pure craft**:
zero project facts; everything comes from the feature artifacts,
`docs/product/`, and the target repo.

Interaction mode: 🚀 **autonomous** — no gate, no questions, no human in the
loop. A gap you cannot resolve from the inputs becomes a visible `TBD` plus
an entry in the phase report — never an invented answer, never a stall.

## Contract (CONTRACT.md is authoritative)

- **Reads**: `prd.md`, `design.md` (its `## Screens & flows` is your
  coverage checklist), the lofi (what the wireframes actually show),
  `docs/product/**` (`design-system/` tokens + `shadcn-theme.css`, jtbd for
  job language, research-plan.md for live constraints), the target repo's
  design system (resolution order below), the harness `intake/`
  `design-intake.md` `## Declared defaults`.
- **Writes**: `spec.md` in the feature directory — nothing else, ever. Plus
  the standing exception: appends to `research-plan.md`'s `## Assumptions` /
  `## Open questions`, tagged `· [spec phase]` with confidence.
- **Done-signal**: successful transition CLI `complete` result. No gate; the
  orchestrator advances automatically.
- **Manifest-optional**: absent → inputs from invocation args, skip manifest
  writes. Same output either way.

## Component-library resolution — binding > default > TBD

1. **Project binding**: the target already has a component library (A-Team
   Config's `design system path`, a `components.json`, an existing
   `components/ui/`, a design-system package). It wins — map to *its*
   component names and *its* tokens.
2. **Declared default**: no library in the target → **shadcn/ui**
   (design-intake `## Declared defaults`, Design-owned). Map to shadcn
   registry names. Record the applied default as a confidence-stamped
   assumption in `research-plan.md` — applied openly, not silently.
3. **Neither resolvable** (config contradicts the repo, two libraries in
   use): map against the best evidence, mark the resolution `TBD`, and flag
   it in the phase report.

## spec.md — required content

One section per screen in `design.md`'s `## Screens & flows` (full coverage,
no screen skipped), each containing:

- **Component breakdown** — the pieces that compose the screen, hierarchy
  noted where it matters.
- **Per component**:
  - **Resolution**: the library component it maps to — a shadcn registry
    name (`button`, `card`, `dialog`, `table`, `form`…) or the target
    library's component. A piece no primitive covers is first specced as a
    **composite** of primitives (say which); only a truly bespoke component
    gets `custom:` — and every `custom:` is a **loud flag** in the phase
    report, since bespoke is the exception this mapping exists to prevent.
  - **All four states**: empty / loading / error / populated — what each
    shows, using token role vars for any visual note. A component where a
    state genuinely cannot occur says so explicitly (`empty: n/a — list is
    seeded`), never silently omits it.
  - **Tokens**: colors as role vars (`--primary`, `--muted`…) or scale steps
    (`brand-600`), spacing/type from `scale.ts` names (`m`, `h2`). **No raw
    px/hex anywhere in the file** — if a value has no token, that is a token
    gap: note it, flag it, don't inline it.
- **Responsive behavior** — what reflows, collapses, or hides at which
  breakpoint; mobile-first unless the target says otherwise.
- **Interactions & edge cases** — hover/focus/disabled, validation, long
  content, zero-data vs first-run, error recovery paths. Accessibility notes
  where the briefing's `## Design context` sets a bar.

Closing sections:

- **`## Components to install`** — the deduplicated list dev needs
  (`npx shadcn add button card dialog …` under the default; the target's own
  instructions under a binding). Spec *names*, dev *installs* — this section
  is what the issues phase lifts into setup work. Empty under a full project
  binding; say so rather than omitting the section.
- **`## Design-system gaps`** — token gaps, `custom:` components, `TBD`
  resolutions: everything the mapping could not settle, mirrored into the
  phase report.

## Preserve acceptance obligations

Read `acceptance.json` with the PRD. The canonical schema is defined in
`../prd-writer/SKILL.md` under **Acceptance obligation ledger**. Include one
`acceptance-obligations` fenced JSON array in `spec.md`, copying every canonical
obligation definition with its `requirementId` and `requirementVersion` exactly.
Carry product, design, and engineering obligations through the spec, including
human studies and rendered reviews that development cannot complete. Keep
performance benchmark workload, units, threshold, method, scope, and version.

The spec describes implementation detail without weakening the source criterion.
Do not change IDs, requirement versions, acceptance stages, owners, or benchmark
values while decomposing. A needed change is a visible definition gap routed to
prd-writer for an authorized versioned decision; then refresh the snapshot. The
spec writes its own snapshot only, never the canonical ledger or evidence.

For every automated behavioral obligation, retain enough test intent for the
independent reviewer to build a concise obligation-to-check map: accepted literal
or worked expected values, the public workflow to exercise, and the external
boundaries that may be substituted. Do not derive expected values from component
implementation details. Status semantics that require redundant text, glyph and
color must name all three. Low-impact text/styling can point to existing checks
and rendered evidence; never introduce a test-count quota.

## Workflow

1. **Ground**: read `design.md` (screens, chosen variant, derived calls),
   the tokens (`scale.ts`, `palette.ts`, `shadcn-theme.css` — if the design
   phase shipped a TBD-draft, brand-dependent notes stay TBD and are
   flagged), `prd.md`'s requirements for behavior ACs, the lofi for what the
   screens actually contain, research-plan.md for constraints the dev review
   surfaced.
2. **Resolve the library** (order above). State the resolution and its
   source at the top of `spec.md`.
3. **Spec each screen** per the content list — walk the lofi screen by
   screen so no visible element goes unspecced.
4. **Dedupe into `## Components to install`** and collect
   `## Design-system gaps`.
5. **Append assumptions** to `research-plan.md`, `· [spec phase]`-tagged
   with confidence (the applied default, any conservative state/interaction
   call).
6. **Commit** (`docs(<slug>): spec — N screens, M components, K to install`)
   and call the completion command below when a manifest exists.
7. **Phase report**: produced · library resolution and why · flags
   (`custom:` components, token gaps, TBD resolutions, states inherited from
   a TBD-draft) — distinct list, honest; the orchestrator's tripwire reads
   it. No gate does not mean no accountability.

## Re-invocation (revise / resume)

Idempotent: `spec.md` is overwritten cleanly, never appended twice. If
`design.md` changed since the last run (sentinel: compare mtimes), re-derive
from scratch rather than patching — a spec that drifts from its design is
worse than a rebuilt one.

## No human present

The normal case — this phase is autonomous by contract. The discipline:
resolve from evidence, apply declared defaults openly, mark everything else
`TBD` + flag. **Never** invent a component the library doesn't have, inline
a raw value to avoid naming a token gap, or skip a state to look complete.
Hard stops (leave `status` as `in_progress`, report loudly): `design.md`
missing or without a parseable `## Screens & flows`; no
`docs/product/design-system/` and no target design system at all — spec
without any token vocabulary would be prose, not a contract.

## Self-check before returning

- Every screen in `design.md`'s `## Screens & flows` has a spec section.
- The spec snapshot retains all canonical acceptance obligations without changed
  methods, stages, owners, or benchmark definitions; unresolved work stays visible.
- Every component resolves to a library name, a declared composite, or a
  flagged `custom:` — nothing unresolved and unflagged.
- All four states present (or explicitly `n/a`-with-reason) per component.
- Zero raw px/hex: grep the file for `px`, `#[0-9a-f]`, `rgb(`, `oklch(`
  literals — hits are either token names or defects; fix or flag.
- `## Components to install` matches the union of shadcn resolutions.
- `[spec phase]` assumptions landed in research-plan.md.
- Manifest (if present): completion command returned success; no direct manifest assignments.
- The phase report's flag list matches `## Design-system gaps` exactly.

## Deterministic completion

When a feature manifest exists, the orchestrator calls `feature-cli.mjs start`
before invoking this skill. After writing the artifacts and collecting the
report, read `node <harness>/runner/src/feature-cli.mjs show --feature <feature-dir>`
and call the following with that manifest revision and one stable event ID for
this completion attempt. Reuse the same ID only to replay the identical operation
after interruption; changed inputs require a new ID.

```sh
node <harness>/runner/src/feature-cli.mjs complete --feature <feature-dir> --expected-revision <revision> --event-id <completion-id> --input '{"phase":"spec","artifacts":["spec.md"],"blocking_flags":[]}'
```

Replace `blocking_flags` with the actual concrete flags from the report. Success
is the done signal; `blocked` retains the reason and requires its resolution.
The command validates actual stage obligations and binds artifact revisions.
Do not edit phase status, approval, attempts, milestones, or state by hand.
Standalone artifact work without a manifest does not create one.

## Executable component declarations

In addition to the narrative screen specification, emit exactly one top-level
`component-states` JSON fence using `<harness>/runner/ARTIFACTS.md`. Declare stable
component IDs, page IDs, canonical requirement/obligation IDs, and empty/loading/
error/populated behavior for every component. A non-applicable state needs a
concrete reason. Every page has a component declaration; a prose mention alone
cannot satisfy this gate. Run strict feature artifact validation at `--stage spec`
before completion. This checks declared criteria, without claiming future human
studies have occurred.

Preserve the exact accepted `flow-contract` JSON fence from design.md in spec.md.
Run `prototype-cli.mjs validate --stage spec` as documented in
`<harness>/runner/PROTOTYPES.md`. Component behavior refers to these node/page/edge
IDs; navigation-only observations cannot satisfy validation or recovery criteria.

## Running-code design verification

Carry every applicable accepted design obligation into the implementation spec
and its declarative rendered plan (`runner/RENDERED-REVIEW.md`). Pin the plan before
implementation through A-Team Config `renderedReview`. Include the required
obligation/state/viewport matrix, literal expected computed tokens and public
interaction outcomes, primary journey, long content, keyboard/focus, scrolling,
sticky positioning and failure/retry recovery. Required states without evidence
remain pending; authorized ledger deferrals remain decisions rather than passes.
The supervisor pins accepted base authority so an implementation cannot waive
its own rendered checks. Rendered evidence must refer to running code at the
verified SHA and retain screenshots plus machine observations; historical evidence
cannot be relabeled current. WCAG 2.2 AA is the default web target, adjustable by
project binding. Bounded automated checks and agent critique leave full
accessibility conformance and human usability unverified.
