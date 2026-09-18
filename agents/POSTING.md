# Posting checklist

[← Packet index](README.md) · [Audit](ISSUE.md) · [External review brief](REVIEW-BRIEF.md)

## Proposed issue

**Title:** Architecture audit: move from phase-shaped execution to agent seats without replacing the harness

**Body:** [ISSUE.md](ISSUE.md)

**Existing labels:** `documentation`, `question`

## Required order

1. Commit this packet and its eight `.claude/agents/` candidate definitions on
   `rs/agent-architecture-audit`.
2. Push that branch **without opening a PR**. The issue body uses branch URLs so colleagues and their
   agents can read every handoff before implementation review begins.
3. Open each link in the `Review packet` table while signed out or through the expected repository
   access path.
4. Preview `ISSUE.md` as the issue body and verify the tables, diagram and reference links render.
5. Post the issue with `documentation` and `question` labels.
6. Invite reviewers to use [REVIEW-BRIEF.md](REVIEW-BRIEF.md) and comment against finding IDs
   `A1`–`A9`.
7. Create no runtime-integration PR until the architecture findings have explicit dispositions.
   After acceptance, open the prepared branch as the declarative packet/agent-definition PR; keep
   PM runner wiring in its own later PR.

## Posting command

Run only after the branch is pushed and its links are verified:

```sh
gh issue create \
  --repo subvisual/the-a-team \
  --title "Architecture audit: move from phase-shaped execution to agent seats without replacing the harness" \
  --label documentation \
  --label question \
  --body-file agents/ISSUE.md
```

The command creates external state. Preview the body immediately before running it.
