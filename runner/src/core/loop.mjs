import { openBudget } from './budget.mjs'
import { rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  hasCommitsSince,
  assertDescendsFrom,
  createPrivateCheckout,
  validatePrivateCheckout,
  importPrivateHead,
  branchExists,
  revParse,
} from '../git.mjs'
import { validateChanges, digest } from '../policy.mjs'
import {
  requirePolicy,
  evaluateRevision,
  assertApprovalCurrent,
  recordDelivery,
  recordNonapprovalDelivery,
  hasDeliveryReceipt,
} from './approval.mjs'
import { validateExecutor } from './results.mjs'
import { recordReviewPublication } from './provenance.mjs'
import { assertSandboxAvailable } from '../sandbox.mjs'
import { runDir as runDirFor, stamp, ensureDir } from '../paths.mjs'
import { objectionsDisjoint } from '../issue.mjs'
import { log } from '../log.mjs'
import { claim, inspectClaim } from './claim.mjs'
import { appendEvent, readEvents, replayIssue, runAction, stableActionId } from './history.mjs'
import { execute as defaultExecute } from './execute.mjs'
import { review as defaultReview } from './review.mjs'

export const OUTCOME = {
  approved: 'approved',
  needsDetail: 'needs-detail',
  changesRequested: 'changes-requested',
  failed: 'failed',
  skipped: 'skipped',
}

