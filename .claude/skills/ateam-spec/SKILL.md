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
- **Done-signal**: set `phases.spec.status = "complete"`. No gate; the
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
  is what `prd-to-issues` lifts into setup work. Empty under a full project
  binding; say so rather than omitting the section.
- **`## Design-system gaps`** — token gaps, `custom:` components, `TBD`
  resolutions: everything the mapping could not settle, mirrored into the
  phase report.

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
   and set **only** `phases.spec.status = "complete"` when a manifest exists.
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
- Every component resolves to a library name, a declared composite, or a
  flagged `custom:` — nothing unresolved and unflagged.
- All four states present (or explicitly `n/a`-with-reason) per component.
- Zero raw px/hex: grep the file for `px`, `#[0-9a-f]`, `rgb(`, `oklch(`
  literals — hits are either token names or defects; fix or flag.
- `## Components to install` matches the union of shadcn resolutions.
- `[spec phase]` assumptions landed in research-plan.md.
- Manifest (if present): own status `complete`, nothing else touched.
- The phase report's flag list matches `## Design-system gaps` exactly.
