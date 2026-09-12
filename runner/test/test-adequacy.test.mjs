import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { approvalGate } from '../src/core/approval.mjs'
import {
  buildTestAdequacyAuthority,
  issueContractSource,
} from '../src/core/adequacy-authority.mjs'
import { normalizeReviewer, validateReviewer } from '../src/core/results.mjs'
import { review, verdictBody } from '../src/core/review.mjs'
import { runIssue } from '../src/core/loop.mjs'
import {
  adapter,
  commit,
  config,
  fixtureRepo,
  git,
  impl,
  issue as fixtureIssue,
  pass,
} from './approval-fixtures.mjs'
import {
  decision as obligationDecision,
  fixture as obligationFixture,
} from './helpers/obligations-fixture.mjs'
import {
  acceptedFailureStatus,
  correctSaveWorkflow,
  defectiveFailureStatus,
  defectiveSaveWorkflow,
} from './fixtures/test-adequacy.mjs'

const criterion =
  'failed persistence retains the exact pending payload for retry before dependent submission'
const issue = {
  key: '45',
  title: 'Test adequacy',
  body: criterion,
  acceptanceCriteria: [criterion],
}
const aspect = (status, evidence) => ({ status, evidence })
const adequacy = (overrides = {}) => ({
  criterion,
  expectedValues: aspect(
    'independent',
    'The expected retry payload is the literal nested fixture value, not a value read from the implementation.',
  ),
  publicBehavior: aspect(
    'exercised',
    'The test edits, saves, retries, and submits through the public workflow API.',
  ),
  substitutedBoundaries: aspect(
    'appropriate',
    'Only the persistence transport is substituted; workflow state and commands are real.',
  ),
  requirementSource: {
    id: issueContractSource(issue).id,
    revision: issueContractSource(issue).revision,
  },
  baselineExpectations: { status: 'preserved', requirementVersion: 1, authorization: '' },
  judgment: 'adequate',
  why: 'The checks would fail if pending payload retention, retry, or submission ordering regressed.',
  ...overrides,
})
const verdict = (entry = adequacy(), overrides = {}) => ({
  ok: true,
  exitCode: 0,
  verdict: 'approve',
  notes: 'Independent semantic review completed.',
  unmetAc: [],
  testCommand: 'node --test',
  testOutput: 'green',
  testsRan: true,
  testsPassed: true,
  testAdequacy: [entry],
  ...overrides,
})
const gate = (review) =>
  approvalGate({
    verdict: review,
    issue,
    verification: { commands: [{ exitCode: 0 }] },
    policy: { verification: { commands: ['node --test'], exemption: null } },
    changed: ['src/save.mjs'],
  })

test('public workflow retains an exact nested payload across failure and successful retry', async () => {
  let attempts = 0
  const flow = correctSaveWorkflow(async () => {
    if (++attempts === 1) throw new Error('offline')
  })
  const pending = { title: 'Annual review', details: { priority: 'urgent' } }
  flow.edit(pending)
  assert.equal(await flow.save(), false)
  assert.deepEqual(flow.snapshot().draft, pending)
  assert.equal(flow.navigate(), 'confirm-unsaved')
  assert.deepEqual(flow.submitDependent(), { status: 'blocked' })
  assert.equal(await flow.retry(), true)
  assert.deepEqual(flow.snapshot().requests, [pending, pending])
  assert.deepEqual(flow.snapshot().persisted, pending)
  assert.deepEqual(flow.submitDependent(), { status: 'submitted', payload: pending })
})

test('public workflow keeps edits made during flight dirty and blocks submission and navigation', async () => {
  const completions = []
  const flow = correctSaveWorkflow(
    () =>
      new Promise((resolve) => {
        completions.push(resolve)
      }),
  )
  const first = { title: 'First', details: { priority: 'normal' } }
  const second = { title: 'Second', details: { priority: 'urgent' } }
  flow.edit(first)
  const savingFirst = flow.save()
  await Promise.resolve()
  flow.edit(second)
  assert.deepEqual(flow.submitDependent(), { status: 'blocked' })
  assert.equal(flow.navigate(), 'confirm-unsaved')
  completions.shift()()
  await savingFirst
  assert.deepEqual(flow.snapshot().persisted, first)
  assert.deepEqual(flow.snapshot().draft, second)
  assert.equal(flow.snapshot().dirty, true)
  assert.deepEqual(flow.submitDependent(), { status: 'blocked' })
  const savingSecond = flow.retry()
  await Promise.resolve()
  completions.shift()()
  await savingSecond
  assert.deepEqual(flow.snapshot().requests, [first, second])
  assert.deepEqual(flow.submitDependent(), { status: 'submitted', payload: second })
  assert.equal(flow.navigate(), 'allow')
})

