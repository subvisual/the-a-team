# Authority map

[← Packet index](README.md) · [Audit](ISSUE.md) · [Runtime contract](RUNTIME-CONTRACT.md) · [Skill integration](SKILL-REVISIONS.md) · [Open questions](OPEN-QUESTIONS.md)

This map prevents the agent layer from inventing a second source of truth. A seat may propose or
write within its allowed scope; downstream work trusts only the canonical artifact or supervisor
record.

| Concern | Canonical authority | Primary writer/recorder | Agent implication |
|---|---|---|---|
| Feature state, phase status, gates, pause/resume | `docs/features/<slug>/feature.json`, mutated through [`feature-cli.mjs`](../runner/src/feature-cli.mjs) | Deterministic supervisor | Lead/seat recommendations cannot advance state |
| Product-scope decisions | `docs/product/decisions/NN-<slug>.md` (`[[dec:NN]]`) | Discovery/PM with human review | No parallel Lead decision ledger |
| Architecture decisions | `docs/product/adr/NN-<slug>.md` (`[[adr:NN]]`) | Architecture craft with required ratification | Lead does not own technical craft |
| Jobs and demand evidence | `docs/product/jtbd/` plus staged input citations | PM | Other seats consume; they do not rewrite demand from implementation facts |
| Known facts, unknowns, conflicts | `context.md` Know/Don't-Know ledger | Discovery/PM | Specialists return bounded findings into this route |
| Research questions and revisit triggers | `research-plan.md` | Discovery-plan and authorized refreshes | Open questions are carried, not silently defaulted |
| Assumptions, falsifiers, probes, evidence | `research-plan.md` `ateam-assumptions` block and retained history | Command-validated research workflow | Session memory cannot mark an assumption resolved |
| Requirements and verification methods | `acceptance.json` plus PRD/spec sources | Definition/spec through obligation tooling | Builder cannot author its own acceptance authority |
| Design direction | `design.md`, briefs and design-system tokens | Designer through existing design gate | Reviewer judges the artifact available at that gate |
| Issue contract | `issues.md` with accepted criteria and traceability | Ticket decomposition phase | Runner snapshots it; agents cannot weaken it mid-run |
| Implementation revision | Committed issue branch/head | Builder, imported by supervisor | Completion text is not delivery evidence |
| Semantic implementation verdict | Immutable reviewer record bound to issue/base/head | Independent Verifier | Remains binding for approval |
| Deterministic checks and rendered observations | Supervisor verification records | Deterministic supervisor | No model may waive missing, pending or failed evidence |
| Combined delivery | Combined-verification record bound to final revision | Deterministic supervisor | Earlier issue approvals do not imply combined approval |
| Human acceptance, integration, release, product validation | Independent milestone records | Authorized operator/integration evidence | No agent inference advances these milestones |
| Role-local working memory | Model session/scratch | The seat | Convenience only; never consumed as authority |

## Dispatch rule

“No authority, no dispatch” means the supervisor verifies that required canonical inputs exist and
are current. It does **not** mean a Lead must manufacture a new decision for every routine state
transition. Routine transitions follow the state machine; genuine product, technical, research or
acceptance decisions land in their existing authority above.

## Conflict rule

If two authorities appear to disagree, do not introduce a precedence rule in an agent prompt.
Follow the conflict, revision, supersession and stale-evidence semantics already defined by
[`CONTRACT.md`](../CONTRACT.md), [`feature-cli.mjs`](../runner/src/feature-cli.mjs), and the relevant
artifact class.
