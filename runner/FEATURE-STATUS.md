# Feature status and cooperative controls

Inspect a feature without running agents, opening a budget window, claiming an
issue, changing Git, or repeating an external action:

```sh
node runner/src/feature-cli.mjs status --feature /target/docs/features/save
node runner/src/feature-cli.mjs status --feature /target/docs/features/save --format json
node runner/src/feature-cli.mjs status --feature /target/docs/features/save --format html > /tmp/save-status.html
```

Open the HTML file directly in a browser. It is a local snapshot with native
document, board and runtime links. Regenerate it to check current evidence;
refreshing an old HTML file does not revalidate anything. Save the preview outside
the feature's bound artifact trees so generating a report does not alter reviewed
evidence. `show` remains the full versioned manifest interface. Invalid usage or
unreadable manifests produce a JSON error envelope and exit 2 in every format.

The projection calls `loadFeature`, which rehashes actual artifacts and validates
current obligations and combined-revision evidence. Status includes the concrete
reason and next action, gate recommendation and decision needed, consequence of
continuing, changed artifact digests since the latest phase decisions, later
configuration/revision events, run-brief assumptions, outstanding obligations,
and current evidence links. Present bytes are distinct from accepted evidence.
Definition/design approval is a phase decision; provisional directions remain
visibly provisional until an authorized human decision is recorded. All six
milestones retain their own pending/recorded/stale/unknown state and receipt
history. A recorded phase in progress does not prove a live process is running.

The index reads existing documents and rendered boards, up to 200 discovered
files and four directory levels under `briefs` and `lofi`; bound evidence is
checked separately. Dotfiles, dependency trees, credentials and symlink escapes
are excluded. Only files inside the target repository receive local links.
Required unsafe evidence blocks loading instead of acquiring a trusted link.
Missing files remain visible with no active link. HTML content is escaped and
uses no scripts, remote assets, or mutation controls.

Optional run-brief fields may be recorded by `init` or the already-authorized
`configure` command:

```json
{
  "runtime_links": [{"label": "Save prototype", "url": "http://127.0.0.1:4321/save"}],
  "runner_history": [{"repo": "/exact/target", "issue_key": "ISS-SAVE"}]
}
```

Runtime links must use HTTP(S) and have no embedded credentials or sensitive
query/fragment names. Unsafe URLs are omitted. Their availability is explicitly
not checked by status. Runner history must name the exact identity supplied to
the adapter: the local target path for local runs, or `owner/repo` for GitHub
runs, plus the stable issue key. Record this association **before dispatch** so
an interrupted attempt is discoverable before an outcome receipt exists. Status
does not scan other histories or guess identities from titles, labels or branch
names. Absent associations remain unavailable. Research assumptions maintained
in `research-plan.md` remain linked evidence; the displayed assumption list is
the run brief, and the displayed obligation list comes from the current ledger.

Budget comes from the existing read-only repository allowance ledger, using the
resolved execution policy when recorded. It is shared across features/issues and
attempts, not a feature-only allowance. A run-brief limit is not an observed
balance. Unknown cost or unfinished launches makes remaining dollars unknown;
known spend and accounting diagnostics remain visible. Resume never replenishes
the allowance or erases failed-attempt costs.

## Controls

All controls use the existing atomic compare-and-swap and durable event history:

```sh
node runner/src/feature-cli.mjs pause --feature /target/docs/features/save --expected-revision 12 --event-id pause-review-1 --input '{"reason":"Review the provisional direction"}'
node runner/src/feature-cli.mjs resume --feature /target/docs/features/save --expected-revision 13 --event-id resume-review-1 --input '{"reason":"Review complete; inspect retained work"}'
node runner/src/feature-cli.mjs revise --feature /target/docs/features/save --expected-revision 14 --event-id revise-design-1 --input '{"phase":"design","reason":"Keep draft input after a failed save"}'
node runner/src/feature-cli.mjs abort --feature /target/docs/features/save --expected-revision 15 --event-id abort-slice-1 --input '{"reason":"Stop this slice"}'
```

Use the **actual current revision** from status; the numbers above illustrate the
sequence only. On a lost response, replay the identical command with its original
revision and event ID. It returns the recorded result without appending a second
event. Different inputs require a new ID; a competing revision requires reload.
An already-recorded blocked command remains blocked on replay.

- **Pause** stores a cooperative scheduling hold. No fresh phase start or gate
  advancement is allowed while paused. Already-running work can still record
  completion, issue outcomes, milestones, refinement completion or failure;
  configuration, revision and abort remain available. Updated observations do
  not silently lift the hold, and artifact revalidation still happens on read.
- **Resume** clears that hold and derives the current stage. It starts no process,
  executes no phase, republishes nothing, and does not turn stale evidence into
  acceptance. Inspect unresolved actions and current evidence before dispatch.
- **Revise** invalidates the named phase and its dependent phases even when the
  phase has no live bindings. Bound affected milestone evidence becomes stale;
  independent milestone receipts and all historical decisions remain recorded.
  Revision during a pause retains the hold.
- **Abort** is terminal for this run and preserves artifacts, branches, issue
  receipts and event history. It performs no deletion or cleanup.

These are cooperative feature controls, not operating-system suspension or
process-tree termination. Native macOS detached-child containment
is an accepted known limitation in #37. An already-started runner invocation may
finish its own work; the orchestrator must check the feature hold before its next
dispatch. Pausing does not revoke an in-flight external operation.

If status names an uncertain action, preserve its exact identity and reconcile
through the existing runner recovery path. `runAction` returns a recorded result,
records a positively confirmed result, or retries only after confirmed absence.
Unknown delivery is never a reason to create a new publication action. Neither
status nor resume performs reconciliation or a side effect automatically.

## Regression evidence

```sh
node --test runner/test/feature-operator.test.mjs runner/test/feature-state.test.mjs runner/test/feature-state-cli.test.mjs
ATEAM_PLAYWRIGHT_MODULE=/trusted/path/playwright/index.mjs node runner/test/browser/feature-operator.mjs /scratch/operator-preview
```

The deterministic tests invoke the actual CLI, retain a failed/uncertain synthetic
action through pause/resume, reconcile its receipt, and verify only one effect.
They exercise paused evidence changes, missing artifacts, safe links, event
collisions, independent milestones and actual Git-branch/artifact preservation.
The browser proof opens the generated HTML, navigates its board/runtime links,
checks every local link target, distinguishes provisional/accepted/stale
decisions, verifies independent human-acceptance/integration states, and captures
desktop/mobile screenshots. Its runtime is synthetic and stops after the check.
