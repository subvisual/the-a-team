# Current project context

Every phase and runner task resolves `current context` from the existing A-Team
Config in the target's CLAUDE.md (default `docs/product/context.md`). It contains
one fenced `ateam-context` JSON index alongside preserved narrative/history.
Missing or legacy prose-only context needs indexing before model execution.
Existing PRODUCT.md, DESIGN.md, ADRs and tokens are linked sources, never copied
into competing authorities. Bootstrap is owned by project-context; unknown
purpose, audience or decisions stay explicit and are resolved at their required stage.

The index schema is version 1. Required fields are `purpose`, `audience`,
`currentState`, ordered `authorityOrder`, `globalInvariants` (source IDs),
`bindings: {design, engineering}`, `commands`, `unresolvedDecisions`, `sources`,
`facts`, and append-only `history`. `sources` carry `id`, `kind` (requirement,
design, code, test, adr, history), target-relative file `path`, SHA-256 content
`revision`, optional affected `paths`, behavior/risk `tags`, mapped `obligationIds`,
and `global`. A task's linked `obligationIds` select their mapped requirement
sources even when the changed paths lie elsewhere.
Authoritative links live in those source paths and the preserved narrative.
Hash exact file bytes (`shasum -a 256 PATH`); do not use mtimes as revisions.

A derived fact has `id`, `kind: intent|observed`, `value`, source IDs in `sources`,
and exact hashes in `revisions: {sourceId: sha256}`. Optional `key` identifies a
comparable claim: an observed value disagreeing with an intent value is a conflict,
not permission to change intent. `global: true` forces applicable shared facts
into every task. State `discovery-only` is checked against implemented source and
package verification commands. Configured commands disagreeing with index commands
also block. Other semantic disagreements must be reported by the phase/reviewer;
content hashes establish freshness, not semantic truth.

```sh
node <harness>/runner/src/context-cli.mjs select --root <target> --task '{"paths":["src/save.mjs"],"tags":["persistence"]}'
```

This is the phase entrypoint. Nonzero exit means stop, surface the returned reason,
and revalidate only affected authority. Pass changed paths, behavior, risks and
linked obligations in task input; title/body/acceptanceCriteria also select common
persistence, authorization, accessibility, migration and security constraints.
Global invariant sources are always read. Selected facts bring their provenance;
unrelated archives and whole backlogs are not loaded. Sources are individual files,
inside the target, never secret-named files or Git internals. Source selectors must
be authored to reflect crosscutting obligations, not guessed solely from path size.

Both executor and reviewer startup (including resumed review) call this resolver
before model launch and include the result in their input. Source and index hashes
and selected reads are recorded with each launch. `context budget tokens` in
A-Team Config is an optional positive operating budget. Exceeding its estimate
blocks; increase an authorized budget or narrow relevant source material without
dropping applicable constraints. `estimatedTokens` is UTF-8 bytes divided by four,
not measured prompt consumption. `observedInputTokens` is null until the provider
reports it and covers the provider's session input, including inputs beyond this
selection. The two values are never substituted for one another.

Before independent review, the executor revalidates selected code/test sources it
changed with `revalidate --root <target> --update <update.json>`. The supervisor
copies the installed runtime into a fresh scratch directory and gives the executor
its exact tool path and `--policy <context-policy.json>` snapshot; pass both to
revalidate and select. This retains the effective runner-configured entrypoint,
commands and budget inside its existing filesystem boundary. The
update has `expectedIndexRevision`, `validation: {id, actor, evidence}`, affected
`sources: [{id, revision}]` and replacement observed `facts`. The evidence JSON
contains `method: source-inspection|verification`, a concrete `summary`, and
`sourceRevisions: {sourceId: sha256}`. Record actual inspection/check results;
never invent a reviewer approval. This preserves a `revalidation` history event
and lets independent review evaluate the new source. It establishes neither
integration nor acceptance. Commit the index and its evidence with the code.
Changed requirement/design/ADR sources additionally require an authorized decision
receipt; no revalidation command may rewrite intent facts.

After integration, project-context updates only affected observed facts:

```sh
node <harness>/runner/src/context-cli.mjs refresh --root <target> --update <refresh.json>
```

The update contains `expectedIndexRevision` (SHA-256 of the entire current-context
file), `integration: {id, actor, revision, evidence}`, affected `sources: [{id,
revision}]`, complete replacement observed `facts`, and optional `commands`, `currentState` or `unresolvedDecisions`. Resolving a pending
decision requires `decisions: [{id, actor, reference}]`; each target-relative JSON
receipt must match that ID/actor and include `authorized: true`, `rationale`, and
`sourceIds` for any changed requirement/design/ADR source. The receipt records the
existing authorization; the tool never grants it. Prior pending decisions and
receipt hashes remain in history. Unsupported update fields are rejected. The target-relative evidence is an operator/integration-layer JSON
receipt `{integrated: true, revision: "the integrated revision"}`; this command
checks that receipt and records its hash, but does not merge or independently
prove a remote merge. Never fabricate one from PR approval. Current source hashes
are rechecked. Historical values, provenance and narrative remain intact. Intent
facts require a separate authorized product/design/engineering decision, not this
completion refresh. Atomic replacement with a lock rejects concurrent or stale
updates; an interrupted lock requires explicit reconciliation, never silent removal.
