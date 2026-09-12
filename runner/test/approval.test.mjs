import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  existsSync,
  chmodSync,
  symlinkSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runIssue } from '../src/core/loop.mjs'
import { reviewPullRequest } from '../src/review-pr.mjs'
import {
  fixtureRepo,
  config,
  issue,
  impl,
  verdict,
  pass,
  commit,
  adapter,
  git,
} from './approval-fixtures.mjs'
let root, repoPath, cfg
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ateam-approval-'))
  process.env.ATEAM_RUNNER_HOME = join(root, 'home')
  repoPath = fixtureRepo(root)
  cfg = config(repoPath)
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  delete process.env.ATEAM_RUNNER_HOME
})

test('review revisions retain reviewer session scratch while each source checkout is fresh', async () => {
  const a = adapter(repoPath),
    reviewSources = []
  let cycle = 0,
    firstScratch
  const result = await runIssue({
    adapter: a,
    issue,
    cfg: { ...cfg, maxCycles: 2 },
    deps: {
      execute: async (args) => {
        writeFileSync(join(args.worktree, 'revision.txt'), String(++cycle))
        return commit(args)
      },
      review: async (args) => {
        reviewSources.push(args.worktree)
        if (!firstScratch) {
          firstScratch = args.scratchDir
          writeFileSync(join(args.scratchDir, 'session-state'), 'reviewer-only')
          return {
            ...verdict,
            verdict: 'request-changes',
            unmetAc: [{ criterion: 'value is good', why: 'revise once' }],
          }
        }
        assert.equal(args.resumeSessionId, verdict.sessionId)
        assert.equal(readFileSync(join(args.scratchDir, 'session-state'), 'utf8'), 'reviewer-only')
        return verdict
      },
      runVerification: pass,
    },
  })
  assert.equal(result.outcome, 'approved', result.reason)
  assert.equal(result.cycles, 2)
  assert.notEqual(reviewSources[0], reviewSources[1])
})

for (const [name, patch, reason] of [
  ['failed process', { ok: false }, /process/],
  ['nonzero exit', { exitCode: 7 }, /7/],
  ['missing tests', { testsPassed: undefined }, /testsPassed/],
  ['string boolean', { testsRan: 'false' }, /testsRan/],
  ['unknown disposition', { approved: true }, /approved/],
  ['unmet criteria', { unmetAc: [{ criterion: 'value is good', why: 'bad' }] }, /unmet/],
  ['skipped tests', { testsRan: false, testsPassed: false, testCommand: '' }, /verification|tests/],
  ['failed tests', { testsPassed: false }, /tests/],
])
  test(`loop refuses reviewer ${name} before approval publication`, async () => {
    const a = adapter(repoPath)
    const result = await runIssue({
      adapter: a,
      issue,
      cfg,
      deps: {
        execute: commit,
        review: async () => ({ ...verdict, ...patch }),
        runVerification: pass,
      },
    })
    assert.equal(result.outcome, 'failed')
    assert.match(result.reason, reason)
    assert.equal(
      a.calls.some(
        (c) => c[0] === 'approved' || (c[0] === 'verdict' && c[1].verdict === 'approve'),
      ),
      false,
    )
  })
for (const [name, patch, reason] of [
  ['failed process', { ok: false }, /process/],
  ['failed exit', { exitCode: 3 }, /3/],
  ['missing status', { status: undefined }, /status/],
  ['string tests', { testsPassed: 'true' }, /testsPassed/],
  ['done and blocked', { blockedReason: 'cannot proceed' }, /blocked/],
  ['unknown status field', { approved: true }, /approved/],
])
  test(`loop refuses executor ${name} before implementation publication`, async () => {
    const a = adapter(repoPath)
    const result = await runIssue({
      adapter: a,
      issue,
      cfg,
      deps: {
        execute: async (args) => ({ ...(await commit(args)), ...patch }),
        review: async () => verdict,
        runVerification: pass,
      },
    })
    assert.equal(result.outcome, 'failed')
    assert.match(result.reason, reason)
    assert.equal(
      a.calls.some((c) => ['approved', 'implemented'].includes(c[0])),
      false,
    )
  })
