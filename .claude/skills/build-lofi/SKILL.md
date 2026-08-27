---
name: build-lofi
description: Use when a feature's screens and flows are drafted and the design phase needs a navigable wireframe — a multi-screen greyscale Astro prototype where buttons and links actually work, suitable for the design gate and moderated user testing. In the A-Team pipeline it is conducted by ateam-design and consumes design.md's ## Screens & flows section, writing the throwaway prototype to docs/features/<slug>/lofi/. Triggered standalone by "build the lo-fi", "scaffold the wireframe", "make the prototype clickable", or "let's user-test the flow". Subcommands: `regen <screen>` (surgical single-screen rebuild — also the REVISE mechanic at the design gate) and `debrief` (standalone-only post-user-test interview, staged as an input/ evidence batch). Do not use for ad-hoc design exploration without drafted screens, or for hi-fi production UI — that is downstream of spec.md and belongs to the dev phase.
metadata:
  version: 0.1.0
  owner: Design (implemented on their behalf; every design opinion traces to the upstream skill)
  provenance: ported 2026-08-11 from subvisual/harness skills/design/build-lofi @ 940c86631660. The greyscale discipline, engine mechanics (templates, sentinel, lint, regen idempotence, debrief walk) are preserved; adaptations — input is design.md's ## Screens & flows instead of docs/design/ia.md, output lands per-feature, JOURNEY.md derives from JTBDs in pipeline mode, the lint is hardened to token-vars-only, variants mount at runtime, and debrief notes become an evidence batch — are marked A-Team where they touch mechanics.
---

# build-lofi

Generate a navigable greyscale Astro wireframe at `docs/features/<slug>/lofi/`
from `design.md`'s `## Screens & flows` section. Wires `<a>` links per flow,
enforces no-color via a lint step, and supports two follow-up modes:

- `build-lofi regen <screen>` — regenerate one screen idempotently.
- `build-lofi debrief` — post-user-test interview (standalone-only), staged
  as an evidence batch.

The lofi is a **throwaway visual reference** (CONTRACT.md): never production
code, never shipped. Dev builds the real UI from `spec.md` against the design
system.

## Modes

- **Pipeline** — conducted by `ateam-design`. Never asks a question: the
  screen list is `design.md`'s `## Screens & flows` (the conductor guarantees
  it exists), mock state derives from the JTBDs, ambiguities become flags in
  the phase report instead of interactive prompts.
- **Standalone** — a human invoked it directly. The upstream interactive
  behavior applies: ambiguity prompts, staleness confirmation, the debrief
  interview.

## Input — `design.md ## Screens & flows`

