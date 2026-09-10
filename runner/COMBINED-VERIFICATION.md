# Final combined verification

Per-issue approval is evidence for that issue revision. Before recording the feature verification milestone or completing its PR phase, verify the actual combined branch. The feature gate loads the current `issues.md`, requires matching approved revisions for every issue, checks their ancestry, and validates the supervisor record against the current branch. Technical verification does not record integration, human acceptance, release or product validation.

Add `deliveryVerification` to the target's existing `CLAUDE.md` A-Team Config JSON. Iteration keeps using `verificationCommands`. Delivery separately declares applicable suite, typecheck, build, browser and integration checks; give a reason for an inapplicable category. No command and no applicable authorized documentation-only exemption means verification cannot pass.

```json
{
  "deliveryVerification": {
    "schemaVersion": 1,
    "checks": [
      {"id":"suite", "kind":"suite", "command":"npm test"},
      {"id":"types", "kind":"typecheck", "command":"npm run typecheck"},
      {"id":"build", "kind":"build", "command":"npm run build -- --outDir \"$TMPDIR/dist\""},
      {"id":"browser", "kind":"browser", "renderedReview":"verification/rendered.json"},
      {"id":"integration", "kind":"integration", "renderedReview":"verification/connected.json"}
    ],
    "boundaries": [
      {"id":"billing", "status":"substituted", "reason":"Local contract fixture; provider tenant not executed", "obligationIds":["OBL-BILLING-LIVE"]}
    ]
  }
}
```

Commands run in separate private checkouts at the same exact SHA under the native review sandbox. Source is read-only; generated output and dependencies belong in scratch (`TMPDIR`, `HOME`, caches). Dependencies must already be available in declared toolchains; verification does not install into the target or enable external networks. CI/setup changes still require their own exact protected-path authorization. Browser and integration plans use the supervised rendered evaluator with a fresh browser context and one local application origin. Ordinary command checks keep their network denial.

Use the declarative plan and trusted browser-runtime setup in [RENDERED-REVIEW.md](RENDERED-REVIEW.md). Combined browser checks default to 30 seconds, may request up to five minutes, and are always bounded by the remaining supervisor allowance.

Prepare `approved-issues.json` outside the target source as a list of `{ "issue": <current normalized issue>, "approvalPath": <supervisor approval JSON> }`. An empty list is explicit for a standalone verification with no issue approvals; feature delivery requires all actual feature issues. It never treats a commit title as approval.

```sh
node /path/to/harness/runner/src/combined-cli.mjs plan --root /path/to/target --branch feature/example --issues /path/to/approved-issues.json
node /path/to/harness/runner/src/combined-cli.mjs verify --root /path/to/target --branch feature/example --issues /path/to/approved-issues.json
node /path/to/harness/runner/src/combined-cli.mjs check --root /path/to/target --branch feature/example --issues /path/to/approved-issues.json --record /path/to/supervisor/result.json
```

Every command emits one JSON object. `plan` has no effects. `verify` retains attempt/start records, actual command output, environment identity, exit codes, omitted checks and previous failed, interrupted or unreadable attempts under the supervisor's `combined/` store. A later pass retains earlier failures with an unresolved disposition; it does not infer a flaky-test diagnosis. A newer failed or interrupted attempt on the same branch or revision invalidates the older passing record. `check` is read-only and invalidates evidence after branch, policy, criteria, approval or output changes. Unexecuted/substituted systems and their obligations remain visible. Missing applicable checks never produce a pass.

For `feature-cli record-milestone --input`, use `evidence.combinedVerification` for the returned supervisor record path and `evidence.revision` for its exact SHA, along with the normal evidence reference and artifact bindings. The same current evidence is required at the PR phase. A string pointing to an old report cannot satisfy the gate.

For a direct combined command that uses a scoped authorization, supply `--authorization-file` on `verify` and `check`. The feature controller can inspect already-executed evidence without asking for that file again: it restores the recorded authorization context only for a read-only comparison against current target bindings, configuration and base revision. It never starts new work or opens a recovery budget from that retained context.

Native macOS retains #37's documented whole-process-tree limitation. This feature makes no stronger process-containment claim.

## Synthetic connected verification

With a trusted installed Playwright module and Chrome available, run the public CLI fixture from the harness checkout:

```sh
ATEAM_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs ATEAM_BROWSER_CHANNEL=chrome node runner/test/browser/combined-connected.mjs /path/outside/harness/combined-evidence
```

The fixture retains its separate synthetic repository, committed variants, operator configuration and supervisor evidence. The correct application passes; removing authorization on the actual route or breaking connected submission fails even though its isolated controller test still passes. Restoring the application passes and retains both failures. A screenshot corruption check verifies that artifact changes invalidate the real combined receipt. This exercises local synthetic state only; the external identity provider remains explicitly unexecuted.