test('review sees committed bad data even when executor leaves a dirty correction', async () => {
  const a = adapter(repoPath)
  let reviewed
  const result = await runIssue({
    adapter: a,
    issue,
    cfg,
    deps: {
      execute: async (args) => {
        await commit(args, 'still bad\n')
        writeFileSync(join(args.worktree, 'value.txt'), 'good\n')
        writeFileSync(join(args.worktree, 'untracked.txt'), 'hidden')
        return impl
      },
      review: async ({ worktree, head }) => {
        reviewed = {
          value: readFileSync(join(worktree, 'value.txt'), 'utf8'),
          untracked: existsSync(join(worktree, 'untracked.txt')),
          head: git(worktree, ['rev-parse', 'HEAD']),
          detached: git(worktree, ['rev-parse', '--abbrev-ref', 'HEAD']),
        }
        return {
          ...verdict,
          verdict: 'request-changes',
          unmetAc: [{ criterion: 'value is good', why: 'committed bad data' }],
        }
      },
      runVerification: pass,
    },
  })
  assert.equal(result.outcome, 'failed')
  assert.deepEqual(reviewed, {
    value: 'still bad\n',
    untracked: false,
    head: result.ctx.head,
    detached: 'HEAD',
  })
  assert.equal(
    a.calls.some((c) => c[0] === 'approved'),
    false,
  )
})
test('supervisor failure refuses reviewer green and retains real output', async () => {
  const a = adapter(repoPath)
  const result = await runIssue({
    adapter: a,
    issue,
    cfg,
    deps: {
      execute: commit,
      review: async () => verdict,
      runVerification: async () => ({ code: 17, stdout: 'actual failure', stderr: 'bad' }),
    },
  })
  assert.equal(result.outcome, 'failed')
  assert.match(result.reason, /17/)
  assert.equal(
    a.calls.some((c) => c[0] === 'approved'),
    false,
  )
  assert.match(readFileSync(result.ctx.verificationPath, 'utf8'), /actual failure/)
})
for (const mutation of ['tracked', 'untracked', 'head'])
  test(`supervisor ${mutation} mutation invalidates approval`, async () => {
    const a = adapter(repoPath)
    const result = await runIssue({
      adapter: a,
      issue,
      cfg,
      deps: {
        execute: commit,
        review: async () => verdict,
        runVerification: async ({ worktree }) => {
          if (mutation === 'head')
            git(worktree, ['checkout', '--detach', cfg.policy.target.baseSha])
          else
            writeFileSync(
              join(worktree, mutation === 'tracked' ? 'value.txt' : 'new.txt'),
              'changed',
            )
          return { code: 0, stdout: 'green', stderr: '' }
        },
      },
    })
    assert.equal(result.outcome, 'failed')
    assert.match(result.reason, /source|revision|HEAD/)
    assert.equal(
      a.calls.some((c) => c[0] === 'approved'),
      false,
    )
  })
test('clean revision records one exact approval and uses declared checks instead of executor replacement', async () => {
  const a = adapter(repoPath)
  let command
  const result = await runIssue({
    adapter: a,
    issue,
    cfg,
    deps: {
      execute: async (args) => ({ ...(await commit(args)), testCommand: 'true' }),
      review: async () => verdict,
      runVerification: async (args) => {
        command = args.command
        return pass()
      },
    },
  })
  assert.equal(result.outcome, 'approved')
  assert.equal(a.calls.filter((c) => c[0] === 'approved').length, 1)
  assert.equal(command, cfg.policy.verification.commands[0])
  const record = JSON.parse(readFileSync(result.ctx.approvalPath, 'utf8'))
  assert.equal(record.schemaVersion, 1)
  assert.equal(record.headSha, result.ctx.head)
  assert.equal(record.baseSha, cfg.policy.target.baseSha)
  assert.equal(record.policyDigest, cfg.policy.digest)
  assert.equal(record.verification.commands[0].exitCode, 0)
  assert.ok(record.criteriaDigest)
  assert.ok(record.verification.commands[0].environmentId)
  assert.ok(record.verification.commands[0].outputRef)
})
test('missing declared checks are not an exemption', async () => {
  cfg.policy.verification.commands = []
  const a = adapter(repoPath)
  const result = await runIssue({
    adapter: a,
    issue,
    cfg,
    deps: { execute: commit, review: async () => verdict, runVerification: pass },
  })
  assert.equal(result.outcome, 'failed')
  assert.match(result.reason, /declared|exemption/)
})
test('missing policy refuses before claim or side effects', async () => {
  const a = adapter(repoPath)
  delete cfg.policy
  const result = await runIssue({
    adapter: a,
    issue,
    cfg,
    deps: { execute: commit, review: async () => verdict, runVerification: pass },
  })
  assert.equal(result.outcome, 'failed')
  assert.match(result.reason, /policy/)
  assert.deepEqual(a.calls, [])
})

