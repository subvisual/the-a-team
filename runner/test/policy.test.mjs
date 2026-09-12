import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const git = (cwd, ...args) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
  }).trim()
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'ateam-policy-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  function repo(name, remote) {
    const p = join(root, name)
    mkdirSync(p)
    git(p, 'init', '-q', '-b', 'main')
    git(p, 'config', 'user.name', 'Fixture')
    git(p, 'config', 'user.email', 'fixture@example.invalid')
    writeFileSync(join(p, 'README.md'), 'fixture\n')
    git(p, 'add', '.')
    git(p, 'commit', '-qm', 'initial')
    if (remote) git(p, 'remote', 'add', 'origin', remote)
    return p
  }
  const harness = repo('harness', 'https://github.com/subvisual/the-a-team.git')
  writeFileSync(join(harness, 'CONTRACT.md'), 'contract')
  mkdirSync(join(harness, 'intake'))
  return { root, harness, repo }
}

test('project config wins over team bindings and identities remain separate', async (t) => {
  const { resolvePolicy } = await import('../src/policy.mjs')
  const f = fixture(t)
  const a = f.repo('a', 'git@github.com:fixture/alpha.git'),
    b = f.repo('b', 'https://github.com/fixture/beta.git')
  for (const [p, cmd, design] of [
    [a, 'node --test', 'ui/tokens'],
    [b, 'mix test', 'assets/theme'],
  ]) {
    writeFileSync(
      join(p, 'CLAUDE.md'),
      `## A-Team Config\n- test command: ${cmd}\n- design system path: ${design}\n- current context: docs/current.md\n`,
    )
  }
  const pa = await resolvePolicy({
    repoPath: a,
    repo: 'fixture/alpha',
    base: 'main',
    cfg: {
      harnessRoot: f.harness,
      testCommand: 'wrong',
      verificationCommands: ['also-wrong'],
      designSystemPath: 'wrong',
    },
  })
  const pb = await resolvePolicy({
    repoPath: b,
    repo: 'fixture/beta',
    base: 'main',
    cfg: { harnessRoot: f.harness },
  })
  assert.deepEqual(pa.verification.commands, ['node --test'])
  assert.equal(pa.bindings.designSystemPath, 'ui/tokens')
  assert.equal(pb.bindings.designSystemPath, 'assets/theme')
  assert.notEqual(pa.target.root, pb.target.root)
  assert.equal(pa.harness.revision, git(f.harness, 'rev-parse', 'HEAD'))
  assert.equal(pa.githubIssues, false)
})

test('canonical aliases cannot authorize protected paths or conceal out-of-scope changes', async (t) => {
  const { resolvePolicy, validateChanges } = await import('../src/policy.mjs')
  const f = fixture(t),
    p = f.repo('target')
  mkdirSync(join(p, '.github/workflows'), { recursive: true })
  writeFileSync(join(p, '.github/workflows/ci.yml'), 'original')
  symlinkSync('.github/workflows/ci.yml', join(p, 'alias.yml'))
  const cfg = { harnessRoot: f.harness, requestedPaths: ['alias.yml'] }
  await assert.rejects(resolvePolicy({ repoPath: p, cfg }), /protected/)
  const policy = await resolvePolicy({ repoPath: p, cfg: { harnessRoot: f.harness } })
  const base = git(p, 'rev-parse', 'HEAD')
  git(p, 'add', 'alias.yml')
  git(p, 'commit', '-qm', 'alias')
  await assert.rejects(validateChanges(policy, p, base, git(p, 'rev-parse', 'HEAD')), /protected/)
})

test('preflight rejects renamed harnesses, mismatched remotes and escaping output symlinks', async (t) => {
  const { resolvePolicy } = await import('../src/policy.mjs')
  const f = fixture(t)
  const p = f.repo('target', 'https://github.com/fixture/target.git')
  await assert.rejects(
    resolvePolicy({ repoPath: p, repo: 'fixture/wrong', cfg: { harnessRoot: f.harness } }),
    /identity/,
  )
  symlinkSync(f.root, join(p, 'docs'))
  await assert.rejects(resolvePolicy({ repoPath: p, cfg: { harnessRoot: f.harness } }), /escapes/)
  const fork = f.repo('fork', 'https://github.com/fixture/renamed.git')
  writeFileSync(join(fork, 'CONTRACT.md'), 'x')
  mkdirSync(join(fork, 'intake'))
  await assert.rejects(
    resolvePolicy({ repoPath: fork, cfg: { harnessRoot: f.harness } }),
    /harness/,
  )
  const ancestor = f.repo('ancestor')
  const nested = f.repo('ancestor/harness')
  await assert.rejects(
    resolvePolicy({
      repoPath: ancestor,
      cfg: { harnessRoot: nested, outputPaths: ['harness/docs'] },
    }),
    /harness/,
  )
})

