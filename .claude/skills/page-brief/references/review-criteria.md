# Review rubric — page-briefs

The method decisions turned into pass/fail checks. Score an existing catalog against these; report the
failures as concrete, prioritized findings with fixes. Be specific, not a rubber stamp.

## 0 · Check upstream first
- [ ] The **JTBDs are progress-shaped**, not feature-shaped ("have fluid control over my leads", not
      "one place to work my leads"). See Q13.
- [ ] Each job follows `When [situation], I want [motivation], so I can [outcome]` — and motivation is
      not just the outcome restated.
- [ ] Each job is **attached to an actor-in-situation** (the `persona` field: who is struggling,
  in what moment — not a demographic profile). One flat list owned by "the product" is a smell.
- [ ] The board came through the pipeline (jobs → journeys → wireflow), not straight into page specs.

**If this section fails, say so before critiquing the cards.** Thin cards on weak jobs are a symptom;
fixing the cards without fixing the jobs is wasted work.

## 1 · Is it actually a page-brief?
- [ ] **Unit = the unique page**, deduplicated — not one card per journey-occurrence, not per
      component. Context differences are **variants within one card**.
- [ ] It's **below the PRD** — no business goals, success metrics, or scope/phasing.
- [ ] It's **above the screen** — no components table, no layout, no hierarchy, no visual design. If
      the card describes the screen it would draw, it has crossed the line.
- [ ] It carries **only the 7 fields** (Q3). Anything extra is probably a v1 field that was cut.

## 2 · Purpose block
- [ ] **Responsibilities translate the job** into what the page is accountable for — a reader can see
      the JTBD behind them.
- [ ] **Checklist items are TASKS, not jobs** (Q10). Apply the test: an item that could appear
      unchanged on three different pages is a job, not a task.
- [ ] **Every task is tagged** to the JTBD it rolls up to.
- [ ] A task tagged to **no** job is **dropped or flagged** "serves an unlisted job?" — the audit is
      used as a gap-finder, not silent dropping (Q5). Flags are resolved with a human, not deleted.

## 3 · Connections form a graph
- [ ] **Connects-to captures cross-page** routing (`→ P2 …`).
- [ ] It also captures **cross-job** routing — a control that triggers another job or journey, tagged
      with that job. Otherwise the catalog is isolated cards, not a graph.
- [ ] **Non-navigational handoffs are there** (open a conversation, notify, open an external form).
      A connections list that's only page-to-page navigation is a sitemap.
- [ ] **Appears in journeys** is populated (or explicitly TODO in degraded mode).

## 4 · Validation block — the one most often faked
- [ ] **Acceptance criteria exist** and have **both layers**: factual *and* qualitative (Q11).
- [ ] The qualitative layer is a real **cotton test** — phrased as a question you ask a person, showing
      only the criterion and the screen. Not "the UI should be clear."
- [ ] It is **not self-certified**. If anything claims the qualitative criteria pass without a human
      having run them, that's the single worst failure in this rubric — call it out first.
- [ ] Criteria are about *this page*, and are specific enough to fail.

## 5 · Reference hygiene
- [ ] **Job vs journey is explicit everywhere** (Q12) — no bare `J2` that could mean either.
- [ ] **Job codes are stable board-wide** and come from the JTBD set — no invented, per-page labels
      that appear once and are never referenced again.
- [ ] Job definitions live **once**, on their own page — not repeated on every card (Q14).
- [ ] A **job → pages index** exists, and every job is served by at least one page's tasks. A job with
      no page carrying a task for it is a finding: unserved job, or under-specified pages.

## 6 · Product-vs-guidance honesty
- [ ] Product facts (triggers, targets, routes) are visually distinct (**dark**) from interpretation
      (**italic grey**). They aren't blurred into one voice.
- [ ] Flags and notes are marked as conclusions, not stated as product fact.

## 7 · Digestible
- [ ] A cold reader could pick up one card and understand the page. Density is honest, not font-shrunk.
- [ ] Linkage is legible from the card by ID.

## Verdict format
- **Verdict** — one line: is this a sound page-brief catalog, and the single biggest issue.
- **Strengths** — briefly, what's working.
- **Findings** — each: the failing check, the concrete instance, the fix. Ordered by impact.
- **Fastest wins** — the 2–3 changes with the most leverage.

Then offer to apply fixes by switching to CREATE and regenerating (grill only the exposed gaps).
