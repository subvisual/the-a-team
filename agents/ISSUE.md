# Architecture audit: move from phase-shaped execution to agent seats without replacing the harness

[Decision](#executive-decision) · [Review packet](#review-packet) · [Evidence](#evidence-anchors) · [Findings](#findings) · [Disposition](#proposal-disposition) · [Adoption](#adoption-sequence) · [Requested review](#requested-review)

## Status

**Audit proposal for debate, with unintegrated candidate agent definitions. No runner or pipeline
behavior change is authorized by this document.**

Baseline: `fa16af2` (`main` after #62). The proposal deliberately preserves the deterministic
supervisor, artifact contracts, and evidence gates. It asks whether craft work now performed by
phase skills should instead be owned by explicit agent seats that compose those skills.

This report supersedes the pre-#62 draft in this packet.

## Method and limits

The review checked the proposed roster against [`PLAN.md`][plan], [`CONTRACT.md`][contract],
[`SKILLS.md`][skills], phase skills, runner process/session lifecycle, approval logic,
rendered/combined verification, and [merged #62][pr-62]'s iteration and evidence-discipline changes.
Claims about current behavior are code- or contract-grounded. Claims about quality, cost, retained
context, provider diversity and model fills remain untested hypotheses. No live target run or
comparative model trial was performed for this audit.

## Executive decision

Adopt the **agent-seat direction**, not the original persistent-process design.

- Keep skills as reusable craft.
- Give PM and Design explicit agent mandates that compose those skills.
- Keep the runner and `feature-cli.mjs` authoritative for state, dispatch eligibility, evidence,
  retries, and approval.
- Treat model session persistence as a per-seat pilot variable, not an architectural requirement.
- Keep independent semantic verification binding. A deterministic green check cannot replace it.
- Do not add a universal Lead decision ledger. The repo already has scoped authorities for product
  decisions, ADRs, assumptions, open questions, obligations, run state, and approvals.
- Evaluate removal of mandatory lofi separately. A running app does not exist at the current design
  gate, so that change requires a different phase topology or a different early review object.

This is an **agent-based work model under deterministic control, over a skill-based craft library**.
It is not a request to turn every skill into an agent or every state-machine transition into model
judgment.

## Review packet

External reviewers should read the audit first, then only the handoffs relevant to the point they
want to challenge.

| Artifact | Purpose | Status |
|---|---|---|
| [This audit][audit] | Findings, verdicts, target architecture, adoption sequence | Debate |
| [External review brief][review-brief] | Copy-ready assignment and response schema for colleague agents | Debate |
| [Packet index][packet-index] | Reading order, roster and review protocol | Debate |
| [Authority map][authority-map] | Existing source of truth for every decision/evidence class | Preserve |
| [Runtime contract][runtime-contract] | Minimum executable contract before any new agent is launched | Proposed |
| [Skill integration][skill-integration] | How seats compose skills without one-seat-per-skill metadata | Proposed |
| [Open questions][open-questions] | Questions that genuinely require a pilot or owner ruling | Open |
| [Lead blueprint][lead] · [agent definition][lead-agent] | Exception handling and handoff synthesis; never state authority | Pilot later |
| [PM blueprint][pm] · [agent definition][pm-agent] | Discovery and definition craft ownership | First pilot |
| [Designer blueprint][designer] · [agent definition][designer-agent] | Design and spec craft ownership | Second pilot |
| [Builder blueprint][builder] · [agent definition][builder-agent] | Current issue-scoped executor; persistence explicitly unproven | Existing / iterate |
| [Verifier blueprint][verifier] · [agent definition][verifier-agent] | Current binding independent semantic review | Existing / keep |
| [Definition reviewer blueprint][definition-reviewer] · [agent definition][definition-reviewer-agent] | Cold advisory review before the human definition gate | Pilot |
| [Design reviewer blueprint][design-reviewer] · [agent definition][design-reviewer-agent] | Cold advisory review of current design artifacts | Pilot |
| [Adjudicator blueprint][adjudicator] · [agent definition][adjudicator-agent] | Optional second semantic review; no evidence override | Experimental |

The agent definitions are concrete Claude Code project agents so reviewers can inspect exact
mandates, tools, skill composition and refusal rules—not imagined placeholders. They use
`model: inherit`, declare no persistent memory, expose no nested-agent tool, and require explicit
supervisor dispatch in their descriptions. They are not wired into `feature-cli.mjs` or the runner.

## Current system, accurately stated

The harness is already agentic in the dev lane but not persistent-role based:

- [`feature`][feature-skill] is a main-thread state-machine skill backed by
  [`feature-cli.mjs`][feature-cli].
- Discovery, definition, design, and spec are phase conductors that compose craft skills.
- [`ateam-discovery`][discovery-skill] dispatches one-shot specialist work
  ([`dev-research`][dev-research-skill]; #62 also permits digest subagents).
- The runner [launches an issue-scoped executor][execute] as a new `claude -p` session for every
  revision cycle.
- The runner launches a [fresh reviewer][review] for cycle 1 and resumes that reviewer for later
  cycles of the same issue.
- The supervisor, not a model, owns process isolation, verification commands, approval records,
  continuation, and delivery receipts.

Therefore **OS process**, **agent seat**, **session persistence**, and **long-lived worker** are four
different properties. The repo proves the first two for executor/reviewer roles. It does not prove
persistent PM, Designer, Lead, or Builder sessions.

### Evidence anchors

| Area | Current contract/code |
|---|---|
| Pipeline and phase order | [`PLAN.md`][plan] · [`feature/SKILL.md`][feature-skill] |
| Cross-phase contract and artifact authority | [`CONTRACT.md`][contract] · [`SKILLS.md`][skills] |
| #62 iteration/evidence changes | [Merged PR #62][pr-62] · [`ateam-discovery`][discovery-skill] |
| Executor lifecycle | [`runner/src/core/execute.mjs`][execute] · [`loop.mjs`][loop] |
| Reviewer lifecycle and semantic contract | [`review.mjs`][review] · [`RUNNER.md`][runner-doc] |
| Approval requirements | [`approval.mjs`][approval] |
| Rendered and combined verification | [`rendered-review.mjs`][rendered-review] · [`combined-verification.mjs`][combined-verification] |
| Refinement and research decisions | [`runner/REFINEMENT.md`][refinement] · [`runner/ASSUMPTIONS.md`][assumptions] |

## Target architecture

```text
human / operator
       |
       v
feature entrypoint
       |
       v
deterministic supervisor  ---- owns state, eligibility, policy, evidence, retries
       |
       +--> PM agent ---------- composes discovery + definition skills
       +--> Designer agent ---- composes design + spec skills
       +--> Builder session --- implements one issue
       +--> cold reviewers ---- definition / design / implementation
       +--> specialists ------- dev research, evidence digest, optional adjudication
       |
       v
versioned repo artifacts + immutable supervisor records
```

Agent memory is a convenience, never authority. A resumed session may remember why it made a call;
the next seat trusts only the versioned artifact and evidence it is permitted to consume.

## Findings

### A1 — The agent-seat premise is sound, but persistence was treated as the premise

**Verdict: ADOPT DIRECTION / REWORK MECHANISM.**

Explicit PM and Designer mandates solve a real problem: conductors currently contain both workflow
and role judgment. Seats provide refusal grounds, tool boundaries, ownership, and review separation.

The case for persistent OS processes does not follow. Bounded handoffs and durable artifacts provide
context isolation under fresh sessions too. Persistence may improve continuity, or may preserve
anchoring and stale assumptions. Test `fresh` versus `resume` per seat.

Fan-out must remain supervisor-owned. Removing lofi does not remove fan-out: discovery already uses
one-shot dev review and evidence digest work. A role session requests a child task; the supervisor
launches the sibling session and returns its bounded result. Role agents do not spawn nested agents.

### A2 — The proposed Lead ledger duplicated existing authorities

**Verdict: REJECT.**

The repo now has deliberately scoped authorities:

- product-scope calls → `docs/product/decisions/`
- technical shape → `docs/product/adr/`
- assumptions, falsifiers and evidence → `research-plan.md`'s assumption ledger
- unknowns and conflicts → `context.md` + `research-plan.md`
- requirements and methods → `acceptance.json`
- run state and gate decisions → `feature.json` through `feature-cli.mjs`
- implementation approval → immutable runner approval/evidence records

A new all-purpose ledger would create two answers to “where does this decision live?” The Lead may
return a proposed next action and rationale, but the supervisor records it through the existing
domain-specific authority or rejects dispatch.

See [the authority map][authority-map].

### A3 — The PM seat is the strongest first vertical slice

**Verdict: PILOT FIRST.**

[`ateam-discovery`][discovery-skill] and [`ateam-definition`][definition-skill] already form a
coherent PM workflow, and #62 strengthened
their shared evidence and iteration contract. A PM agent can carry the mandate while continuing to
write exactly the same artifacts through exactly the same gates.

The pilot must compare:

1. current main-thread phase conductors;
2. a fresh PM session per phase with artifact handoff;
3. one resumed PM session across discovery → definition.

The first question is agent ownership versus phase execution. The second is whether persistence adds
value. Do not confound them.

### A4 — A Designer seat makes sense; replacing lofi does not yet

**Verdict: PILOT SEAT / SEPARATE PROTOTYPE DECISION.**

A Designer agent composing [`ateam-design`][design-skill], [`design-system`][design-system-skill],
[`build-lofi`][lofi-skill], and [`ateam-spec`][spec-skill] matches the working
`subvisual-designer` pattern: a mandate plus selectable craft.

Demoting [`build-lofi`][lofi-skill] may ultimately be right, but “review the running app at the
design gate” is incompatible with the [current order][feature-skill]
`design → spec → issues → dev`. [`rendered-review`][rendered-review] and
[`combined-verification`][combined-verification] observe committed running code later; they do not
conjure an app before dev.

Keep the current review object for the agent-seat pilot. Separately compare:

- current lofi;
- a cheaper generated interactive artifact;
- implementation-first prototype with an explicit topology and rework budget.

Do not claim spec-before-build is preserved while moving the first real implementation before spec.

### A5 — Independent semantic verification remains binding

**Verdict: KEEP.**

The runner intentionally requires both:

- deterministic supervisor evidence; and
- a reviewer judgment that every acceptance criterion is met and semantically adequate.

Green tests cannot prove that expected values came from accepted authority, that a public behavior
was meaningfully exercised, or that a substituted boundary is appropriate. An adjudicator may
produce a second independent semantic review under an explicit policy. It may not convert the first
review into “advisory” or override missing/failed evidence.

### A6 — Fresh definition and design review are useful, but must judge present artifacts

**Verdict: PILOT.**

A persistent or resumed author should not certify its own output. Cold reviewers are reasonable.
Their scope must match the gate:

- definition reviewer: jobs, PRD, epics, wireflow, page briefs, acceptance obligations;
- design reviewer: `design.md`, tokens, the current clickable design artifact, jobs and briefs;
- implementation verifier: running code, diff, accepted criteria and required evidence.

The design reviewer cannot require `spec.md` component states or the running application at a gate
that precedes both.

### A7 — Skill frontmatter should not encode a single owning seat

**Verdict: REWORK.**

Skills are many-to-many. PM authors briefs that Design consumes; Designer may invoke wireflow craft;
Builder consumes spec and ticket craft; standalone humans may invoke the same skills directly.

Put composition in an agent manifest, not a scalar `seat:` on every skill. Keep each skill's existing
trigger and mode documentation. The prepared PM and Designer definitions use the verified host
`skills:` field for conductor preloading and the `Skill` tool for conductor-directed craft. Runtime
enforcement still belongs in repo-owned supervisor dispatch, not invented skill frontmatter.

See [skill integration][skill-integration].

### A8 — Parallel execution remains a scheduling question, not an agent prerequisite

**Verdict: DEFER.**

The current local runner serializes issue execution deliberately to preserve dependency ancestry and
avoid file collisions. Agent seats do not require issue concurrency. Add concurrency only after the
existing dependency and scope planner can prove independent branches and the pilot shows worthwhile
latency reduction.

### A9 — The evidence gap outranks model-fill debate

**Verdict: PILOT BEFORE ROSTER EXPANSION.**

No evidence yet shows that the full harness beats a bounded two-model workflow, or that resumed role
sessions beat fresh sessions with artifact handoffs. Model names and “one rung above” policies are
configuration hypotheses. Score the architecture before standardizing fills.

## Proposal disposition

| Proposal | Verdict | Reason |
|---|---|---|
| Agent seats compose skills | **ADOPT** | Clean separation of mandate from craft |
| Deterministic supervisor remains authoritative | **KEEP** | Existing recovery, evidence and state guarantees depend on it |
| PM agent | **PILOT FIRST** | Best-contained workflow and strongest context-continuity claim |
| Designer agent | **PILOT SECOND** | Good composition fit; preserve current gate object initially |
| Builder agent | **KEEP ISSUE-SCOPED** | Existing behavior; persistence has no evidence yet |
| Fresh definition/design reviewers | **PILOT** | Independence benefit; bounded implementation |
| Binding implementation verifier | **KEEP** | Semantic adequacy is not a deterministic check |
| Optional adjudicator | **EXPERIMENT** | Second review only; no authority/evidence bypass |
| Persistent Lead | **DEFER** | Risks duplicating deterministic orchestration |
| Universal Lead decision ledger | **REJECT** | Duplicates domain-specific authorities |
| Mandatory lofi removal | **SEPARATE PILOT** | Current replacement is phase-circular |
| One `seat:` field per skill | **REJECT** | Composition is many-to-many |
| Cross-provider requirement | **TEST** | Plausible diversity mechanism; no comparative evidence |
| Issue concurrency | **DEFER** | Orthogonal to seats; current serialization is deliberate |

## Adoption sequence

1. **Ratify boundaries, not model fills.** Agree on the [authority map][authority-map] and
   [runtime contract][runtime-contract].
2. **Ratify and merge the prepared agent definitions.** Review the concrete `.claude/agents/`
   files in this packet; landing them changes no runner or pipeline dispatch.
3. **Pilot the PM seat.** Same artifacts and gates; compare current, fresh-agent, and resumed-agent
   arms.
4. **Pilot the Designer seat.** Keep lofi/current review topology so the experiment isolates the
   seat change.
5. **Add cold gate reviewers** if they improve defect detection without unacceptable churn.
6. **Decide persistence per seat** from the pilot. Session resume is configuration, not doctrine.
7. **Run separate topology experiments** for lofi replacement, Lead, adjudication and concurrency.

No runtime-integration PR should bundle all seven steps.

## Acceptance criteria for the first runtime-integration PR

- The current state machine and artifact paths remain authoritative.
- Exactly one seat is introduced, preferably PM.
- Its manifest declares mandate, composed skills, tool policy, read/write scope, inputs, outputs,
  refusal outcomes, resume policy and reviewer.
- Agent dispatch goes through the supervisor; the agent cannot spawn nested agents directly.
- Every output is bound to consumed artifact revisions and validated by existing command gates.
- No new universal ledger or duplicate status vocabulary is introduced.
- Existing open-question, decision-record, assumption, refinement and iteration semantics survive.
- A matched baseline and scorecard are captured before expanding to the next seat.

## Requested review

Reviewers should respond with evidence against one or more IDs (`A1`–`A9`) and one disposition:

- **accept** — direction is safe enough for a bounded pilot;
- **revise** — name the conflicting repo contract and proposed correction;
- **reject** — name the invariant the proposal breaks;
- **test** — state the smallest comparison that would resolve the disagreement.

Please separate architecture objections from model preferences. This issue seeks agreement on seats,
authority and lifecycle before any runtime-integration PR.

[audit]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/agents/ISSUE.md
[review-brief]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/agents/REVIEW-BRIEF.md
[packet-index]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/agents/README.md
[authority-map]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/agents/AUTHORITY-MAP.md
[runtime-contract]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/agents/RUNTIME-CONTRACT.md
[skill-integration]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/agents/SKILL-REVISIONS.md
[open-questions]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/agents/OPEN-QUESTIONS.md
[lead]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/agents/lead/BLUEPRINT.md
[pm]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/agents/pm/BLUEPRINT.md
[designer]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/agents/designer/BLUEPRINT.md
[builder]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/agents/builder/BLUEPRINT.md
[verifier]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/agents/verifier/BLUEPRINT.md
[definition-reviewer]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/agents/definition-reviewer/BLUEPRINT.md
[design-reviewer]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/agents/design-reviewer/BLUEPRINT.md
[adjudicator]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/agents/adjudicator/BLUEPRINT.md
[lead-agent]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/.claude/agents/ateam-lead.md
[pm-agent]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/.claude/agents/ateam-pm.md
[designer-agent]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/.claude/agents/ateam-designer.md
[builder-agent]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/.claude/agents/ateam-builder.md
[verifier-agent]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/.claude/agents/ateam-verifier.md
[definition-reviewer-agent]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/.claude/agents/ateam-definition-reviewer.md
[design-reviewer-agent]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/.claude/agents/ateam-design-reviewer.md
[adjudicator-agent]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/.claude/agents/ateam-adjudicator.md
[plan]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/PLAN.md
[contract]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/CONTRACT.md
[skills]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/SKILLS.md
[feature-skill]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/.claude/skills/feature/SKILL.md
[discovery-skill]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/.claude/skills/ateam-discovery/SKILL.md
[definition-skill]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/.claude/skills/ateam-definition/SKILL.md
[design-skill]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/.claude/skills/ateam-design/SKILL.md
[spec-skill]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/.claude/skills/ateam-spec/SKILL.md
[dev-research-skill]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/.claude/skills/dev-research/SKILL.md
[design-system-skill]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/.claude/skills/design-system/SKILL.md
[lofi-skill]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/.claude/skills/build-lofi/SKILL.md
[feature-cli]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/runner/src/feature-cli.mjs
[execute]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/runner/src/core/execute.mjs
[review]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/runner/src/core/review.mjs
[loop]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/runner/src/core/loop.mjs
[approval]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/runner/src/core/approval.mjs
[rendered-review]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/runner/src/rendered-review.mjs
[combined-verification]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/runner/src/combined-verification.mjs
[runner-doc]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/RUNNER.md
[refinement]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/runner/REFINEMENT.md
[assumptions]: https://github.com/subvisual/the-a-team/blob/rs/agent-architecture-audit/runner/ASSUMPTIONS.md
[pr-62]: https://github.com/subvisual/the-a-team/pull/62
