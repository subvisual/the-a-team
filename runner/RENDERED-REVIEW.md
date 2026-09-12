# Independent rendered review

Applicable accepted design/spec obligations are reviewed in running code before
approval. The existing independent reviewer remains responsible for semantic
judgment: screenshots and deterministic checks supply evidence, not a replacement
reviewer or a human usability study.

## Acceptance and project bindings

Add a target-relative `renderedReview` JSON path to A-Team Config before the
implementation run. `accessibilityTarget` defaults to `WCAG 2.2 AA`; a project
binding may specify a different target. Runtime fields (`sandbox.playwrightModule`
and `sandbox.browserChannel`) belong only to the operator's runner configuration.
The trusted runtime may alternatively be supplied through
`ATEAM_PLAYWRIGHT_MODULE` and `ATEAM_BROWSER_CHANNEL`. Never select a runtime from
an application module, source file or target A-Team Config.

The supervisor reads applicable current-context design sources and acceptance
ledger obligations with `method: "rendered-review"` from the accepted base commit.
Design sources should map their `obligationIds`; an unmapped applicable design
source requires the synthetic identifier `design:<source-id>`. The base plan's
exact digest is pinned too. Removing an obligation, changing expected computed
values, changing the server command, or shrinking a case matrix in the executor
head cannot approve that implementation. Reaccept changed intent in the project
before starting a new implementation run. Existing authorized ledger deferrals
remain explicit decisions; they are never counted as passed browser observations.
A valid future ledger deferral also disposes a design source mapped to that same
obligation, regardless of source order. Once its decision stage is reached, the
obligation requires fresh observation. Human-study obligations remain separate.

A selected rendered obligation without a plan produces an explicit pending
review and cannot approve. Every required obligation/state/viewport tuple needs
observed passing evidence. Missing cases remain pending; any observed failure
fails the review even when another case for that tuple passes. An applicable
design obligation omitted from the plan also remains pending. The independent
reviewer must assess whether the accepted matrix actually covers the design and
spec; deterministic completeness alone cannot make that semantic judgment.

## Declarative plan

```json
{
  "schemaVersion": 1,
  "serverCommand": "node server.mjs",
  "requirements": [
    {"obligation":"OBL-SAVE","state":"error","viewport":{"width":390,"height":844}}
  ],
  "cases": [
    {
      "id":"save-error-mobile",
      "obligation":"OBL-SAVE",
      "state":"error",
      "fixture":"synthetic long title with failed persistence",
      "route":"/draft",
      "viewport":{"width":390,"height":844},
      "actions":[
        {"type":"fill","selector":"#title","value":"Exact pending value"},
        {"type":"click","selector":"#save"},
        {"type":"wait","selector":"#status","text":"Save failed"}
      ],
      "assertions":[
        {"type":"text","selector":"#status","includes":"Save failed"},
        {"type":"value","selector":"#title","equals":"Exact pending value"},
        {"type":"contained","selector":"#retry"},
        {"type":"css","selector":"#status","property":"color","equals":"rgb(163, 32, 32)"}
      ]
    }
  ]
}
```

Expand the matrix for the primary journey, empty/loading/error/populated states,
long content, narrow and wide relevant viewports, keyboard/focus, actual vertical
and horizontal scrolling, and sticky positioning. Include retry and failure
recovery when the journey has persistence. Describe non-applicable states in the
accepted design/spec and retain outstanding states as required tuples without a
case until they can be observed. Do not delete requirements to hide missing proof.

Actions: `click(selector)`, `fill(selector,value)`, `press(selector,key)`,
`wait(selector,state|text)`, `scroll(selector,x,y)`, and
`dialog(disposition: accept|dismiss)` before the action that opens the dialog.
Selectors must identify one element where an assertion inspects geometry. Use
keyboard actions followed by `focus` and computed outline checks to prove focus
movement; a click is not keyboard evidence. Scroll a real container before
asserting its actual offset. Sticky edges are measured against the nearest
vertical scrollport, including its borders and actual scroll offset; the viewport
is used only when no nearer scrolling ancestor exists. The assertion requires a
resolved pixel inset and records the expected and observed edge coordinates.

