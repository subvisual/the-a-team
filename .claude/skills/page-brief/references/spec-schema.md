# Board spec schema (v2)

The engine (`scripts/page-brief.py`) renders from a single JSON file. It carries **no** project
content — everything below comes from your spec. A complete worked example ships at
`references/examples/casa-financeira.json` (illustration only — it is not part of the method).

## Top level
```jsonc
{
  "title":   "Page-brief — <Project>",       // optional board title
  "columns": 3,                                // cards per row (default 3; use 1 for a deep page)
  "width":   1380,                             // optional board width in px (default 1380)
  "jtbds": {                                   // the job set — defined ONCE for the whole board
    "JTBD-1": {
      "statement": "When <situation>, I want <motivation>, so I can <desired outcome>.",
      "persona":   "Consultor",                // the actor-in-situation the job belongs to (Q13)
      "color":     "#8E44AD"                   // optional — otherwise auto-assigned
    },
    "JTBD-2": "a bare string still works — but you lose the actor, and knowing who's struggling matters"
  },
  "pages": [ /* one object per unique page — see below */ ]
}
```

`jtbds` is the **single source of job definitions**, and the engine renders it as a dedicated
**"Jobs to be done" page** at the top of the board (Q14). Cards carry **code pills only** — never
re-state a job's text on a card. Codes are free-form (`JTBD-1`, `J-onboard`, `pay-correctly`); a
`JTBD-N` code renders its pill as `JN`, any other code renders as-is. Colours auto-assign from an
8-hue palette in declaration order.

The engine also renders a **"Job → pages index"** page: for each job, the pages it passes through and
the tasks on each. If a job has no page carrying a task for it, the index says so in amber — that's a
real finding (the job is unserved, or the pages are under-specified), not a rendering gap.

## A page object
```jsonc
{
  "id":   "P1",                       // stable ID — used for linkage, keep it fixed across re-layouts
  "name": "Lead detail",
  "route": "app#/leads/:id",          // shown under the title
  "ref":   "/app#/leads/:id",         // Design-ref (live route) — links to the real screen, not a shot

  "responsibilities": "1–3 lines: what the page is accountable for, translating the job into page
                       accountability. Note any variant here.",

  "checklist": [                      // TASKS (Q10) — not jobs restated
    { "text": "Show every opportunity on the lead, with its state", "jobs": ["JTBD-1"] },
    { "text": "Show the Seguro side of this client", "jobs": [],
      "flag": "serves an unlisted job? — is this a cross-sell job we never wrote down?" }
  ],

  "appears_in": [                     // inbound — which journeys/steps traverse this page
    { "journey": "J3", "step": "open lead" },
    { "journey": "J4", "step": "oversight", "variant": "permission-filtered" }
  ],

  "connects": [                       // OUTBOUND routing — cross-page AND cross-job. Makes it a graph.
    { "trigger": "Abrir processo", "target": "P2 Credit process", "kind": "page",
      "job": "JTBD-1", "note": "same job, deeper surface" },
    { "trigger": "Adicionar produto", "target": "Routing (Journey 2)", "kind": "journey",
      "job": "JTBD-4", "note": "triggers ANOTHER job — spawns an opportunity" },
    { "trigger": "Abrir conversa", "target": "Channels thread", "kind": "external",
      "job": "JTBD-1", "note": "non-navigational handoff" }
  ],

  "acceptance": {                     // how we'd know this page is right (Q11) — BOTH layers
    "factual": [
      "Opportunity states per vertical are shown",
      "RGPD consent status is visible before any action is offered"
    ],
    "qualitative": [                  // the cotton test — phrased as questions you ask a person
      "Can you tell me which opportunities are on this lead?",
      "Can you tell me whether you're allowed to work this lead right now?"
    ]
  }
}
```

### Field → block mapping
| Block           | Fields rendered                     |
|-----------------|-------------------------------------|
| **Purpose**     | `responsibilities` · `checklist`    |
| **Connections** | `appears_in` · `connects`           |
| **Validation**  | `acceptance`                        |

Every block/field is **optional** and self-skipping — a degraded card with only responsibilities and a
checklist still renders cleanly. Only `id` + `name` are truly required per page.

## Conventions the engine encodes for you
- **Job vs journey is never ambiguous (Q12).** A job renders as a filled, job-coloured, fully-rounded
  **pill**; a journey renders as a pale-blue square-cornered **chip carrying the word "Journey"**. So
  `{"journey": "J3", "step": "open lead"}` renders `Journey 3 · open lead` — it can't be misread as
  job 3. The reading key on every card states both.
- **`kind` on a connection** picks the arrow marker: `page` `→` · `journey` `⇢` · `job` `↦` ·
  `external` `↗`. Defaults to `→`.
- **Product-vs-guidance:** product text (`trigger`, `target`, `text`, `route`) renders **dark**;
  interpretive text (`note`, `flag`) renders **italic grey/amber**. Put the product fact in the
  product field and your read in the `note` — don't merge them into one string.
- **The cotton test gets its own tinted block** with the line *"a person runs this — it is not
  self-certifiable"* printed automatically. You cannot render a qualitative criterion that looks
  AI-verified.
- **An untagged checklist item auto-flags.** Leave `jobs` empty and the engine prints the gap-finder
  warning for you (Q5). Supply your own `flag` string to say something more specific.
- **Reading-key footer:** added to every card automatically.

## Removed in v2 — the engine warns, it does not silently drop
`jobs_served`, `components`, `cut_log`, `open` are **ignored** with a warning explaining why (see
`method-decisions.md` Q3). `key_info` is auto-folded into `acceptance.factual` with a warning telling
you to add the qualitative layer. `appears_in` strings (`"J3 · open lead"`) and `connects.component`
are upgraded silently.

## Generate
```bash
python scripts/page-brief.py board.json --out ./out --rasterize
python scripts/page-brief.py board.json --out ./out --columns 1     # one deep card per row
python scripts/page-brief.py board.json --out ./out --cards-only    # skip the two shared pages
```
Outputs `board.svg`, `board.html`, and (if a rasterizer is available) `board.png`.
