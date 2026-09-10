import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { fixtureRepo, git } from './approval-fixtures.mjs'
const cli = resolve(import.meta.dirname, '../src/combined-cli.mjs')
const native = process.platform === 'darwin' && process.env.ATEAM_NATIVE_SANDBOX_TEST === '1'
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'ateam-combined-cli-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const root = fixtureRepo(dir),
    home = join(dir, 'home'),
    input = join(dir, 'issues.json')
  const config = {
    deliveryVerification: {
      schemaVersion: 1,
      checks: [
        { id: 'suite', kind: 'suite', command: 'node check.mjs' },
        ...['typecheck', 'build', 'browser', 'integration'].map((kind) => ({
          id: kind,
          kind,
          notApplicable: 'Isolated Node command fixture does not have this layer',
        })),
      ],
      boundaries: [
        {
          id: 'external-tenant',
          status: 'unexecuted',
          reason: 'No tenant authorized',
          obligationIds: ['OBL-EXTERNAL'],
        },
      ],
    },
  }
  writeFileSync(
    join(root, 'CLAUDE.md'),
    '## A-Team Config\n\n```json\n' + JSON.stringify(config) + '\n```\n',
  )
  writeFileSync(
    join(root, 'check.mjs'),
    'if(process.env.ATEAM_PRIVATE_SECRET)throw Error("environment leaked"); console.log("real command ran")\n',
  )
  git(root, ['add', '.'])
  git(root, ['commit', '-m', 'verification contract'])
  writeFileSync(input, '[]')
  const env = {
    ...process.env,
    ATEAM_RUNNER_HOME: home,
    ATEAM_PRIVATE_SECRET: 'must-not-reach-check',
  }
  const run = (command, more = []) => {
    const result = spawnSync(
      process.execPath,
      [cli, command, '--root', root, '--branch', 'main', '--issues', input, ...more],
      { env, encoding: 'utf8' },
    )
    return { code: result.status, value: JSON.parse(result.stdout), stderr: result.stderr }
  }
  return { dir, root, home, input, run }
}
test('public combined plan has no source/history/process effects', (t) => {
  const f = fixture(t),
    before = git(f.root, ['status', '--porcelain'])
  const result = f.run('plan')
  assert.equal(result.code, 0, JSON.stringify(result.value))
  assert.equal(result.value.status, 'planned')
  assert.deepEqual(result.value.effects, [])
  assert.equal(git(f.root, ['status', '--porcelain']), before)
  assert.equal(existsSync(f.home), false)
})
test(
  'native public CLI runs actual command on exact immutable SHA, retains failure then pass',
  { skip: !native },
  (t) => {
    const f = fixture(t)
    writeFileSync(
      join(f.root, 'check.mjs'),
      'console.error("combined-only defect"); process.exit(9)\n',
    )
    git(f.root, ['add', '.'])
    git(f.root, ['commit', '-m', 'injected combined defect'])
    const failed = f.run('verify')
    assert.equal(failed.code, 2)
    assert.equal(failed.value.status, 'failed', JSON.stringify(failed.value))
    assert.equal(failed.value.record.checks[0].exitCode, 9)
    writeFileSync(
      join(f.root, 'check.mjs'),
      'if(process.env.ATEAM_PRIVATE_SECRET)throw Error("environment leaked"); console.log("real command ran")\n',
    )
    git(f.root, ['add', '.'])
    git(f.root, ['commit', '-m', 'restore behavior'])
    const passed = f.run('verify')
    assert.equal(passed.code, 0, JSON.stringify(passed.value))
    assert.equal(passed.value.record.checks[0].output.stdout, 'real command ran\n')
    assert.equal(passed.value.record.history[0].status, 'failed')
    assert.equal(passed.value.record.headSha, git(f.root, ['rev-parse', 'HEAD']))
    assert.equal(f.run('check', ['--record', passed.value.recordPath]).code, 0)
    assert.equal(JSON.parse(readFileSync(failed.value.recordPath)).checks[0].exitCode, 9)
  },
)