for (const [name, patch, reason] of [
  ['failed process', { ok: false }, /process/],
  ['missing verdict', { verdict: undefined }, /verdict/],
  ['bad boolean', { testsPassed: 'true' }, /testsPassed/],
  ['unmet', { unmetAc: [{ criterion: 'value is good', why: 'bad' }] }, /unmet/],
  ['skipped', { testsRan: false, testsPassed: false, testCommand: '' }, /tests|verification/],
])
  test(`direct PR refuses ${name} without remote mutations`, async () => {
    git(repoPath, ['checkout', '-b', 'proposed'])
    await commit({ worktree: repoPath })
    const calls = []
    const result = await reviewPullRequest({
      repo: 'o/r',
      repoPath,
      pr: {
        number: 9,
        headRefOid: git(repoPath, ['rev-parse', 'HEAD']),
        baseRefName: 'main',
        headRefName: 'agent/issue-1',
        closingIssuesReferences: [{ number: 1 }],
        comments: [],
        reviews: [],
      },
      cfg,
      labels: {},
      deps: {
        gh: {
          viewIssue: async () => ({ ...issue, number: 1 }),
          postVerdict: async (...args) => calls.push(args),
          setPhaseLabel: async (...args) => calls.push(args),
          removeLabels: async (...args) => calls.push(args),
        },
        review: async () => ({ ...verdict, ...patch }),
        runVerification: pass,
      },
    })
    assert.equal(result.verdict, 'blocked')
    assert.match(result.reason, reason)
    assert.deepEqual(calls, [])
  })

test('private executor has no supervisor remote, shared objects, or hooks', async () => {
  const a = adapter(repoPath)
  let observed
  const result = await runIssue({
    adapter: a,
    issue,
    cfg,
    deps: {
      execute: async (args) => {
        observed = {
          remote: git(args.worktree, ['remote']),
          store: readFileSync(join(args.worktree, '.git', 'config'), 'utf8'),
          alternates: existsSync(join(args.worktree, '.git', 'objects', 'info', 'alternates')),
          hooks: existsSync(join(args.worktree, '.git', 'hooks')),
        }
        return commit(args)
      },
      review: async () => verdict,
      runVerification: pass,
    },
  })
  assert.equal(result.outcome, 'approved')
  assert.equal(observed.remote, '')
  assert.equal(observed.alternates, false)
  assert.equal(observed.hooks, false)
  assert.doesNotMatch(observed.store, /url =|include/)
})
for (const mutate of ['head', 'base', 'criteria'])
  test(`delivery refuses changed ${mutate}`, async () => {
    const a = adapter(repoPath)
    const currentIssue = structuredClone(issue)
    const result = await runIssue({
      adapter: a,
      issue: currentIssue,
      cfg,
      deps: {
        execute: commit,
        review: async () => verdict,
        runVerification: async () => {
          if (mutate === 'head')
            git(repoPath, ['update-ref', 'refs/heads/agent/issue-1', cfg.policy.target.baseSha])
          if (mutate === 'base')
            git(repoPath, [
              'update-ref',
              'refs/heads/main',
              git(repoPath, ['rev-parse', 'agent/issue-1']),
            ])
          if (mutate === 'criteria') currentIssue.acceptanceCriteria.push('new criterion')
          return pass()
        },
      },
    })
    assert.equal(result.outcome, 'failed')
    assert.match(result.reason, new RegExp(mutate === 'criteria' ? 'criteria' : mutate))
    assert.equal(
      a.calls.some(
        (c) => c[0] === 'approved' || (c[0] === 'verdict' && c[1].verdict === 'approve'),
      ),
      false,
    )
  })
