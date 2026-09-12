# Artifact validation

The Python wireflow and page-brief renderers share the runner's deterministic
validator. Keep the full harness checkout available and use Node 20+ and Python
3. Set `ATEAM_NODE` only when Node is not on PATH. Rendering defaults to strict:

```sh
python3 <harness>/.claude/skills/wireflow/scripts/wireflow.py board.json --strict --out out
python3 <harness>/.claude/skills/page-brief/scripts/page-brief.py board.json --strict --out out
node <harness>/runner/src/artifacts-cli.mjs wireflow --input board.json
node <harness>/runner/src/artifacts-cli.mjs feature --feature <feature-dir> --root <target> --stage spec
```

`--validate-only` checks a renderer input without producing a render. Explicit
`--permissive` keeps draft rendering available and reports warnings, including
unknown references. Its receipt is always ineligible for phase advancement.
Strict failure exits 2 before writing new output. Existing output from an earlier
render is not evidence about the new source. A successful render writes
`artifact-validation.json`, including the input node/edge IDs. Feature completion,
approval and reload read the actual source files and run the gate again; they do
not trust a receipt, SVG, HTML, agent claim or saved success flag.

Definition and later stages require `prd.md`, `acceptance.json`,
`briefs/wireflow/board.json` and `briefs/pages/board.json`. Spec and later stages
also require the component contract in `spec.md`. The existing canonical
obligation validator checks stage-specific coverage and evidence; future human
studies remain pending until their required stage.

Use the same IDs across files:

- Jobs come from `<target>/docs/product/jtbd/*.md`: frontmatter `id`, or the
  existing filename prefix such as `01` from `01-save.md`. Boards reference these
  IDs rather than inventing a second job register.
- Each journey has a stable `id`, accepted `jtbds`, unique node IDs and edges with
  valid `from`/`to`. Edge `id` is recommended; legacy edges get a deterministic
  diagnostic identity. Each screen node carries the page brief's `pageId`.
- Pages have stable `id`, `name`, a nonempty job-tagged `checklist`, and nonempty
  `acceptance.factual` and `acceptance.qualitative` criteria arrays. These are
  criteria, not claims that a human study ran. Each page maps to a screen node.
- Connections have an explicit `kind`: `page`, `job`, `journey` or `external`.
  Internal `targetId` is an exact stable ID; `target` may remain the display
  label. With no `targetId`, `target` must itself be the exact ID. Each
  `appears_in` entry uses an exact `journey` ID and screen node ID in `step`.
- Pages and components carry nonempty `requirementIds` and `obligationIds`
  referencing `acceptance.json`, alongside the existing exact obligation
  snapshots defined in [prd-writer](../.claude/skills/prd-writer/SKILL.md).

Every page must have at least one declared component. Put exactly one top-level
JSON fence in `spec.md` (JSON below is synthetic):

````markdown
```component-states
{
  "schemaVersion": 1,
  "components": [{
    "id": "C-SAVE", "pageId": "P1",
    "requirementIds": ["R-SAVE"], "obligationIds": ["OBL-SAVE"],
    "states": {
      "empty": {"status": "applicable", "behavior": "Show an editable empty field"},
      "loading": {"status": "applicable", "behavior": "Retain the draft and show Saving"},
      "error": {"status": "applicable", "behavior": "Retain the draft and offer Retry"},
      "populated": {"status": "applicable", "behavior": "Show the persisted value"}
    }
  }]
}
```
````

A state can instead be `{"status":"not-applicable","reason":"<concrete
reason>"}`. An omitted state or empty reason blocks the gate.

For an explicitly headless change, the PRD may contain one `artifact-scope`
JSON fence with `interface: "none"`, a concrete `reason`, a canonical
`requirementId`, and `source: {id, revision}`. That source must be a current
requirement in the target's current-context index with a matching actual content
hash. This exempts interface boards and components only; canonical acceptance
coverage and phase artifact bindings still apply. An absent, invented or stale
source cannot exempt missing artifacts.

Diagnostics include artifact path, stable ID, field and invalid reference. Fix
the source and rerun; never edit a renderer receipt to make a phase pass.
