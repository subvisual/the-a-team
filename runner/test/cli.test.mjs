import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  lstatSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { recordNonapprovalDelivery } from '../src/core/approval.mjs'
import { normaliseIssue } from '../src/adapters/github.mjs'
import { verdict } from './approval-fixtures.mjs'

const binary = fileURLToPath(new URL('../bin/ateam-runner.mjs', import.meta.url))
const goodBody = '## Acceptance criteria\n- [ ] Works as requested\n'
const issue = (number, body = goodBody) => ({
  number,
  title: `Issue ${number}`,
  body,
  labels: [{ name: 'agent:ready' }],
  state: 'OPEN',
})
const pr = {
  number: 10,
  headRefName: 'agent/issue-1',
  headRefOid: 'abcdef1234',
  baseRefName: 'main',
  closingIssuesReferences: [{ number: 1 }],
  comments: [],
  reviews: [],
}
let root, repo, runnerHome, bin, recordings, dataFile, issuesFile

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ateam-cli-'))
  repo = join(root, 'repo')
  runnerHome = join(root, 'runner-home')
  bin = join(root, 'bin')
  recordings = join(root, 'commands.jsonl')
  dataFile = join(root, 'fixture.json')
  issuesFile = join(root, 'issues.md')
  mkdirSync(join(repo, '.git'), { recursive: true })
  mkdirSync(bin)
  writeFileSync(join(repo, 'README.md'), '# fixture\n')
  writeFileSync(join(repo, 'CLAUDE.md'), '## A-Team Config\n- test command: node --test\n')
  writeFileSync(
    issuesFile,
    '## Ready\n### Acceptance criteria\n- [ ] Works\n\n## Blocked\n**Depends on:** Ready\n### Acceptance criteria\n- [ ] Depends on Ready\n\n## Malformed\n### Acceptance criteria\nTBD\n',
  )
  fixture()
  // All external programs are recorded stubs. An unexpected command fails
  // closed; the CLI cannot reach live git, GitHub, or model operations.
  const stub = `#!${process.execPath}
import { appendFileSync, readFileSync } from 'node:fs'
import { basename } from 'node:path'
const name = basename(process.argv[1])
const originalArgs = process.argv.slice(2)
const args = [...originalArgs]
if(name==='git')while(args[0]==='-c')args.splice(0,2)
const data = JSON.parse(readFileSync(process.env.CLI_FIXTURE, 'utf8'))
appendFileSync(process.env.CLI_RECORDINGS, JSON.stringify({ name, args, originalArgs }) + '\\n')
const emit = (value) => process.stdout.write(typeof value === 'string' ? value : JSON.stringify(value))
if (name === 'git') {
  if (args[0] === 'log') emit(data.gitLog || '')
  else if (args[0] === 'symbolic-ref') emit('refs/remotes/origin/main\\n')
  else if (args[0] === 'fetch') {}
  else if (args[0] === 'remote' && args[1] === 'get-url') emit('https://github.com/o/r.git\\n')
  else if (args[0] === 'rev-parse') emit(args.includes('--show-toplevel') ? process.cwd() + '\\n' : 'a'.repeat(40) + '\\n')
  else { process.stderr.write('unexpected git call'); process.exitCode = 91 }
} else if (name === 'gh') {
  const action = args.slice(0, 2).join(' ')
  if (data.fail === action) { process.stderr.write('fixture discovery failure'); process.exitCode = 3 }
  else if (action === 'repo view') emit({ defaultBranchRef: { name: 'main' } })
  else if (args[0] === 'api') emit({})
  else if (action === 'issue list') emit(data.issues)
  else if (action === 'issue view') {
    const found = [...data.issues, ...(data.otherIssues || [])].find(i => i.number === Number(args[2]))
    if (found) emit(found)
    else { process.stderr.write('issue not found'); process.exitCode = 4 }
  }
  else if (action === 'pr list') emit(data.prs)
  else if (action === 'pr view') emit(data.prs.find(p => p.number === Number(args[2])) || data.pr)
  else if (['label create', 'issue edit', 'issue comment', 'repo clone'].includes(action)) {}
  else { process.stderr.write('unexpected gh call'); process.exitCode = 92 }
} else { process.stderr.write('unexpected model launch'); process.exitCode = 93 }
`
  for (const name of ['gh', 'git', 'claude']) writeFileSync(join(bin, name), stub, { mode: 0o755 })
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