The single source for the engine (replaces upstream's `docs/design/ia.md`).
Shape the conductor writes and this skill parses:

- Screens: a nested list, `- Screen name — one-line purpose.` (children
  indented two spaces).
- Flows: one H4 per named journey, body a single arrow-string referencing
  screen names **verbatim**: `Login → Workspace home → Meeting detail`.

Validate before generating: every flow screen exists in the screen list with
the exact same name. Broken references → **stop and report** (pipeline: fail
loudly to the conductor; standalone: tell the user). Never guess a mapping.

## Fidelity — `run_brief.fidelity` calibrates depth

| fidelity | What gets built |
|---|---|
| `flows` | Skeleton screens: title, purpose, navigation links only. No mock content, no variants. |
| `lofi` (default) | Full mock content per screen + scale/palette variants mounted for comparison. |
| `hifi-direction` | The full lofi, with the **recommended palette variant preloaded as the default view** (the human asked to feel the visual direction; `?palette=default` returns to greyscale). |

## Default mode: generate

### 1. Read and validate

Parse `## Screens & flows` (screens, purposes, flows). Run the exact-name
validation above.

### 2. Staleness check

If `lofi/.lofi-generated` exists and `design.md` has an mtime ≤ the
sentinel's, the lofi is current. Standalone: offer to regenerate anyway
(default no; suggest `regen <screen>`). Pipeline: skip regeneration, report
"lofi current", and only rebuild screens the conductor names (REVISE loop).

### 3. Flag ambiguities

Scan screens for vagueness: purpose under 4 words; generic name without
qualifier ("Dashboard", "Home", "Page", "Detail"); screen in 2+ flows with
different roles; same source flowing to 2+ destinations. For each, **explain
why it matters** — the lofi needs to know what's on the screen.

Standalone: ask, with the upstream (a) tell-me-the-content / (b)
split-the-screen options. Pipeline: resolve with the most conservative
reading, record each as an assumption (`research-plan.md`, `· [design
phase]`), and list them in the phase report. More than 3 ambiguous screens →
that's a **flag for the gate**: the screen draft needs sharpening.

### 4. Scaffold the Astro project (only if `lofi/` doesn't exist)

Copy from this skill's `templates/`: `package.json` (Astro + Tailwind v3),
`astro.config.mjs`, `tailwind.config.mjs` (greyscale baseline),
`src/layouts/Layout.astro` (carries the A-Team variant loader),
`src/components/Header.astro` + `Footer.astro`, `src/styles/tokens.css`
(greyscale baseline + brand fallback chain — replaced when `design-system`
materialises tokens), `lofi-lint.mjs`, `JOURNEY.md` and `LOFI.md`
placeholders. `prebuild` runs the lint.

### 5. Generate per-screen pages

For each screen, write `src/pages/<slug>.astro` (kebab-case of the name):

- `<h1>` = screen name; purpose as subtitle.
- Body: greyscale wireframe elements matching the purpose (boxes for content,
  gray rectangles for images, lists with placeholder rows) — calibrated by
  fidelity.
- Navigation: every flow containing this screen contributes a link to its
  next screen; multiple destinations → labeled list.
- Color discipline: **only** `white`/`black`/`gray-*`/`neutral-*` utilities
  and token CSS variables. No raw hex/rgb/oklch literals — the hardened lint
  fails the build on any leak. Primary actions get `.cta` — greyscale by
  default, tinted only when a palette variant mounts (the fallback chain in
  `tokens.css`).

Mock data reads from `JOURNEY.md`, consistently — the same names, the same
counts, on every screen.

### 6. Write narrative documents

- `JOURNEY.md` — one paragraph: who the user is, what state they're in, the
  mock content scope. **Pipeline: derive it from the active JTBDs** the
  feature serves — jobs carry who/situation/trigger in their `## Context`;
  cite the job ids. Standalone with no jobs: ask one paragraph, then write.
- `LOFI.md` — per-screen invented-content summary (mock data, buttons, where
  each link goes).

### 7. Mount variants (fidelity ≥ lofi)

Copy any `scale-variants/*.css` and `palette-variants/*.css` produced by
`design-system` into `lofi/public/scale-variants/` and
`lofi/public/palette-variants/`. The Layout loader mounts them at
`?scale=<name>` / `?palette=<name>` (sticky via localStorage;
`?palette=default` clears). `hifi-direction`: set the recommended palette as
the loader's preload default. List the comparison URLs in the phase report —
the gate reviews options by clicking, not by reading prose.

### 8. Touch the sentinel, lint, report

Write the timestamp to `.lofi-generated`. Run `node lofi-lint.mjs` — any hit
fails with file + line; fix the leak, never bypass. Report: path, screen
count, ambiguities resolved (and how), variant URLs, dev command
(`cd docs/features/<slug>/lofi && npm install && npm run dev`).

## Regen mode: `build-lofi regen <screen> [with <instruction>]`

1. Verify the screen exists in `## Screens & flows`; error if not.
2. Rewrite ONLY `src/pages/<slug>.astro` — not layouts, not other screens,
   not styles.
3. Incorporate the instruction if given; otherwise regenerate from the
   current `design.md` + `JOURNEY.md`.
4. Update that screen's entry in `LOFI.md`; touch the sentinel; lint.

**This is the design gate's REVISE mechanic**: the conductor maps the
human's revision notes to per-screen regens instead of rebuilding the world.
Layout-level changes warrant a full regenerate — say so rather than
stretching regen past its contract.

## Debrief mode: `build-lofi debrief` — standalone only

A post-user-test interview: definitionally a human moment, invoked
deliberately after a session. Never runs in pipeline mode.

1. **Confirm context**, one at a time: session date (default today), tester
   name/handle, which flow(s) were tested.
2. **Walk the template**, one section at a time — flow validity (end-to-end?
   where did they pause, backtrack, quit?) · per-screen friction (confused,
   expected, did instead) · screen-draft changes proposed (add/remove/rename/
   re-purpose) · regen requests (with instruction) · open questions for the
   next test.
3. **Stage the notes as evidence** (A-Team adaptation): write the session as
   a new batch `docs/product/input/<YYYY-MM-DD>-lofi-debrief-<slug>/session.md`
   — append-only, one batch per session, never edited after. User-test
   findings are demand-side evidence: `research-synthesis` digests them, jobs
   cite them, `confidence:` moves when a test validates or breaks a job.
4. **Offer inline regens** (all / pick / skip); skipped ones stay recorded in
   the batch. Proposed screen-draft changes route to `design.md`'s owner —
   never auto-edit `design.md` from a debrief.

## Common mistakes

- **Color slipping in.** Only `white`/`black`/`gray-*`/`neutral-*` utilities;
  no raw literals. The lint catches it; respect the failure.
- **Adding state.** No `useState`, no fetches, no form submissions. Buttons
  that "submit" navigate via `<a href>`.
- **Mock data drift.** The same persona, the same three projects, on every
  screen. `JOURNEY.md` is the source.
- **Skipping ambiguity handling.** Generic screen names produce vague
  wireframes. Standalone asks; pipeline records and flags — neither ignores.
- **Touching multiple files in regen mode.** Regen Cart → `cart.astro` and
  `LOFI.md` only.
- **Forgetting the sentinel.** Every successful generate/regen touches
  `.lofi-generated`; staleness detection depends on it.
- **Treating the lofi as deliverable UI.** It is a throwaway reference; the
  production UI comes from `spec.md` + the design system, built by dev.

## Red flags — STOP

- `## Screens & flows` validates broken (orphan flow references). Refuse and
  report; the draft gets fixed first.
- More than 3 ambiguous screens. Pipeline: flag for the gate. Standalone:
  push back — the screen draft needs sharpening.
- Anyone asks for color in the lofi's default render. Decline. Greyscale
  enforces flow-validity testing; color lives behind `?palette=`.
- Debrief without a session having happened. Ask: "was there a session, or
  are you starting one?" Don't fabricate notes.
- Lint fails and you're tempted to bypass it. Don't. Fix the leakage.
