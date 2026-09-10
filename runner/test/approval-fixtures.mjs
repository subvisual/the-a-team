import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULTS } from '../src/config.mjs'
import { digest } from '../src/policy.mjs'
export const git = (cwd, args) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
  }).trim()
export function fixtureRepo(root) {
  const repoPath = join(root, 'repo')
  mkdirSync(repoPath)
  git(repoPath, ['init', '--initial-branch=main'])
  git(repoPath, ['config', 'user.name', 'Test'])
  git(repoPath, ['config', 'user.email', 'test@example.com'])
  writeFileSync(join(repoPath, 'value.txt'), 'bad\n')
  git(repoPath, ['add', '.'])
  git(repoPath, ['commit', '-m', 'initial'])
  return repoPath
}
export function config(repoPath, overrides = {}) {
  const policy = {
    schemaVersion: 1,
    harness: { root: repoPath, revision: 'fixture' },
    target: {
      root: repoPath,
      remote: 'github.com/o/r',
      base: 'main',
      baseSha: git(repoPath, ['rev-parse', 'main']),
    },
    readPaths: ['.'],
    writePaths: ['.'],
    outputPaths: [],
    authorization: { id: null, protectedPaths: [] },
    verification: { commands: ['test "$(cat value.txt)" = good'], exemption: null },
    sandbox: { backend: 'test' },
    digest: 'synthetic-policy',
  }
  Object.defineProperty(policy, 'digest', {
    enumerable: true,
    get() {
      return digest(
        Object.fromEntries(
          Object.keys(this)
            .filter((k) => k !== 'digest')
            .map((k) => [k, this[k]]),
        ),
      )
    },
  })
  return { ...DEFAULTS, maxCycles: 1, cleanupOnSuccess: false, policy, ...overrides }
}
export const issue = {
  key: '1',
  number: 1,
  title: 'Fix value',
  body: '## Acceptance criteria\n- [ ] value is good',
  acceptanceCriteria: ['value is good'],
  blockedBy: [],
}
export const impl = {
  ok: true,
  exitCode: 0,
  status: 'done',
  summary: 'fixed',
  blockedReason: '',
  testCommand: 'declared',
  testsRan: true,
  testsPassed: true,
  costUsd: 0,
  sessionId: 'executor-session',
}
export const verdict = {
  ok: true,
  exitCode: 0,
  verdict: 'approve',
  notes: 'checked',
  unmetAc: [],
  testCommand: 'declared',
  testOutput: 'green',
  testsRan: true,
  testsPassed: true,
  costUsd: 0,
  sessionId: 'reviewer-session',
}
export const pass = async () => ({ code: 0, stdout: 'supervisor green', stderr: '' })
export async function commit({ worktree }, value = 'good\n') {
  writeFileSync(join(worktree, 'value.txt'), value)
  git(worktree, ['add', '.'])
  git(worktree, ['commit', '-m', 'fix'])
  return { ...impl }
}
export function adapter(repoPath) {
  const calls = []
  return {
    repo: 'o/r',
    repoPath,
    base: 'main',
    calls,
    async onClaimed() {
      calls.push(['claimed'])
    },
    async onImplemented(i, ctx) {
      calls.push(['implemented', ctx])
      return {}
    },
    async onVerdict(i, ctx, v) {
      calls.push(['verdict', v])
    },
    async onApproved(i, ctx) {
      calls.push(['approved', ctx])
    },
    async onFailed(i, ctx, reason) {
      calls.push(['failed', reason])
    },
  }
}
