import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULTS } from '../src/config.mjs'
import { digest } from '../src/policy.mjs'
import { publishedVerdictBody } from '../src/core/provenance.mjs'
import { issueContractSource } from '../src/core/adequacy-authority.mjs'

export function publicationFixture() {
  const records = new Map()
  let nextId = 1
  return {
    async postVerdict(repo, prNumber, args) {
      const id = nextId++,
        body = publishedVerdictBody(args)
      records.set(id, {
        id,
        user: { id: 17 },
        body,
        commit_id: args.headSha,
        state: args.event === 'approve' ? 'APPROVED' : 'CHANGES_REQUESTED',
        pull_request_url: `https://api.github.com/repos/${repo}/pulls/${prNumber}`,
      })
      return {
        via: 'review',
        id,
        authorId: 17,
        bodyDigest: digest(body),
        headSha: args.headSha,
        event: args.event,
        evidenceDigest: args.evidenceDigest,
      }
    },
    async readPublication(repo, prNumber, publication) {
      return records.get(publication.id)
    },
  }
}
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
export const adequacyFor = (
  criteria,
  issueContract = { ...issue, acceptanceCriteria: criteria },
  authority = null,
) => {
  const fallback = issueContractSource(issueContract)
  const source = authority?.sources?.[0] || {
    id: fallback.id,
    revision: fallback.revision,
    requirementVersions: [fallback.requirementVersion],
  }
  return criteria.map((criterion) => ({
    criterion,
    expectedValues: {
      status: 'independent',
      evidence: 'The fixture asserts a literal accepted value independent of the implementation.',
    },
    publicBehavior: {
      status: 'exercised',
      evidence: 'The fixture exercises the public behavior associated with this criterion.',
    },
    substitutedBoundaries: {
      status: 'none',
      evidence: 'No system boundary is substituted by this fixture.',
    },
    requirementSource: { id: source.id, revision: source.revision },
    baselineExpectations: {
      status: 'preserved',
      requirementVersion: source.requirementVersions[0],
      authorization: '',
    },
    judgment: 'adequate',
    why: 'The check fails when the accepted behavior changes.',
  }))
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
  testAdequacy: adequacyFor(issue.acceptanceCriteria),
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
