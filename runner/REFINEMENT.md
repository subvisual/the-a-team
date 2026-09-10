# Bounded refinement of an existing product

Refinement reuses accepted product context and obligations. It does not regenerate
discovery, the PRD or every board for a known defect. The existing feature command
layer owns its state; the existing local runner owns independent implementation
review and verification receipts.

Before configuring a change, select current context as described in [CONTEXT.md](CONTEXT.md).
Maintain the existing acceptance ledger and disclose unresolved owners, reviews
and dependencies. A refinement does not lower any acceptance threshold.

## Change record

Save a short JSON record, then submit it through the feature CLI's
`configure-refinement` command as `{"change": ...}`:

```json
{
  "schemaVersion": 1,
  "id": "REF-SAVE",
  "kind": "bugfix",
  "outcome": "Retry a failed save without losing pending edits",
  "linkedObligations": ["OBL-SAVE"],
  "invariants": ["persisted-before-submit"],
  "authorization": {"actor": "owner", "reference": "request-123", "authorized": true},
  "authorizedDelta": "Repair retry under the accepted save contract",
  "surfaces": ["src/save.mjs", "test/save.test.mjs"],
  "dependencies": [],
  "risks": [],
  "affectedArtifacts": ["docs/product/context.md", "docs/features/save/result.json"],
  "reviews": []
}
```

These are illustrative IDs: use actual project-owned obligations, current source
IDs and existing authorization. Paths are canonical target-relative file paths,
not directories or globs. Linked obligations must exist in selected requirement
authority. Global invariants are always retained. `kind` is `bugfix`, `visual`,
`feature-delta` or `copy`. Dependencies have an `id` and explicit `status` of
`satisfied`, `pending`, `blocked` or `unknown`; unresolved entries block work.

The computed record retains the Git base, inherited dirty-file hashes, selected
source revisions, accepted design/architecture bindings, route, required reviews,
verification methods and pending result. The controller adds only its exact
`feature.json` and temporary `.feature.lock` paths to the affected artifacts.

Declare uncertainty in `risks`, even for small diffs. Route selection also checks
the stated delta and affected source kinds for the following signals:

| Risk | Required review |
| --- | --- |
| `new-audience`, `new-job`, `load-bearing-assumption` | discovery |
| `authorization` | security-review |
| `business-rule` | domain-review |
| `design`, `interaction`, `accessibility`, `shared-token` | design-review |
| `architecture` | architecture-review |
| `migration` | architecture-review and migration-review |

This is a deterministic routing aid; reviewers must still inspect the actual
delta for undeclared uncertainty. Required reviews block implementation. To
resolve one, cite an existing decision in `reviews` as
`{"kind":"design-review","actor":"reviewer","reference":"docs/reviews/design.json","approved":true}`.
The referenced JSON contains the same kind/actor/approval and `sourceRevisions`
mapping every selected source ID to its inspected content hash. Refresh relevant
authority and reconfigure after an authorized review; do not forge a receipt.

## Execute and finish

All mutations use the expected manifest revision and a stable event ID:

```sh
node "$HARNESS/runner/src/feature-cli.mjs" configure-refinement \
  --feature "$FEATURE" --expected-revision 3 --event-id configure-save \
  --input "$(cat configure-refinement.json)"
node "$HARNESS/runner/src/feature-cli.mjs" start \
  --feature "$FEATURE" --expected-revision 4 --event-id start-save \
  --input '{"phase":"dev"}'
```

Replace example revisions with the current values from `show`. A replay uses the
same event ID and identical input. `start` revalidates current context and reviews.
Create a scoped local ticket in `issues.md` with a stable `ISS-...` ID, the
`REF-...` ID, every linked `OBL-...` ID and checkable acceptance criteria. Run it
through the existing local runner. Commit method-specific evidence and revalidate
affected context observations before the final executor commit, so the independent
reviewer inspects the same code, evidence and current context. Only affected
artifacts may change; unchanged inherited work remains outside this delta.

Behavior changes require `regression` evidence. Low-impact text or styling uses
`existing-checks` and `rendered-review`. All routes require the runner's delivered
independent approval. A method report is a committed JSON file:

```json
{
  "method": "regression",
  "status": "passed",
  "summary": "Observed results of the stated regression checks",
  "actor": "verifier",
  "sourceRevisions": {"src/save.mjs": "<sha256>", "test/save.test.mjs": "<sha256>"},
  "scenarios": [
    {"id": "save-failure-retry", "status": "passed"},
    {"id": "edits-in-flight", "status": "passed"},
    {"id": "dependent-submit-blocked", "status": "passed"},
    {"id": "unsaved-navigation", "status": "passed"}
  ]
}
```

Use actual output and inspected source hashes. The four scenario dispositions
are required for save/retry changes; other regressions follow the ticket. An
authored report alone never replaces the supervisor's independently recorded
review, command results and output hashes. Human studies remain separate ledger
obligations and are not established by these synthetic fixtures.

After the approved revision is available in the feature checkout and implementation
and verification have their own current milestone records, invoke
`finish-refinement` with this `completion` object:

```json
{
  "completion": {
    "summary": "Retry preserves pending edits under the accepted contract",
    "issuesPath": "docs/features/save/issues.md",
    "ticketId": "ISS-SAVE",
    "approvedRevision": "<exact runner-reviewed commit SHA>",
    "evidence": [{"method": "regression", "reference": "docs/features/save/result.json"}]
  }
}
```

The read-only validator checks current ticket content/version, execution policy,
delivered local supervisor approval, verification output hashes, revision ancestry,
scope, source hashes, current context and method dispositions. It permits only the
exact controller manifest/lock bookkeeping after the reviewed revision; code,
context, criteria or report changes require new review. Earlier product changes
cannot be hidden in a later reviewed base. Use the same configured harness and
execution settings as the runner; programmatic callers may pass a freshly resolved
policy, while the CLI resolves it from the actual target configuration.

Unchanged inherited files are preserved only as unrelated work. Relevant source,
context, ticket and report bytes must exist in the reviewed Git tree, including
files that Git would otherwise ignore. An inherited untracked report cannot
satisfy a verification method.

The manifest records the verified result and retains result history. It does not
record human acceptance, integration, release or product validation. Later bound
artifact changes make the corresponding evidence stale. A separate post-integration
context refresh records observed integration without rewriting product intent.