for (const exempt of [false, true])
  test(`documentation-only missing tests ${exempt ? 'can use explicit exemption' : 'cannot use implicit exemption'}`, async () => {
    cfg.policy.verification.commands = []
    cfg.policy.authorization.id = exempt ? 'authorized-docs' : null
    cfg.policy.verification.exemption = exempt
      ? { reason: 'Only prose documentation changes' }
      : null
    const a = adapter(repoPath)
    const result = await runIssue({
      adapter: a,
      issue,
      cfg,
      deps: {
        execute: async ({ worktree }) => {
          writeFileSync(join(worktree, 'README.md'), 'documentation\n')
          git(worktree, ['add', '.'])
          git(worktree, ['commit', '-m', 'docs'])
          return { ...impl, testsRan: false, testsPassed: false, testCommand: '' }
        },
        review: async () => ({ ...verdict, testsRan: false, testsPassed: false, testCommand: '' }),
        runVerification: pass,
      },
    })
    assert.equal(result.outcome, exempt ? 'approved' : 'failed')
  })
test('documentation exemption never excuses unmet criteria', async () => {
  cfg.policy.verification.commands = []
  cfg.policy.authorization.id = 'docs'
  cfg.policy.verification.exemption = { reason: 'docs only' }
  const a = adapter(repoPath)
  const result = await runIssue({
    adapter: a,
    issue,
    cfg,
    deps: {
      execute: async ({ worktree }) => {
        writeFileSync(join(worktree, 'README.md'), 'doc')
        git(worktree, ['add', '.'])
        git(worktree, ['commit', '-m', 'docs'])
        return { ...impl, testsRan: false, testsPassed: false, testCommand: '' }
      },
      review: async () => ({
        ...verdict,
        unmetAc: [{ criterion: 'value is good', why: 'not met' }],
        testsRan: false,
        testsPassed: false,
        testCommand: '',
      }),
      runVerification: pass,
    },
  })
  assert.equal(result.outcome, 'failed')
  assert.match(result.reason, /unmet/)
})

test('direct PR successful checks record exactly one approval; old markers are insufficient', async () => {
  git(repoPath, ['checkout', '-b', 'proposed'])
  await commit({ worktree: repoPath })
  const calls = []
  const pr = {
    number: 9,
    headRefOid: git(repoPath, ['rev-parse', 'HEAD']),
    baseRefName: 'main',
    baseRefOid: cfg.policy.target.baseSha,
    headRefName: 'agent/issue-1',
    closingIssuesReferences: [{ number: 1 }],
    comments: [
      { body: `<!-- ateam-runner:verdict sha=${git(repoPath, ['rev-parse', 'HEAD'])} cycle=1 -->` },
    ],
    reviews: [],
  }
  const deps = {
    gh: {
      viewPR: async () => pr,
      viewIssue: async () => ({ ...issue, number: 1 }),
      postVerdict: async (r, n, v) => {
        calls.push(v.event)
        return 'review'
      },
      setPhaseLabel: async () => {},
      removeLabels: async () => {},
    },
    review: async () => verdict,
    runVerification: pass,
  }
  const result = await reviewPullRequest({ repo: 'o/r', repoPath, pr, cfg, labels: {}, deps })
  assert.equal(result.verdict, 'approve')
  assert.deepEqual(calls, ['approve'])
  assert.equal(JSON.parse(readFileSync(result.approvalPath, 'utf8')).headSha, pr.headRefOid)
  const again = await reviewPullRequest({ repo: 'o/r', repoPath, pr, cfg, labels: {}, deps })
  assert.equal(again.skipped, true)
  assert.deepEqual(calls, ['approve'])
})

for (const change of ['head', 'base', 'criteria', 'evidence'])
  test(`stored approval becomes invalid when ${change} changes`, async () => {
    const { validateApprovalRecord } = await import('../src/core/approval.mjs')
    const a = adapter(repoPath)
    const result = await runIssue({
      adapter: a,
      issue,
      cfg,
      deps: { execute: commit, review: async () => verdict, runVerification: pass },
    })
    assert.equal(result.outcome, 'approved')
    const record = JSON.parse(readFileSync(result.ctx.approvalPath, 'utf8'))
    const context = {
      repo: 'o/r',
      issue: structuredClone(issue),
      head: result.ctx.head,
      baseSha: cfg.policy.target.baseSha,
      policy: cfg.policy,
    }
    assert.equal(validateApprovalRecord(record, context).valid, true)
    if (change === 'head') context.head = 'f'.repeat(40)
    if (change === 'base') context.baseSha = 'e'.repeat(40)
    if (change === 'criteria') context.issue.acceptanceCriteria.push('another criterion')
    if (change === 'evidence') {
      rmSync(record.verification.commands[0].outputRef)
      writeFileSync(record.verification.commands[0].outputRef, 'tampered')
    }
    assert.equal(validateApprovalRecord(record, context).valid, false)
  })