test('implementation-mirroring checks can pass for a defective workflow but cannot pass adequacy', async () => {
  let attempts = 0
  const flow = defectiveSaveWorkflow(async () => {
    if (++attempts === 1) throw new Error('offline')
  })
  flow.edit({ title: 'Annual review', details: { priority: 'urgent' } })
  await flow.save()
  const implementationValue = flow.snapshot().draft
  await flow.retry()
  // This deliberately bad assertion mirrors the defective implementation.
  assert.deepEqual(flow.snapshot().requests[1], implementationValue)

  const reviewed = verdict(
    adequacy({
      expectedValues: aspect(
        'implementation-mirroring',
        'The passing assertion derives its expected retry payload from state returned by the implementation.',
      ),
      publicBehavior: aspect(
        'not-exercised',
        'It never asserts the accepted retained literal through retry and dependent submission.',
      ),
      judgment: 'inadequate',
      why: 'The test passes when the implementation loses the pending payload.',
    }),
  )
  assert.throws(() => gate(reviewed), /inadequate tests/i)
})

test('accepted failure status uses redundant text, glyph and color while a mirrored color-only check is rejected', () => {
  assert.deepEqual(acceptedFailureStatus(), {
    text: 'Save failed. Your changes are retained.',
    glyph: '!',
    colorToken: 'danger',
  })
  const defective = defectiveFailureStatus()
  const implementationStyles = { failure: defective.colorToken }
  // This passes while contradicting the accepted redundant status contract.
  assert.equal(defective.colorToken, implementationStyles.failure)
  assert.equal(defective.text, '')
  assert.equal(defective.glyph, '')

  const reviewed = verdict(
    adequacy({
      expectedValues: aspect(
        'implementation-mirroring',
        'The expected color is copied from the implementation and omits the literal text and glyph contract.',
      ),
      judgment: 'inadequate',
      why: 'A color-only assertion cannot detect missing redundant status semantics.',
    }),
  )
  assert.throws(() => gate(reviewed), /inadequate tests/i)
})

test('approval requires exactly one complete adequacy entry per acceptance criterion', () => {
  assert.throws(() => validateReviewer({ ...verdict(), testAdequacy: [] }, { issue }), /adequacy/i)
  assert.throws(
    () => validateReviewer(verdict(adequacy({ criterion: 'some other criterion' })), { issue }),
    /adequacy|criterion/i,
  )
  assert.equal(gate(verdict()), true)
})

