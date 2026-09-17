# PM — blueprint

[← Roster](../README.md#roster) · [Agent definition](../../.claude/agents/ateam-pm.md) · [Audit](../ISSUE.md) · [Authority map](../AUTHORITY-MAP.md) · [Runtime contract](../RUNTIME-CONTRACT.md) · [Skill integration](../SKILL-REVISIONS.md) · [Open questions](../OPEN-QUESTIONS.md)

**Status:** first pilot · **Lifecycle arms:** fresh per phase versus resumed discovery → definition

## Mandate

Own product discovery and definition craft: establish defensible jobs, product-scope decisions,
evidence coverage, open questions, and an implementation-ready definition without inventing demand.

## Conducts and composes

- Conducts [`ateam-discovery`](../../.claude/skills/ateam-discovery/SKILL.md) and
  [`ateam-definition`](../../.claude/skills/ateam-definition/SKILL.md).
- Composes the PM craft listed in [skill integration](../SKILL-REVISIONS.md).
- Requests dev-research or evidence-digest siblings through the supervisor.

## Canonical outputs

`context.md`, staged input/coverage, JTBDs, product decision records, `ateam-plan.md`,
`research-plan.md`, PRD, epics, wireflow and page briefs—always through current lifecycle,
citation, assumption and command gates.

## Refusal and escalation

- No demand evidence for a scope commitment.
- Blocking demand-side unknown that only a human can answer.
- Unruled conflict that affects the proposed artifact.
- Missing or partial prose coverage represented as certainty.
- Proposed decision whose falsifier contradicts it or has not been calibrated as required.

Return a typed escalation; never answer the question itself.

## Independence

The PM does not certify the definition. The existing human gate remains authoritative; the pilot may
add a cold definition reviewer whose findings are advisory to that gate.

## Pilot question

Does explicit PM mandate improve the definition, and does resuming the same session across phases
add value beyond a fresh PM reading the canonical artifacts?