for (const change of ['none', 'head', 'base', 'criteria', 'absent', 'receipt'])
  test(`status ${change === 'none' ? 'accepts current evidence' : `invalidates ${change}`}`, async () => {
    const { repoStatus } = await import('../src/status.mjs')
    const a = adapter(repoPath)
    a.onImplemented = async () => ({ prNumber: 9 })
    a.onVerdict = async () => 'review'
    const result = await runIssue({
      adapter: a,
      issue,
      cfg,
      deps: { execute: commit, review: async () => verdict, runVerification: pass },
    })
    assert.equal(result.outcome, 'approved')
    const raw = { ...issue, labels: [{ name: 'approved' }] }
    const pr = {
      number: 9,
      headRefName: 'agent/issue-1',
      headRefOid: result.ctx.head,
      baseRefName: 'main',
      baseRefOid: cfg.policy.target.baseSha,
      closingIssuesReferences: [{ number: 1 }],
      comments: [],
      reviews: [],
      url: 'https://example.test/pr/9',
    }
    if (change === 'head') pr.headRefOid = 'f'.repeat(40)
    if (change === 'base') pr.baseRefOid = 'e'.repeat(40)
    if (change === 'criteria') raw.body += '\n- [ ] new criterion'
    if (change === 'absent') rmSync(result.ctx.approvalPath)
    if (change === 'receipt') rmSync(result.ctx.deliveryPath)
    const status = await repoStatus(
      'o/r',
      cfg,
      { approved: 'approved' },
      {
        gh: {
          listIssues: async () => [raw],
          listPRs: async () => [pr],
          viewPR: async () => pr,
          viewIssue: async () => raw,
        },
      },
    )
    assert.equal(status.prs[0].reviewed, change === 'none')
    assert.equal(status.issues[0].phase, change === 'none' ? 'approved' : 'approval-invalid')
  })

for (const failure of [
  'check exit',
  'source mutation',
  'remote head',
  'remote base',
  'remote criteria',
])
  test(`direct PR refuses ${failure} before approval publication`, async () => {
    git(repoPath, ['checkout', '-b', 'proposed'])
    await commit({ worktree: repoPath })
    const calls = []
    let reads = 0
    const pr = {
      number: 9,
      headRefOid: git(repoPath, ['rev-parse', 'HEAD']),
      baseRefName: 'main',
      baseRefOid: cfg.policy.target.baseSha,
      headRefName: 'agent/issue-1',
      closingIssuesReferences: [{ number: 1 }],
      comments: [],
      reviews: [],
    }
    const deps = {
      gh: {
        viewPR: async () => ({
          ...pr,
          ...(failure === 'remote head' ? { headRefOid: 'f'.repeat(40) } : {}),
          ...(failure === 'remote base' ? { baseRefOid: 'e'.repeat(40) } : {}),
        }),
        viewIssue: async () => ({
          ...issue,
          body:
            ++reads > 1 && failure === 'remote criteria'
              ? issue.body + '\n- [ ] changed'
              : issue.body,
        }),
        postVerdict: async () => calls.push('verdict'),
        setPhaseLabel: async () => calls.push('label'),
        removeLabels: async () => calls.push('remove'),
      },
      review: async () => verdict,
      runVerification: async ({ worktree }) => {
        if (failure === 'source mutation') writeFileSync(join(worktree, 'value.txt'), 'changed')
        return {
          code: failure === 'check exit' ? 19 : 0,
          stdout: 'real verification output',
          stderr: '',
        }
      },
    }
    const result = await reviewPullRequest({ repo: 'o/r', repoPath, pr, cfg, labels: {}, deps })
    assert.equal(result.verdict, 'blocked')
    assert.deepEqual(calls, [])
    assert.match(
      result.reason,
      failure === 'check exit'
        ? /19/
        : failure === 'source mutation'
          ? /source/
          : failure === 'remote criteria'
            ? /criteria/
            : /head or base/,
    )
  })
