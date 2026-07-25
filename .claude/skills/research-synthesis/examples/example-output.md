# Example Output: Research Synthesis

## Research Question

- Why are first-time workspace admins abandoning setup before inviting teammates?

## Input JTBD(s)

- When I set up a new workspace for my team, I want to get us collaborating quickly without exposing anything sensitive, so I can show the team the switch was worth it.

## Sources

- Source: interview notes | Segment: first-time admins | Period: February 2026 | Caveat: mobile-heavy sample.
- Source: support-tag summary | Segment: new workspace admins | Period: January-February 2026 | Caveat: only users who contacted support.
- Source: analytics summary | Segment: all new workspaces | Period: Q1 2026 to date | Caveat: quantifies drop-off but not user intent.

## Evidence Strength Notes

- Setup hesitation around permissions: `Strong` because interviews, support themes, and analytics all point to the same drop-off moment.
- Invite-step value confusion: `Moderate` because it appears in interviews and support data, but analytics cannot isolate the exact cause.

## Converging Themes

- Theme: users hesitate when setup asks for permissions before the benefit is obvious.
  - Supporting evidence: repeated interview comments, support complaints about "risky" setup, and funnel drop-off at the permissions step.
  - Why it matters: friction appears before users reach collaboration value.

## Contradictions and Segment Differences

- Contradiction or segment split: some admins want to skip invite entirely until later, while others see invite as the main reason to create a workspace.
  - Source comparison: interviews show both behaviors; support themes skew toward users who expected to invite immediately.
  - Plausible explanation: team size and urgency likely change whether invite feels essential during onboarding.

## Gaps and Unknowns

- Gap: no evidence yet on whether legal/compliance copy requirements constrain a permission-step rewrite.
  - Why it matters: copy and UX scope depend on it.
  - What still needs validation: compliance review and legal requirements.

## Priority Matrix (Frequency x Impact)

- High frequency + high impact (top priority): permission hesitation before value is visible.
- Low frequency + high impact (segment-specific): admins who deliberately set up solo before involving the team.
- High frequency + low impact (quality-of-life): confusion about the wording of the invite step.
- Low frequency + low impact (note and deprioritize): two complaints about workspace logo upload.

## Job Verdicts

- JTBD: When I set up a new workspace for my team, I want to get us collaborating quickly without exposing anything sensitive, so I can show the team the switch was worth it.
  - Verdict: `Suggests refinement`
  - Evidence cited: the safety and speed struggle is strongly confirmed (permission hesitation across all three sources), but the invite-timing split shows "get us collaborating quickly" is not universal at setup time — for one segment the immediate progress is solo evaluation, not team collaboration.

## Suggested New Job Signals

- Signal: several interviewed admins set up alone first "to make sure it isn't embarrassing before I bring the team in" (interview notes, February 2026).
  - Why it looks like a different job: the progress sought is de-risking a tool recommendation privately, not collaborating quickly — a different situation and motivation than the input job.

## Discovery Questions to Carry Forward

- What permission rationale is required for trust without increasing setup time?
- Which admin segments need invite during onboarding versus later in the journey?

## Next likely skill(s)

- `jobs-to-be-done` first: review the refinement verdict and formalize the solo-evaluation signal.
- `discovery-plan` afterwards, once the job set is settled.

## What to pass forward

- Research question, the input JTBD with its `Suggests refinement` verdict and cited evidence, the permission-trust theme, the invite-timing contradiction, the compliance gap, priority matrix placements, and the solo-evaluation new job signal.

## Suggested next prompts

- "Review this job against the invite-timing evidence and refine it." (`jobs-to-be-done`)
- "Formalize the solo-evaluation signal into a job statement." (`jobs-to-be-done`)
- "Turn this synthesis into a discovery plan." (`discovery-plan`)
