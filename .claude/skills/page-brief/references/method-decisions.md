# The page-brief method — locked decisions + why

Read this before drafting/grilling. Each decision was locked deliberately; the *why* matters more
than the rule, because it tells you how to adapt when a project doesn't look like the example. This
skill is context-agnostic — none of the Casa specifics below are part of the method; they're just
where the reasoning was pressure-tested.

> **v2 (board review).** The card was cut from 12 fields / 4 blocks down to **7 fields / 3 blocks**.
> Q3 was rewritten, Q4 retired, Q5 rehomed; Q10–Q14 are new. The driving finding: most of what was on
> the card either **restated something already on the card** (Jobs served), **belonged to design and
> went stale** (Components), or **belonged on the board but not on the card** (Open questions, the
> JTBD legend). What survived is the part that only a page-brief can say.

## Q1 · Unit = the unique page (a deduplicated catalog)
One brief per **unique page**, not per journey-occurrence. Responsibilities and jobs are intrinsic to
the page, not the journey passing through it. The card back-references the journeys/steps that
traverse it. Materially different per-context behaviour is a **variant inside the one card** ("default"
vs "manager permission-filtered"), never a second card. *Why:* a page's identity is stable; a catalog
of unique pages is legible and someone's possible entry point into understanding the product. Hard
requirement: the page↔journey link is **bidirectional and legible on the card alone**.

## Q2 · Medium = board-only, single source of truth, full info inline
Put the full information on the card first. Only **if** the board visibly bloats do you propose the
fallback (split depth into a companion doc). *Why:* one source of truth beats a board-index + separate
doc that drift apart. Digestibility is a design constraint, not a reason to move detail off-card
prematurely. *(v2 note: the JTBD legend is the one deliberate exception — see Q14. It moved off the
card not for space but because repeating the same definitions on every card was read as noise.)*

## Q3 · Schema = 7 fields, 3 blocks, ordered for a cold reader
```
Header        P{n} · Page name · route · design-ref
Purpose       1. Responsibilities   — 1–3 lines, translating the JTBD into page accountability
              2. Checklist          — tasks, each tagged to the JTBD it rolls up to  (Q10)
Connections   3. Appears in journeys — inbound journey·step chips
              4. Connects to         — outbound, cross-page AND cross-job
Validation    5. Acceptance criteria — factual + qualitative/cotton test  (Q11)
Footer        6. Reading key
```
*Why the order:* a cold reader needs *what is this page accountable for* (Purpose) before *how it sits
in the product* (Connections) before *how we'll know it's right* (Validation).

**What was removed in v2, and why — read this before re-adding anything:**

- **Jobs served** (per job: where it enters the page). *Cut: redundant.* "Which jobs does this page
  serve? It's literally the ones already listed." The job set is fully carried by the checklist tags.
  The *where it enters* half is genuinely useful but is **flow-level information — it belongs to the
  wireflow**, which is where the entry into a screen is already modelled. Do not reintroduce it here.
- **Components** (table: component · type · behaviour · jobs). *Cut: it's design's job, and it rots.*
  It read as the AI narrating the screen it would draw next, it duplicated a live design that is the
  real source of truth, and it was the field guaranteed to be out of date first. The page-brief now
  says nothing about the surface — which is the point: it stops **above** the screen and lets the
  acceptance criteria carry what must be true of it.
- **Cut log.** *Cut: orphaned.* Its entire subject was "components considered but cut for serving no
  job." With components gone the gap-finder it powered is rehomed onto the checklist (Q5).
- **Open questions / decisions surfaced.** *Cut: useful to the team, wrong home.* The honest question
  was "is this useful *visible here*, or only useful to the AI?" In practice these live as post-its
  pinned at the point of doubt on the board, and resolve *into* the checklist once answered. On the
  card they only grow — a card that accumulates eight open questions has stopped being digestible.
  Keep them as board post-its beside the card, not as a card field.
- **Jobs referenced** (per-card legend). *Moved, not cut* — see Q14.

## Q4 · RETIRED — component granularity (the 3-kind inclusion test)
Formerly: a component earned a row only if it was an action/navigation trigger, an input, or a
key-information block; repeaters collapsed; stop at main-component level. **Retired in v2 with the
Components field itself.** Recorded here because the *altitude* idea still applies — when in doubt
about whether something belongs on a checklist item or an acceptance criterion, ask whether it is a
requirement of the page or a detail of the screen. The latter is design's.

