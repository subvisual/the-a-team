import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  existsSync,
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  readFileSync,
  symlinkSync,
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fixture, snapshots, writeFixture, decision } from './helpers/obligations-fixture.mjs'
import { parseIssuesFile, validateIssues } from '../src/local-issues.mjs'

const cli = new URL('../src/obligations-cli.mjs', import.meta.url)
const run = (dir, ...args) => {
  assert.equal(existsSync(cli), true, 'standalone issues-phase validation entrypoint must exist')
  const process = spawnSync(
    globalThis.process.execPath,
    [cli.pathname, 'issues', '--feature', dir, ...args],
    { encoding: 'utf8' },
  )
  return { status: process.status, output: JSON.parse(process.stdout) }
}
const temporary = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'ateam-obligations-'))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('real issues-phase CLI reads PRD/spec/page board/tickets and exposes remaining human work', () =>
  temporary((dir) => {
    writeFixture(dir)
    const { status, output } = run(dir)
    assert.equal(status, 0)
    assert.equal(output.ok, true)
    assert.equal(output.requirements[0].accepted, false)
    assert.deepEqual(
      output.pending.map((o) => o.id),
      ['OBL-CODE', 'OBL-SCREEN', 'OBL-STUDY'],
    )
    assert.equal(run(dir, '--stage', 'verification').status, 2)
  }))

for (const path of ['prd.md', 'spec.md', 'briefs/pages/board.json', 'issues.md']) {
  test(`real issues-phase gate reports dropped obligation in actual ${path}`, () =>
    temporary((dir) => {
      const ledger = fixture(),
        records = snapshots(ledger)
      records[path].pop()
      writeFixture(dir, ledger, records)
      const { status, output } = run(dir)
      assert.equal(status, 2)
      assert.ok(
        output.diagnostics.some(
          (d) => d.obligationId === 'OBL-STUDY' && d.field === 'snapshot' && d.artifact === path,
        ),
      )
    }))
}

test('actual issues parser rejects unknown ticket mapping and unknown requirement metadata', () =>
  temporary((dir) => {
    const ledger = fixture(),
      records = snapshots(ledger)
    records['issues.md'][0].disposition.ticketId = 'ISS-MISSING'
    writeFixture(dir, ledger, records)
    assert.equal(run(dir).status, 2)
    writeFixture(dir)
    const path = join(dir, 'issues.md')
    writeFileSync(
      path,
      readFileSync(path, 'utf8').replace(
        '**Requirements:** R-ROUNDTRIP',
        '**Requirements:** R-UNKNOWN',
      ),
    )
    const result = run(dir)
    assert.equal(result.status, 2)
    assert.ok(
      result.output.diagnostics.some(
        (d) => d.field === 'requirements' && d.message.includes('R-UNKNOWN'),
      ),
    )
  }))

test('acceptance blocks preserve parser ticket IDs and AC while nested code samples do not supply coverage', () =>
  temporary((dir) => {
    writeFixture(dir)
    const path = join(dir, 'issues.md'),
      source = readFileSync(path, 'utf8')
    const issues = validateIssues(parseIssuesFile(source))
    assert.deepEqual(
      issues.map((item) => item.id),
      ['ISS-CODE'],
    )
    assert.deepEqual(issues[0].acceptanceCriteria, [
      'Given saved input, when reopened, then it is restored',
    ])
    writeFileSync(
      path,
      source.replace('```acceptance-obligations', '````markdown\n```acceptance-obligations') +
        '\n````\n',
    )
    assert.equal(run(dir).status, 2)
  }))

test('unlisted real page briefs fail coverage and broken JSON fails closed', () =>
  temporary((dir) => {
    writeFixture(dir)
    writeFileSync(
      join(dir, 'briefs/pages/unlisted.md'),
      '# P2\nA new page without its obligations\n',
    )
    const unlisted = run(dir)
    assert.equal(unlisted.status, 2)
    assert.ok(
      unlisted.output.diagnostics.some(
        (d) => d.field === 'artifacts' && d.message.includes('unlisted.md'),
      ),
    )
    rmSync(join(dir, 'briefs/pages/unlisted.md'))
    writeFileSync(join(dir, 'spec.md'), '# Spec\n```acceptance-obligations\n{broken json}\n```')
    assert.equal(run(dir).status, 2)
  }))

