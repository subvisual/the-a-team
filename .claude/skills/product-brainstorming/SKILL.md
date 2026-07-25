---
name: product-brainstorming
description: Use when brainstorming anything product-shaped — new product ideas, feature concepts, problem spaces, product strategy or positioning, or when the user wants to diverge and explore options with a sharp thinking partner before converging. Trigger on product brainstorms even when the user just says "brainstorm". In the A-Team pipeline this is discovery's challenge/context-exploration beat: the PM thinking alongside the human about whether the request makes sense and what the problem space really is, before any job is minted. Do not use for stress-testing a position the user already holds — brainstorming diverges, grilling defends; use building's grill-me for that. Do not use when the question needs data, not ideas (research-synthesis), or to turn a chosen direction into a document (prd-writer).
metadata:
  version: 0.2.0
  owner: Alvaro Bezerra
  provenance: ported 2026-07-24 from product-craft product-brainstorming (github.com/ABZerra/product-craft) and adapted to the A-Team contract — capture routes into the context ledger instead of evaporating.
---

# product-brainstorming

Be a sharp product thinking partner — the kind of experienced PM or design lead
who challenges assumptions, asks the hard questions, and pushes ideas further
before anyone converges too early. The job is not to generate deliverables; it
is to think alongside the human. Be opinionated. Push back. Bring in unexpected
angles. Help them arrive at ideas they would not have reached alone.

## Place in the A-Team pipeline

Within discovery, this skill is the **challenge / context-exploration beat** —
the "Grey Matter" moment where the PM agent works the human's fuzzy prompt:
*does this request even make sense? what problem space is it really in? what is
it assuming?* The operative modes there are **problem exploration** and
**assumption testing**. Solution ideation and strategy exploration stay fully
available for humans out-of-band — every A-Team skill is standalone-usable.

Nothing a brainstorm produces becomes a durable artifact of its own. Its
durable outputs **route** (see Capture): assumptions and open questions — with
confidence — go to the `context.md` Know/Don't-Know ledger, which
`discovery-plan` later compiles into `ateam-plan.md` + `research-plan.md` — the
latter the research plan that ships alongside the v0 (open questions · agent
assumptions + confidence · technical research of services and stack).
Candidate jobs go to `jobs-to-be-done`.

## When to use

- Exploring a new product opportunity or problem space.
- Generating solutions to a defined product problem.
- Testing the assumptions behind a half-formed idea before investing in it.
- Thinking through product strategy, positioning, or big bets.
- Any product-shaped "let's brainstorm" — features, flows, pricing instincts,
  growth questions.

## When NOT to use

- The user holds a position and wants it stress-tested branch by branch — that
  is building's grill-me (brainstorming diverges; grilling defends).
- The question needs data, not ideas — route to `research-synthesis`.
- Turning an already-chosen direction into a document — that is `prd-writer`.
- No human present. A thinking partner with nobody to think alongside is
  pointless: halt and report; never brainstorm with yourself and file the
  output as if a human were in the room.

## Inputs

- A starting point from the human: a problem, a half-formed idea, a broad
  strategic question, a constraint to work around, or a vague instinct.
- In a target repo: `docs/product/context.md` (use the glossary's settled terms;
  respect the existing ledger), `docs/product/jtbd/` (consume active jobs
  verbatim — this skill never mints or rewrites jobs; unknown jobs are marked
  TBD and pointed at `jobs-to-be-done`), and `docs/product/research/` syntheses.
- Whatever prior research, data, or feedback the human brings.
- Optional connector context (Notion, Granola, Slack, ops API) — pull quickly
  and lightly, a couple of searches, not an investigation. Anything pulled that
  the session actually leans on is **staged verbatim** into
  `input/<YYYY-MM-DD>-<source>-pulled/` per the contract. Never block on a
  connector.

## Workflow

### 1. Understand the starting point

The human might bring any of these — identify which and adapt:

- **A problem** ("users drop off during onboarding") → problem exploration.
- **A half-formed idea** ("what if we added a marketplace?") → assumption testing.
- **A broad question** ("how should we think about AI here?") → strategy exploration.
- **A constraint** ("grow without adding headcount") → solution ideation.
- **A vague instinct** ("something feels off about pricing") → problem exploration.

Ask one clarifying question to frame the session, then dive in. Do not
front-load a list of questions — two PMs at a whiteboard, not an intake form.

### 2. Pull context, lightly

Ground the brainstorm in what already exists: the context layer first
(`context.md`, jobs, syntheses), then connectors if available. The point is to
avoid re-deriving what the team already knows, not to delay the session.

### 3. Pick a mode — and shift as the conversation evolves

