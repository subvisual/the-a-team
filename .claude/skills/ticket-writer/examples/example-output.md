# Example Output: Ticket Writer

## Mode 1 — Single Ticket Output

# Feature Ticket

## Title

[Feature] Add weekly digest email scheduling in notification settings

## Type

feature

## Story / Problem

As a user, I want to control weekly digest emails so that updates arrive on a predictable schedule.

## JTBD

When I want to catch up on product updates without checking the app every day, I want a weekly digest, so I can stay informed on a predictable schedule.

## Scope

- Add digest on/off toggle in notification settings.
- Schedule digest dispatch every Monday at 09:00 in user local time.
- Retry one time on send failure and log failure details.

## Acceptance Criteria

- [ ] Given a user on notification settings, when they enable weekly digest, then the preference is saved and active.
- [ ] Given weekly digest is enabled, when Monday 09:00 user local time is reached, then the digest email is sent exactly once.
- [ ] Given the initial send attempt fails, when retry policy runs, then one retry occurs and failure context is logged if retry also fails.

## Metadata

- Assignee: TBD
- Reporter: PM
- Priority: Medium
- Labels: type:feature, triage
- Component: Notifications
- Epic / Initiative: Engagement Q2
- Estimate: 5 points
- Due Date: TBD

## Tasks

- [ ] Add settings toggle and persistence.
- [ ] Implement schedule trigger and timezone handling.
- [ ] Add retry + logging behavior and automated tests.

## Links / Dependencies

- Related PRD: Weekly digest PRD (Notion)
- Related designs: Figma notification settings flow
- Related tickets: none
- Blocked by: none

## Out of Scope

- SMS or push notification digests.

---

Handoff:

- Next likely skill(s): `epics` if this ticket needs sequencing against other engagement work.
- What to pass forward: this ticket, its JTBD, and the one-sprint constraint.
- Suggested next prompts: "Sequence this against the Q2 engagement backlog." / "Write the bug ticket for the current digest send failures."

## Mode 2 — Batch Ticket Output

### Ticket 1

- Title: [Chore] Migrate analytics dashboard queries to the new query layer
- Type: chore
- JTBD: When analysts review dashboard performance, they need reliable data foundations, so they can trust the reported metrics.
- Primary dependency: blocks Ticket 2 and Ticket 3

Acceptance Criteria:

- [ ] Given dashboard widgets use the legacy query layer, when migration is completed, then widgets read from the new query layer.
- [ ] Given migration changes are deployed, when smoke tests run, then critical dashboard views load without errors.

### Ticket 2

- Title: [Feature] Add caching for top dashboard widgets
- Type: feature
- JTBD: When analysts repeatedly check top widgets, they want results to load quickly, so they can assess performance without waiting on refresh delays.
- Primary dependency: depends on Ticket 1

Acceptance Criteria:

- [ ] Given widget query results are available, when top widgets are requested repeatedly, then cached results are served within the target TTL.
- [ ] Given cached data expires, when a new request arrives, then cache refreshes without breaking widget rendering.

### Ticket 3

- Title: [Spike] Validate metric parity and rollout recommendation for dashboard migration
- Type: spike
- JTBD: When the team is deciding whether to complete the dashboard migration, they need evidence on parity and rollout risk, so they can make a confident go/no-go decision.
- Primary dependency: depends on Ticket 1 and references Ticket 2

Acceptance Criteria:

- [ ] Given old and new query outputs, when parity checks run, then metric deltas outside agreed thresholds are documented.
- [ ] Given parity and performance findings, when spike closes, then a clear rollout recommendation is published.

---

Handoff:

- Next likely skill(s): `epics` to structure and prioritize the three tickets against the quarter.
- What to pass forward: the three tickets, the shared JTBD, and the dependency chain (1 blocks 2 and 3).
- Suggested next prompts: "Structure these three tickets under an analytics epic." / "Expand Ticket 2 into the full feature template."

## Mode 3 — AC-Only Output

# Acceptance Criteria

## Ticket / Story Context

- Ticket/Story ID: Export project report as PDF
- Linked PRD requirement(s): Reporting PRD — external sharing
- JTBD: When stakeholders ask for a status snapshot, I want to share the report outside the app, so I can keep everyone aligned without granting access.
- User outcome summary: Users get a filter-accurate PDF of the current report, or a clear failure message.

## Preconditions

- User has view access to the project report.
- The report has rendered with data (empty reports are out of scope for export).

## Criteria (Gherkin Checklist)

- [ ] Given a rendered project report, when the user clicks Export PDF in the toolbar, then a PDF of the current report downloads.
- [ ] Given active filters on the report, when the user exports, then the PDF reflects only the filtered data.

## Edge Cases (Gherkin Checklist)

- [ ] Given a report whose export would exceed 20 MB, when the user exports, then the export fails with a message stating the size limit and no partial file downloads.

## Notes

- Depends on the existing PDF rendering service; no new infrastructure.
- Paste this block into the ticket's `## Acceptance Criteria` section as-is.

---

Handoff:

- Next likely skill(s): none required — the block pastes into the existing ticket.
- What to pass forward: the AC block and the preserved JTBD from the Reporting PRD.
- Suggested next prompts: "Write the chore ticket for monitoring PDF export failures." / "Draft ACs for the report scheduling story next."
