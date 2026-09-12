import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const path = new URL('../src/evaluation.mjs', import.meta.url)
const api = existsSync(path) ? await import(path) : {}
const requireApi = () =>
  assert.equal(typeof api.readCatalog, 'function', 'versioned evaluation API must exist')
const digest = 'a'.repeat(64)
function trial(overrides = {}) {
  return {
    schemaVersion: 1,
    kind: 'agent-trial',
    id: 'trial-1',
    groupId: 'sample-1',
    trialNumber: 1,
    scenarioId: 'narrow-refinement',
    scenarioVersion: 1,
    synthetic: true,
    versions: {
      harnessRevision: 'b'.repeat(40),
      harnessDigest: digest,
      skillBundleDigest: digest,
      model: 'authorized-model-exact-version',
      cli: { name: 'authorized-cli', version: '1.2.3' },
      configuration: { id: 'config-1', digest },
      sourceCommit: 'c'.repeat(40),
      input: { id: 'input-1', digest },
      rubric: { id: 'capability-v1', digest },
    },
    outcome: { status: 'failed', reason: 'Missed the retained-input requirement' },
    trace: { events: [{ type: 'observation', detail: 'Draft reset after failed save' }] },
    subjective: { status: 'not-scored', assessments: [] },
    ...overrides,
  }
}
test('evaluation catalog enumerates explicit scenarios and unresolved release dependency', () => {
  requireApi()
  const catalog = api.readCatalog()
  assert.equal(catalog.schemaVersion, 1)
  assert.equal(catalog.scenarios.length, 20)
  assert.equal(new Set(catalog.scenarios.map((s) => s.id)).size, 20)
  assert.ok(catalog.scenarios.every((s) => s.version && s.expected && s.testFile && s.testName))
  assert.deepEqual(
    catalog.unresolvedDependencies.map((d) => d.issue),
    [37],
  )
  assert.equal(catalog.releaseEligible, false)
})
test('agent trial saving requires full identifiers and separates outcomes from traces and subjective scoring', () => {
  requireApi()
  const root = mkdtempSync(join(tmpdir(), 'ateam-eval-records-'))
  for (const field of Object.keys(trial().versions)) {
    const record = trial()
    delete record.versions[field]
    assert.throws(() => api.saveAgentTrial(root, record), new RegExp(field))
  }
  for (const kind of ['outcome', 'trace', 'subjective']) {
    const record = trial()
    delete record[kind]
    assert.throws(() => api.saveAgentTrial(root, record), new RegExp(kind))
  }
  const saved = api.saveAgentTrial(root, trial())
  assert.deepEqual(JSON.parse(readFileSync(saved.outcome)), trial().outcome)
  assert.deepEqual(JSON.parse(readFileSync(saved.trace)), trial().trace)
  assert.deepEqual(JSON.parse(readFileSync(saved.subjective)), trial().subjective)
  assert.throws(() => api.saveAgentTrial(root, trial()), /exists/)
  api.saveAgentTrial(
    root,
    trial({
      id: 'trial-2',
      trialNumber: 2,
      outcome: { status: 'passed', reason: 'All specified outcomes observed' },
    }),
  )
  assert.equal(readdirSync(join(root, 'agent-trials')).length, 2)
  assert.throws(
    () => api.saveAgentTrial(root, trial({ id: 'trial-3', trialNumber: 2 })),
    /trialNumber/,
  )
  const changed = trial({ id: 'trial-3', trialNumber: 3 })
  changed.versions.model = 'other-model'
  assert.throws(() => api.saveAgentTrial(root, changed), /group.*versions/)
})
test('evaluation records reject invented completion, empty identifiers and path escape', () => {
  requireApi()
  const root = mkdtempSync(join(tmpdir(), 'ateam-eval-invalid-'))
  for (const mutate of [
    (t) => (t.id = '../outside'),
    (t) => (t.versions.input.digest = 'pending'),
    (t) => (t.versions.cli.version = ''),
    (t) => (t.versions.model = 'not-used:deterministic'),
    (t) => (t.outcome.status = 'green'),
    (t) => (t.trace.events = null),
    (t) => (t.subjective = { status: 'scored', assessments: [] }),
  ]) {
    const value = trial()
    mutate(value)
    assert.throws(() => api.saveAgentTrial(root, value))
  }
  assert.deepEqual(readdirSync(root), [])
})
test('reconciliation retains individual disagreement, rubric revisions, and accepted/rejected examples', () => {
  requireApi()
  const root = mkdtempSync(join(tmpdir(), 'ateam-eval-calibration-'))
  const record = {
    schemaVersion: 1,
    id: 'reconcile-1',
    trialId: 'trial-1',
    synthetic: true,
    assessments: [
      {
        graderId: 'synthetic-grader-a',
        rubricId: 'v1',
        verdict: 'accept',
        rationale: 'Input remained visible',
      },
      {
        graderId: 'synthetic-grader-b',
        rubricId: 'v1',
        verdict: 'reject',
        rationale: 'It was not restored after reload',
      },
    ],
    rubricRevisions: [
      { id: 'v1', digest, text: 'Retain input on failure', supersedes: null },
      {
        id: 'v2',
        digest: 'b'.repeat(64),
        text: 'Retain input on failure and restore after reload',
        supersedes: 'v1',
      },
    ],
    examples: [
      {
        id: 'kept-after-reload',
        disposition: 'accepted',
        rubricId: 'v2',
        inputDigest: digest,
        outputDigest: digest,
        rationale: 'Both cases demonstrated',
      },
      {
        id: 'visible-only',
        disposition: 'rejected',
        rubricId: 'v2',
        inputDigest: digest,
        outputDigest: digest,
        rationale: 'Reload loses input',
      },
    ],
    resolution: {
      actor: 'synthetic-calibrator',
      rubricId: 'v2',
      verdict: 'reject',
      rationale: 'Reload is a required behavior; rescore separately',
    },
  }
  for (const rubric of record.rubricRevisions) rubric.digest = api.digest(rubric.text)
  for (const example of record.examples) {
    example.input = 'Synthetic failed-save draft'
    example.output = example.id
    example.inputDigest = api.digest(example.input)
    example.outputDigest = api.digest(example.output)
  }
  assert.throws(() => api.saveReconciliation(root, record), /trial/)
  api.saveAgentTrial(
    root,
    trial({
      versions: {
        ...trial().versions,
        rubric: { id: 'v1', digest: record.rubricRevisions[0].digest },
      },
    }),
  )
  const saved = api.saveReconciliation(root, record)
  assert.deepEqual(JSON.parse(readFileSync(saved)), record)
  assert.throws(() => api.saveReconciliation(root, record), /exists/)
  const withoutRevision = structuredClone(record)
  withoutRevision.id = 'reconcile-2'
  withoutRevision.rubricRevisions.pop()
  assert.throws(() => api.saveReconciliation(root, withoutRevision), /rubric/)
  const averaged = structuredClone(record)
  averaged.id = 'reconcile-3'
  averaged.resolution = { average: 0.5 }
  assert.throws(() => api.saveReconciliation(root, averaged), /resolution/)
})

