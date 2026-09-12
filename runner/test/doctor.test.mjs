import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { doctor } from '../src/doctor.mjs'
import { chmodSync, symlinkSync, copyFileSync, existsSync, utimesSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const harness = resolve(import.meta.dirname, '../..')
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'ateam-doctor-'))
  const previousHome = process.env.ATEAM_RUNNER_HOME
  process.env.ATEAM_RUNNER_HOME = `${root}-evidence`
  t.after(() => {
    if (previousHome === undefined) delete process.env.ATEAM_RUNNER_HOME
    else process.env.ATEAM_RUNNER_HOME = previousHome
  })
  t.after(() => rmSync(root, { recursive: true, force: true }))
  git(root, 'init', '-q', '-b', 'main')
  git(root, 'config', 'user.name', 'Synthetic operator')
  git(root, 'config', 'user.email', 'operator@example.invalid')
  mkdirSync(join(root, 'docs/product'), { recursive: true })
  writeFileSync(join(root, 'docs/product/context.md'), 'Synthetic sample context')
  writeFileSync(
    join(root, 'CLAUDE.md'),
    `## A-Team Config\n- harness root: ${harness}\n- harness revision: ${git(harness, 'rev-parse', 'HEAD')}\n- base branch: main\n- test command: node --test\n`,
  )
  git(root, 'add', '.')
  git(root, 'commit', '-qm', 'synthetic target')
  return root
}
function snapshot(root) {
  const files = {}
  function scan(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) scan(path)
      else if (entry.isFile())
        files[path] = createHash('sha256').update(readFileSync(path)).digest('hex')
    }
  }
  scan(root)
  return files
}
const probes = {
  findBinary: (name) =>
    name === 'git'
      ? execFileSync('which', ['git'], { encoding: 'utf8' }).trim()
      : `/trusted/${name}`,
  isolationProbe: async () => {},
  versionProbe: async (name) => (name === 'python3' ? 'Python 3.12.0' : 'git version 2.45.0'),
}

test('doctor never executes a repository-configured clean filter while inspecting dirty state', async (t) => {
  const root = fixture(t)
  writeFileSync(join(root, '.gitattributes'), 'docs/product/context.md filter=diagnostic_probe\n')
  git(root, 'add', '.gitattributes')
  git(root, 'commit', '-qm', 'synthetic filter attribute')
  const marker = join(root, 'filter-executed'),
    script = join(root, 'filter.sh')
  writeFileSync(script, '#!/bin/sh\nprintf executed > filter-executed\n/bin/cat\n')
  chmodSync(script, 0o755)
  git(root, 'config', 'filter.diagnostic_probe.clean', script)
  writeFileSync(join(root, 'docs/product/context.md'), 'synthetic sample context')
  utimesSync(join(root, 'docs/product/context.md'), new Date(), new Date(Date.now() + 2000))
  const before = snapshot(root)
  const result = await doctor({ root }, probes)
  assert.equal(existsSync(marker), false, 'target filter must never run')
  assert.deepEqual(snapshot(root), before)
  assert.equal(result.checks.find((c) => c.id === 'target-clean').status, 'blocked')
  assert.match(result.checks.find((c) => c.id === 'target-clean').condition, /filter/i)
})

test('doctor reads a pinned separate target without changing any repository bytes', async (t) => {
  const root = fixture(t),
    before = snapshot(root)
  const result = await doctor({ root, cfg: {} }, probes)
  assert.equal(
    result.status,
    'ready',
    JSON.stringify(result.checks.filter((c) => c.status === 'blocked')),
  )
  assert.deepEqual(result.effects, [])
  assert.equal(result.harness.revision, git(harness, 'rev-parse', 'HEAD'))
  assert.ok(result.checks.some((c) => c.id === 'containment' && c.status === 'warning'))
  assert.deepEqual(snapshot(root), before)
})

test('doctor history inspection cannot start a configured signature verifier or lazy fetch', async (t) => {
  const root = fixture(t)
  const original = git(root, 'cat-file', 'commit', 'HEAD')
  const signed = original.replace(
    '\n\n',
    '\ngpgsig -----BEGIN PGP SIGNATURE-----\n \n aGVsbG8=\n -----END PGP SIGNATURE-----\n\n',
  )
  const commit = execFileSync('git', ['hash-object', '-t', 'commit', '-w', '--stdin'], {
    cwd: root,
    input: signed,
    encoding: 'utf8',
  }).trim()
  git(root, 'update-ref', 'refs/heads/main', commit)
  const marker = join(root, 'signature-executed'),
    script = join(root, 'signature.sh')
  writeFileSync(script, '#!/bin/sh\nprintf executed > signature-executed\nexit 1\n')
  chmodSync(script, 0o755)
  git(root, 'config', 'gpg.program', script)
  git(root, 'config', 'log.showSignature', 'true')
  let before = snapshot(root),
    result = await doctor({ root }, probes)
  assert.equal(existsSync(marker), false)
  assert.equal(result.checks.find((c) => c.id === 'target-policy').status, 'passed')
  assert.deepEqual(snapshot(root), before)
  git(root, 'config', 'remote.origin.promisor', 'true')
  git(root, 'config', 'remote.origin.url', 'https://example.invalid/synthetic/fixture.git')
  before = snapshot(root)
  result = await doctor({ root }, probes)
  assert.equal(result.checks.find((c) => c.id === 'target-policy').status, 'blocked')
  assert.match(
    result.checks.find((c) => c.id === 'target-policy').condition,
    /incomplete|retrieval/,
  )
  assert.deepEqual(snapshot(root), before)
})