test('baseline weakening is rejected unless a changed baseline matches accepted ledger history', () => {
  assert.throws(
    () => gate(verdict(adequacy({ baselineExpectations: { status: 'weakened', requirementVersion: 1, authorization: '' } }))),
    /baseline|weaken/i,
  )
  assert.throws(
    () => gate(verdict(adequacy({ baselineExpectations: { status: 'changed-authorized', requirementVersion: 2, authorization: '' } }))),
    /authoriz/i,
  )
  assert.throws(
    () =>
      gate(
        verdict(
          adequacy({
            baselineExpectations: {
              status: 'changed-authorized',
              requirementVersion: 2,
              authorization: 'decisions/D-7.md',
            },
          }),
        ),
      ),
    /requirement version|actual versioned authorized requirement change/i,
  )

  const root = mkdtempSync(join(tmpdir(), 'ateam-authorized-baseline-'))
  const previous = obligationFixture()
  const current = structuredClone(previous)
  current.revision = 2
  current.requirements[0].version = 2
  current.requirements[0].obligations[0].statement = 'Prove exact public round-trip payload'
  current.requirements[0].decision = obligationDecision()
  mkdirSync(join(root, 'acceptance-history'))
  writeFileSync(join(root, 'acceptance-history/1.json'), JSON.stringify(previous))
  const content = JSON.stringify(current)
  writeFileSync(join(root, 'acceptance.json'), content)
  const ledgerIssue = { ...issue, requirements: ['R-ROUNDTRIP'] }
  const authority = buildTestAdequacyAuthority({
    root,
    issue: ledgerIssue,
    selection: {
      indexRevision: 'accepted-base-context',
      selected: [
        {
          id: 'acceptance-ledger',
          kind: 'requirement',
          path: 'acceptance.json',
          actualRevision: createHash('sha256').update(content).digest('hex'),
          content,
        },
      ],
    },
  })
  const accepted = verdict(
    adequacy({
      requirementSource: {
        id: authority.sources[0].id,
        revision: authority.sources[0].revision,
      },
      baselineExpectations: {
        status: 'changed-authorized',
        requirementVersion: 2,
        authorization: 'decisions/D-7.md',
      },
    }),
  )
  assert.equal(
    approvalGate({
      verdict: accepted,
      issue: ledgerIssue,
      adequacyAuthority: authority,
      verification: { commands: [{ exitCode: 0 }] },
      policy: { verification: { commands: ['node --test'], exemption: null } },
      changed: ['src/save.mjs'],
    }),
    true,
  )

  const rejectsNonsemanticChange = (candidate) => {
    candidate.revision = 2
    candidate.requirements[0].version = 2
    candidate.requirements[0].decision = obligationDecision()
    const content = JSON.stringify(candidate)
    writeFileSync(join(root, 'acceptance.json'), content)
    const candidateAuthority = buildTestAdequacyAuthority({
      root,
      issue: ledgerIssue,
      selection: {
        indexRevision: 'accepted-base-context',
        selected: [
          {
            id: 'acceptance-ledger',
            kind: 'requirement',
            path: 'acceptance.json',
            actualRevision: createHash('sha256').update(content).digest('hex'),
            content,
          },
        ],
      },
    })
    const candidateVerdict = verdict(
      adequacy({
        requirementSource: {
          id: candidateAuthority.sources[0].id,
          revision: candidateAuthority.sources[0].revision,
        },
        baselineExpectations: {
          status: 'changed-authorized',
          requirementVersion: 2,
          authorization: 'decisions/D-7.md',
        },
      }),
    )
    assert.throws(
      () =>
        approvalGate({
          verdict: candidateVerdict,
          issue: ledgerIssue,
          adequacyAuthority: candidateAuthority,
          verification: { commands: [{ exitCode: 0 }] },
          policy: { verification: { commands: ['node --test'], exemption: null } },
          changed: ['src/save.mjs'],
        }),
      /actual versioned authorized requirement change/i,
    )
  }
  rejectsNonsemanticChange(structuredClone(previous))
  const reordered = structuredClone(previous)
  reordered.requirements[0].obligations.reverse()
  rejectsNonsemanticChange(reordered)
  const reassigned = structuredClone(previous)
  reassigned.requirements[0].obligations[0].owner.actor = 'Fixture engineer'
  rejectsNonsemanticChange(reassigned)

  mkdirSync(join(root, 'acceptance-history'), { recursive: true })
  writeFileSync(join(root, 'acceptance-history/2.json'), JSON.stringify(current))
  const laterMetadata = structuredClone(current)
  laterMetadata.revision = 3
  laterMetadata.requirements[0].obligations[0].owner.actor = 'Fixture engineer'
  const laterContent = JSON.stringify(laterMetadata)
  writeFileSync(join(root, 'acceptance.json'), laterContent)
  const laterAuthority = buildTestAdequacyAuthority({
    root,
    issue: ledgerIssue,
    selection: {
      indexRevision: 'accepted-later-context',
      selected: [
        {
          id: 'acceptance-ledger',
          kind: 'requirement',
          path: 'acceptance.json',
          actualRevision: createHash('sha256').update(laterContent).digest('hex'),
          content: laterContent,
        },
      ],
    },
  })
  const laterVerdict = verdict(
    adequacy({
      requirementSource: {
        id: laterAuthority.sources[0].id,
        revision: laterAuthority.sources[0].revision,
      },
      baselineExpectations: {
        status: 'changed-authorized',
        requirementVersion: 2,
        authorization: 'decisions/D-7.md',
      },
    }),
  )
  assert.equal(
    approvalGate({
      verdict: laterVerdict,
      issue: ledgerIssue,
      adequacyAuthority: laterAuthority,
      verification: { commands: [{ exitCode: 0 }] },
      policy: { verification: { commands: ['node --test'], exemption: null } },
      changed: ['src/save.mjs'],
    }),
    true,
  )
})