for (const disposition of ['request-changes', 'blocked'])
  test(`direct PR preserves valid reviewer ${disposition} feedback`, async () => {
    git(repoPath, ['checkout', '-b', 'proposed'])
    await commit({ worktree: repoPath })
    const calls = []
    const pr = {
      number: 9,
      headRefOid: git(repoPath, ['rev-parse', 'HEAD']),
      baseRefName: 'main',
      baseRefOid: cfg.policy.target.baseSha,
      headRefName: 'agent/issue-1',
      closingIssuesReferences: [{ number: 1 }],
      comments: [],
      reviews: [],
    }
    const deps = {
      gh: {
        viewPR: async () => pr,
        viewIssue: async () => issue,
        postVerdict: async (r, n, v) => {
          calls.push(v)
          return 'review'
        },
        setPhaseLabel: async () => {},
        removeLabels: async () => {},
      },
      review: async () => ({
        ...verdict,
        verdict: disposition,
        notes: 'specific review finding',
        unmetAc:
          disposition === 'request-changes' ? [{ criterion: 'value is good', why: 'bad' }] : [],
      }),
      runVerification: pass,
    }
    const result = await reviewPullRequest({ repo: 'o/r', repoPath, pr, cfg, labels: {}, deps })
    assert.equal(result.verdict, disposition)
    assert.equal(calls[0].event, 'request-changes')
    assert.match(calls[0].body, /specific review finding/)
  })

for (const change of ['head', 'base', 'criteria'])
  test(`loop refreshes adapter ${change} before publishing approval`, async () => {
    const a = adapter(repoPath)
    a.currentApprovalInputs = async (i, ctx) => ({
      issue: change === 'criteria' ? { ...i, acceptanceCriteria: ['changed'] } : i,
      head: change === 'head' ? 'f'.repeat(40) : ctx.head,
      baseSha: change === 'base' ? 'e'.repeat(40) : ctx.baseSha,
    })
    const result = await runIssue({
      adapter: a,
      issue,
      cfg,
      deps: { execute: commit, review: async () => verdict, runVerification: pass },
    })
    assert.equal(result.outcome, 'failed')
    assert.match(result.reason, new RegExp(change))
    assert.equal(
      a.calls.some(
        (c) => c[0] === 'approved' || (c[0] === 'verdict' && c[1].verdict === 'approve'),
      ),
      false,
    )
  })

test('executor cannot replace the declared base with an unrelated history', async () => {
  const a = adapter(repoPath)
  const result = await runIssue({
    adapter: a,
    issue,
    cfg,
    deps: {
      execute: async (args) => {
        git(args.worktree, ['checkout', '--orphan', 'unrelated'])
        return commit(args)
      },
      review: async () => verdict,
      runVerification: pass,
    },
  })
  assert.equal(result.outcome, 'failed')
  assert.match(result.reason, /base|ancestor/)
  assert.equal(
    a.calls.some((c) => c[0] === 'implemented' || c[0] === 'approved'),
    false,
  )
})

for (const actor of ['executor', 'reviewer'])
  test(`documentation exemption cannot waive ${actor} reported test failure`, async () => {
    cfg.policy.verification.commands = []
    cfg.policy.authorization.id = 'docs'
    cfg.policy.verification.exemption = { reason: 'documentation only' }
    const a = adapter(repoPath)
    const result = await runIssue({
      adapter: a,
      issue,
      cfg,
      deps: {
        execute: async ({ worktree }) => {
          writeFileSync(join(worktree, 'README.md'), 'docs')
          git(worktree, ['add', '.'])
          git(worktree, ['commit', '-m', 'docs'])
          return {
            ...impl,
            testsRan: actor === 'executor',
            testsPassed: false,
            testCommand: actor === 'executor' ? 'false' : '',
          }
        },
        review: async () => ({
          ...verdict,
          testsRan: actor === 'reviewer',
          testsPassed: false,
          testCommand: actor === 'reviewer' ? 'false' : '',
        }),
        runVerification: pass,
      },
    })
    assert.equal(result.outcome, 'failed')
    assert.match(result.reason, /failed tests/)
  })
test('trusted Git ignores replacement refs when inspecting a revision', async () => {
  const { git: trustedGit } = await import('../src/git.mjs')
  git(repoPath, ['checkout', '-b', 'proposed'])
  await commit({ worktree: repoPath })
  const head = git(repoPath, ['rev-parse', 'HEAD'])
  git(repoPath, ['replace', head, cfg.policy.target.baseSha])
  assert.equal(git(repoPath, ['show', `${head}:value.txt`]), 'bad')
  assert.equal((await trustedGit(repoPath, ['show', `${head}:value.txt`])).stdout, 'good\n')
})