test('deterministic evidence never treats an empty or skipped selection as a pass', async () => {
  const runnerPath = new URL('../src/evaluation-runner.mjs', import.meta.url)
  const runner = existsSync(runnerPath) ? await import(runnerPath) : {}
  assert.equal(typeof runner.assessProcess, 'function', 'deterministic result assessor must exist')
  const good = { status: 0, stdout: '# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n', stderr: '' }
  assert.equal(runner.assessProcess(good).status, 'passed')
  for (const result of [
    { ...good, stdout: '# pass 0\n# fail 0\n# cancelled 0\n# skipped 1\n' },
    { ...good, status: 1 },
    { ...good, signal: 'SIGTERM', status: null },
    { ...good, stdout: 'Everything is good' },
  ])
    assert.notEqual(runner.assessProcess(result).status, 'passed')
})

test('result assessment requires the exact selected subtest and tolerates only unmatched test skips', async () => {
  const { assessProcess } = await import('../src/evaluation-runner.mjs')
  const result = {
    status: 0,
    stdout:
      '# Subtest: expected\nok 1 - expected\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n',
  }
  assert.equal(assessProcess(result, 'expected').status, 'passed')
  assert.equal(assessProcess(result, 'another test').status, 'failed')
  const node20 = {
    ...result,
    stdout:
      result.stdout.replace('# skipped 0', '# skipped 1') +
      'ok 2 - unrelated # SKIP test name does not match pattern\n',
  }
  assert.equal(assessProcess(node20, 'expected').status, 'passed')
  assert.equal(
    assessProcess(
      {
        ...node20,
        stdout: node20.stdout.replace('test name does not match pattern', 'native unavailable'),
      },
      'expected',
    ).status,
    'failed',
  )
})