/** Execute one issue while keeping each attempted revision and action receipt. */
export async function runIssue({ adapter, issue, cfg, dryRun = false, deps = {} }) {
  const execute = deps.execute || defaultExecute,
    review = deps.review || defaultReview
  const repo = adapter.repo,
    started = Date.now()
  let policy
  try {
    policy = requirePolicy(cfg, adapter.repoPath)
  } catch (error) {
    return { outcome: OUTCOME.failed, issue: issue.key, reason: error.message }
  }
  const maxCycles = policy.limits?.maxCycles ?? cfg.maxCycles
  if (!issue.acceptanceCriteria.length) {
    const reason =
      'no checkable acceptance criteria — add an "## Acceptance criteria" section with checklist items'
    log.warn('issue.needs_detail', { repo, issue: issue.key })
    if (!dryRun) await adapter.onNeedsDetail?.(issue, reason)
    return { outcome: OUTCOME.needsDetail, issue: issue.key, reason }
  }
  const blockers = (await adapter.openBlockers?.(issue)) ?? []
  if (blockers.length) {
    if (!dryRun)
      appendEvent(repo, issue, {
        type: 'eligibility.blocked',
        failureCategory: 'blocked-prerequisites',
        blockers,
      })
    return {
      outcome: OUTCOME.skipped,
      issue: issue.key,
      reason: `blocked by ${blockers.map((b) => `#${b}`).join(', ')}`,
      failureCategory: 'blocked-prerequisites',
    }
  }
  if (dryRun) return { outcome: OUTCOME.skipped, issue: issue.key, reason: 'dry run' }
  if (!deps.execute || !deps.review) {
    try {
      await assertSandboxAvailable(policy)
    } catch (error) {
      return { outcome: OUTCOME.failed, issue: issue.key, reason: error.message }
    }
  }
  const token = claim(repo, issue.key, { title: issue.title })
  if (!token) {
    const state = inspectClaim(repo, issue.key)
    return {
      outcome: OUTCOME.skipped,
      issue: issue.key,
      reason:
        state.status === 'recovery-uncertain'
          ? 'claim recovery is uncertain; reconcile the retained recovery guard'
          : 'already claimed',
      failureCategory: state.status,
    }
  }
  let ctx = {},
    totalCost = 0,
    cycle = 0,
    stage = 'preparing',
    attemptId,
    dir,
    worktree,
    branch
  let priorDuration = 0,
    budget
  const updateCost = () => {
    if (budget) totalCost = budget.attemptStatus(attemptId).spentUsd
  }
  const event = (type, fields = {}) => {
    updateCost()
    return appendEvent(repo, issue, {
      type,
      attemptId,
      ...ctx,
      cycle,
      stage,
      costUsd: totalCost,
      durationMs: priorDuration + Date.now() - started,
      ...fields,
    })
  }
  const finish = (result) => {
    updateCost()
    const full = {
      issue: issue.key,
      costUsd: totalCost,
      ctx,
      ...result,
      ...(budget ? { budget: budget.snapshot() } : {}),
    }
    event('attempt.finished', {
      outcome: full.outcome,
      failureCategory: full.failureCategory || null,
      reason: full.reason || null,
      evidence: {
        approvalPath: ctx.approvalPath,
        verificationPath: ctx.verificationPath,
        reviewPath: ctx.reviewPath,
        deliveryPath: ctx.deliveryPath,
      },
      budget: full.budget,
    })
    return full
  }
  const action = async (kind, args, callback) => {
    if (!callback) return undefined
    const actionCycle = kind === 'onClaimed' ? 0 : cycle
    return runAction(
      {
        repo,
        issue,
        attemptId,
        actionId: stableActionId({ attemptId, kind, cycle: actionCycle }),
        kind,
        input: {
          branch: ctx.branch,
          head: kind === 'onClaimed' ? null : ctx.head || null,
          cycle: actionCycle,
        },
        reconcile: adapter.reconcileAction ? (e) => adapter.reconcileAction(issue, e) : undefined,
      },
      async () => {
        await deps.checkpoint?.(`before-${kind}`, ctx)
        return callback(...args)
      },
    )
  }
  const fail = async (reason, failureCategory) => {
    await action('onFailed', [issue, ctx, reason], adapter.onFailed?.bind(adapter))
    return finish({ outcome: OUTCOME.failed, reason, failureCategory, cycles: cycle })
  }
  try {
    let history = replayIssue(readEvents(repo, issue.key), issue)
    if (history.unresolvedActions.length) {
      for (const pending of history.unresolvedActions) {
        if (!adapter.reconcileAction)
          throw Object.assign(
            Error(`action uncertain: ${pending.kind}; reconcile before retrying`),
            { code: 'action-uncertain' },
          )
        await runAction(
          {
            repo,
            issue,
            attemptId: pending.attemptId,
            actionId: pending.actionId,
            kind: pending.kind,
            input: pending.input,
            reconcile: (e) => adapter.reconcileAction(issue, e),
          },
          async () => {
            throw Error('unresolved action cannot be replayed automatically')
          },
        )
      }
      history = replayIssue(readEvents(repo, issue.key), issue)
    }
    const prior = history.currentAttempts.at(-1)
    const recoveryWindow = policy.authorization?.recoveryWindow || null
    if (
      prior?.failureCategory === 'cycle-exhausted' &&
      (prior.recoveryWindow || null) === recoveryWindow
    )
      throw Object.assign(
        Error(`cycle cap reached (${maxCycles}); explicit recovery window required`),
        { code: 'cycle-exhausted' },
      )
    const resumable =
      prior &&
      (!prior.outcome ||
        prior.failureCategory === 'interrupted' ||
        prior.failureCategory === 'action-uncertain')
    const resume = resumable && prior.worktree && existsSync(prior.worktree) ? prior : null
    if (resumable && !resume)
      throw Object.assign(
        Error('interrupted attempt checkout is missing; retained history requires reconciliation'),
        { code: 'missing-checkout' },
      )
    attemptId = resume?.attemptId || randomUUID()
    dir =
      resume?.runDir || ensureDir(runDirFor(repo, issue.key, `${stamp()}-${attemptId.slice(0, 8)}`))
    worktree = resume?.worktree || join(dir, 'executor-source')
    branch = resume?.branch || `${cfg.branchPrefix}${issue.key}`
    if (!resume && (await branchExists(adapter.repoPath, branch)))
      branch = `${branch}-${attemptId.slice(0, 8)}`
    const baseRef = policy.target.baseRef || policy.target.base,
      baseSha = policy.target.baseSha
    const dependencyHeads = (await adapter.dependencyHeads?.(issue)) || {}
    if (
      resume &&
      (resume.baseSha !== baseSha ||
        digest(resume.dependencyHeads || {}) !== digest(dependencyHeads))
    )
      throw Object.assign(Error('interrupted attempt base or dependency revisions changed'), {
        code: 'recovery-base-changed',
      })
    ctx = {
      ...(resume || {}),
      attemptId,
      branch,
      worktree,
      runDir: dir,
      prNumber: resume?.prNumber || null,
      prUrl: resume?.prUrl || null,
      baseSha,
      dependencyHeads,
      recoveryWindow,
    }
    // Replay metadata and nested events never belong to an attempt checkpoint.
    for (const key of [
      'events',
      'type',
      'sequence',
      'eventId',
      'at',
      'repo',
      'issueKey',
      'outcome',
      'failureCategory',
      'reason',
      'implementation',
      'evaluation',
    ])
      delete ctx[key]
    totalCost = resume?.costUsd || 0
    priorDuration = resume?.durationMs || 0
    budget = openBudget({ repo, policy })
    cycle = resume?.cycle || 0
    stage = resume?.stage || 'preparing'
    event(resume ? 'attempt.resumed' : 'attempt.started', { recoveredClaim: token.recoveredHolder })
    if ((await revParse(adapter.repoPath, baseRef)) !== baseSha)
      throw Object.assign(Error('resolved policy base changed before execution'), {
        code: 'base-changed',
      })
    for (const head of Object.values(dependencyHeads))
      await assertDescendsFrom(adapter.repoPath, head, baseSha)
    if (resume) await validatePrivateCheckout(worktree)
    else await createPrivateCheckout(adapter.repoPath, worktree, baseSha, branch)
    await action('onClaimed', [issue, { branch, worktree }], adapter.onClaimed?.bind(adapter))
    let previousUnmet = resume?.previousUnmet || null,
      reviewerSession = resume?.reviewerSession || null,
      revision = resume?.revision || null
    let resumeCycle = resume
    for (cycle = Math.max(1, resume?.cycle || 1); cycle <= maxCycles; cycle++) {
      let impl = resumeCycle?.implementation
      if (!impl) {
        stage = 'executing'
        event('attempt.executing', { revision, previousUnmet, reviewerSession })
        impl = await budget.call(
          'executor',
          async (grant) => {
            const result = await execute({
              issue,
              branch,
              base: baseRef,
              worktree,
              testCommand: policy.verification.commands.join(' && '),
              policy,
              scratchDir: ensureDir(join(dir, `executor-${cycle}-scratch`)),
              revision,
              model: cfg.executorModel,
              budgetUsd: grant.budgetUsd,
              timeoutMs: grant.timeoutMs,
              runDir: dir,
            })
            try {
              return validateExecutor(result)
            } catch (error) {
              error.costUsd = result?.costUsd
              throw error
            }
          },
          { issueKey: issue.key, attemptId, cycle, baseSha, dependencyHeads },
        )
        updateCost()
        stage = 'executed'
        event('attempt.executed', { implementation: impl })
        await deps.checkpoint?.('after-executor', ctx)
      }
      if (impl.status === 'blocked') return await fail(impl.blockedReason, 'executor-blocked')
      await validatePrivateCheckout(worktree)
      if (!(await hasCommitsSince(worktree, baseSha, 'HEAD')))
        return await fail('executor reported done but produced no commits', 'empty-implementation')
      const head = await revParse(worktree, 'HEAD')
      await assertDescendsFrom(worktree, baseSha, head)
      await validateChanges(policy, worktree, baseSha, head)
      await importPrivateHead(adapter.repoPath, worktree, head, branch)
      ctx = { ...ctx, head }
      stage = 'committed'
      event('attempt.committed', { implementation: impl })
      await deps.checkpoint?.('after-commit', ctx)
      ctx = {
        ...ctx,
        ...((await action(
          'onImplemented',
          [issue, { ...ctx, summary: impl.summary, cycle }],
          adapter.onImplemented?.bind(adapter),
        )) || {}),
      }
      const priorEvaluation = resumeCycle?.evaluation
      const reusableEvaluation =
        priorEvaluation?.reviewRecord?.cycle === cycle &&
        priorEvaluation.reviewRecord.headSha === head
          ? priorEvaluation
          : null
      const evaluation =
        reusableEvaluation ||
        (await evaluateRevision({
          repo,
          repoPath: adapter.repoPath,
          source: worktree,
          issue,
          baseSha,
          head,
          policy,
          implementation: impl,
          review,
          runDir: dir,
          cycle,
          model: cfg.reviewerModel,
          budgetUsd: cfg.reviewerBudgetUsd,
          budget,
          attemptId,
          resumeSessionId: reviewerSession,
          deps,
        }))
      const { verdict } = evaluation
      ctx = {
        ...ctx,
        approvalPath: evaluation.approvalPath,
        verificationPath: evaluation.verificationPath,
        reviewPath: evaluation.reviewPath,
        reviewDigest: evaluation.reviewDigest,
      }
      updateCost()
      reviewerSession = verdict.sessionId || reviewerSession
      stage = 'reviewed'
      event('attempt.reviewed', {
        implementation: impl,
        evaluation,
        reviewerSession,
        failureCategory:
          verdict.verdict === 'request-changes'
            ? 'reviewer-rejection'
            : verdict.verdict === 'blocked'
              ? 'reviewer-blocked'
              : null,
      })
      await deps.checkpoint?.('after-review', ctx)
      const assertCurrent = async () => {
        if (digest(cfg.policy) !== digest(policy))
          throw Error('resolved policy changed before approval')
        const latest = adapter.currentApprovalInputs
          ? await adapter.currentApprovalInputs(issue, ctx)
          : { issue, head, baseSha }
        await assertApprovalCurrent(evaluation.record, {
          repo,
          issue: latest.issue,
          head: latest.head,
          baseSha: latest.baseSha,
          policy,
          repoPath: adapter.repoPath,
          branch,
          source: worktree,
        })
      }
      if (verdict.verdict === 'approve') await assertCurrent()
      const publication = await action(
        'onVerdict',
        [issue, { ...ctx, cycle }, verdict],
        adapter.onVerdict?.bind(adapter),
      )
      const via = publication?.via || publication
      if (ctx.prNumber && publication && typeof publication === 'object')
        recordReviewPublication({
          reviewPath: evaluation.reviewPath,
          publication,
          repo,
          prNumber: ctx.prNumber,
        })
      if (verdict.verdict !== 'approve' && ctx.prNumber && ['review', 'comment'].includes(via))
        ctx.reviewDeliveryPath = recordNonapprovalDelivery({
          repo,
          issue,
          head,
          baseSha,
          policy,
          verdict,
          prNumber: ctx.prNumber,
          via,
          runDir: dir,
          cycle,
        })
      if (verdict.verdict === 'approve') {
        await assertCurrent()
        await action(
          'onApproved',
          [issue, { ...ctx, cycle }, verdict],
          adapter.onApproved?.bind(adapter),
        )
        ctx.deliveryPath = await runAction(
          {
            repo,
            issue,
            attemptId,
            actionId: stableActionId({ attemptId, kind: 'recordDelivery', cycle }),
            kind: 'recordDelivery',
            input: { approvalPath: evaluation.approvalPath, head },
            reconcile: async () =>
              hasDeliveryReceipt(evaluation.record, { repo, prNumber: ctx.prNumber })
                ? { status: 'confirmed', result: join(dir, `delivery-${cycle}.json`) }
                : { status: 'absent', evidence: 'immutable receipt absent' },
          },
          async () =>
            recordDelivery({
              record: evaluation.record,
              approvalPath: evaluation.approvalPath,
              repo,
              prNumber: ctx.prNumber,
              kind: ctx.prNumber ? 'github-verdict' : 'adapter-approval',
              via: via || null,
            }),
        )
        stage = 'delivered'
        const result = finish({ outcome: OUTCOME.approved, cycles: cycle })
        // Only an accounted successful checkout is eligible for cleanup.
        if (cfg.cleanupOnSuccess !== false) rmSync(worktree, { recursive: true, force: true })
        return result
      }
      if (verdict.verdict === 'blocked') return await fail(verdict.notes, 'reviewer-blocked')
      const current = verdict.unmetAc.map((u) => u.criterion)
      if (previousUnmet && objectionsDisjoint(previousUnmet, current))
        return await fail(
          'reviewer objections are disjoint across cycles — not converging',
          'review-oscillating',
        )
      previousUnmet = current
      revision = { cycle: cycle + 1, unmet: verdict.unmetAc, notes: verdict.notes }
      resumeCycle = null
    }
    cycle = maxCycles
    return await fail(
      `cycle cap reached (${maxCycles}) with changes still requested`,
      'cycle-exhausted',
    )
  } catch (error) {
    if (error.verificationPath) ctx = { ...ctx, verificationPath: error.verificationPath }
    const failureCategory = error.failureCategory || error.code || 'runner-error'
    // An uncertain remote action is not followed by further side effects.
    if (attemptId && !['action-uncertain', 'interrupted'].includes(failureCategory)) {
      try {
        await action(
          'onFailed',
          [issue, ctx, `runner error: ${error.message}`],
          adapter.onFailed?.bind(adapter),
        )
      } catch {
        /* retain the independently uncertain action */
      }
    }
    if (!attemptId)
      return {
        outcome: OUTCOME.failed,
        issue: issue.key,
        reason: error.message,
        failureCategory,
        budget: error.budget,
      }
    return finish({
      outcome: OUTCOME.failed,
      reason: error.message,
      failureCategory,
      budget: error.budget,
    })
  } finally {
    token.release()
    log.info('issue.done', {
      repo,
      issue: issue.key,
      ms: Date.now() - started,
      cost: totalCost.toFixed(4),
    })
  }
}
