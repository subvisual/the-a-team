import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'
import * as local from '../src/adapters/local.mjs'
import { createPrivateCheckout } from '../src/git.mjs'

const cli = fileURLToPath(new URL('../bin/ateam-runner.mjs', import.meta.url))
const gitBinary = execFileSync('which', ['git'], { encoding: 'utf8' }).trim()
let root, repo, first, localHead, remoteHead, runnerHome, file, bin, calls
function git(...args) {
  return execFileSync(gitBinary, args, {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
  }).trim()
}
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ateam-local-base-'))
  repo = join(root, 'target')
  mkdirSync(repo)
  runnerHome = join(root, 'runner-home')
  file = join(root, 'issues.md')
  bin = join(root, 'bin')
  mkdirSync(bin)
  calls = join(root, 'calls.jsonl')
  git('init', '-q', '-b', 'main')
  git('config', 'user.name', 'Fixture')
  git('config', 'user.email', 'fixture@localhost')
  writeFileSync(join(repo, 'value.txt'), 'first\n')
  git('add', '.')
  git('commit', '-qm', 'initial')
  first = git('rev-parse', 'HEAD')
  writeFileSync(join(repo, 'value.txt'), 'local requested\n')
  git('commit', '-qam', 'local main')
  localHead = git('rev-parse', 'HEAD')
  git('checkout', '-q', '-b', 'remote-fixture', first)
  writeFileSync(join(repo, 'value.txt'), 'remote divergent\n')
  git('commit', '-qam', 'remote main')
  remoteHead = git('rev-parse', 'HEAD')
  git('checkout', '-q', 'main')
  git('update-ref', 'refs/remotes/origin/main', remoteHead)
  git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main')
  git('remote', 'add', 'origin', 'https://github.com/fixture/project.git')
  writeFileSync(
    file,
    '## Save\n**ID:** ISS-SAVE\n**Depends on:** none\n### Acceptance criteria\n- [ ] Given input, when saved, then it persists\n',
  )
  const wrapper = `#!${process.execPath}\nconst fs=require('node:fs');const cp=require('node:child_process');const path=require('node:path');const name=path.basename(process.argv[1]);const args=process.argv.slice(2);fs.appendFileSync(process.env.BASE_CALLS,JSON.stringify({name,args})+'\\n');const stripped=[...args];while(stripped[0]==='-c')stripped.splice(0,2);if(name!=='git'||!['symbolic-ref','rev-parse','remote','log','status'].includes(stripped[0]))process.exit(99);const r=cp.spawnSync(${JSON.stringify(gitBinary)},args,{stdio:'inherit'});process.exit(r.status??98);\n`
  for (const name of ['git', 'gh', 'claude'])
    writeFileSync(join(bin, name), wrapper, { mode: 0o755 })
})
afterEach(() => rmSync(root, { recursive: true, force: true }))
function invoke(extra) {
  return spawnSync(
    process.execPath,
    [cli, 'run', '--source', 'local', '--issues', file, '--path', repo, ...extra, '--json'],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        ATEAM_RUNNER_HOME: runnerHome,
        BASE_CALLS: calls,
      },
    },
  )
}
function assertOffline() {
  const recorded = existsSync(calls)
    ? readFileSync(calls, 'utf8').trim().split('\n').map(JSON.parse)
    : []
  assert.equal(
    recorded.some(
      (call) =>
        call.name !== 'git' ||
        call.args.some((arg) => ['fetch', 'push', 'ls-remote'].includes(arg)),
    ),
    false,
  )
}

test('local base resolver uses the requested local branch despite divergent origin/main and private checkout contains that revision', async () => {
  assert.equal(typeof local.resolveLocalBase, 'function')
  const policy = await local.resolveLocalBase({ repoPath: repo, base: 'main' })
  assert.equal(policy.target.baseSha, localHead)
  assert.notEqual(policy.target.baseSha, remoteHead)
  const checkout = join(root, 'private')
  await createPrivateCheckout(repo, checkout, policy.target.baseSha)
  assert.equal(readFileSync(join(checkout, 'value.txt'), 'utf8'), 'local requested\n')
})

test('local resolver accepts an exact commit SHA and an originless repository', async () => {
  assert.equal(typeof local.resolveLocalBase, 'function')
  git('remote', 'remove', 'origin')
  const policy = await local.resolveLocalBase({ repoPath: repo, base: first })
  assert.equal(policy.target.base, first)
  assert.equal(policy.target.baseSha, first)
  assert.equal(policy.target.remote, null)
})

test('local resolver preserves explicit, project, configured and continuation base precedence', async () => {
  assert.equal(typeof local.resolveLocalBase, 'function')
  writeFileSync(
    join(repo, 'CLAUDE.md'),
    '## A-Team Config\n- base branch: remote-fixture\n- test command: project-test\n',
  )
  assert.equal(
    (await local.resolveLocalBase({ repoPath: repo, cfg: { base: 'main' } })).target.baseSha,
    remoteHead,
  )
  assert.equal(
    (await local.resolveLocalBase({ repoPath: repo, base: first })).target.baseSha,
    first,
  )
  assert.equal(
    (await local.resolveLocalBase({ repoPath: repo, base: first, continuationBase: 'main' })).target
      .baseSha,
    localHead,
  )
})

test('unresolved local base fails actionably before implementation checkout', () => {
  const result = invoke(['--base', 'missing-local-branch'])
  assert.equal(result.status, 1)
  assert.match(
    JSON.parse(result.stdout).error.message,
    /local base.*missing-local-branch.*not available.*prepare.*locally/i,
  )
  assert.equal(existsSync(runnerHome), false)
  assertOffline()
})

test('local dry-run exposes exact requested SHA without GitHub or remote Git access', () => {
  for (const [base, sha] of [
    ['main', localHead],
    [first, first],
  ]) {
    const result = invoke(['--base', base, '--dry-run'])
    assert.equal(result.status, 0, result.stderr)
    assert.equal(JSON.parse(result.stdout).result.targets[0].policy.target.baseSha, sha)
  }
  assert.equal(existsSync(runnerHome), false)
  assertOffline()
})

test('local dry-run with no origin still resolves the local branch and reports an unresolved base as a prerequisite', () => {
  git('remote', 'remove', 'origin')
  assert.equal(invoke(['--base', 'main', '--dry-run']).status, 0)
  const missing = invoke(['--base', 'missing-local-branch', '--dry-run'])
  assert.equal(missing.status, 2)
  assert.ok(
    JSON.parse(missing.stdout).result.prerequisites.some((p) => p.code === 'missing-local-base'),
  )
  assertOffline()
})

test('an explicit local branch wins over a same-named tag without changing its policy name', async () => {
  git('tag', 'main', first)
  const policy = await local.resolveLocalBase({ repoPath: repo, base: 'main' })
  assert.equal(policy.target.base, 'main')
  assert.equal(policy.target.baseSha, localHead)
})
