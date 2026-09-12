import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  fixtureRepo,
  config,
  commit,
  verdict,
  adequacyFor,
  pass,
  git,
  adapter as spy,
} from './approval-fixtures.mjs'
import { createLocalAdapter } from '../src/adapters/local.mjs'
import { runIssue } from '../src/core/loop.mjs'
import { appendEvent } from '../src/core/history.mjs'
let root, repoPath, issuesFile, cfg
const approvedReview = async ({ issue, adequacyAuthority }) => ({
  ...verdict,
  testAdequacy: adequacyFor(issue.acceptanceCriteria, issue, adequacyAuthority),
})
const source = `## A\n**ID:** ISS-A\n**Depends on:** none\n### Acceptance criteria\n- [ ] value is good\n\n## A extended\n**ID:** ISS-B\n**Depends on:** ISS-A\n### Acceptance criteria\n- [ ] uses A\n`
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ateam-recovery-'))
  process.env.ATEAM_RUNNER_HOME = join(root, 'home')
  repoPath = fixtureRepo(root)
  issuesFile = join(root, 'issues.md')
  writeFileSync(issuesFile, source)
  cfg = config(repoPath)
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  delete process.env.ATEAM_RUNNER_HOME
})
const local = () => createLocalAdapter({ repoPath, issuesFile, base: 'main', cfg })
async function approved() {
  const i = local().issues[0],
    adapter = { ...spy(repoPath), repo: repoPath }
  const result = await runIssue({
    adapter,
    issue: i,
    cfg,
    deps: { execute: commit, review: approvedReview, runVerification: pass },
  })
  assert.equal(result.outcome, 'approved')
  return result
}
test('failed and unrelated title marker commits remain pending and do not unblock dependents', async () => {
  git(repoPath, ['checkout', '-b', 'unrelated'])
  git(repoPath, [
    'commit',
    '--allow-empty',
    '-m',
    'Implements issue: A extended\n\nImplements issue: A',
  ])
  git(repoPath, ['checkout', 'main'])
  const adapter = local()
  assert.deepEqual(
    (await adapter.listCandidates()).map((i) => i.key),
    ['ISS-A', 'ISS-B'],
  )
  assert.deepEqual(await adapter.openBlockers(adapter.issues[1]), ['ISS-A'])
})
test('restart selects the approved ancestry chain while delivery integration remains separate', async () => {
  const result = await approved(),
    adapter = local()
  assert.deepEqual(
    (await adapter.listCandidates()).map((i) => i.key),
    ['ISS-B'],
  )
  assert.equal(adapter.base, result.ctx.head)
  assert.deepEqual(await adapter.openBlockers(adapter.issues[1]), [])
  assert.equal(adapter.state.issues['ISS-A'].status, 'approved-available')
  assert.equal(adapter.state.issues['ISS-A'].integrated, false)
  assert.equal(git(repoPath, ['rev-parse', 'main']), cfg.policy.target.baseSha)
  assert.equal(
    await adapter.dependencyHeads(adapter.issues[1]).then((x) => x['ISS-A']),
    result.ctx.head,
  )
})
test('a rename and changed acceptance criteria retain identity without reusing approval', async () => {
  await approved()
  writeFileSync(issuesFile, source.replace('## A\n', '## Renamed\n'))
  let adapter = local()
  await adapter.listCandidates()
  assert.equal(adapter.state.issues['ISS-A'].status, 'renamed')
  assert.deepEqual(await adapter.openBlockers(adapter.issues[1]), ['ISS-A'])
  writeFileSync(issuesFile, source.replace('value is good', 'value is different'))
  adapter = local()
  await adapter.listCandidates()
  assert.equal(adapter.state.issues['ISS-A'].status, 'criteria-changed')
})
test('missing approved Git objects cannot satisfy blockers', async () => {
  const result = await approved()
  git(repoPath, ['update-ref', '-d', `refs/heads/${result.ctx.branch}`])
  git(repoPath, ['reflog', 'expire', '--expire=now', '--all'])
  git(repoPath, ['gc', '--prune=now'])
  const adapter = local()
  await adapter.listCandidates()
  assert.equal(adapter.state.issues['ISS-A'].status, 'missing-commit')
  assert.deepEqual(await adapter.openBlockers(adapter.issues[1]), ['ISS-A'])
})
test('attempt exhaustion and uncertain actions remain explicit in materialized state', async () => {
  let adapter = local(),
    i = adapter.issues[0]
  appendEvent(repoPath, i, {
    type: 'attempt.started',
    attemptId: 'a',
    baseSha: cfg.policy.target.baseSha,
  })
  appendEvent(repoPath, i, {
    type: 'attempt.finished',
    attemptId: 'a',
    outcome: 'failed',
    failureCategory: 'cycle-exhausted',
  })
  await adapter.listCandidates()
  assert.equal(adapter.state.issues['ISS-A'].status, 'cycle-exhausted')
  appendEvent(repoPath, i, {
    type: 'action.intent',
    attemptId: 'a',
    actionId: 'publish',
    kind: 'publish',
  })
  adapter = local()
  await adapter.listCandidates()
  assert.equal(adapter.state.issues['ISS-A'].status, 'action-uncertain')
})

