# Flow contracts and prototype fidelity

The source of navigation is `briefs/wireflow/board.json`. Keep its journey, node,
page and edge IDs through design, prototype and spec. Display names can change;
they never identify transition targets. Unknown targets fail before generation.

The interaction choice is independent of visual depth (`flows`, `lofi`, or
`hifi-direction`). Select `navigation` or `interactive` explicitly in the flow
contract. Navigation remains a valid sketch: it displays graph links and branch
conditions, including descriptive conditions it does not execute. It cannot
verify input validation, persistence or recovery. Interactive mode uses local,
deterministic scenario sequences; it makes no backend requests or durable writes.

## Author and generate

Author feature-local `prototype.json` with `schemaVersion: 1`, a stable `id`,
`fidelity`, `journeyId`, `initialNodeId`, `scenario`, `states`, and `obligations`.
Compile it against the actual wireflow; copy the returned `contract` object into
one top-level `flow-contract` JSON fence in `design.md`. The compiler supplies
the exact graph, source revision and complete contract revision; do not hand-edit
hashes or reconstruct arrows from screen names.

```sh
node <harness>/runner/src/prototype-cli.mjs compile --feature <feature-dir> --root <target> --input prototype.json
node <harness>/runner/src/prototype-cli.mjs generate --feature <feature-dir> --root <target>
node <harness>/runner/src/prototype-cli.mjs validate --feature <feature-dir> --root <target> --stage design
```

Generation uses the incumbent Astro/Tailwind template and writes a `/flow` page,
the small `FlowPlayer` and local runtime, `src/data/flow.json`, and
`flow-manifest.json`. It adds a home redirect only when no home page exists.
Unrelated screens and accepted tokens are retained. Output symlinks are refused.
Install the existing template dependencies inside the generated `lofi` project,
then run `npm run build` (including token lint) and serve the resulting `dist`.
The manifest lists every node and transition, including conditions and triggers.

Spec copies the exact accepted `flow-contract` fence into `spec.md`, alongside
its component-state declarations. From design onward, the feature artifact gate
compares the current wireflow, design, and generated flow data; from spec onward
it also compares the spec contract. Changing the graph, scenario or mapping
requires regeneration and renewed review. A rendered file alone cannot pass.

## Small interactive contract

Use [the synthetic save fixture](test/fixtures/flow/save.mjs) as a complete schema
example, not as client content. It has three pages and six state nodes covering
invalid input, loading, failure, retry, review and submission.

- Every node has one state with `nodeId`, a valid `pageId` and `kind`: `form`,
  `loading`, `error` or `summary`. Non-screen graph nodes still map to the page on
  which their state is shown. Form fields have a safe `key`, visible `label`,
  boolean `required`, and an initial string value in the scenario.
- `scenario` has `id`, `initial` values and named `sequences`, such as
  `{"save":["failure","success"]}`. A loading state names its `operation` and
  bounded `delayMs`. Exhausted sequences stop visibly and require reset.
- Interactive edges have stable `id`, `from`, `to`, `trigger` and action `label`.
  Conditions are complementary `{kind:"valid"}` / `{kind:"invalid"}`, or
  distinct `{kind:"outcome",value:"failure"|"success"}` results on `settle`.
  Unsupported prose conditions stop interactive compilation; navigation may
  retain them as descriptions. There is no eval or arbitrary JavaScript DSL.
- Only a successful simulated loading result may carry `effect:"persist"`.
  The runtime retains the failed request's draft for retry; dependent actions
  are available only at graph states that expose them. Reset restores initial
  data, counters and transitions, and cancels an outstanding simulated callback.
- `obligations` names actual canonical IDs, a capability (`navigation`,
  `validation`, `recovery`) and nonempty `requiredTransitions`. These describe
  what this prototype can observe; preserve broader canonical acceptance methods
  and stages from `acceptance.json`.

## Record observations without overstating them

The player exposes scenario evidence under its review disclosure. Save that JSON
as a feature-local receipt and assess it against the current generated contract:

```sh
node <harness>/runner/src/prototype-cli.mjs assess --feature <feature-dir> --root <target> --input review-receipt.json
```

An identity/revision mismatch stays unverified. Navigation receipts always leave
validation and recovery obligations unverified, even if the reviewer clicked
through every corresponding edge. Supported observed transitions are classified
as deterministic prototype observations. This command does not mark canonical
obligations satisfied, approve a phase, or claim production behavior, human
usability, accessibility conformance or a completed study. Attach actual browser
evidence for independent review and keep unmet methods pending.

## Reproduce the browser fixture

Generate the synthetic save fixture once per fidelity, build both projects, and
serve them on two isolated loopback URLs. The portable browser script accepts a
locally installed Playwright module (no runner dependency or automatic install):

```sh
ATEAM_PLAYWRIGHT_MODULE=<path-to-playwright/index.mjs> ATEAM_BROWSER_CHANNEL=chrome \
  node <harness>/runner/test/browser/flow.mjs <interactive-url>/flow <navigation-url>/flow <evidence-directory>
```

Omit the channel to use Playwright's installed Chromium. The script exercises
invalid input, loading, failed-save retention, retry payloads, dependent submit,
all three pages, repeated reset, reset during loading, mobile containment and
both fidelities. It writes screenshots and structured browser results. Ordinary
Node tests cover the strict CLI and feature gate. Neither is a human study.
