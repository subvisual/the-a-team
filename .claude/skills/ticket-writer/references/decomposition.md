# Decomposing a feature into runnable local issues

This reference is authored from the current `CONTRACT.md`, ticket-writer
workflow and runner parser. It describes the supported format; it does not
claim to recover an earlier missing reference.

Read the gated `prd.md`, `spec.md`, relevant briefs and the target's project
context. Trace each ticket to the PRD's requirement IDs and one primary job
(`[[NN]]`, or `JTBD: TBD` when the source does not identify a job). Record the
expected files touched, including verification. Do not invent missing product
requirements to make a ticket runnable; report the gap to the orchestrator.

## Choose vertical slices

Start with a tracer bullet: the smallest useful user outcome through all
necessary layers, from an entry point through behavior and persistence to
observable feedback. A settings form that saves a preference and shows that
saved value is a slice; separate database, API and UI tickets usually are not.
The tracer bullet establishes a working path that later tickets extend with
supported failure states, boundaries and additional behavior.

Give each ticket one outcome and enough context for a fresh implementing and
reviewing session. Include failure paths only where a requirement, specified
state or known constraint supports them. For wide mechanical changes, use
expand then contract: introduce a compatible path, migrate complete consumers,
then remove the obsolete path after its explicit dependencies are complete.
Keep intermediate slices usable and independently verifiable.

## File format and durable identity

Use `# Feature name — issues` for the document and one `## Title` per ticket.
A `## Dependency graph` preamble without ticket metadata or an acceptance
subsection is descriptive and is not parsed as a ticket. Each ticket uses:

```markdown
## Save and reopen a preference

**ID:** ISS-PREFERENCE-ROUNDTRIP
**Depends on:** none
**Requirements:** R-1
**JTBD:** [[01]] Preserve my chosen settings

### Description
Save the preference through the existing form and display its persisted value
when the user returns. Defer retry behavior to its dependent ticket.

### Acceptance criteria
- [ ] Given an unsaved preference, when the user saves it, then the saved value is displayed.
- [ ] Given a saved preference, when the user reopens settings, then the persisted value is selected.

### Technical notes
**Files touched:** src/settings.mjs, test/settings.test.mjs
Use the existing persistence service and verify through the public settings flow.
```

`**ID:**` is immutable authored identity, unique across this issues file. Use
`ISS-` followed by uppercase letters, numbers and hyphen-separated groups.
Renaming or reordering a ticket preserves its ID; never recycle an ID for a
different ticket. New tickets receive new IDs. Branches and local selection use
these IDs, for example `--issue ISS-PREFERENCE-ROUNDTRIP`.

`**Depends on:**` lists comma-separated local IDs or `none`. Never use titles,
implicit file order or prose as dependencies. Order the authored batch with
prerequisites first; the adapter also computes deterministic dependency order.
References must resolve within the whole batch. Duplicate IDs, unknown
references, cycles and empty acceptance criteria reject the entire batch before
execution, including when one ticket is selected with `--issue`.

`**Requirements:**` lists comma-separated PRD IDs (`R-1, R-2`). Verify those IDs
against the source PRD; parser syntax validation cannot prove requirement
coverage. Keep requirement trace in this metadata and derive more concrete
per-ticket criteria instead of duplicating the PRD's requirement-level text.

Empty checkbox markers are not criteria and fail batch validation.
Write one observable Gherkin scenario per checklist item: `Given …, when …,
then …`. A multiline item may continue with Given/When/Then/And/But. Blank lines
separate unbulleted scenarios. Avoid additional headings inside a scenario.
`### Acceptance criteria` ends at the next peer or higher heading, so technical
notes and files touched do not become criteria. Standalone GitHub tickets may
continue to use `## Acceptance Criteria` or another Markdown heading depth.

The parser exposes `criteriaVersion`, a deterministic SHA-256 of extracted
criteria, and `contentVersion`, a deterministic SHA-256 of title and body.
Criteria edits change both versions; a title edit changes content version while
preserving ID and criteria version. These versions describe input; they never
mean an issue is approved.

## Migrate legacy files deliberately

For existing title-based batches, run:

```sh
ateam-runner migrate-issues --issues docs/features/example/issues.md --dry-run --json
ateam-runner migrate-issues --issues docs/features/example/issues.md --json
```

The preview returns the proposed file and ID mapping without writes. The second
command uses a flushed same-directory temporary file and atomic rename, preserves
the existing file mode, and refuses replacement if the source changes during
preparation. A failed save cleans only its own temporary file. It persists generated IDs in the issues file once and translates only
unambiguous title dependencies. Later runs preserve existing IDs. Unknown or
ambiguous references, legacy identity collisions, duplicate IDs and invalid
batches produce diagnostics and leave the original file unchanged. Resolve the
reported ambiguity with explicit distinct IDs and dependencies before retrying.
Migration neither reads run history nor grants approval based on old commits,
branch names or title markers. Legacy text remains readable for a blocked plan;
execution requires a fully validated stable-ID batch.

## Check the handoff

Use `examples/issues.md` as the synthetic runnable batch. Its three tickets
contain exactly six Gherkin criteria, trace R-1 through R-3, and declare the
tracer bullet as the prerequisite for both extensions. `runner/test/local-issues.test.mjs`
checks required ticket-writer references exist and parses that file through the
real local adapter. Run the runner tests before shipping changes to this format.
Report ticket count, criterion count, requirement coverage, dependency order,
expected files and any decomposition gaps to the orchestrator.