test('low-impact text can rely on existing checks and rendered evidence without an artificial new test', () => {
  const textCriterion = 'the corrected label is rendered'
  const textIssue = { acceptanceCriteria: [textCriterion] }
  const textSource = issueContractSource(textIssue)
  const review = verdict({
      ...adequacy(),
      criterion: textCriterion,
      expectedValues: aspect('independent', 'Rendered evidence shows the literal corrected label.'),
      publicBehavior: aspect('not-applicable', 'No workflow behavior changes.'),
      substitutedBoundaries: aspect('none', 'No system boundary participates in this text correction.'),
      requirementSource: { id: textSource.id, revision: textSource.revision },
      judgment: 'adequate',
      why: 'Existing checks and rendered review cover the scoped correction; no new test is needed.',
    })
  assert.equal(
    approvalGate({
      verdict: review,
      issue: textIssue,
      verification: { commands: [{ exitCode: 0 }] },
      policy: { verification: { commands: ['existing-check'], exemption: null } },
      changed: ['src/label.mjs'],
    }),
    true,
  )
})

test('raw reviewer output normalizes the scoped adequacy map', () => {
  const result = normalizeReviewer(
    {
      ok: true,
      exitCode: 0,
      structured: {
        verdict: 'approve',
        tests_ran: true,
        tests_passed: true,
        test_command: 'node --test',
        test_output: 'green',
        unmet_ac: [],
        notes: 'reviewed',
        test_adequacy: [
          {
            criterion,
            expected_values: aspect('independent', 'literal payload'),
            public_behavior: aspect('exercised', 'public save/retry commands'),
            substituted_boundaries: aspect('appropriate', 'transport only'),
            requirement_source: { id: 'issue-45', revision: 'version-1' },
            baseline_expectations: {
              status: 'preserved',
              requirement_version: 1,
              authorization: '',
            },
            judgment: 'adequate',
            why: 'detects the defect',
          },
        ],
      },
    },
    { issue },
  )
  assert.equal(result.testAdequacy[0].publicBehavior.status, 'exercised')
  assert.equal(result.testAdequacy[0].baselineExpectations.requirementVersion, 1)
})

test('normalization preserves exact adequacy identity bytes before validation', () => {
  const htmlCriterion =
    'Given an HTML fragment, when it is rendered, then it ends with </main>'
  const htmlIssue = { acceptanceCriteria: [htmlCriterion] }
  const normalized = normalizeReviewer(
    {
      ok: true,
      exitCode: 0,
      structured: {
        verdict: 'approve',
        tests_ran: true,
        tests_passed: true,
        test_command: 'node --test',
        test_output: 'green',
        unmet_ac: [],
        notes: 'reviewed',
        test_adequacy: [
          {
            criterion: htmlCriterion,
            expected_values: aspect('independent', 'literal closing tag </invoke>'),
            public_behavior: aspect('exercised', 'public renderer'),
            substituted_boundaries: aspect('none', 'none'),
            requirement_source: {
              id: 'requirements-html</main>',
              revision: 'revision-html</main>',
            },
            baseline_expectations: {
              status: 'changed-authorized',
              requirement_version: 2,
              authorization: 'decisions/html</main>',
            },
            judgment: 'adequate',
            why: 'detects a missing closing tag',
          },
        ],
      },
    },
    { issue: htmlIssue },
  )
  assert.doesNotThrow(() => validateReviewer(normalized, { issue: htmlIssue }))
  assert.equal(normalized.testAdequacy[0].criterion, htmlCriterion)
  assert.equal(normalized.testAdequacy[0].requirementSource.id, 'requirements-html</main>')
  assert.equal(normalized.testAdequacy[0].requirementSource.revision, 'revision-html</main>')
  assert.equal(
    normalized.testAdequacy[0].baselineExpectations.authorization,
    'decisions/html</main>',
  )
  assert.equal(normalized.testAdequacy[0].expectedValues.evidence, 'literal closing tag')
})

test('published verdict exposes the concise obligation-to-check map', () => {
  const review = verdict()
  const body = verdictBody({ ...review, cycle: 1, marker: '<!-- review -->' })
  assert.match(body, /Test adequacy/)
  assert.match(body, /independent.*exercised.*appropriate/s)
  assert.match(body, new RegExp(`${issueContractSource(issue).id}@${issueContractSource(issue).revision}`))
  assert.match(body, /baseline preserved.*v1/i)
})

