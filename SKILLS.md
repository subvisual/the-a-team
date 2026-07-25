# SKILLS.md — skill glossary

One row per skill: what it does and its intention, so anyone can understand the
repo's capabilities at a glance. **Every PR that adds or changes a skill updates
this file.** Status vocabulary: `harness` (orchestration glue) · `stub`
(placeholder to be replaced) · `ported` (real skill, migrated from
product-craft) · `reserved` (contract name, not yet built) · `planned` (PR
pending).

## In the repo

| Skill | What it does | Intent / pipeline position | Status |
|---|---|---|---|
| `feature` | Drives a feature prompt to a production-ready PR through discovery → definition → design → spec → issues → dev → pr, gating at definition, design, and pr. Owns `feature.json` and all state transitions. | The A-Team orchestrator (state machine on the main thread). | harness |
| `jobs-to-be-done` | Creates and reviews JTBDs (Klement, Jobs-as-Progress) via a one-question-at-a-time grill. In a target repo it writes durable `docs/product/jtbd/NN-<slug>.md` files — forces sketch, honest confidence, sources — parks unpursued candidates as real files, and supersedes rather than deletes. | Discovery — mints and maintains the North Star every downstream artifact traces to. | ported |
| `ateam-definition` | Placeholder: writes a stub `prd.md` + `briefs/`, sets its manifest status. | Definition phase slot — to be replaced by a wrapper over the ported definition skills. | stub |
| `ateam-design` | Placeholder: writes a stub `design.md` + lo-fi dir, sets its manifest status. | Design phase slot — Design-authored later. | stub |
| `ateam-spec` | Placeholder: writes a stub `spec.md`, sets its manifest status. | Design-spec phase slot — Design-authored later. | stub |
| `ateam-discovery` | Reserved orchestrator name — **not yet built**. | Discovery phase slot — will be a thin wrapper over the ported discovery skills (wiring step after the PM skill migration). | reserved |

## Planned (PM skill migration — one PR each)

| Skill | What it will do | Pipeline position |
|---|---|---|
| `project-context` | Seeds/refreshes the durable `context.md` — digest, glossary, Know/Don't-Know ledger. | Discovery / Stage-0 |
| `research-synthesis` | Digests messy evidence (interviews, transcripts, support themes) against the JTBD set — job verdicts + new-job signals. | Discovery |
| `product-brainstorming` | The PM-grills-human-for-context moment: structured divergence before jobs are minted. | Discovery |
| `discovery-plan` | Produces `docs/product/PLAN.md` — deliverables to reach v0, seeded from surviving unknowns. | Discovery exit |
| `prd-writer` | Feature PRD (`prd.md`): problem, goals/non-goals, scope, user stories, acceptance criteria — every scoped item traces to a JTBD id. | Definition |
| `wireflow` | Wireflow of the feature's screens and flows, into `briefs/`. | Definition |
| `page-brief` | Per-screen requirement briefs, into `briefs/`. | Definition |
| `epics` | Slim epic-definition skill (cherry-picked from roadmap-writer — the rest of it stays out). | Definition |
| `ticket-writer` | Agent-consumable, implementation-ready tickets with testable acceptance criteria. | Dev boundary |
