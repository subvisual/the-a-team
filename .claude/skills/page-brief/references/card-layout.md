# Card layout — rules and debugging a bad card

The engine renders each page as a card with **three** soft blocks, preceded on the board by two shared
pages. You almost never edit the engine; you fix the **spec**. This is the map of what the layout does
and how to read a bad PNG.

## The board, top to bottom
1. **Jobs to be done** — the job set defined once (pill · statement · persona). Rendered from
   top-level `jtbds`. Cards never repeat this.
2. **Job → pages index** — per job, the pages it passes through and the tasks on each. A job with no
   page carrying a task for it prints an amber line — treat that as a finding.
3. **The card grid** — `columns` cards per row (default 3).

Skip 1 + 2 with `--cards-only` when you only want the cards (e.g. pasting a single card beside a
journey).

## The 3-block card anatomy
1. **Header** — `P{id} · {name}` in blue on a tinted bar; route below; Design-ref right-aligned.
2. **Purpose** — *Responsibilities* (wrapped paragraph) · *Checklist* (checkboxes, job pills
   right-aligned, amber ⚑ flag line under any untagged item).
3. **Connections** — *Appears in journeys* (pale-blue "Journey N · step" chips) · *Connects to*
   (job pill + trigger + kind-marker + target + inline italic note).
4. **Validation** — *Acceptance criteria*: factual bullets, then the **cotton test** in its own
   lavender block with the not-self-certifiable line.
5. **Reading-key footer** — always present, and it states the job-vs-journey convention.

Each block sits in a tinted container with a small grey uppercase label. Empty blocks and fields are
skipped entirely, so a sparse card doesn't leave hollow containers.

## Layout mechanics you can rely on
- **Cards auto-size to content.** Height is computed from what's rendered; you never set it. Rows align
  to the tallest card in that row.
- **Text wraps** to the column width (greedy word-wrap sized to glyph width). Responsibilities, tasks,
  flags and criteria wrap rather than overflow.
- **Checklist job pills reserve their own gutter** — the task text wraps to avoid them, so a task with
  three job tags won't collide with its pills.
- **Journey chips wrap to a new row** when they'd exceed the card width.
- **Job pills are round + filled; journey chips are square + pale.** This is the Q12 disambiguation
  and it's enforced by the engine, not by what you type.

## Reading a bad card (what to look for, and the fix)
Verify **every** card by Reading its PNG. Common issues, all fixed in the spec:

| Symptom in the PNG | Cause | Fix in the spec |
|---|---|---|
| An inline `note` on Connects-to runs off the right edge | note is long *and* sits after long product text; note x is width-estimated | shorten the `note`, or shorten `trigger`/`target` |
| A card is far taller than its row-mates (ragged grid) | one page carries much more than the others | give it its own row (`--columns 1`), or check the checklist hasn't drifted into sub-task detail |
| The checklist reads like a list of jobs | Q10 slipped | apply the test: an item that could appear unchanged on three pages is a job — rewrite until it's true of *this* page only |
| Acceptance criteria are all factual, no cotton test | Q11 half-done | add `acceptance.qualitative` — the engine already warns on this at generate time |
| Everything is tagged `J1` | the job set is too coarse, or feature-shaped | go back up to the JTBDs (Q13); this is an upstream problem the card can't fix |
| Amber ⚑ flags everywhere | many tasks map to no job | that's the gap-finder working — resolve them with the human, don't silence them |
| A job pill is grey and missing from the definitions page | the code isn't in top-level `jtbds` | add the code + statement + persona to `jtbds` |
| Boxes/tofu instead of glyphs | an emoji/dingbat in your text (cairosvg renders them as tofu) | replace with a plain char — the built-in markers (`→ ⇢ ↦ ↗ ⚑ · •`) are safe |

## When a card is genuinely too dense
That's a **content** signal, not a layout bug. Options, in order: (1) check the checklist is at task
altitude and not decomposing into sub-steps; (2) check the page is really one page and not two (Q1);
(3) only as a last resort (Q2), propose splitting depth into a companion doc and keep the card as the
index. Never shrink the font to force fit — that breaks the digestible metric.

**If your instinct is "this card needs a components table to explain the screen" — that's Q3 talking
you back into v1.** The screen is design's; the card says what must be true of it.