test('restart accounts for an approval interrupted before local delivery without rerunning agents', async () => {
  const adapter = local()
  let executions = 0,
    reviews = 0
  const result = await runIssue({
    adapter,
    issue: adapter.issues[0],
    cfg,
    deps: {
      execute: async (args) => {
        executions++
        return commit(args)
      },
      review: async ({ issue, adequacyAuthority }) => {
        reviews++
        return {
          ...verdict,
          testAdequacy: adequacyFor(issue.acceptanceCriteria, issue, adequacyAuthority),
        }
      },
      runVerification: pass,
      checkpoint: async (name) => {
        if (name === 'after-review') throw Object.assign(Error('stop'), { code: 'interrupted' })
      },
    },
  })
  assert.equal(result.outcome, 'failed')
  const resumed = local()
  assert.deepEqual(
    (await resumed.listCandidates()).map((i) => i.key),
    ['ISS-B'],
  )
  assert.equal(resumed.state.issues['ISS-A'].delivered, true)
  assert.equal(
    resumed.report.filter((r) => r.issue === 'ISS-A' && r.outcome === 'approved').length,
    1,
  )
  await resumed.listCandidates()
  assert.equal(
    resumed.report.filter((r) => r.issue === 'ISS-A' && r.outcome === 'approved').length,
    1,
  )
  assert.equal(executions, 1)
  assert.equal(reviews, 1)
})
test('known local report action interruption is reconciled from local evidence', async () => {
  const adapter = local()
  const first = await runIssue({
    adapter,
    issue: adapter.issues[0],
    cfg,
    deps: {
      execute: commit,
      review: approvedReview,
      runVerification: pass,
      checkpoint: async (name) => {
        if (name === 'before-onApproved')
          throw Object.assign(Error('stop'), { code: 'interrupted' })
      },
    },
  })
  assert.equal(first.failureCategory, 'action-uncertain')
  const resumed = local()
  await resumed.listCandidates()
  assert.equal(resumed.state.issues['ISS-A'].status, 'approved-available')
  assert.equal(resumed.state.issues['ISS-A'].history.unresolvedActions.length, 0)
})
test('current approvals on diverging branches remain available but cannot satisfy selected-base dependencies', async () => {
  const result = await approved()
  // Move the delivery base down a divergent, unapproved branch. This must not
  // splice either history together or silently treat branch availability as integration.
  git(repoPath, ['checkout', 'main'])
  writeFileSync(join(repoPath, 'other.txt'), 'human work\n')
  git(repoPath, ['add', '.'])
  git(repoPath, ['commit', '-m', 'unrelated delivery work'])
  cfg = config(repoPath)
  const adapter = local()
  await adapter.listCandidates()
  assert.equal(adapter.state.issues['ISS-A'].approved, true)
  assert.equal(adapter.state.issues['ISS-A'].selected, false)
  assert.equal(adapter.base, git(repoPath, ['rev-parse', 'main']))
  assert.deepEqual(await adapter.openBlockers(adapter.issues[1]), ['ISS-A'])
})