test('ledger cannot replace mandatory actual artifacts with an invented manifest path', () =>
  temporary((dir) => {
    const ledger = fixture()
    ledger.artifacts[0].path = 'invented-prd.md'
    writeFixture(dir, ledger)
    assert.equal(run(dir).status, 2)
  }))

test('prior ledger is loaded automatically and benchmark edits cannot bypass history validation', () =>
  temporary((dir) => {
    const previous = fixture(),
      before = previous.requirements[0].obligations[0]
    before.method = 'performance-benchmark'
    before.benchmark = {
      version: 1,
      workload: '10000 rows',
      units: 'ms',
      threshold: { operator: '<=', value: 100 },
      method: 'p95 cold',
      scope: 'Desktop',
    }
    mkdirSync(join(dir, 'acceptance-history'))
    writeFileSync(join(dir, 'acceptance-history/1.json'), JSON.stringify(previous))
    const ledger = structuredClone(previous)
    ledger.revision = 2
    ledger.requirements[0].obligations[0].benchmark.units = 'seconds'
    writeFixture(dir, ledger)
    const result = run(dir)
    assert.equal(result.status, 2)
    assert.ok(
      result.output.diagnostics.some(
        (d) => d.obligationId === 'OBL-CODE' && d.field === 'benchmark.units',
      ),
    )
    ledger.requirements[0].version = 2
    ledger.requirements[0].decision = decision()
    ledger.requirements[0].obligations[0].benchmark.version = 2
    writeFixture(dir, ledger)
    assert.equal(run(dir).status, 0)
    ledger.revision = 1
    writeFixture(dir, ledger)
    assert.equal(run(dir).status, 2)
  }))

test('missing history on a revised ledger and missing canonical ledger fail closed', () =>
  temporary((dir) => {
    const ledger = fixture()
    ledger.revision = 2
    writeFixture(dir, ledger)
    assert.equal(run(dir).status, 2)
    rmSync(join(dir, 'acceptance.json'))
    assert.equal(run(dir).status, 2)
  }))

test('artifact paths cannot traverse or follow a symlink outside the feature', () =>
  temporary((dir) => {
    writeFixture(dir)
    rmSync(join(dir, 'prd.md'))
    symlinkSync('/etc/hosts', join(dir, 'prd.md'))
    const result = run(dir)
    assert.equal(result.status, 2)
    assert.ok(result.output.diagnostics.some((d) => /outside.*feature/.test(d.message)))
  }))