test('private checkout sanitization removes packed replacement refs', async () => {
  const { createPrivateCheckout, sanitizePrivateCheckout } = await import('../src/git.mjs')
  git(repoPath, ['checkout', '-b', 'proposed'])
  await commit({ worktree: repoPath })
  const head = git(repoPath, ['rev-parse', 'HEAD'])
  const checkout = join(root, 'private')
  await createPrivateCheckout(repoPath, checkout, head)
  git(checkout, ['replace', head, cfg.policy.target.baseSha])
  git(checkout, ['pack-refs', '--all'])
  assert.notEqual(git(checkout, ['for-each-ref', 'refs/replace']), '')
  sanitizePrivateCheckout(checkout)
  assert.equal(git(checkout, ['for-each-ref', 'refs/replace']), '')
})

test('loop rejects redirected private Git metadata before importing or reviewing', async () => {
  git(repoPath, ['checkout', '-b', 'outside-executor'])
  await commit({ worktree: repoPath })
  const a = adapter(repoPath)
  let reviews = 0
  const result = await runIssue({
    adapter: a,
    issue,
    cfg,
    deps: {
      execute: async (args) => {
        const result = await commit(args)
        writeFileSync(join(args.worktree, '.git/commondir'), join(repoPath, '.git'))
        writeFileSync(join(args.worktree, '.git/HEAD'), 'ref: refs/heads/outside-executor\n')
        return result
      },
      review: async () => {
        reviews++
        return verdict
      },
      runVerification: pass,
    },
  })
  assert.equal(result.outcome, 'failed')
  assert.match(result.reason, /private Git metadata.*commondir/)
  assert.equal(reviews, 0)
  assert.equal(
    a.calls.some(([kind]) => ['implemented', 'approved'].includes(kind)),
    false,
  )
})

for (const disposition of ['request-changes', 'blocked'])
  test(`unchanged delivered ${disposition} reviews are reused until inputs change or force`, async () => {
    git(repoPath, ['checkout', '-b', 'proposed'])
    await commit({ worktree: repoPath })
    let reviews = 0,
      publications = 0,
      currentIssue = issue
    const pr = {
      number: 9,
      headRefOid: git(repoPath, ['rev-parse', 'HEAD']),
      baseRefName: 'main',
      baseRefOid: cfg.policy.target.baseSha,
      headRefName: 'agent/issue-1',
      closingIssuesReferences: [{ number: 1 }],
      comments: [],
      reviews: [],
    }
    const deps = {
      gh: {
        viewPR: async () => pr,
        viewIssue: async () => currentIssue,
        postVerdict: async (r, n, posted) => {
          publications++
          pr.reviews.push({ body: posted.body })
          return 'review'
        },
        setPhaseLabel: async () => {},
        removeLabels: async () => {},
      },
      review: async () => {
        reviews++
        return {
          ...verdict,
          verdict: disposition,
          unmetAc:
            disposition === 'request-changes'
              ? [{ criterion: 'value is good', why: 'revise' }]
              : [],
        }
      },
      runVerification: pass,
    }
    const run = (force = false) =>
      reviewPullRequest({ repo: 'o/r', repoPath, pr, cfg, labels: {}, deps, force })
    assert.equal((await run()).verdict, disposition)
    assert.equal((await run()).skipped, true)
    assert.deepEqual([reviews, publications], [1, 1])
    assert.equal((await run(true)).verdict, disposition)
    currentIssue = { ...issue, body: '## Acceptance criteria\n- [ ] changed criterion' }
    assert.equal((await run()).verdict, disposition)
    assert.deepEqual([reviews, publications], [3, 3])
    assert.equal((await run()).skipped, true)
    writeFileSync(join(repoPath, 'another.txt'), 'new revision')
    git(repoPath, ['add', '.'])
    git(repoPath, ['commit', '-m', 'next revision'])
    pr.headRefOid = git(repoPath, ['rev-parse', 'HEAD'])
    assert.equal((await run()).verdict, disposition)
    assert.deepEqual([reviews, publications], [4, 4])
  })