test('reconciliation rejects mismatched synthetic provenance and altered rubric digests', () => {
  requireApi()
  const examplePath = new URL('../evaluation/reconciliation.example.json', import.meta.url)
  assert.ok(existsSync(examplePath), 'Versioned reconciliation example must exist')
  const record = JSON.parse(readFileSync(examplePath))
  const input = JSON.parse(
    readFileSync(new URL('../evaluation/agent-trial.example.json', import.meta.url)),
  )
  const root = mkdtempSync(join(tmpdir(), 'ateam-eval-rubrics-'))
  api.saveAgentTrial(root, input)
  const changed = structuredClone(record)
  changed.rubricRevisions[0].text += ' Changed without revision'
  assert.throws(() => api.saveReconciliation(root, changed), /rubric.*digest/)
  const provenance = structuredClone(record)
  provenance.synthetic = false
  assert.throws(() => api.saveReconciliation(root, provenance), /synthetic/)
})

test('seeded run versions identify the mutated source bytes and portable configuration separately', async () => {
  const runner = await import('../src/evaluation-runner.mjs')
  assert.equal(typeof runner.seedVersions, 'function', 'seed metadata derivation must exist')
  const original = trial().versions
  const files = [
    { path: 'runner/src/context.mjs', digest: api.digest('before') },
    { path: 'other', digest },
  ]
  const result = runner.seedVersions(original, files, 'after', {
    profile: 'native',
    nativeBackend: 'macos-seatbelt',
  })
  assert.notEqual(result.versions.harnessDigest, original.harnessDigest)
  assert.equal(result.files[0].digest, api.digest('after'))
  assert.equal(result.versions.harnessDigest, api.digest(api.json(result.files)))
  assert.equal(result.configuration.profile, 'portable')
  assert.equal(result.configuration.nativeBackend, 'not-run')
  assert.equal(result.versions.configuration.digest, api.digest(api.json(result.configuration)))
  assert.equal(result.versions.harnessRevision, original.harnessRevision)
})

test('reconciliation cannot substitute a rubric unrelated to the recorded trial', () => {
  const record = JSON.parse(
    readFileSync(new URL('../evaluation/reconciliation.example.json', import.meta.url)),
  )
  const input = JSON.parse(
    readFileSync(new URL('../evaluation/agent-trial.example.json', import.meta.url)),
  )
  const root = mkdtempSync(join(tmpdir(), 'ateam-eval-bound-rubric-'))
  input.versions.rubric.digest = 'f'.repeat(64)
  api.saveAgentTrial(root, input)
  assert.throws(() => api.saveReconciliation(root, record), /trial rubric/)
})

