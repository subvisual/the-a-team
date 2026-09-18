# Agent architecture audit packet

[Audit](ISSUE.md) · [External review](REVIEW-BRIEF.md) · [Authority map](AUTHORITY-MAP.md) · [Runtime contract](RUNTIME-CONTRACT.md) · [Skill integration](SKILL-REVISIONS.md) · [Open questions](OPEN-QUESTIONS.md) · [Posting](POSTING.md)

**Audit plus opt-in trial.** The existing skill-based harness remains the default.
[TRIAL.md](TRIAL.md) defines the complete agent arm: PM, Designer, cold gate
reviewers, existing runner Builder/Verifier sessions, and delivery craft. Select
it explicitly with `/feature "<prompt>" --repo <target> --orchestration-mode agent`.
The main thread dispatches host agents; the deterministic CLI does not launch them.
The audit below records the original proposal, including its earlier PM-first
adoption sequence. TRIAL.md defines the current experiment scope.

## Reading order

| Order | Document | Question it answers |
|---:|---|---|
| 1 | [ISSUE.md](ISSUE.md) | What should change, what should not, and why? |
| 2 | [REVIEW-BRIEF.md](REVIEW-BRIEF.md) | What should an independent external agent inspect and return? |
| 3 | [AUTHORITY-MAP.md](AUTHORITY-MAP.md) | Where does each kind of truth already live? |
| 4 | [RUNTIME-CONTRACT.md](RUNTIME-CONTRACT.md) | What must exist before a seat can execute safely? |
| 5 | [SKILL-REVISIONS.md](SKILL-REVISIONS.md) | How do agents compose skills without absorbing them? |
| 6 | [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md) | Which claims need a pilot or an owner ruling? |

Maintainer handoff: [POSTING.md](POSTING.md) contains the publish order and copy-ready `gh` command.

## Roster

| Seat | Lifecycle proposed for first pilot | Authority | Blueprint | Agent definition | Status |
|---|---|---|---|---|---|
| Supervisor | long-running deterministic process | State, policy, dispatch eligibility, evidence | [Runtime contract](RUNTIME-CONTRACT.md) | — | Existing / extend |
| Lead | fresh or resumable only for exceptions | Recommendations only | [Lead](lead/BLUEPRINT.md) | [`ateam-lead`](../.claude/agents/ateam-lead.md) | Defer |
| PM | fresh per phase vs resumed across discovery/definition | PM artifacts through existing gates | [PM](pm/BLUEPRINT.md) | [`ateam-pm`](../.claude/agents/ateam-pm.md) | First pilot |
| Designer | fresh per phase vs resumed across design/spec | Design artifacts through existing gates | [Designer](designer/BLUEPRINT.md) | [`ateam-designer`](../.claude/agents/ateam-designer.md) | Second pilot |
| Builder | fresh per issue revision cycle | Committed implementation only | [Builder](builder/BLUEPRINT.md) | [`ateam-builder`](../.claude/agents/ateam-builder.md) | Existing |
| Verifier | fresh cycle 1; resumed within the same issue | Binding semantic review plus cited evidence | [Verifier](verifier/BLUEPRINT.md) | [`ateam-verifier`](../.claude/agents/ateam-verifier.md) | Existing |
| Definition reviewer | fresh at definition gate | Advisory findings | [Definition reviewer](definition-reviewer/BLUEPRINT.md) | [`ateam-definition-reviewer`](../.claude/agents/ateam-definition-reviewer.md) | Pilot |
| Design reviewer | fresh at design gate | Advisory findings | [Design reviewer](design-reviewer/BLUEPRINT.md) | [`ateam-design-reviewer`](../.claude/agents/ateam-design-reviewer.md) | Pilot |
| Adjudicator | fresh when an explicit dispute qualifies | Second semantic review only | [Adjudicator](adjudicator/BLUEPRINT.md) | [`ateam-adjudicator`](../.claude/agents/ateam-adjudicator.md) | Experimental |

## Shared rules

1. The deterministic supervisor owns state transitions, process lifecycle, policy and evidence.
2. Agent memory is non-authoritative. Versioned artifacts and supervisor records are authoritative.
3. A seat composes skills; it does not copy their craft rules into its prompt.
4. Fan-out is supervisor-owned. Seats request sibling work; seats do not spawn nested agents.
5. No author certifies its own output when the gate claims independent review.
6. Every handoff names consumed revisions, outputs, deviations, open obligations and evidence.
7. No transcripts cross seats. Investigation remains in retained scratch/evidence stores.
8. Model/provider/effort are configuration. They are never part of the seat mandate.
9. No new catch-all ledger may duplicate the authorities in [AUTHORITY-MAP.md](AUTHORITY-MAP.md).
10. Persistence is selected per seat from evidence; “agent” does not imply “long-lived process.”

## Review protocol

Comment against finding IDs `A1`–`A9` from the audit. Prefer a concrete contract conflict, runner
path, artifact example, or minimal falsifying pilot. Architecture review comes before model selection
and runtime-integration PRs. The candidate agent files are included so reviewers can debate
executable mandates rather than prose alone.