for (const mutation of ['mode', 'symlink'])
  test(`immutable source checks reject hidden ${mutation} changes`, async () => {
    const a = adapter(repoPath)
    const result = await runIssue({
      adapter: a,
      issue,
      cfg,
      deps: {
        execute: commit,
        review: async () => verdict,
        runVerification: async ({ worktree }) => {
          git(worktree, ['update-index', '--assume-unchanged', 'value.txt'])
          if (mutation === 'mode') chmodSync(join(worktree, 'value.txt'), 0o755)
          else {
            writeFileSync(join(root, 'outside'), 'good\n')
            rmSync(join(worktree, 'value.txt'))
            symlinkSync(join(root, 'outside'), join(worktree, 'value.txt'))
          }
          return pass()
        },
      },
    })
    assert.equal(result.outcome, 'failed')
    assert.match(result.reason, /source|mode|type/)
    assert.equal(
      a.calls.some((c) => c[0] === 'approved'),
      false,
    )
  })

for (const scenario of ['failed publication', 'stale local base'])
  test(`direct PR record reuse handles ${scenario}`, async () => {
    git(repoPath, ['checkout', '-b', 'proposed'])
    await commit({ worktree: repoPath })
    let attempts = 0,
      approvals = 0
    const pr = {
      number: 9,
      headRefOid: git(repoPath, ['rev-parse', 'HEAD']),
      baseRefName: 'main',
      baseRefOid: cfg.policy.target.baseSha,
      headRefName: 'agent/issue-1',
      closingIssuesReferences: [{ number: 1 }],
      comments: [],
      reviews: [],
    }
    const deps = {
      gh: {
        viewPR: async () => pr,
        viewIssue: async () => issue,
        postVerdict: async () => {
          attempts++
          if (scenario === 'failed publication' && attempts === 1)
            throw new Error('remote publication failed')
          approvals++
          return 'review'
        },
        setPhaseLabel: async () => {},
        removeLabels: async () => {},
      },
      review: async () => verdict,
      runVerification: pass,
    }
    const first = await reviewPullRequest({ repo: 'o/r', repoPath, pr, cfg, labels: {}, deps })
    if (scenario === 'stale local base') {
      assert.equal(first.verdict, 'approve')
      git(repoPath, ['update-ref', 'refs/heads/main', pr.headRefOid])
    } else {
      assert.equal(first.verdict, 'blocked')
      assert.equal(approvals, 0)
    }
    const second = await reviewPullRequest({ repo: 'o/r', repoPath, pr, cfg, labels: {}, deps })
    if (scenario === 'stale local base') {
      assert.equal(second.verdict, 'blocked')
      assert.match(second.reason, /base/)
      assert.equal(approvals, 1)
    } else {
      assert.equal(second.verdict, 'approve')
      assert.equal(attempts, 2)
      assert.equal(approvals, 1)
    }
  })

for (const disposition of ['approve', 'request-changes', 'blocked'])
  test(`direct review reuses a current delivered loop ${disposition} record for the same PR`, async () => {
    const a = adapter(repoPath)
    a.onImplemented = async () => ({ prNumber: 9 })
    a.onVerdict = async () => 'review'
    const implemented = await runIssue({
      adapter: a,
      issue,
      cfg,
      deps: {
        execute: commit,
        review: async () => ({
          ...verdict,
          verdict: disposition,
          unmetAc:
            disposition === 'request-changes'
              ? [{ criterion: 'value is good', why: 'revise' }]
              : [],
        }),
        runVerification: pass,
      },
    })
    assert.equal(implemented.outcome, disposition === 'approve' ? 'approved' : 'failed')
    const pr = {
      number: 9,
      headRefOid: implemented.ctx.head,
      baseRefName: 'main',
      baseRefOid: cfg.policy.target.baseSha,
      headRefName: implemented.ctx.branch,
      closingIssuesReferences: [{ number: 1 }],
      comments: [],
      reviews: [],
    }
    let evaluations = 0
    const result = await reviewPullRequest({
      repo: 'o/r',
      repoPath,
      pr,
      cfg,
      labels: {},
      deps: {
        gh: { viewIssue: async () => issue, viewPR: async () => pr },
        review: async () => {
          evaluations++
          throw new Error('unexpected duplicate review')
        },
        runVerification: pass,
      },
    })
    assert.equal(result.skipped, true)
    assert.equal(evaluations, 0)
  })
