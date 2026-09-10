import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { parseIssuesFile } from '../src/adapters/local.mjs'
const binary = fileURLToPath(new URL('../bin/ateam-runner.mjs', import.meta.url))
let root, file, home, bin, calls
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ateam-migration-'))
  file = join(root, 'issues.md')
  home = join(root, 'runner-home')
  bin = join(root, 'bin')
  calls = join(root, 'calls')
  mkdirSync(bin)
  writeFileSync(
    file,
    '## First\n### Acceptance criteria\n- [ ] Given input, when saved, then it persists\n## Second\n**Depends on:** First\n### Acceptance criteria\n- [ ] Given saved input, when opened, then it appears\n',
  )
  for (const name of ['git', 'gh', 'claude'])
    writeFileSync(
      join(bin, name),
      `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(calls)},'unexpected launch');process.exit(99)\n`,
      { mode: 0o755 },
    )
})
afterEach(() => rmSync(root, { recursive: true, force: true }))
function invoke(extra = []) {
  return spawnSync(
    process.execPath,
    [binary, 'migrate-issues', '--issues', file, ...extra, '--json'],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, ATEAM_RUNNER_HOME: home },
    },
  )
}

test('explicit migration previews exact text without effects and persists IDs once', () => {
  const original = readFileSync(file, 'utf8')
  const preview = invoke(['--dry-run'])
  assert.equal(preview.status, 0, preview.stderr)
  const plan = JSON.parse(preview.stdout)
  assert.equal(plan.command, 'migrate-issues')
  assert.equal(plan.result.dryRun, true)
  assert.equal(readFileSync(file, 'utf8'), original)
  assert.equal(existsSync(home), false)
  assert.equal(existsSync(calls), false)
  const changed = invoke()
  assert.equal(changed.status, 0, changed.stderr)
  assert.equal(readFileSync(file, 'utf8'), plan.result.text)
  const issues = parseIssuesFile(readFileSync(file, 'utf8'))
  assert.match(issues[0].id, /^ISS-/)
  assert.deepEqual(issues[1].dependsOn, [issues[0].id])
  assert.equal(JSON.parse(invoke().stdout).result.changed, false)
  assert.equal(readFileSync(file, 'utf8'), plan.result.text)
  assert.equal(existsSync(home), false)
  assert.equal(existsSync(calls), false)
})

test('failed migration leaves an ambiguous original untouched with useful diagnostics', () => {
  writeFileSync(file, readFileSync(file, 'utf8').replace('## Second', '## First'))
  const original = readFileSync(file, 'utf8')
  const result = invoke()
  assert.equal(result.status, 2)
  assert.match(JSON.parse(result.stdout).error.message, /ambiguous|collision/i)
  assert.equal(readFileSync(file, 'utf8'), original)
  assert.equal(existsSync(home), false)
  assert.equal(existsSync(calls), false)
})

test('execution validates unselected siblings before any process or state creation', () => {
  writeFileSync(
    file,
    '## Selected\n**ID:** ISS-SELECTED\n### Acceptance criteria\n- [ ] Works\n## Other\n**ID:** ISS-OTHER\n**Depends on:** ISS-MISSING\n### Acceptance criteria\n- [ ] Works\n',
  )
  const result = spawnSync(
    process.execPath,
    [
      binary,
      'run',
      '--source',
      'local',
      '--issues',
      file,
      '--issue',
      'ISS-SELECTED',
      '--path',
      root,
      '--json',
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, ATEAM_RUNNER_HOME: home },
    },
  )
  assert.equal(result.status, 2)
  assert.match(JSON.parse(result.stdout).error.message, /unknown dependency ISS-MISSING/)
  assert.equal(existsSync(home), false)
  assert.equal(existsSync(calls), false)
})

import fs from 'node:fs'
import * as local from '../src/adapters/local.mjs'

function migrationTemps() {
  return fs.readdirSync(root).filter((name) => name.startsWith('.issues.md.migrate-'))
}

test('atomic migration replaces the file only after flushing and preserves its mode', (t) => {
  assert.equal(typeof local.migrateIssuesFile, 'function')
  fs.chmodSync(file, 0o640)
  const original = readFileSync(file, 'utf8')
  let flushed = false
  const flush = fs.fsyncSync
  t.mock.method(fs, 'fsyncSync', (fd) => {
    flushed = true
    return flush(fd)
  })
  const rename = fs.renameSync
  t.mock.method(fs, 'renameSync', (source, destination) => {
    assert.equal(flushed, true)
    assert.equal(readFileSync(file, 'utf8'), original)
    assert.equal(destination, file)
    assert.equal(join(root, source.split('/').at(-1)), source)
    return rename(source, destination)
  })
  const migrated = local.migrateIssuesFile(file)
  assert.equal(readFileSync(file, 'utf8'), migrated.text)
  assert.equal(fs.statSync(file).mode & 0o777, 0o640)
  assert.deepEqual(migrationTemps(), [])
})

for (const operation of ['writeFileSync', 'fsyncSync', 'renameSync']) {
  test(`failed atomic migration ${operation} preserves original and removes only its temporary file`, (t) => {
    assert.equal(typeof local.migrateIssuesFile, 'function')
    const original = readFileSync(file, 'utf8')
    const unrelated = join(root, '.issues.md.migrate-unrelated.tmp')
    writeFileSync(unrelated, 'keep this other writer')
    t.mock.method(fs, operation, () => {
      throw new Error(`interrupted ${operation}`)
    })
    assert.throws(() => local.migrateIssuesFile(file), new RegExp(`interrupted ${operation}`))
    assert.equal(readFileSync(file, 'utf8'), original)
    assert.equal(readFileSync(unrelated, 'utf8'), 'keep this other writer')
    assert.deepEqual(migrationTemps(), ['.issues.md.migrate-unrelated.tmp'])
  })
}

test('atomic migration refuses a source changed after reading without overwriting the concurrent edit', (t) => {
  assert.equal(typeof local.migrateIssuesFile, 'function')
  const edited = `${readFileSync(file, 'utf8')}\nA concurrent edit.\n`
  const flush = fs.fsyncSync
  t.mock.method(fs, 'fsyncSync', (fd) => {
    flush(fd)
    writeFileSync(file, edited)
  })
  assert.throws(() => local.migrateIssuesFile(file), /issues file changed.*retry/i)
  assert.equal(readFileSync(file, 'utf8'), edited)
  assert.deepEqual(migrationTemps(), [])
})