test('public corpus rejects an outside symlink into the harness before creating nested evidence', async () => {
  const { mkdirSync, copyFileSync, symlinkSync } = await import('node:fs')
  const { spawnSync, execFileSync } = await import('node:child_process')
  for (const suffix of ['new-evidence', 'absent/nested/evidence']) {
    const dir = mkdtempSync(join(tmpdir(), 'ateam-eval-symlink-'))
    const harness = join(dir, 'harness')
    mkdirSync(join(harness, 'runner/src'), { recursive: true })
    mkdirSync(join(harness, 'runner/evaluation'))
    for (const file of [
      'evaluation-cli.mjs',
      'evaluation-runner.mjs',
      'evaluation.mjs',
      'entrypoint.mjs',
    ])
      copyFileSync(new URL(`../src/${file}`, import.meta.url), join(harness, 'runner/src', file))
    const { writeFileSync } = await import('node:fs')
    writeFileSync(join(harness, 'runner/package.json'), JSON.stringify({ version: 'test' }))
    writeFileSync(join(harness, 'runner/evaluation/rubric.json'), '{}')
    // A minimal disposable catalog isolates preflight: no scenario process can run.
    writeFileSync(
      join(harness, 'runner/evaluation/catalog.json'),
      JSON.stringify({ schemaVersion: 1, scenarios: [] }),
    )
    const git = (args) =>
      execFileSync('git', args, {
        cwd: harness,
        stdio: 'pipe',
        env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
      })
    git(['init', '-q', '-b', 'main'])
    git(['add', '.'])
    git([
      '-c',
      'user.name=Synthetic evaluation',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-qm',
      'Synthetic preflight fixture',
    ])
    const alias = join(dir, 'outside-link')
    symlinkSync(harness, alias, 'dir')
    const before = readdirSync(harness).sort()
    const result = spawnSync(
      process.execPath,
      ['runner/src/evaluation-cli.mjs', 'run', '--output', join(alias, suffix)],
      { cwd: harness, encoding: 'utf8', timeout: 5000 },
    )
    assert.equal(result.status, 1)
    assert.match(result.stderr, /outside the harness checkout/)
    assert.deepEqual(
      readdirSync(harness).sort(),
      before,
      'rejected path must not create any evidence ancestor',
    )
    assert.equal(existsSync(join(harness, suffix)), false)
  }
})

test('output resolution canonicalizes harness aliases and accepts fresh external descendants without overwriting', async () => {
  const { mkdirSync, symlinkSync, realpathSync } = await import('node:fs')
  const runner = await import('../src/evaluation-runner.mjs')
  assert.equal(typeof runner.resolveEvidenceOutput, 'function')
  const dir = mkdtempSync(join(tmpdir(), 'ateam-eval-path-'))
  const harness = join(dir, 'harness'),
    external = join(dir, 'external')
  mkdirSync(harness)
  mkdirSync(external)
  const rootAlias = join(dir, 'harness-alias'),
    outputAlias = join(dir, 'external-alias')
  symlinkSync(harness, rootAlias, 'dir')
  symlinkSync(external, outputAlias, 'dir')
  assert.throws(
    () => runner.resolveEvidenceOutput(rootAlias, join(harness, 'missing/deep')),
    /outside the harness checkout/,
  )
  assert.throws(
    () => runner.resolveEvidenceOutput(harness, join(rootAlias, 'missing/deep')),
    /outside the harness checkout/,
  )
  assert.equal(
    runner.resolveEvidenceOutput(rootAlias, join(outputAlias, 'missing/deep')),
    join(realpathSync(external), 'missing/deep'),
  )
  assert.deepEqual(readdirSync(external), [])
  assert.equal(runner.resolveEvidenceOutput(rootAlias, external), realpathSync(external))
  assert.throws(() => runner.runCorpus({ output: external }), /new output directory/)
  assert.deepEqual(readdirSync(external), [])
})