test('public review workflow rejects reviewer-invented source and baseline authorization', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ateam-adequacy-authority-'))
  process.env.ATEAM_RUNNER_HOME = join(root, 'home')
  const repoPath = fixtureRepo(root)
  const requirements = 'Version 1: value is good. No baseline changes have been authorized.'
  writeFileSync(join(repoPath, 'requirements.md'), requirements)
  mkdirSync(join(repoPath, 'docs/product'), { recursive: true })
  writeFileSync(
    join(repoPath, 'docs/product/context.md'),
    `\`\`\`ateam-context\n${JSON.stringify({
      schemaVersion: 1,
      purpose: 'Fixture verification',
      audience: 'Test maintainers',
      currentState: 'implemented',
      authorityOrder: ['requirements', 'code'],
      globalInvariants: ['rules'],
      bindings: { design: 'fixture', engineering: 'fixture' },
      commands: ['test "$(cat value.txt)" = good'],
      unresolvedDecisions: [],
      sources: [
        {
          id: 'rules',
          kind: 'requirement',
          path: 'requirements.md',
          revision: createHash('sha256').update(requirements).digest('hex'),
          global: true,
        },
      ],
      facts: [],
      history: [],
    })}\n\`\`\`\n`,
  )
  git(repoPath, ['add', '.'])
  git(repoPath, ['commit', '-m', 'fixture authority'])
  const issueUnderReview = { ...fixtureIssue, requirementVersion: 1 }
  const result = await runIssue({
    adapter: adapter(repoPath),
    issue: issueUnderReview,
    cfg: config(repoPath),
    deps: {
      execute: commit,
      runVerification: pass,
      review: (args) =>
        review({
          ...args,
          deps: {
            runClaude: async () => ({
              ok: true,
              exitCode: 0,
              costUsd: 0,
              structured: {
                verdict: 'approve',
                notes: 'Semantic fixture claim only.',
                tests_ran: true,
                tests_passed: true,
                test_command: 'fixture check',
                test_output: 'fixture green',
                unmet_ac: [],
                test_adequacy: [
                  {
                    criterion: issueUnderReview.acceptanceCriteria[0],
                    expected_values: aspect('independent', 'literal accepted value'),
                    public_behavior: aspect('exercised', 'public call'),
                    substituted_boundaries: aspect('none', 'none'),
                    requirement_source: {
                      id: 'nonexistent-source',
                      revision: 'invented-revision',
                    },
                    baseline_expectations: {
                      status: 'changed-authorized',
                      requirement_version: 1,
                      authorization: 'decisions/DOES-NOT-EXIST.md',
                    },
                    judgment: 'adequate',
                    why: 'Fixture claims an authorized baseline change.',
                  },
                ],
              },
            }),
          },
        }),
    },
  })
  assert.equal(result.outcome, 'failed')
  assert.match(result.reason, /requirement source|authorization|baseline/i)
})

