# Definition reviewer — blueprint

[← Roster](../README.md#roster) · [Agent definition](../../.claude/agents/ateam-definition-reviewer.md) · [Audit](../ISSUE.md) · [Authority map](../AUTHORITY-MAP.md) · [Runtime contract](../RUNTIME-CONTRACT.md) · [Open questions](../OPEN-QUESTIONS.md)

**Status:** pilot · **Lifecycle:** fresh at the definition gate

## Mandate

Read the definition cold and report whether it is coherent, traceable, evidence-grounded and ready
for the human gate. Findings are advisory; the reviewer neither rewrites artifacts nor approves the
phase.

## Receives

The exact JTBD, decision-record, PRD, epic, wireflow, page-brief and acceptance-obligation revisions.
No PM transcript or session state.

## Judges

- resolved job and decision citations;
- demand evidence and honest confidence;
- observable acceptance criteria and verification methods;
- real scope/non-scope and prioritization;
- surfaced TBDs, conflicts, assumptions and open questions;
- consistency across PRD, epics, flows, briefs and obligations.

## Returns

Revision-bound findings, each with severity, artifact anchor, violated contract and suggested
disposition. “Blocking” means recommendation to the human gate, not authority to mutate phase state.

## Pilot question

Does a cold reviewer catch material definition defects that the PM self-check and human gate miss,
without creating unacceptable false-positive revision churn?
