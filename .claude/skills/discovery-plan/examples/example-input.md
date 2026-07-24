# Example Input: discovery-plan

Target repo state: `docs/product/` holds a context.md whose ledger has three
surviving unknowns, one synthesis run, and one active job.

Prompt: "We want to introduce AI-assisted ticket triage for support teams.
Plan what we still need to learn before committing scope."

From `context.md` (ledger):
- [non-blocking] Expected classification accuracy on our ticket mix — unknown.
- [non-blocking] Compliance constraints for sending ticket data to models — unknown.
- [non-blocking] Whether experienced agents will trust automated prioritization —
  assumption, confidence: directional.

From `research/2026-07-20-triage-trust.md`:
- Research question: what prevents support teams from trusting assisted
  prioritization?
- Verdict on job 01: **supports** — interviews confirm the triage struggle;
  auditability concerns shape how the job is satisfied, not the job itself.
- Contradiction: newer agents want stronger automation; experienced agents want
  override control first.

From `jtbd/01-focus-on-urgent-cases.md` (active):
- When support teams triage a new queue of incoming tickets, I want reliable
  priority guidance, so I can focus attention on the most urgent cases without
  re-sorting everything manually.