function fixture(overrides = {}) {
  writeFileSync(
    dataFile,
    JSON.stringify({
      issues: [issue(1), issue(2, `Blocked by #9\n${goodBody}`), issue(3, 'No criteria')],
      otherIssues: [issue(9)],
      prs: [pr],
      pr,
      ...overrides,
    }),
  )
}

function invoke(args) {
  return spawnSync(process.execPath, [binary, ...args], {
    cwd: repo,
    encoding: 'utf8',
    timeout: 15000,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      ATEAM_RUNNER_HOME: runnerHome,
      CLI_FIXTURE: dataFile,
      CLI_RECORDINGS: recordings,
    },
  })
}

function commands() {
  return existsSync(recordings)
    ? readFileSync(recordings, 'utf8').trim().split('\n').map(JSON.parse)
    : []
}

function snapshot(path) {
  if (!existsSync(path)) return null
  if (!lstatSync(path).isDirectory()) return readFileSync(path).toString('base64')
  return Object.fromEntries(
    readdirSync(path)
      .sort()
      .map((name) => [name, snapshot(join(path, name))]),
  )
}

function envelope(child, command, status) {
  assert.equal(child.error, undefined)
  let result
  assert.doesNotThrow(() => {
    result = JSON.parse(child.stdout)
  }, `entire stdout must be one JSON document: ${child.stdout}\nstderr: ${child.stderr}`)
  assert.deepEqual(
    Object.keys(result).sort(),
    ['schemaVersion', 'command', 'status', 'result', 'error'].sort(),
  )
  assert.equal(result.schemaVersion, 1)
  assert.equal(result.command, command)
  if (status) assert.equal(result.status, status)
  return result
}

function assertReadOnly(before) {
  assert.deepEqual(
    { repo: snapshot(repo), home: snapshot(runnerHome), issues: snapshot(issuesFile) },
    before,
  )
  for (const { name, args, originalArgs } of commands()) {
    assert.notEqual(name, 'claude', 'dry run must not start a model')
    if (name === 'git')
      assert.ok(
        ['log', 'symbolic-ref', 'rev-parse', 'status'].includes(args[0]) ||
          (args[0] === 'remote' && args[1] === 'get-url'),
        `mutating git call: ${args}`,
      )
    if (name === 'git')
      for (let i = 0; originalArgs[i] === '-c'; i += 2)
        assert.ok(
          [
            'core.hooksPath=/dev/null',
            'core.fsmonitor=false',
            'protocol.ext.allow=never',
            'core.attributesFile=/dev/null',
          ].includes(originalArgs[i + 1]),
          `unexpected Git override: ${originalArgs[i + 1]}`,
        )
    if (name === 'gh')
      assert.ok(
        ['issue list', 'issue view', 'pr list', 'pr view', 'repo view'].includes(
          args.slice(0, 2).join(' '),
        ) || args[0] === 'api',
        `mutating gh call: ${args}`,
      )
  }
}

for (const [command, args] of [
  ['run', () => ['--repo', 'o/r', '--issue', '1', '--path', repo]],
  ['run', () => ['--source', 'local', '--issues', issuesFile, '--path', repo]],
  ['review', () => ['--repo', 'o/r', '--pr', '10', '--path', repo]],
  ['watch', () => ['--repo', 'o/r', '--once', '--path', repo]],
  ['init', () => []],
]) {
  test(`${command} ${command === 'run' ? (args.toString().includes('local') ? 'local' : 'github') : ''} dry-run returns a plan without local or remote changes`, () => {
    const before = {
      repo: snapshot(repo),
      home: snapshot(runnerHome),
      issues: snapshot(issuesFile),
    }
    const child = invoke([command, ...args(), '--dry-run', '--json'])
    assertReadOnly(before)
    const output = envelope(child, command)
    assert.equal(output.result.dryRun, true)
    assert.ok(Array.isArray(output.result.candidates))
    assert.equal(output.error, null)
  })
}

test('watch dry-run inspects every candidate and describes ready, blocked and malformed dispositions', () => {
  const output = envelope(
    invoke(['watch', '--repo', 'o/r', '--path', repo, '--once', '--dry-run', '--json']),
    'watch',
    'blocked',
  )
  assert.deepEqual(
    output.result.candidates.filter((c) => c.kind === 'issue').map((c) => [c.issue, c.disposition]),
    [
      ['1', 'ready'],
      ['2', 'blocked'],
      ['3', 'malformed'],
    ],
  )
  const ready = output.result.candidates.find((c) => c.issue === '1' && c.kind === 'issue')
  assert.ok(ready.actions.includes('execute'))
  assert.ok(ready.actions.includes('open-pr'))
  assert.ok(
    output.result.candidates
      .find((c) => c.disposition === 'malformed')
      .actions.includes('request-detail'),
  )
})

