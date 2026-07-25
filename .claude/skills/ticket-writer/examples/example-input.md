# Example Input: Ticket Writer

## Mode 1 — Single Ticket Request

Create a feature ticket for adding scheduled weekly digest emails.

Requirements:
- Users can turn digest on or off in notification settings.
- Digests are sent every Monday at 09:00 user local time.
- If send fails, system retries once and logs the failure.
- Use existing email provider integration.

JTBD:
- When users want to catch up on product updates without checking the app every day, they want a weekly digest, so they can stay informed on a predictable schedule.

Constraints:
- Ship in one sprint.
- Include clear acceptance criteria and metadata placeholders.

## Mode 2 — Batch Ticket Request

Split this scope into tickets:
- Migrate analytics dashboard to new query layer.
- Add caching for top widgets.
- Validate no metric regressions.
- Prepare rollout recommendation before full migration.

Shared JTBD context:
- When analysts review dashboard performance, they want reliable and fast reporting, so they can make decisions without second-guessing the data.

## Mode 3 — AC-Only Request

Our ticket "Export project report as PDF" already exists. Write acceptance criteria I can paste into it.

Ticket summary:
- Users can export the current project report as a PDF from the report toolbar.
- Export respects the active filters.
- Exports over 20 MB fail with a clear message.

JTBD (from the PRD):
- When stakeholders ask for a status snapshot, I want to share the report outside the app, so I can keep everyone aligned without granting access.