test('protected path exceptions require explicit invocation authority and stay narrow', async (t) => {
  const { resolvePolicy, validateChanges } = await import('../src/policy.mjs')
  const f = fixture(t)
  const p = f.repo('target', 'https://github.com/fixture/target.git')
  const cfg = { harnessRoot: f.harness, requestedPaths: ['.github/workflows/ci.yml'] }
  await assert.rejects(resolvePolicy({ repoPath: p, cfg }), /protected/)
  const policy = await resolvePolicy({
    repoPath: p,
    cfg,
    authorization: { id: 'user-request-1', protectedPaths: ['.github/workflows/ci.yml'] },
  })
  const base = git(p, 'rev-parse', 'HEAD')
  mkdirSync(join(p, '.github/workflows'), { recursive: true })
  writeFileSync(join(p, '.github/workflows/ci.yml'), 'safe fixture')
  git(p, 'add', '.')
  git(p, 'commit', '-qm', 'allowed')
  await validateChanges(policy, p, base, git(p, 'rev-parse', 'HEAD'))
  writeFileSync(join(p, '.github/workflows/other.yml'), 'outside scope')
  git(p, 'add', '.')
  git(p, 'commit', '-qm', 'unapproved')
  await assert.rejects(validateChanges(policy, p, base, git(p, 'rev-parse', 'HEAD')), /protected/)
})

test('a harness revision pin is checked and source cannot expand its own privileges', async (t) => {
  const { resolvePolicy } = await import('../src/policy.mjs')
  const f = fixture(t),
    p = f.repo('target')
  writeFileSync(join(p, 'CLAUDE.md'), '## A-Team Config\n- harness revision: deadbeef\n')
  await assert.rejects(resolvePolicy({ repoPath: p, cfg: { harnessRoot: f.harness } }), /revision/)
  writeFileSync(
    join(p, 'CLAUDE.md'),
    '## A-Team Config\n```json\n{"writeRoots":["/"],"protectedPaths":[".github/workflows/"]}\n```\n',
  )
  await assert.rejects(
    resolvePolicy({ repoPath: p, cfg: { harnessRoot: f.harness } }),
    /writeRoots|protectedPaths|unsupported/,
  )
})

test('target supervisor actions may narrow an invocation and local runs never gain publishing actions', async (t) => {
  const { resolvePolicy } = await import('../src/policy.mjs')
  const f = fixture(t),
    p = f.repo('target')
  writeFileSync(
    join(p, 'CLAUDE.md'),
    '## A-Team Config\n- supervisor actions: ["record-local-approval"]\n',
  )
  await assert.rejects(
    resolvePolicy({
      repoPath: p,
      cfg: { harnessRoot: f.harness, invocationActions: ['push-branch'] },
    }),
    /supervisor action/,
  )
  const policy = await resolvePolicy({
    repoPath: p,
    cfg: { harnessRoot: f.harness, invocationActions: ['record-local-approval'] },
  })
  assert.deepEqual(policy.supervisor.actions, ['record-local-approval'])
  assert.ok(Object.isFrozen(policy.verification.commands))
})

test('Git execution refuses unsupported confidential subdirectory reads and credential-named history', async (t) => {
  const { resolvePolicy } = await import('../src/policy.mjs')
  const f = fixture(t),
    p = f.repo('target')
  writeFileSync(join(p, 'CLAUDE.md'), '## A-Team Config\n- read paths: ["src"]\n')
  await assert.rejects(
    resolvePolicy({ repoPath: p, cfg: { harnessRoot: f.harness } }),
    /narrower confidential read scopes are unsupported/,
  )
  writeFileSync(join(p, 'CLAUDE.md'), '## A-Team Config\n- read paths: ["."]\n')
  writeFileSync(join(p, '.env'), 'SYNTHETIC_SECRET_ONLY')
  git(p, 'add', '.env')
  git(p, 'commit', '-qm', 'credential fixture')
  git(p, 'rm', '-q', '.env')
  git(p, 'commit', '-qm', 'remove current file')
  await assert.rejects(
    resolvePolicy({ repoPath: p, cfg: { harnessRoot: f.harness } }),
    /credential-named path in Git history/,
  )
})

test('Git source checking includes credential paths introduced only by a merge', async (t) => {
  const { assertReadableSource } = await import('../src/policy.mjs')
  const f = fixture(t),
    p = f.repo('merge-target')
  git(p, 'checkout', '-qb', 'side')
  writeFileSync(join(p, 'side.txt'), 'side')
  git(p, 'add', '.')
  git(p, 'commit', '-qm', 'side change')
  git(p, 'checkout', '-q', 'main')
  writeFileSync(join(p, 'main.txt'), 'main')
  git(p, 'add', '.')
  git(p, 'commit', '-qm', 'main change')
  git(p, 'merge', '--no-commit', '--no-ff', 'side')
  writeFileSync(join(p, '.env'), 'SYNTHETIC_MERGE_ONLY_CREDENTIAL')
  git(p, 'add', '.env')
  git(p, 'commit', '-qm', 'merge with synthetic credential path')
  await assert.rejects(assertReadableSource(p), /credential-named path in Git history/)
})

test('preflight refuses a config symlink outside the target before reading its bindings', async (t) => {
  const { resolvePolicy } = await import('../src/policy.mjs')
  const f = fixture(t),
    p = f.repo('config-target')
  writeFileSync(
    join(f.root, 'outside-config.md'),
    '## A-Team Config\n- test command: outside-binding\n',
  )
  symlinkSync(join(f.root, 'outside-config.md'), join(p, 'CLAUDE.md'))
  await assert.rejects(
    resolvePolicy({ repoPath: p, cfg: { harnessRoot: f.harness } }),
    /config.*escapes target/i,
  )
})
