# House defaults

The stack the A-Team reaches for when **nothing else decides**. These are craft
defaults, not project facts: they carry no client, no product, no repo, and they
sit at the **bottom** of the precedence order in SKILL.md. Any target repo, any
`## A-Team Config` block, any `context.md` constraint, and the run brief's
purpose all outrank them.

Recorded here rather than left implicit so that choosing them is a *cited*
decision an ADR can point at, and so that changing the house's mind is a diff.

Source: the A-Team board, Dev lane — *"Techstack default, unless specified"*.

## Defaults

| Surface | Default | Notes |
|---|---|---|
| Frontend | **React + Tailwind** | The board's default. Tailwind is also the design-system assumption downstream — `ateam-spec` maps to tokens, not raw px/hex. |
| Backend | **Elixir** | The board's default. A v0 with no real backend need should not grow one; see "shape follows the jobs" below. |
| Quick visual prototype | **Astro-style static** | The Dev-agent card's own carve-out: for a prototype whose job is to be *looked at*, a static site beats a server. Server/complex only when `context.md` says so. |
| Infrastructure | **Local-first for v0** | Runs on the developer's machine. A shared link is an explicit upgrade, answered by the run brief, not assumed. |
| v0 data | **Mocked, API-shaped** | The board's HMW working answer: mocked data fit to the product context, ideally API-based — so the integration seam is real even when the data is not. |

## Rules for using this file

- **Shape follows the jobs.** Defaults answer *"which"*, never *"whether"*. If
  no job needs a backend, the default backend is not a reason to have one.
- **Cite it.** An ADR that lands on a house default says so in Alternatives
  considered — "no higher precedence rule applied; house default" — so a reader
  can tell a considered choice from a reflex.
- **A default is not a ratification.** Landing here does not exempt a decision
  from the human-ratification list in SKILL.md. Cheap and defaulted still needs
  a yes when it forecloses something.
- **The Astro carve-out is about audience, not size.** Choose it when the v0's
  purpose is visual review. A `seed of production` run that starts on Astro
  should say, in Consequences, what the migration costs.