## Q5 · Job-alignment audit = a gap-finder, run on the checklist
Tag each **checklist item** with the JTBD it rolls up to. An item that maps to **no** listed job
branches: **drop it** *or* **flag "serves an unlisted job?"**. *Why the branch matters:* the second
path is the whole value — a task that clearly matters but maps to no job usually means the page's job
list, or the **upstream JTBD set**, is missing something. That flag is a signal to go back up the
pipeline (Q13), not a footnote. Don't strict-drop everything; keep the escape hatch.

*(v2: this previously ran on components. Same audit, better subject — a task that serves no job is a
sharper signal than a button that serves no job, which was usually just chrome.)*

## Q6 · Derivation = draft-then-grill, per page
Design/prototype = **WHAT the page does** (its capabilities, readable off the live screen). Human/grill
= **WHY and whether it's good** (responsibilities, which jobs truly pass through, ambiguous mappings,
what the acceptance criteria actually are). Steps: (1) gather inputs — the JTBD set, the journeys, the
wireflow, the live design; (2) **AI drafts** each card (checklist from the screen's capabilities;
*proposed* responsibility, job mappings, criteria; flagged gaps); (3) **grill the human page-by-page**
to confirm responsibility, validate/repair mappings, and land the criteria. *Why draft first:* it
grounds the conversation so the human reacts rather than authors from scratch — which also protects
the digestible metric.

## Q7 · Layout = beside the journey, linked by stable ID
Place a page's full card once at its **primary occurrence** (the journey where it's richest);
secondary occurrences show a compact **ID chip** (`P3 · Lead detail`) pointing back. Linkage is by
**stable ID, not drawn connectors**. *Why:* connectors from every journey node to every card would be
spaghetti on a real board; IDs stay legible and survive re-layout. Catalog-column placement is the
fallback if inline clutters.

## Q8 · Skill shape = wireflow-chained, degradable, bounded below the PRD
**Consumes** validated JTBDs + journeys + a wireflow + the live design. **Produces** page-brief cards
via the generate → rasterize → Read pipeline proven for the wireflow. **Degrades** to design + JTBDs
alone (leaving "Appears in journeys" as TODO). **Hard boundary:** stops at per-page requirements tied
to jobs — **not** the full PRD (no business goals, metrics, scope/phasing). *Why the boundary:* it's
the mid-term a PRD skill consumes; without it, cards mushroom into mini-PRDs and stop being digestible.
v2 adds a hard boundary on the *other* side too: it stops **above the screen** — no components, no
layout, no hierarchy. That's design's.

## Q9 · Name = `page-brief`
Honest unit (per-page), approachable. Rejected `journey-brief` (wrong unit, collides with "journey").

## Q10 · Checklist items are TASKS, not jobs
The board arrow: `task ——▷ (JTBD)`. Each checklist item is a concrete thing the user must be able to
do or see **on this page**, tagged with the JTBD it rolls up to. It is **not** a restatement of the
job. *Why:* the checklist was the strongest part of the artifact precisely because it operates one
level below the job — it's where an abstract job becomes checkable. The moment items start reading
like jobs ("give the user control over their leads"), the card has lost its only concrete layer.

**Test:** if an item could appear unchanged on three different pages, it's a job, not a task. Rewrite
it until it's true of *this* page only.

## Q11 · Acceptance criteria (replacing "Key information") — two layers
Renamed and widened. Key information asked "what data must be on this page?", which is a fragment of
the real question: **how do we know this page is right?** Two kinds, both required:

1. **Factual** — what must be present and true. *"Opportunity states per vertical are shown."* *"RGPD
   consent status is visible."* Checkable, binary, verifiable by anyone. This absorbs everything the
   old key-information field carried.
2. **Qualitative — the affordance / cotton test.** Not "is it there" but "does it work as a screen."
   Are affordances respected? Is critical information *distinguishable* — does the thing that matters
   stand out from the thing that doesn't? Can the user actually perceive what they need to?

**The cotton test**, stated properly: hand a person **only the criterion and the screen** — no goals,
no jobs, no walkthrough — and ask *"can you do this?"* If they can, the design passes. *"Can you tell
me which opportunities are on this vertical?"* *"Can you see what was requested?"* *"Can you compare
the bank proposals?"*