Assertions: `text(selector,equals|includes)`, `value(selector,equals)`,
`visible(selector,equals:boolean)`, `disabled(selector,equals:boolean)`,
`focus(selector)`, `contained(selector)`, `css(selector,property,equals)`,
`scroll(selector,axis:x|y,min)`, `sticky(selector,edge:top|bottom,tolerance)`,
`accessibility`, and `api(path,status,method?,headers?,data?,jsonEquals?)`.
API expectations compare the actual response and optional exact JSON; redirects
are disabled. No JavaScript callbacks, evaluation strings, target-selected
modules, screenshot filenames, external routes or arbitrary driver arguments are
accepted. Fixed supervisor browser functions receive declarative data only.

## Execution and evidence

The native macOS verifier launches the app with read-only source, sanitized
credentials/environment, separate writable scratch, and a single assigned
loopback port (`ATEAM_VERIFICATION_PORT`). Chrome uses a fresh ephemeral profile
and context for each case. Only the supervised origin is allowed; unexpected
popups, off-origin requests and WebSockets fail the case, and service workers
are blocked. The observer closes contexts on cancellation. Evidence is written
outside both source and app scratch. Reviewers receive readable copies, while
approval hashes refer to the supervisor's original evidence.

Every observed case records exact SHA, route, fixture, state, viewport, screenshot,
computed geometry/style observations, assertions, and obligation ID. A control
whose box or label is clipped fails containment. Descendant label text is measured
against every clipping ancestor, so a wide outer button cannot hide a clipped
inner span. The bounded inspection retains the text fragment and clipping bounds;
non-rendered and conventional visually hidden accessibility labels are excluded.
The observer verifies rectangular overflow clipping. Clip paths, masks, legacy
clip regions, filters, transforms and paint containment are recorded as unsupported
geometry, explicitly unverified, and fail containment/sticky checks instead of
producing a false pass. Hidden or fully transparent controls also fail. Actual focus, scrolling and
sticky coordinates matter; class names cannot satisfy a mismatched token or
layout expectation. Server output survives failure. Screenshot and machine
observation hashes, original committed plan bytes, policy and revision are checked
before evidence reuse, including when the original repository has dirty files.
Pre-rendered-review approval records require fresh evaluation.

Bounds: 40 cases, 160 required tuples, 50 actions and 50 assertions per case,
3-second action waits, 5-second navigation, and a 300-second maximum server run.
The existing runner cycle budget bounds refinement; immutable candidate history
retains the best observed candidate with its actual SHA. An older passing SHA
never turns a failing or pending current SHA into a pass.

Every case runs bounded document-title, document-language, visible-control name
and image-alternative checks (up to 500 elements). Explicit assertions and keyboard
interaction add evidence for the selected design/accessibility obligations. This
is a partial automated check: it does not claim full WCAG 2.2 AA conformance,
screen-reader compatibility, exhaustive contrast analysis, or human usability.
Any human research/acceptance remains pending until real authorized evidence is
recorded. Keep these limitations visible in review and delivery reports.

`evaluateRenderedReview` returns `{status,recordPath,record}`. Combined verification
can select this production evaluator through a `renderedReview` browser or
integration check. That caller provides its private exact committed combined
revision. Issue review additionally supplies accepted base authority. Neither path
accepts application-authored success reports as independent evidence.

## Synthetic proof

Run `node runner/test/browser/rendered-review.mjs <outside-repo-evidence-dir>`
with the trusted Playwright environment above on native macOS. The isolated
fixture proves correct/restored behavior and injects clipped labels, a keyboard
trap, broken retry, computed token drift, broken scrolling and broken sticky
positioning. Both narrow and wide views, all primary states, screenshots,
computed observations, SHA reuse, dirty-source reuse and screenshot tampering are
exercised. These synthetic tests do not establish provider readiness or human
acceptance for any real product.