test('local dry-run reports dependencies and malformed issues in its structured plan', () => {
  const child = invoke([
    'run',
    '--source',
    'local',
    '--issues',
    issuesFile,
    '--path',
    repo,
    '--dry-run',
    '--json',
  ])
  const output = envelope(child, 'run', 'blocked')
  assert.equal(child.status, 2)
  assert.deepEqual(
    output.result.candidates.map((c) => c.disposition),
    ['ready', 'blocked', 'malformed'],
  )
  assert.deepEqual(output.result.candidates[1].blockers, ['Ready'])
})

test('missing clone is reported without cloning or creating runner home', () => {
  const child = invoke(['run', '--repo', 'o/r', '--issue', '1', '--dry-run', '--json'])
  const output = envelope(child, 'run', 'blocked')
  assert.equal(child.status, 2)
  assert.equal(existsSync(runnerHome), false)
  assert.ok(output.result.prerequisites.some((p) => p.code === 'missing-clone'))
  assert.equal(output.result.candidates[0].disposition, 'blocked')
  assert.equal(
    commands().some((c) => c.args[0] === 'repo' && c.args[1] === 'clone'),
    false,
  )
})

test('missing local issues file is a plan prerequisite and creates nothing', () => {
  const child = invoke([
    'run',
    '--source',
    'local',
    '--issues',
    join(root, 'absent.md'),
    '--dry-run',
    '--json',
  ])
  const output = envelope(child, 'run', 'blocked')
  assert.equal(child.status, 2)
  assert.ok(output.result.prerequisites.some((p) => p.code === 'missing-issues-file'))
  assert.equal(existsSync(runnerHome), false)
  assert.equal(existsSync(join(root, 'absent.md')), false)
})

for (const flags of [['--json'], ['--json', '--dry-run']]) {
  test(`streaming watch ${flags.join(' ')} rejects before discovery or setup`, () => {
    const child = invoke(['watch', '--repo', 'o/r', '--path', repo, ...flags])
    const output = envelope(child, 'watch', 'error')
    assert.equal(child.status, 2)
    assert.equal(output.error.code, 'unsupported-combination')
    assert.match(output.error.message, /--once/)
    assert.deepEqual(commands(), [])
    assert.equal(existsSync(runnerHome), false)
  })
}

test('finite status JSON is a single envelope for multiple repositories', () => {
  fixture({ issues: [], prs: [] })
  const child = invoke(['status', '--repo', 'o/r', '--repo', 'o/s', '--json'])
  const output = envelope(child, 'status', 'success')
  assert.equal(child.status, 0)
  assert.deepEqual(
    output.result.map((s) => s.repo),
    ['o/r', 'o/s'],
  )
})

test('ordinary run still sets labels and requests detail, with nested WARN only on stderr', () => {
  const child = invoke(['run', '--repo', 'o/r', '--issue', '3', '--path', repo, '--json'])
  const output = envelope(child, 'run', 'blocked')
  assert.equal(child.status, 2)
  assert.equal(output.result.outcome, 'needs-detail')
  assert.match(child.stderr, /WARN issue.needs_detail/)
  assert.ok(commands().some((c) => c.args.slice(0, 2).join(' ') === 'label create'))
  assert.ok(commands().some((c) => c.args.slice(0, 2).join(' ') === 'issue comment'))
})

test('ordinary local multi-issue run emits one envelope and nested diagnostics on stderr', () => {
  writeFileSync(
    issuesFile,
    '## First\n### Acceptance criteria\nTBD\n## Second\n**Depends on:** Missing\n### Acceptance criteria\n- [ ] Works\n',
  )
  const child = invoke([
    'run',
    '--source',
    'local',
    '--issues',
    issuesFile,
    '--path',
    repo,
    '--json',
  ])
  const output = envelope(child, 'run', 'blocked')
  assert.equal(child.status, 2)
  assert.equal(output.result.results.length, 2)
  assert.match(child.stderr, /WARN local.needs_detail/)
  assert.match(child.stderr, /INFO issue.blocked_by/)
})

