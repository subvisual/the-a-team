# Design intake bank

*Authored by the Design role owner — replace and extend these questions. This
file is rubric pre-work (a locked decision): the questions the Design agent
wishes had been asked before it starts. The design-briefing clusters below are
migrated from the `teach-impeccable` skill (Impeccable design suite), adapted
to the A-Team: answers land in `context.md`'s `## Design context` section —
there is no `.impeccable.md` in the A-Team.*

The discovery grill **never asks these raw**. Each entry seeds the
`context.md` Know/Don't-Know ledger tagged `[design]`, then routes by
answerability (see CONTRACT.md): blocking + human-answerable → asked in the
grill · blocking but not answerable by this human → research activity in
`research-plan.md` · non-blocking → stays in the ledger.

**Explore before asking** (the briefing's own rule, same as ours): scan the
target first — design tokens / CSS variables, brand assets, existing
components and their patterns, README audience statements, any style guide.
A question the codebase already answers is never asked; it enters the ledger
as a Know with its source.

**Ask once, then deltas**: the design briefing is durable context. The first
discovery run on a project captures it; later runs only ask what changed or
was left TBD.

## Design briefing (migrated from teach-impeccable)

### Users & purpose
- Who uses this, and in what context? (Cross-check against the JTBD set —
  jobs carry the situation; don't re-ask what a job already states.)
- What emotions should the interface evoke — confidence, delight, calm,
  urgency?

### Brand & personality
- The brand personality in 3 words?
- Reference sites or apps that capture the right feel — and what specifically
  about them?
- What should this explicitly NOT look like? Anti-references matter as much
  as references.

### Aesthetic preferences
- Strong preferences for visual direction? (minimal, bold, elegant, playful,
  technical, organic…)
- Light mode, dark mode, or both?
- Colors that must be used or avoided?
- Is there a brand color already locked — a hex, a hue, or a brand whose
  color to match? (The palette generator's seed; without one, the design
  phase ships a TBD-draft and a blocking flag.)

### Typography & density
*(Sourced from the design-system skill's own interview — the questions its
pipeline mode wishes the grill had asked. Feel-questions, not font-questions.)*
- What should reading this product feel like — a dense professional tool, a
  steady default, something calm and editorial, or airy and spacious? (Maps
  to the type-scale presets: Compact / Balanced / Relaxed / Spacious.)
- Character of the letterforms: sans-serif (default), serif, monospace, or
  display? (Specimen category only — the concrete font is a later decision.)

### Accessibility & inclusion
- Specific accessibility requirements? (WCAG level, known user needs)
- Reduced motion, color blindness, or other accommodations to design for?

## Pipeline questions (A-Team specific)

- Does the target project have a design system / component library, and where
  does it live? (A-Team Config carries the path; this asks whether it's real
  and current.)
- What fidelity is expected of the design phase output for THIS run — flows
  only, lo-fi, or hi-fi direction? (Cross-check with `run_brief.fidelity`.)
- Are there existing screens/patterns this feature must feel consistent with?
- Who decides between design options at the design gate — and if nobody will
  be present, may the agent self-select (record it as a provisional call)?

## Declared defaults

*Owned by the Design role owner — fill and maintain. This heading is required
by CONTRACT.md; its contents are not the PM's to author.*

The **team-level** design defaults. Discovery reads them so that a question
already answered by a standing team decision is never put to the human: a
default that applies is **applied openly** — recorded as a confidence-stamped
assumption in `research-plan.md` and surfaced at the gate — rather than
asked. Precedence: **project binding > team default > ask.** A project
binding (the target already has a component library, or A-Team Config names
one) always wins.

- Component library — **shadcn/ui** — does not apply when the target already
  has a component library or `## A-Team Config` names another. The spec
  phase's design-system mapping resolves against it; dev installs components
  on demand (`npx shadcn add`). *(Design team decision, 2026-08-11.)*


- Web accessibility target — **WCAG 2.2 AA**, unless the project binds a different
  target through `accessibilityTarget`. Record the chosen target and any known
  user needs. Bounded automation plus keyboard/focus interaction supplies partial
  evidence; full conformance and human usability require separate evidence.
- Running-code review — preserve applicable accepted design/spec obligations,
  declare required route/fixture/state/viewport coverage, and bind a rendered plan
  before implementation (`runner/RENDERED-REVIEW.md`). Include primary journey,
  empty/loading/error/populated states, long content, actual scrolling and sticky
  behavior. Pending evidence and authorized dispositions stay visible.

## Where the answers land

The briefing's synthesis is written by discovery into `context.md` under
`## Design context` (canonical shape in the context template): **Users &
emotional goals** · **Brand personality** (3 words, voice) · **Aesthetic
direction** (references, anti-references, theme, color constraints, brand
seed) · **Typography & density** (specimen category, scale-preset feel) ·
**Accessibility** · **Design principles** (3–5, derived from the answers —
these guide every design decision downstream). The design phase reads this
section as its floor alongside the JTBD set; unanswered entries become
derived calls or TBDs there, never mid-phase questions.