test('standalone validator exports reusable file-based function', async () => {
  assert.equal(existsSync(cli), true, 'reusable issues-phase API must exist')
  const { validateIssuesPhase } = await import(cli)
  assert.equal(typeof validateIssuesPhase, 'function')
  const dir = mkdtempSync(join(tmpdir(), 'ateam-obligations-api-'))
  try {
    writeFixture(dir)
    assert.equal((await validateIssuesPhase({ featureDir: dir })).ok, true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('an auxiliary PRD cannot replace missing coverage in the actual PRD', () =>
  temporary((dir) => {
    const ledger = fixture()
    ledger.artifacts.push({ ...structuredClone(ledger.artifacts[0]), path: 'auxiliary-prd.md' })
    ledger.artifacts[0].obligationIds = []
    writeFixture(dir, ledger)
    assert.equal(run(dir).status, 2)
  }))

test('three-revision CLI history rejects old benchmark evidence reintroduced after a pending revision', () =>
  temporary((dir) => {
    const original = fixture(),
      first = original.requirements[0].obligations[0]
    first.method = 'performance-benchmark'
    first.benchmark = {
      version: 1,
      workload: '1000 rows',
      units: 'ms',
      threshold: { operator: '<=', value: 100 },
      method: 'p95 cold',
      scope: 'Desktop',
    }
    first.status = 'satisfied'
    first.evidence = [
      {
        reference: 'results/run-original.json',
        actor: 'Tester',
        method: first.method,
        requirementVersion: 1,
        benchmarkVersion: 1,
      },
    ]
    const intermediate = structuredClone(original),
      second = intermediate.requirements[0].obligations[0]
    intermediate.revision = 2
    intermediate.requirements[0].version = 2
    intermediate.requirements[0].decision = decision()
    second.benchmark.version = 2
    second.benchmark.units = 'seconds'
    second.status = 'pending'
    second.evidence = []
    const current = structuredClone(intermediate),
      third = current.requirements[0].obligations[0]
    current.revision = 3
    third.status = 'satisfied'
    third.evidence = [{ ...first.evidence[0], requirementVersion: 2, benchmarkVersion: 2 }]
    mkdirSync(join(dir, 'acceptance-history'))
    writeFileSync(join(dir, 'acceptance-history/1.json'), JSON.stringify(original))
    writeFileSync(join(dir, 'acceptance-history/2.json'), JSON.stringify(intermediate))
    writeFixture(dir, current)
    const rejected = run(dir)
    assert.equal(rejected.status, 2)
    assert.equal(rejected.output.ok, false)
    assert.ok(
      rejected.output.diagnostics.some(
        (d) =>
          d.obligationId === 'OBL-CODE' &&
          d.field === 'evidence.reference' &&
          d.message.includes('revision 1'),
      ),
    )
    third.evidence[0].reference = 'results/run-v2-new.json'
    writeFixture(dir, current)
    assert.equal(
      run(dir).status,
      0,
      'genuinely new evidence for the current benchmark remains valid',
    )
  }))

test('symlinked issues CLI executes the same validation and exit status as its real entrypoint', () =>
  temporary((dir) => {
    const linked = join(dir, 'issues-gate.mjs')
    symlinkSync(cli.pathname, linked)
    const missing = join(dir, 'nonexistent-feature')
    const direct = run(missing)
    const invocation = spawnSync(process.execPath, [linked, 'issues', '--feature', missing], {
      encoding: 'utf8',
    })
    assert.equal(
      invocation.status,
      direct.status,
      'linked entrypoint must not silently return success',
    )
    assert.deepEqual(JSON.parse(invocation.stdout), direct.output)
    writeFixture(dir)
    const valid = spawnSync(process.execPath, [linked, 'issues', '--feature', dir], {
      encoding: 'utf8',
    })
    assert.equal(valid.status, 0)
    assert.equal(JSON.parse(valid.stdout).ok, true)
  }))

test('historical pending discovery work and unresolved owner do not block its later valid completion', () =>
  temporary((dir) => {
    const original = fixture(),
      before = original.requirements[0].obligations[0]
    before.requiredStage = 'discovery'
    before.owner = { role: null, actor: null }
    const current = structuredClone(original),
      after = current.requirements[0].obligations[0]
    current.revision = 2
    after.owner = { role: 'Engineering', actor: null }
    after.status = 'satisfied'
    after.evidence = [
      {
        reference: 'results/discovery.json',
        method: after.method,
        requirementVersion: 1,
        actor: 'Reviewer',
      },
    ]
    mkdirSync(join(dir, 'acceptance-history'))
    writeFileSync(join(dir, 'acceptance-history/1.json'), JSON.stringify(original))
    writeFixture(dir, current)
    const result = run(dir)
    assert.equal(result.status, 0, JSON.stringify(result.output.diagnostics))
    assert.equal(result.output.ok, true)
    assert.equal(
      result.output.obligations.find((item) => item.id === 'OBL-CODE').status,
      'satisfied',
    )
    after.status = 'pending'
    after.evidence = []
    writeFixture(dir, current)
    assert.equal(run(dir).status, 2, 'the current required stage remains enforced')
  }))

test('reusable issues API imports from Node stdin without treating dash as a file', () => {
  const invocation = spawnSync(process.execPath, ['--input-type=module', '-'], {
    encoding: 'utf8',
    input: `import { validateIssuesPhase } from ${JSON.stringify(cli.href)};\nprocess.stdout.write(JSON.stringify({ api: typeof validateIssuesPhase }));\n`,
  })
  assert.equal(invocation.status, 0, invocation.stderr)
  assert.deepEqual(JSON.parse(invocation.stdout), { api: 'function' })
})