test('review with no linked issue produces a skipped envelope', () => {
  fixture({
    pr: { ...pr, headRefName: 'independent-branch', closingIssuesReferences: [] },
    prs: [],
  })
  const child = invoke(['review', '--repo', 'o/r', '--pr', '10', '--path', repo, '--json'])
  const output = envelope(child, 'review', 'skipped')
  assert.equal(child.status, 0)
  assert.equal(output.result.skipped, true)
})

test('an old review marker without current evidence cannot count as an approval', () => {
  fixture({
    pr: { ...pr, reviews: [{ body: '<!-- ateam-runner:verdict sha=abcdef1234 cycle=1 -->' }] },
    prs: [],
  })
  const child = invoke(['review', '--repo', 'o/r', '--pr', '10', '--path', repo, '--json'])
  const output = envelope(child, 'review', 'blocked')
  assert.notEqual(output.result.verdict, 'approve')
  assert.equal(
    commands().some((c) => c.args.slice(0, 2).join(' ') === 'pr review'),
    false,
  )
})

test('watch and its preview do not suppress current review because of an old marker', () => {
  const marked = {
    ...pr,
    reviews: [{ body: '<!-- ateam-runner:verdict sha=abcdef1234 cycle=1 -->' }],
  }
  fixture({ issues: [], otherIssues: [issue(1)], prs: [marked], pr: marked })
  const args = ['watch', '--repo', 'o/r', '--path', repo, '--once', '--json']
  const preview = envelope(invoke([...args, '--dry-run']), 'watch').result
  assert.equal(preview.candidates[0].disposition, 'ready')
  const live = envelope(invoke(args), 'watch').result
  assert.equal(live.results[0].pr, 10)
  assert.notEqual(live.results[0].verdict, 'approve')
})

test('review dry-run and execution reuse current delivered negative evidence without writes or model calls', () => {
  const current = { ...pr, headRefOid: 'b'.repeat(40), baseRefOid: 'a'.repeat(40) }
  fixture({ issues: [issue(1)], prs: [current], pr: current })
  const args = ['review', '--repo', 'o/r', '--pr', '10', '--path', repo, '--json']
  const preview = envelope(invoke([...args, '--dry-run']), 'review').result
  const policy = preview.targets[0].policy
  assert.ok(policy)
  const dir = join(runnerHome, 'runs/o-r/pr-10/fixture')
  mkdirSync(dir, { recursive: true })
  recordNonapprovalDelivery({
    repo: 'o/r',
    issue: normaliseIssue(issue(1)),
    head: current.headRefOid,
    baseSha: current.baseRefOid,
    policy,
    verdict: { ...verdict, verdict: 'blocked' },
    prNumber: 10,
    via: 'review',
    runDir: dir,
    cycle: 1,
  })
  const before = { repo: snapshot(repo), home: snapshot(runnerHome), issues: snapshot(issuesFile) }
  const planned = envelope(invoke([...args, '--dry-run']), 'review').result
  assert.equal(planned.candidates[0].disposition, 'skipped')
  assert.equal(envelope(invoke(args), 'review', 'skipped').result.previousVerdict, 'blocked')
  const forced = envelope(invoke([...args, '--dry-run', '--force']), 'review').result
  assert.equal(forced.candidates[0].disposition, 'ready')
  assertReadOnly(before)
})

test('watch once returns its issue results and INFO progress only on stderr', () => {
  fixture({ issues: [issue(3, 'No criteria')], prs: [] })
  const child = invoke(['watch', '--repo', 'o/r', '--path', repo, '--once', '--json'])
  const output = envelope(child, 'watch', 'blocked')
  assert.equal(child.status, 2)
  assert.equal(output.result.results[0].issue, '3')
  assert.match(child.stderr, /INFO watch.start/)
  assert.match(child.stderr, /INFO watch.stopped/)
})

test('watch once propagates discovery failure in its envelope and exit code', () => {
  fixture({ issues: [], prs: [], fail: 'issue list' })
  const child = invoke(['watch', '--repo', 'o/r', '--path', repo, '--once', '--json'])
  const output = envelope(child, 'watch', 'error')
  assert.equal(child.status, 1)
  assert.match(output.error.message, /fixture discovery failure/)
  assert.match(child.stderr, /ERROR watch.issue_error/)
})

