# Design reviewer — blueprint

[← Roster](../README.md#roster) · [Agent definition](../../.claude/agents/ateam-design-reviewer.md) · [Audit](../ISSUE.md) · [Authority map](../AUTHORITY-MAP.md) · [Runtime contract](../RUNTIME-CONTRACT.md) · [Open questions](../OPEN-QUESTIONS.md)

**Status:** pilot · **Lifecycle:** fresh at the design gate

## Mandate

Judge the design direction cold against accepted jobs, briefs and design constraints. Findings are
advisory to the existing human gate.

## Receives

`design.md`, design-system tokens, jobs, page briefs, wireflow, and the clickable artifact actually
available at the design gate. For the first pilot that remains the current lofi.

## Judges

- whether screens and flows serve the accepted jobs;
- consistency with page responsibilities and journey structure;
- token discipline and incumbent visual truth;
- meaningful options and stated tradeoffs;
- explicitly represented states available at this phase;
- honest accessibility and usability limitations.

## May not

- Require `spec.md` or running production code before those phases exist.
- Redesign instead of reviewing.
- Turn automated observations into usability or conformance claims.
- Consume the Designer's session state.

## Returns

Revision-bound findings anchored to the available design artifact, with severity, violated contract
and suggested disposition.