test('doctor reports nested submodule state as blocked instead of claiming a clean target', async (t) => {
  const root = fixture(t)
  git(
    root,
    'update-index',
    '--add',
    '--cacheinfo',
    `160000,${git(root, 'rev-parse', 'HEAD')},nested`,
  )
  git(root, 'commit', '-qm', 'synthetic nested gitlink')
  const before = snapshot(root),
    result = await doctor({ root }, probes)
  const finding = result.checks.find((c) => c.id === 'target-clean')
  assert.equal(finding.status, 'blocked')
  assert.match(finding.condition, /submodule/)
  assert.deepEqual(snapshot(root), before)
})

test('doctor names missing prerequisites, dirty state, identity and config failures without echoing secret values', async (t) => {
  const root = fixture(t)
  writeFileSync(join(root, 'pending.txt'), 'preserve this work')
  let result = await doctor(
    { root, cfg: {} },
    {
      ...probes,
      findBinary: () => null,
      isolationProbe: async () => {
        throw Error('private-token-do-not-echo')
      },
    },
  )
  assert.equal(result.status, 'blocked')
  for (const id of ['binary:git', 'binary:claude', 'target-clean', 'isolation'])
    assert.ok(
      result.checks.find((c) => c.id === id && c.status === 'blocked'),
      id,
    )
  assert.ok(!JSON.stringify(result).includes('private-token-do-not-echo'))
  git(
    root,
    'remote',
    'add',
    'origin',
    'https://secret-user:secret-password@example.invalid/fixture/repo?token=secret-query',
  )
  result = await doctor({ root, cfg: {} }, probes)
  assert.ok(result.checks.find((c) => c.id === 'target-policy' && c.status === 'blocked'))
  assert.ok(!/secret-user|secret-password|secret-query/.test(JSON.stringify(result)))
  writeFileSync(
    join(root, 'CLAUDE.md'),
    '## A-Team Config\n```json\n{"secret-token-unknown-key":"secret-value"}\n```\n',
  )
  result = await doctor({ root, cfg: {} }, probes)
  assert.ok(result.checks.find((c) => c.id === 'target-config' && c.status === 'blocked'))
  assert.ok(!/secret-token|secret-value/.test(JSON.stringify(result)))
})

test('doctor detects missing required harness references without executing target commands', async (t) => {
  const root = fixture(t)
  const result = await doctor(
    { root, cfg: {}, requiredReferences: ['CONTRACT.md', 'missing-required-reference.md'] },
    probes,
  )
  assert.equal(result.status, 'blocked')
  assert.ok(
    result.checks.find(
      (c) => c.id === 'reference:missing-required-reference.md' && c.status === 'blocked',
    ),
  )
  assert.ok(result.checks.every((c) => typeof c.repair === 'string'))
})

test('actual doctor --json remains parseable with malformed operator config and no model or remote starts', async (t) => {
  const root = fixture(t),
    operator = process.env.ATEAM_RUNNER_HOME
  mkdirSync(operator)
  t.after(() => rmSync(operator, { recursive: true, force: true }))
  writeFileSync(join(operator, 'config.json'), '{"secret-key":"secret-value", broken')
  const before = snapshot(root)
  const { spawnSync } = await import('node:child_process')
  const child = spawnSync(
    process.execPath,
    [join(harness, 'runner/bin/ateam-runner.mjs'), 'doctor', '--path', root, '--json'],
    { encoding: 'utf8' },
  )
  const result = JSON.parse(child.stdout)
  assert.equal(child.status, 2)
  assert.equal(child.stderr, '')
  assert.equal(result.command, 'doctor')
  assert.ok(result.result.checks.some((c) => c.id === 'operator-config' && c.status === 'blocked'))
  assert.ok(!/secret-key|secret-value/.test(child.stdout))
  assert.deepEqual(snapshot(root), before)
})

test('rejecting target-owned Git prevents all Git subprocesses and target writes', (t) => {
  const root = fixture(t),
    bin = join(root, 'bin'),
    marker = join(root, 'doctor-started-target-git.txt')
  mkdirSync(bin)
  writeFileSync(join(bin, 'git'), '#!/bin/sh\nprintf touched >> "$ATEAM_DOCTOR_MARKER"\nexit 1\n')
  chmodSync(join(bin, 'git'), 0o755)
  const before = snapshot(root)
  const child = spawnSync(
    process.execPath,
    [join(harness, 'runner/bin/ateam-runner.mjs'), 'doctor', '--path', root, '--json'],
    {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, ATEAM_DOCTOR_MARKER: marker },
    },
  )
  const result = JSON.parse(child.stdout)
  assert.equal(result.status, 'blocked')
  assert.ok(result.result.checks.find((c) => c.id === 'binary:git' && c.status === 'blocked'))
  assert.deepEqual(snapshot(root), before)
})