test('executor-authored head ledger cannot authorize its own changed baseline', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ateam-head-authority-'))
  process.env.ATEAM_RUNNER_HOME = join(root, 'home')
  const repoPath = fixtureRepo(root)
  const requirements = 'Version 1: value is good. No baseline changes have been authorized.'
  const baseIndex = {
    schemaVersion: 1,
    purpose: 'Fixture verification',
    audience: 'Test maintainers',
    currentState: 'implemented',
    authorityOrder: ['requirements', 'code'],
    globalInvariants: ['rules'],
    bindings: { design: 'fixture', engineering: 'fixture' },
    commands: ['test "$(cat value.txt)" = good'],
    unresolvedDecisions: [],
    sources: [
      {
        id: 'rules',
        kind: 'requirement',
        path: 'requirements.md',
        revision: createHash('sha256').update(requirements).digest('hex'),
        global: true,
      },
    ],
    facts: [],
    history: [],
  }
  writeFileSync(join(repoPath, 'requirements.md'), requirements)
  mkdirSync(join(repoPath, 'docs/product'), { recursive: true })
  writeFileSync(
    join(repoPath, 'docs/product/context.md'),
    `\`\`\`ateam-context\n${JSON.stringify(baseIndex)}\n\`\`\`\n`,
  )
  git(repoPath, ['add', '.'])
  git(repoPath, ['commit', '-m', 'accepted base authority'])

  const previous = obligationFixture()
  const current = structuredClone(previous)
  current.revision = 2
  current.requirements[0].version = 2
  current.requirements[0].obligations[0].statement = 'Executor redefines accepted value'
  current.requirements[0].decision = obligationDecision()
  const ledgerContent = JSON.stringify(current)
  const ledgerRevision = createHash('sha256').update(ledgerContent).digest('hex')
  const issueUnderReview = { ...fixtureIssue, requirementVersion: 1 }
  const result = await runIssue({
    adapter: adapter(repoPath),
    issue: issueUnderReview,
    cfg: config(repoPath),
    deps: {
      execute: async ({ worktree }) => {
        writeFileSync(join(worktree, 'value.txt'), 'good\n')
        mkdirSync(join(worktree, 'acceptance-history'))
        writeFileSync(
          join(worktree, 'acceptance-history/1.json'),
          JSON.stringify(previous),
        )
        writeFileSync(join(worktree, 'acceptance.json'), ledgerContent)
        const headIndex = structuredClone(baseIndex)
        headIndex.sources.push({
          id: 'executor-ledger',
          kind: 'requirement',
          path: 'acceptance.json',
          revision: ledgerRevision,
          global: true,
        })
        writeFileSync(
          join(worktree, 'docs/product/context.md'),
          `\`\`\`ateam-context\n${JSON.stringify(headIndex)}\n\`\`\`\n`,
        )
        git(worktree, ['add', '.'])
        git(worktree, ['commit', '-m', 'self authorize changed baseline'])
        return impl
      },
      runVerification: pass,
      review: (args) =>
        review({
          ...args,
          deps: {
            runClaude: async () => ({
              ok: true,
              exitCode: 0,
              costUsd: 0,
              structured: {
                verdict: 'approve',
                notes: 'Claims the executor ledger is accepted authority.',
                tests_ran: true,
                tests_passed: true,
                test_command: 'fixture check',
                test_output: 'fixture green',
                unmet_ac: [],
                test_adequacy: [
                  {
                    criterion: issueUnderReview.acceptanceCriteria[0],
                    expected_values: aspect('independent', 'literal accepted value'),
                    public_behavior: aspect('exercised', 'public call'),
                    substituted_boundaries: aspect('none', 'none'),
                    requirement_source: {
                      id: 'executor-ledger',
                      revision: ledgerRevision,
                    },
                    baseline_expectations: {
                      status: 'changed-authorized',
                      requirement_version: 2,
                      authorization: 'decisions/D-7.md',
                    },
                    judgment: 'adequate',
                    why: 'The head ledger claims to authorize the new baseline.',
                  },
                ],
              },
            }),
          },
        }),
    },
  })
  assert.equal(result.outcome, 'failed')
  assert.match(result.reason, /not current supervisor authority/i)
})

test('public workflow preserves an HTML acceptance criterion through normalize and approval', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ateam-html-criterion-'))
  process.env.ATEAM_RUNNER_HOME = join(root, 'home')
  const repoPath = fixtureRepo(root)
  const htmlCriterion =
    'Given an HTML fragment, when it is rendered, then it ends with </main>'
  const htmlIssue = {
    ...fixtureIssue,
    body: `## Acceptance criteria\n- [ ] ${htmlCriterion}`,
    acceptanceCriteria: [htmlCriterion],
  }
  const result = await runIssue({
    adapter: adapter(repoPath),
    issue: htmlIssue,
    cfg: config(repoPath),
    deps: {
      execute: commit,
      runVerification: pass,
      review: async ({ adequacyAuthority }) => {
        const source = adequacyAuthority.sources[0]
        return normalizeReviewer(
          {
            ok: true,
            exitCode: 0,
            costUsd: 0,
            structured: {
              verdict: 'approve',
              notes: 'Exact criterion reviewed.',
              tests_ran: true,
              tests_passed: true,
              test_command: 'fixture check',
              test_output: 'fixture green',
              unmet_ac: [],
              test_adequacy: [
                {
                  criterion: htmlCriterion,
                  expected_values: aspect('independent', 'literal </main>'),
                  public_behavior: aspect('exercised', 'public renderer'),
                  substituted_boundaries: aspect('none', 'none'),
                  requirement_source: { id: source.id, revision: source.revision },
                  baseline_expectations: {
                    status: 'preserved',
                    requirement_version: source.requirementVersions[0],
                    authorization: '',
                  },
                  judgment: 'adequate',
                  why: 'The check detects a missing closing tag.',
                },
              ],
            },
          },
          { issue: htmlIssue },
        )
      },
    },
  })
  assert.equal(result.outcome, 'approved', result.reason)
})
