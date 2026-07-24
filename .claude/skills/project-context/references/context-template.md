# context.md template — the canonical shape

This is the durable `docs/product/context.md` every A-Team skill reads. The
structure below is the contract (see `CONTRACT.md`); the annotations are guidance.

```markdown
---
project: <name>
updated: <YYYY-MM-DD>
ingested:                          # input/ batches digested into this file
  - 2026-07-17-client-call         # one line on what the batch held
  - 2026-07-24-granola-pulled      # staged connector pull (verbatim)
---

# Context: <project name>

## Overview

<One paragraph: what this project is and why it exists. If jobs are defined,
cite them by id ([[01-...]]) and quote headline language exactly — never
paraphrase a job, never restate the jtbd/ files here. If none exist:
"Core job: TBD — define via jobs-to-be-done.">

- **Audience / users:** <primary users, buyers, stakeholders — TBD is fine>
- **Current stage:** <exploration / discovery / definition / building / live>
- **Goals:** <goal 1; goal 2 — or TBD>
- **Constraints:** <budget, timeline, tech, team, contractual>
- **Key links:** <repo · Notion · Figma · tracker · Slack channel — or TBD>

## Digest

<Per ingested batch, newest first: what the evidence actually says, compressed,
with pointers back to the input/ files. The digest is the readable form of the
raw mess — it never replaces the raw files and never embellishes them.>

### 2026-07-17-client-call
<...>

## Glossary

Status: **settled** — team-wide agreement, safe to use in artifacts ·
**forming** — best current definition, may still shift · **TBD** — in play,
undefined.

| Term | Working definition | Status | Source / notes |
| --- | --- | --- | --- |
| <term> | <what the team means by it today> | settled | <where defined> |
| <term> | <best current definition> | forming | <competing name: "<other>"> |
| <term> | <unknown — heard in kickoff> | TBD | <who to ask> |

Never delete a renamed term — note the rename in Source / notes so old
documents stay readable.

## Know / Don't know

### Know
- <fact> — <source: batch, meeting, person>

### Don't know
- **[blocking → <the JTBD id or scope call it blocks>]** <question>
- **[non-blocking]** <question — survives into PLAN.md as a deliverable>

## Awaiting answers

<Present only while an escalation is open — one blocking question per heading,
serialised by a skill that found no human to grill. Answer inline and re-invoke;
the skill removes the section when resolved.>
```

Rules that bind every writer of this file:

- **Refresh, never rebuild.** Preserve what is still true; update what changed.
  A refresh that silently drops content is an overwrite, and overwrites are
  forbidden for durable artifacts.
- **TBD stays visible.** Uncertainty lives as explicit `TBD` / ledger entries,
  never hidden inside polished prose.
- **The ledger drives the grill.** Only blocking Don't-Knows justify questions;
  non-blocking ones flow into `PLAN.md` as deliverables, so stopping loses
  nothing.