test('operator config envelopes and configured credential URLs never pass or leak through doctor', (t) => {
  const root = fixture(t),
    operator = process.env.ATEAM_RUNNER_HOME
  mkdirSync(operator)
  t.after(() => rmSync(operator, { recursive: true, force: true }))
  for (const config of [
    [],
    'secret-config-string',
    4,
    null,
    { harnessRoot: 'https://secret-user:secret-password@example.invalid/missing' },
  ]) {
    writeFileSync(join(operator, 'config.json'), JSON.stringify(config))
    const child = spawnSync(
      process.execPath,
      [join(harness, 'runner/bin/ateam-runner.mjs'), 'doctor', '--path', root, '--json'],
      { encoding: 'utf8' },
    )
    const result = JSON.parse(child.stdout)
    assert.equal(child.stderr, '')
    assert.equal(result.status, 'blocked')
    assert.ok(
      result.result.checks.some(
        (c) => ['operator-config', 'harness-config'].includes(c.id) && c.status === 'blocked',
      ),
    )
    assert.ok(!/secret-user|secret-password|secret-config-string/.test(child.stdout))
  }
})

test('supervisor evidence symlink into the target is reported as unsafe', async (t) => {
  const root = fixture(t),
    operator = process.env.ATEAM_RUNNER_HOME
  symlinkSync(root, operator)
  t.after(() => rmSync(operator))
  const result = await doctor({ root }, probes)
  assert.ok(result.checks.some((c) => c.id === 'evidence-location' && c.status === 'blocked'))
})

test('relative PATH entries cannot change the Git binary when doctor changes cwd', (t) => {
  const root = fixture(t),
    bin = join(root, 'bin'),
    marker = join(root, 'relative-git-started')
  mkdirSync(bin)
  writeFileSync(join(bin, 'git'), '#!/bin/sh\nprintf touched >> "$ATEAM_DOCTOR_MARKER"\nexit 1\n')
  chmodSync(join(bin, 'git'), 0o755)
  const before = snapshot(root)
  const child = spawnSync(
    process.execPath,
    [join(harness, 'runner/bin/ateam-runner.mjs'), 'doctor', '--path', root, '--json'],
    {
      cwd: harness,
      encoding: 'utf8',
      env: { ...process.env, PATH: 'bin:/usr/bin:/bin', ATEAM_DOCTOR_MARKER: marker },
    },
  )
  assert.ok(
    JSON.parse(child.stdout).result.checks.some(
      (c) => c.id === 'binary:git' && c.status === 'passed',
    ),
  )
  assert.deepEqual(snapshot(root), before)
})

test('sample setup ignores ambient Git repository redirects and preserves other repositories', (t) => {
  const victim = fixture(t),
    target = `${victim}-new-target`,
    before = snapshot(victim)
  t.after(() => rmSync(target, { recursive: true, force: true }))
  const child = spawnSync(
    process.execPath,
    [join(harness, 'runner/examples/onboarding/setup.mjs'), target],
    {
      encoding: 'utf8',
      env: { ...process.env, GIT_DIR: join(victim, '.git'), GIT_WORK_TREE: victim },
    },
  )
  assert.equal(child.status, 0, child.stderr)
  assert.deepEqual(snapshot(victim), before)
  assert.equal(JSON.parse(child.stdout).revision, git(harness, 'rev-parse', 'HEAD'))
  assert.equal(git(target, 'status', '--porcelain'), '')
})

test('required resources come from pinned HEAD and must remain actual files', (t) => {
  const root = fixture(t),
    candidate = `${root}-harness`
  t.after(() => rmSync(candidate, { recursive: true, force: true }))
  git(harness, 'clone', '--quiet', '--no-local', '--no-hardlinks', harness, candidate)
  for (const path of ['runner/src/doctor.mjs', 'runner/src/cli.mjs', 'runner/src/git.mjs'])
    copyFileSync(join(harness, path), join(candidate, path))
  git(candidate, 'rm', '-q', '.claude/skills/ateam-discovery/SKILL.md')
  rmSync(join(candidate, 'runner/EXECUTION.md'))
  mkdirSync(join(candidate, 'runner/EXECUTION.md'))
  const before = snapshot(candidate)
  const child = spawnSync(
    process.execPath,
    [join(candidate, 'runner/bin/ateam-runner.mjs'), 'doctor', '--path', root, '--json'],
    { encoding: 'utf8' },
  )
  const result = JSON.parse(child.stdout)
  for (const id of [
    'reference:.claude/skills/ateam-discovery/SKILL.md',
    'reference:runner/EXECUTION.md',
  ])
    assert.ok(
      result.result.checks.some((c) => c.id === id && c.status === 'blocked'),
      id,
    )
  assert.deepEqual(snapshot(candidate), before)
})