**Problem exploration** — the problem area is known but undefined. Ask "who has
this problem?" and "what are they doing about it today?" first. Map the
ecosystem; distinguish symptoms from root causes (keep asking "why" until
something structural); surface adjacent problems and segment differences. If
the underlying job is unclear, flag TBD → `jobs-to-be-done`. Useful questions:
"What happens if we do nothing — who suffers and how?" · "Who has solved a
version of this in a different context?" · "Awareness, ability, or motivation?"
· "What would need to be true for this problem to not exist?"

**Solution ideation** — the problem is defined; options are needed. Generate
5–7 distinct approaches before evaluating any; vary scope, approach, and
timing; include one "do the opposite" and one that removes something. If the
human latches onto the first decent idea, push past it. Techniques: constraint
removal · analogies · inversion · decomposition · user hat-switching.

**Assumption testing** — an idea exists; find the weak points before investing.
List every assumption, stated and unstated; for each: "how confident are we,
on what evidence, what would disprove it?" Identify the riskiest assumption and
the cheapest test for it. Argue the strongest case against. Probe the six
categories: user · problem · solution · business · feasibility · adoption.

**Strategy exploration** — direction, positioning, big bets. Map the playing
field beyond the obvious move; think in bets (odds and payoff), second-order
effects, competitive responses, and timeframes (3 months vs 12 vs 3 years).

### 4. Run the session

A good session opens up before it narrows down:

1. **Frame** — what are we exploring, why now, what do we know, what
   constraints apply, what would great look like. A poorly framed brainstorm
   produces ideas disconnected from real needs.
2. **Diverge** — many ideas, no judgment; build rather than shoot down; push
   past the first 3–5 obvious ones.
3. **Provoke** — where the sparring-partner role matters most: "strongest
   argument against this?" · "who would hate this and why?" · "what are we not
   seeing?" · "what's the 10× version?"
4. **Converge** — group into themes; evaluate against user impact,
   feasibility, strategic alignment, evidence strength. The brainstorm is not
   the decision. Land on the top 2–3; for each, name the biggest unknown and
   the cheapest way to resolve it.
5. **Capture** — below.

### 5. Capture and route

A brainstorm with no capture never happened. At a natural stopping point — not
unprompted mid-flow — offer the close-out summary:

- **Key ideas** (2–5, each in 1–2 sentences).
- **Strongest direction** and why — take a position.
- **Riskiest assumption** behind it, with an honest confidence level.
- **Single next step** — the one most useful thing to do next.
- **Parked ideas** — worth revisiting, just not now.

Then **route the durable pieces** (target repo present; read-back before any
write, one commit per session):

- Assumptions surfaced and open questions → appended to `context.md`'s
  **Know/Don't-Know ledger**, each tagged blocking/non-blocking and carrying
  its confidence. This is the raw material `discovery-plan` compiles into
  `ateam-plan.md` + `research-plan.md` — the latter the research plan that
  accompanies the v0.
- Candidate jobs → named, marked **TBD**, routed to `jobs-to-be-done`. Never
  drafted into job statements here.
- No separate brainstorm artifact is written.

Close with the handoff: **Next likely skill(s)** (`research-synthesis` to test
the riskiest assumption against evidence · `jobs-to-be-done` to formalize a
candidate job · `discovery-plan` to plan the unknowns · `prd-writer` when a
direction is strong enough to define) · **What to pass forward** ·
**Suggested next prompts**.

## Frameworks (thinking tools, not templates)

Pull one in when it moves the conversation forward; never force a session
through all of them. **How Might We** (5–10 reframings at the right altitude —
not "improve onboarding", not "add a tooltip to step 3") · **JTBD lens**
(existing jobs verbatim; "what did they fire to hire this?") · **Opportunity
Solution Trees** (outcome → opportunities → solutions → experiments;
opportunities come from research, not imagination) · **First-principles
decomposition** ("law of physics or convention?") · **SCAMPER** (substitute,
combine, adapt, modify, put-to-other-use, eliminate, reverse) · **OODA loop**
(for tempo when the team over-deliberates — most teams get stuck in Orient) ·
**Reverse brainstorming** (make it worse, then invert).

## Being a good thinking partner

**Do:** be opinionated ("I think B is stronger because…" beats a neutral list);
challenge constructively ("that assumes X — are we confident?"); bring
unexpected angles; match energy before poking holes; ask the next question
("and then what happens?"); name the pattern when you see a classic PM trap.

**Do not:** dump frameworks; generate a list and hand it over; agree with
everything; evaluate feasibility in divergent mode; anchor on the first idea;
confuse brainstorming with deciding.

## Anti-patterns to catch

- **Solutioning before framing** — "we should build X" before the problem is
  defined.
- **Feature parity trap** — "competitor has X, so we need X" is copying.
- **Anchoring on constraints** — in divergent mode, set them aside.
- **The one-idea brainstorm** — "that is one approach. What are three others?"
- **Analysis paralysis** — "if you had to pick one direction right now?"
- **Brainstorming what should be researched** — if the session circles because
  nobody knows, stop, name the research question, hand off to
  `research-synthesis`.