test('repeat groups ignore recursive object key order but preserve array order and real changes', () => {
  const root = mkdtempSync(join(tmpdir(), 'ateam-eval-semantic-group-'))
  const first = trial()
  first.versions.configuration.arguments = ['--mode', 'offline']
  api.saveAgentTrial(root, first)
  const reorder = (value) =>
    Array.isArray(value)
      ? value.map(reorder)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value)
              .reverse()
              .map(([key, entry]) => [key, reorder(entry)]),
          )
        : value
  const second = { ...first, id: 'trial-2', trialNumber: 2, versions: reorder(first.versions) }
  assert.doesNotThrow(
    () => api.saveAgentTrial(root, second),
    'object insertion order does not change trial conditions',
  )
  const changedOrder = {
    ...second,
    id: 'trial-3',
    trialNumber: 3,
    versions: structuredClone(second.versions),
  }
  changedOrder.versions.configuration.arguments.reverse()
  assert.throws(() => api.saveAgentTrial(root, changedOrder), /group versions/)
  for (const change of [
    (versions) => (versions.model = 'genuinely-other-model'),
    (versions) => (versions.configuration.digest = 'd'.repeat(64)),
    (versions) => (versions.input.digest = 'e'.repeat(64)),
    (versions) => (versions.rubric.digest = 'f'.repeat(64)),
  ]) {
    const changed = {
      ...second,
      id: 'trial-3',
      trialNumber: 3,
      versions: structuredClone(second.versions),
    }
    change(changed.versions)
    assert.throws(() => api.saveAgentTrial(root, changed), /group versions/)
  }
  assert.equal(readdirSync(join(root, 'agent-trials')).length, 2)
})

test('reconciliation requires one revision chain anchored to the exact trial rubric', () => {
  const input = JSON.parse(
    readFileSync(new URL('../evaluation/agent-trial.example.json', import.meta.url)),
  )
  const example = JSON.parse(
    readFileSync(new URL('../evaluation/reconciliation.example.json', import.meta.url)),
  )
  const root = mkdtempSync(join(tmpdir(), 'ateam-eval-rubric-chain-'))
  api.saveAgentTrial(root, input)
  const disconnected = structuredClone(example)
  disconnected.rubricRevisions[1].supersedes = null
  assert.throws(() => api.saveReconciliation(root, disconnected), /rubric.*chain/)
  const branched = structuredClone(example)
  branched.rubricRevisions.push({
    id: 'v3',
    text: 'Third rubric',
    digest: api.digest('Third rubric'),
    supersedes: 'capability-v1',
  })
  branched.resolution.rubricId = 'v3'
  assert.throws(() => api.saveReconciliation(root, branched), /rubric.*chain/)
  const unanchored = structuredClone(example)
  unanchored.rubricRevisions.unshift({
    id: 'unrelated-root',
    text: 'Other rubric',
    digest: api.digest('Other rubric'),
    supersedes: null,
  })
  unanchored.rubricRevisions[1].supersedes = 'unrelated-root'
  assert.throws(() => api.saveReconciliation(root, unanchored), /trial rubric/)
  const saved = api.saveReconciliation(root, example)
  assert.deepEqual(JSON.parse(readFileSync(saved)).assessments, example.assessments)
})

test('calibration payloads must be inspectable text matching their retained hashes', () => {
  const input = JSON.parse(
    readFileSync(new URL('../evaluation/agent-trial.example.json', import.meta.url)),
  )
  const example = JSON.parse(
    readFileSync(new URL('../evaluation/reconciliation.example.json', import.meta.url)),
  )
  const root = mkdtempSync(join(tmpdir(), 'ateam-eval-calibration-payload-'))
  api.saveAgentTrial(root, input)
  for (const field of ['input', 'output']) {
    const changed = structuredClone(example)
    changed.examples[0][field] += ' Different payload'
    assert.throws(
      () => api.saveReconciliation(root, changed),
      new RegExp(`example\\.${field}.*digest`),
    )
    const missing = structuredClone(example)
    delete missing.examples[0][field]
    assert.throws(() => api.saveReconciliation(root, missing), new RegExp(`example\\.${field}`))
    const opaque = structuredClone(example)
    opaque.examples[0][field] = { privateReference: 'not-retained' }
    assert.throws(() => api.saveReconciliation(root, opaque), new RegExp(`example\\.${field}`))
  }
  const empty = structuredClone(example)
  empty.examples[1].output = ''
  empty.examples[1].outputDigest = api.digest('')
  assert.doesNotThrow(
    () => api.saveReconciliation(root, empty),
    'An explicitly empty output remains inspectable with its exact hash',
  )
})