test('init JSON writes its config and returns one envelope', () => {
  const child = invoke(['init', '--json'])
  const output = envelope(child, 'init', 'success')
  assert.equal(child.status, 0)
  assert.equal(output.result.path, join(runnerHome, 'config.json'))
  assert.ok(existsSync(output.result.path))
  assert.match(child.stderr, /INFO config.written/)
})

test('command errors, invalid config and unknown commands have parseable JSON', () => {
  for (const args of [['run'], ['nonsense'], ['run', '--repo', 'o/r', '--issue']]) {
    const child = invoke([...args, '--json'])
    const output = envelope(child, args[0], 'error')
    assert.equal(child.status, 2)
    assert.equal(output.result, null)
    assert.ok(output.error.message)
  }
  mkdirSync(runnerHome)
  writeFileSync(join(runnerHome, 'config.json'), '{')
  const child = invoke(['status', '--repo', 'o/r', '--json'])
  const output = envelope(child, 'status', 'error')
  assert.equal(child.status, 1)
  assert.ok(output.error.message)
})

test('remote discovery errors emit one structured error without state creation', () => {
  fixture({ fail: 'issue view' })
  const child = invoke(['run', '--repo', 'o/r', '--issue', '1', '--dry-run', '--json'])
  const output = envelope(child, 'run', 'error')
  assert.equal(child.status, 1)
  assert.match(output.error.message, /fixture discovery failure/)
  assert.equal(existsSync(runnerHome), false)
})

test('human init and dry-run remain readable', () => {
  const child = invoke(['init', '--dry-run'])
  assert.equal(child.status, 0)
  assert.match(child.stdout, /[Pp]lan/)
  assert.match(child.stdout, /config\.json/)
  assert.equal(existsSync(runnerHome), false)
})

test('dry runs preserve existing config, worktrees, locks and run records', () => {
  mkdirSync(join(runnerHome, 'worktrees', 'o-r', '1'), { recursive: true })
  mkdirSync(join(runnerHome, 'locks', 'o-r'), { recursive: true })
  mkdirSync(join(runnerHome, 'runs', 'o-r', '1'), { recursive: true })
  writeFileSync(
    join(runnerHome, 'config.json'),
    JSON.stringify({ repos: [{ repo: 'o/r', path: repo, base: 'main' }] }),
  )
  writeFileSync(join(runnerHome, 'locks', 'o-r', '1.lock'), '{"pid":123}')
  writeFileSync(join(runnerHome, 'worktrees', 'o-r', '1', 'existing.txt'), 'keep work')
  writeFileSync(join(runnerHome, 'runs', 'o-r', '1', 'result.json'), '{"keep":true}')
  const before = { repo: snapshot(repo), home: snapshot(runnerHome), issues: snapshot(issuesFile) }
  for (const args of [
    ['init'],
    ['run', '--repo', 'o/r', '--issue', '1'],
    ['review', '--repo', 'o/r', '--pr', '10'],
    ['watch', '--once'],
    ['run', '--source', 'local', '--issues', issuesFile],
  ]) {
    const output = envelope(invoke([...args, '--dry-run', '--json']), args[0])
    assert.equal(output.result.dryRun, true)
    assertReadOnly(before)
  }
})

test('unknown dependency state blocks dry-run without requesting issue changes', () => {
  fixture({ otherIssues: [] })
  const child = invoke([
    'run',
    '--repo',
    'o/r',
    '--issue',
    '2',
    '--path',
    repo,
    '--dry-run',
    '--json',
  ])
  const output = envelope(child, 'run', 'blocked')
  assert.equal(output.result.candidates[0].prerequisites[0].code, 'unavailable-blocker')
  assert.equal(
    commands().some((c) => ['edit', 'comment'].includes(c.args[1])),
    false,
  )
})

test('local dry-run lists already implemented work as skipped without GitHub discovery', () => {
  fixture({ gitLog: 'Implements issue: Ready\n' })
  const child = invoke([
    'run',
    '--source',
    'local',
    '--issues',
    issuesFile,
    '--issue',
    'ready',
    '--dry-run',
    '--json',
  ])
  const output = envelope(child, 'run', 'skipped')
  assert.equal(child.status, 0)
  assert.equal(output.result.candidates[0].disposition, 'skipped')
  assert.equal(
    commands().some((c) => c.name !== 'git'),
    false,
  )
})

