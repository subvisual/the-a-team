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
| `project-context` | Seeds or refreshes the durable `docs/product/context.md` — overview, digest of `input/` evidence, glossary (settled/forming/TBD), Know/Don't-Know ledger. Repo-first-and-always; Cowork folders valid, never a blocker. Connector pulls are staged verbatim into `input/` before digesting. | Discovery / Stage-0 — the entry door every project fact walks through. | ported |
| `research-synthesis` | Digests mixed evidence into an append-only `docs/product/research/<date>-<slug>.md`: themes, contradictions, evidence strength, frequency×impact, job verdicts (supports/challenges/refine), raw new-job signals. Greenfield-capable — with no jobs yet, its signals feed `jobs-to-be-done`. | Discovery — the PM's digest-the-mess machine; the evidence audit trail. | ported |
| `product-brainstorming` | Sharp product thinking partner, 4 modes: problem exploration, solution ideation, assumption testing, strategy exploration. No artifact of its own — assumptions + open questions (with confidence) route to the context.md ledger, candidate jobs to `jobs-to-be-done`. | Discovery — the challenge/context-exploration beat ("does this request even make sense?"). | ported |
| `discovery-plan` | Compiles the ledger, syntheses, and jobs into TWO durable artifacts in one pass: `PLAN.md` (the product team's plan — job-traced goals, deliverables to reach v0, initiatives, decision criteria) and `research-plan.md` (ships with the v0 — open questions, assumptions + confidence + cheapest probes, technical research: services, stack, integration costs). Re-runnable at any phase to keep both live. | Discovery exit — why stopping discovery loses nothing. | ported |
| `prd-writer` | Feature-level PRD at `docs/features/<slug>/prd.md`: problem, evidence (cited), jobs in scope, user stories grouped by JTBD id, MoSCoW (all four, every item job-traced, Must ≤~60%), requirement-level acceptance criteria, decision log. Presented at the definition gate with the jobs it scopes against. | Definition — the product feature doc every ticket rolls up to. | ported |
| `wireflow` | Maps journeys into JTBD-anchored swimlane flows (screens, decisions, system/agent nodes — no deep UI) with a verified generate→rasterize→Read build engine; horizontal or matrix layouts; FigJam rebuild optional. Output: `briefs/wireflow/` (board.json spec + HTML/SVG). Pipeline mode derives method decisions and headlines journey set + spine at the gate; standalone runs the full grill. | Definition — journeys → pages; owns where each job enters a screen. | ported |
| `page-brief` | The "PRD per page": one card per unique screen — responsibilities, task checklist tagged to `[[NN]]` job ids, journey/graph connections, factual + cotton-test acceptance criteria (never self-certified). Card engine renders verified SVG/HTML into `briefs/pages/`. Gates on job quality first; pipeline mode derives all cards with flags headlined at the gate. | Definition — between wireflow and PRD; below the PRD, above the screen. | ported |
| `ateam-definition` | Placeholder: writes a stub `prd.md` + `briefs/`, sets its manifest status. | Definition phase slot — to be replaced by a wrapper over the ported definition skills. | stub |
| `ateam-design` | Placeholder: writes a stub `design.md` + lo-fi dir, sets its manifest status. | Design phase slot — Design-authored later. | stub |
| `ateam-spec` | Placeholder: writes a stub `spec.md`, sets its manifest status. | Design-spec phase slot — Design-authored later. | stub |
| `ateam-discovery` | Reserved orchestrator name — **not yet built**. | Discovery phase slot — will be a thin wrapper over the ported discovery skills (wiring step after the PM skill migration). | reserved |

## Planned (PM skill migration — one PR each)

| Skill | What it will do | Pipeline position |
|---|---|---|
| `epics` | Slim epic-definition skill (cherry-picked from roadmap-writer — the rest of it stays out). | Definition |
| `ticket-writer` | Agent-consumable, implementation-ready tickets with testable acceptance criteria. | Dev boundary |