test('each dependent receives the saved prerequisite revision and the whole approved chain resumes once', async () => {
  const first = await approved()
  const adapter = local()
  await adapter.listCandidates()
  const nextCfg = config(repoPath)
  nextCfg.policy.target.base = first.ctx.head
  nextCfg.policy.target.baseSha = first.ctx.head
  const second = await runIssue({
    adapter,
    issue: adapter.issues[1],
    cfg: nextCfg,
    deps: {
      execute: async ({ worktree }) => {
        assert.equal(
          git(worktree, ['rev-list', '--count', `${cfg.policy.target.baseSha}..HEAD`]),
          '1',
        )
        writeFileSync(join(worktree, 'dependent.txt'), 'uses approved A\n')
        git(worktree, ['add', '.'])
        git(worktree, ['commit', '-m', 'dependent'])
        return { ...(await import('./approval-fixtures.mjs')).impl }
      },
      review: approvedReview,
      runVerification: pass,
    },
  })
  assert.equal(second.outcome, 'approved', second.reason)
  const resumed = local()
  assert.deepEqual(await resumed.listCandidates(), [])
  assert.equal(resumed.base, second.ctx.head)
  assert.equal(
    git(repoPath, ['rev-list', '--count', `${cfg.policy.target.baseSha}..${resumed.base}`]),
    '2',
  )
  await resumed.listCandidates()
  assert.equal(
    git(repoPath, ['rev-list', '--count', `${cfg.policy.target.baseSha}..${resumed.base}`]),
    '2',
  )
})
test('an approved dependent becomes invalid when its prerequisite criteria change', async () => {
  const first = await approved()
  const adapter = local()
  await adapter.listCandidates()
  const nextCfg = config(repoPath)
  nextCfg.policy.target.base = first.ctx.head
  nextCfg.policy.target.baseSha = first.ctx.head
  const second = await runIssue({
    adapter,
    issue: adapter.issues[1],
    cfg: nextCfg,
    deps: {
      execute: async ({ worktree }) => {
        writeFileSync(join(worktree, 'dependent.txt'), 'dependent\n')
        git(worktree, ['add', '.'])
        git(worktree, ['commit', '-m', 'B'])
        return { ...(await import('./approval-fixtures.mjs')).impl }
      },
      review: approvedReview,
      runVerification: pass,
    },
  })
  assert.equal(second.outcome, 'approved', second.reason)
  writeFileSync(issuesFile, source.replace('value is good', 'value is better'))
  const resumed = local()
  await resumed.listCandidates()
  assert.equal(resumed.state.issues['ISS-A'].status, 'criteria-changed')
  assert.equal(resumed.state.issues['ISS-B'].status, 'dependency-approval-invalid')
  assert.deepEqual(await resumed.openBlockers(resumed.issues[1]), ['ISS-A'])
})

test('reordering independent issue sections preserves the recorded approved continuation chain', async () => {
  const independent = source
    .replace('**Depends on:** ISS-A', '**Depends on:** none')
    .replace('**ID:** ISS-A', '**ID:** ISS-Z')
  // The prerequisite's key sorts after its successor, so reconstruction must
  // reach a fixed point rather than merely sorting the authored sections.
  writeFileSync(issuesFile, independent)
  const first = await approved()
  const adapter = local()
  await adapter.listCandidates()
  const nextCfg = config(repoPath)
  nextCfg.policy.target.base = first.ctx.head
  nextCfg.policy.target.baseSha = first.ctx.head
  const second = await runIssue({
    adapter,
    issue: adapter.issues.find((i) => i.key === 'ISS-B'),
    cfg: nextCfg,
    deps: {
      execute: async ({ worktree }) => {
        writeFileSync(join(worktree, 'independent-b.txt'), 'independent B after A\n')
        git(worktree, ['add', '.'])
        git(worktree, ['commit', '-m', 'independent B'])
        return { ...(await import('./approval-fixtures.mjs')).impl }
      },
      review: approvedReview,
      runVerification: pass,
    },
  })
  assert.equal(second.outcome, 'approved', second.reason)
  const before = local()
  assert.deepEqual(await before.listCandidates(), [])
  assert.equal(before.base, second.ctx.head)
  const [a, b] = independent.split('\n\n## A extended\n')
  writeFileSync(issuesFile, `## A extended\n${b}\n\n${a}\n`)
  const after = local()
  assert.deepEqual(
    after.issues.map((i) => i.key),
    ['ISS-B', 'ISS-Z'],
  )
  assert.deepEqual(await after.listCandidates(), [])
  assert.equal(after.base, second.ctx.head)
  assert.equal(after.state.issues['ISS-B'].baseSha, first.ctx.head)
  assert.equal(after.state.issues['ISS-Z'].selected, true)
  assert.equal(after.state.issues['ISS-B'].selected, true)
})
