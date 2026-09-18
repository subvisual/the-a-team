import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { assertReadableSource, credentialPath, pathAuthorized } from '../src/policy.mjs'

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'ateam-source-template-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const git = (...args) =>
    execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
      cwd: root,
      encoding: 'utf8',
      env: { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
    }).trim()
  git('init', '-q', '-b', 'main')
  git('config', 'user.name', 'Fixture')
  git('config', 'user.email', 'fixture@example.invalid')
  return { root, git }
}

test('source history accepts root and nested example templates, including deleted templates', async (t) => {
  const { root, git } = fixture(t)
  for (const path of ['.env.example', 'backend/.env.example']) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), 'API_KEY=<replace-me>\n')
    git('add', path)
  }
  git('commit', '-qm', 'Add placeholder templates')
  await assert.doesNotReject(assertReadableSource(root))
  git('rm', '-q', '.env.example', 'backend/.env.example')
  git('commit', '-qm', 'Remove current templates')
  await assert.doesNotReject(assertReadableSource(root))
})

test('template history does not authorize agents to modify example templates', () => {
  const policy = { writePaths: ['.'], authorization: { protectedPaths: ['.env.example'] } }
  assert.equal(pathAuthorized(policy, '.env.example'), false)
  assert.equal(pathAuthorized(policy, 'backend/.env.example'), false)
})

test('credential filenames and example lookalikes retain their protected classification', () => {
  // Filename classification only: these paths are never created or read.
  for (const path of [
    '.env',
    'backend/.env.local',
    '.env.example.local',
    '.env.example.bak',
    '.env.EXAMPLE',
    '.npmrc',
    '.netrc',
    'id_rsa',
    'keys/id_ed25519',
  ]) {
    assert.equal(credentialPath(path), true, path)
  }
})

test('example templates do not hide credential-named files deleted from history', async (t) => {
  const { root, git } = fixture(t)
  writeFileSync(join(root, '.env.example'), 'API_KEY=<replace-me>\n')
  writeFileSync(join(root, '.npmrc'), '# synthetic fixture; no credentials\n')
  git('add', '.')
  git('commit', '-qm', 'Add template and credential-named fixture')
  git('rm', '-q', '.npmrc')
  git('commit', '-qm', 'Remove current credential-named fixture')
  await assert.rejects(assertReadableSource(root), /credential-named path.*: \.npmrc;/)
})