test('local dry-run reports a requested issue missing from an existing input file', () => {
  const child = invoke([
    'run',
    '--source',
    'local',
    '--issues',
    issuesFile,
    '--issue',
    'absent',
    '--dry-run',
    '--json',
  ])
  const output = envelope(child, 'run', 'blocked')
  assert.equal(child.status, 2)
  assert.equal(output.result.prerequisites[0].code, 'missing-issue')
})

test('ordinary run reports a requested local issue missing from an existing file', () => {
  const child = invoke([
    'run',
    '--source',
    'local',
    '--issues',
    issuesFile,
    '--issue',
    'absent',
    '--json',
  ])
  const output = envelope(child, 'run', 'error')
  assert.equal(child.status, 2)
  assert.match(output.error.message, /issue.*not found/)
})

test('command-specific unsupported flags are rejected before init can write', () => {
  const child = invoke(['init', '--pr', '10', '--json'])
  const output = envelope(child, 'init', 'error')
  assert.equal(child.status, 2)
  assert.equal(output.error.code, 'unsupported-combination')
  assert.equal(existsSync(runnerHome), false)
})

test('watch once idle and JSON help remain finite envelopes', () => {
  fixture({ issues: [], prs: [] })
  const idle = invoke(['watch', '--repo', 'o/r', '--path', repo, '--once', '--json'])
  assert.deepEqual(envelope(idle, 'watch', 'skipped').result.results, [])
  assert.equal(idle.status, 0)
  const help = invoke(['--json'])
  assert.match(envelope(help, 'help', 'success').result.usage, /ateam-runner/)
})

test('unknown options and dry-run status return structured usage errors before work', () => {
  for (const args of [
    ['run', '--unknown', 'x'],
    ['status', '--dry-run', '--repo', 'o/r'],
  ]) {
    const child = invoke([...args, '--json'])
    const output = envelope(child, args[0], 'error')
    assert.equal(child.status, 2)
    assert.ok(output.error.message)
  }
  assert.deepEqual(commands(), [])
})

test('execution preflight refuses a renamed harness before state or GitHub writes', () => {
  writeFileSync(join(repo, 'CONTRACT.md'), 'synthetic harness')
  mkdirSync(join(repo, 'intake'))
  const before = { repo: snapshot(repo), home: snapshot(runnerHome), issues: snapshot(issuesFile) }
  const child = invoke(['run', '--repo', 'o/r', '--issue', '3', '--path', repo, '--json'])
  assert.match(envelope(child, 'run', 'error').error.message, /harness/)
  assertReadOnly(before)
})

test('execution preflight rejects protected scope and dry-run retains the conflict without effects', () => {
  const before = { repo: snapshot(repo), home: snapshot(runnerHome), issues: snapshot(issuesFile) }
  const args = [
    'run',
    '--repo',
    'o/r',
    '--issue',
    '1',
    '--path',
    repo,
    '--scope-path',
    '.github/workflows/ci.yml',
    '--json',
  ]
  assert.match(envelope(invoke(args), 'run', 'error').error.message, /protected/)
  const plan = envelope(invoke([...args, '--dry-run']), 'run', 'blocked').result
  assert.ok(plan.prerequisites.some((p) => /protected/.test(p.message)))
  assertReadOnly(before)
})

test('dry-run exposes project bindings and scoped invocation authorization', () => {
  const authority = join(root, 'authorization.json')
  writeFileSync(
    authority,
    JSON.stringify({
      id: 'explicit-fixture-request',
      protectedPaths: ['.github/workflows/ci.yml'],
    }),
  )
  writeFileSync(
    join(repo, 'CLAUDE.md'),
    '## A-Team Config\n- test command: project-test\n- design system path: existing/tokens\n',
  )
  const plan = envelope(
    invoke([
      'run',
      '--repo',
      'o/r',
      '--issue',
      '1',
      '--path',
      repo,
      '--test-cmd',
      'team-fallback',
      '--scope-path',
      '.github/workflows/ci.yml',
      '--authorization-file',
      authority,
      '--dry-run',
      '--json',
    ]),
    'run',
    'success',
  ).result
  assert.deepEqual(plan.targets[0].policy.verification.commands, ['project-test'])
  assert.equal(plan.targets[0].policy.bindings.designSystemPath, 'existing/tokens')
  assert.equal(plan.targets[0].policy.authorization.id, 'explicit-fixture-request')
  assert.equal(plan.targets[0].policy.githubIssues, false)
})