*Why it matters:* a page can satisfy every factual requirement and still be bad. The factual layer
catches missing requirements; only the cotton test catches an unusable screen.

**This layer is a human judgement and the AI must not self-certify it.** Draft the criteria, then say
plainly that they need to be run with a person. It's qualitative, not quantitative — an analysis
someone has to do. This is the field where the human matters more than the AI, and claiming a
qualitative pass without running it is the single worst failure mode of this skill.

## Q12 · Every reference declares whether it's a JOB or a JOURNEY
The board's `Note:`. A bare code is ambiguous — `J2` could be the second job or the second journey,
and in practice it silently meant both. Every reference renders with its kind explicit: job pills read
as jobs, journey chips read as journeys, and no field mixes the two namespaces.

*Why:* in the reviewed session the generated labels ("JTBD side", "JT practice expired", "J1 ready for
renew", "J2 what's missing") were unreadable, and worse, were then **never referenced anywhere else** —
invented per-page and immediately abandoned. Job codes come from the JTBD set (Q14) and are stable
across the whole board. Never invent a job label on a card.

## Q13 · Quality is upstream-bound — gate on the JTBDs
A page-brief cannot be better than the jobs feeding it, and the observed failure was exactly this: the
cards were thin because the JTBDs were feature-shaped, and because the session started at the wireflow
instead of walking the pipeline. So the skill **inspects the JTBDs before drafting** and says so out
loud when they're weak (procedure in `SKILL.md`, Movement 0).

What a real job looks like: **macro, and about progress or feeling — never a feature.**

| Feature-shaped (reject) | Progress-shaped (accept) |
|---|---|
| "One place to work my leads" | "Have fluid control over my leads and any opportunity that comes" |
| "Keep everyone moving, stop losing follow-ups" | "Manage the whole operation from one screen" |
| "Book a room in another city" | Airbnb — *feel at home anywhere* |
| "Order a taxi from the app" | Uber — *get me somewhere with the least friction possible* |

Two more rules that fell out of the review:
- **Template:** `When [situation], I want [motivation], so I can [desired outcome]`. Note that
  motivation and outcome are different things — *"I want to get home immediately"* is an outcome; the
  motivation underneath it is the taxi line, the haggling, the hassle you want gone.
- **Jobs belong to an actor-in-situation, not to the platform** (the `persona` field names who is
  struggling, in what moment — not a demographic profile). The same software serves Catarina and
  Álvaro at the same company with **different jobs**. A single job list attached to "the product" is
  a smell.

*Why gate rather than document:* the dependency was already documented and it still got skipped. A
warning at the moment of drafting is the only version that fires when it matters.

## Q14 · The JTBD legend lives once, plus a reverse index
Formerly a per-card legend, repeated on every card so a card could travel alone. **v2 moves it off the
cards**: repeating the same definitions on every card was read as noise, and it was the first thing to
cut when scanning a card. Instead:

- **One JTBD definitions page** on the board (code · statement · persona), rendered once.
- **Cards carry code pills only** — the pill is a pointer, and Q12 makes its kind unambiguous.
- **A reverse index page: job → the pages it passes through, in order.** This is the interaction that
  was actually wanted: *pick a job, and see it laid out across P1, P2, P3* — "for this job you have
  these things on page one, these on page two." It answers "is this job fulfilled by the product?"
  which no single card can answer, and it replaces the per-card legend's job far better than the
  legend did.

*Trade-off, stated honestly:* a card lifted off the board in isolation now shows codes it doesn't
define. Accepted — the definitions page and index travel with the board, and the noise cost of
repeating N definitions on every one of N cards was the larger harm.

---

## The origin (context, not method)
From the "Product Afternooonz" review: an optimized information architecture isn't enough — each
screen must be *catalogued* by its purpose, which jobs pass through it, and where those jobs land. The
page-brief is that catalog.

The v2 board review then cut it roughly in half. Its lesson, beyond any individual field: **the card
should only carry what nothing else in the pipeline carries.** Flow detail is the wireflow's. The
surface is design's. Open questions are the board's. Job definitions are the JTBD set's. What's left —
what this page is accountable for, what it must let you do, what it connects to, and how you'd know
it's right — is the page-brief.

The recurring success metric across every decision, v1 and v2: the output must be **digestible by a
human, not just the AI.**
