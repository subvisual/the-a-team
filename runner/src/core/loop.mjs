import { existsSync } from 'node:fs'
import { hasCommitsSince, addWorktree, removeWorktree, revParse, git } from '../git.mjs'
import { worktreePath, runDir as runDirFor, stamp, ensureDir } from '../paths.mjs'
import { objectionsDisjoint } from '../issue.mjs'
import { log } from '../log.mjs'
import { claim } from './claim.mjs'
import { execute as defaultExecute } from './execute.mjs'
import { review as defaultReview } from './review.mjs'

export const OUTCOME = {
  approved: 'approved',
  needsDetail: 'needs-detail',
  changesRequested: 'changes-requested',
  failed: 'failed',
  skipped: 'skipped',
}

/**
 * One issue, end to end: gate on acceptance criteria, claim, implement,
 * review independently, loop on request-changes up to the cap.
 */
export async function runIssue({ adapter, issue, cfg, dryRun = false, deps = {} }) {
  const execute = deps.execute || defaultExecute
  const review = deps.review || defaultReview
  const repo = adapter.repo
  const started = Date.now()

  if (!issue.acceptanceCriteria.length) {
    const reason = 'no checkable acceptance criteria — add an "## Acceptance criteria" section with checklist items'
    log.warn('issue.needs_detail', { repo, issue: issue.key })
    if (!dryRun) await adapter.onNeedsDetail?.(issue, reason)
    return { outcome: OUTCOME.needsDetail, issue: issue.key, reason }
  }

  const blockers = await adapter.openBlockers?.(issue) ?? []
  if (blockers.length) {
    log.info('issue.blocked_by', { repo, issue: issue.key, blockers: blockers.join(',') })
    return { outcome: OUTCOME.skipped, issue: issue.key, reason: `blocked by ${blockers.map((b) => `#${b}`).join(', ')}` }
  }

  if (dryRun) {
    log.info('issue.dry_run', { repo, issue: issue.key, criteria: issue.acceptanceCriteria.length })
    return { outcome: OUTCOME.skipped, issue: issue.key, reason: 'dry run' }
  }

  const token = claim(repo, issue.key, { title: issue.title })
  if (!token) return { outcome: OUTCOME.skipped, issue: issue.key, reason: 'already claimed' }

  const branch = `${cfg.branchPrefix}${issue.key}`
  const worktree = worktreePath(repo, issue.key)
  const dir = ensureDir(runDirFor(repo, issue.key, stamp()))
  let ctx = { branch, worktree, runDir: dir, prNumber: null, prUrl: null }
  let totalCost = 0

  try {
    await git(adapter.repoPath, ['fetch', '--prune', 'origin'], { check: false })
    const base = adapter.base
    const baseRef = (await git(adapter.repoPath, ['rev-parse', '--verify', `origin/${base}`], { check: false })).code === 0
      ? `origin/${base}`
      : base
    const baseSha = await revParse(adapter.repoPath, baseRef)

    if (existsSync(worktree)) await removeWorktree(adapter.repoPath, worktree)
    await addWorktree(adapter.repoPath, worktree, branch, baseRef)
    log.info('worktree.ready', { repo, issue: issue.key, branch, base: baseSha.slice(0, 8) })
    await adapter.onClaimed?.(issue, { branch, worktree })

    let previousUnmet = null
    let reviewerSession = null
    let revision = null

    for (let cycle = 1; cycle <= cfg.maxCycles; cycle += 1) {
      const impl = await execute({
        issue, branch, base: baseRef, worktree,
        testCommand: adapter.testCommand,
        revision,
        model: cfg.executorModel,
        budgetUsd: cfg.executorBudgetUsd,
        runDir: dir,
      })
      totalCost += impl.costUsd || 0

      if (impl.status === 'blocked') {
        log.warn('executor.blocked', { repo, issue: issue.key, cycle, reason: impl.blockedReason })
        await adapter.onFailed?.(issue, ctx, `executor blocked: ${impl.blockedReason}`)
        return { outcome: OUTCOME.failed, issue: issue.key, reason: impl.blockedReason, cycles: cycle, costUsd: totalCost, ctx }
      }

      if (!(await hasCommitsSince(adapter.repoPath, baseSha, branch))) {
        const reason = 'executor reported done but produced no commits'
        log.warn('executor.empty', { repo, issue: issue.key, cycle })
        await adapter.onFailed?.(issue, ctx, reason)
        return { outcome: OUTCOME.failed, issue: issue.key, reason, cycles: cycle, costUsd: totalCost, ctx }
      }

      const head = await revParse(worktree, 'HEAD')
      ctx = { ...ctx, head, baseSha, ...(await adapter.onImplemented?.(issue, { ...ctx, head, baseSha, summary: impl.summary, cycle }) || {}) }

      const verdict = await review({
        issue, base: baseSha, head, worktree,
        testCommand: impl.testCommand || adapter.testCommand,
        model: cfg.reviewerModel,
        budgetUsd: cfg.reviewerBudgetUsd,
        runDir: dir,
        cycle,
        resumeSessionId: reviewerSession,
        repoPath: adapter.repoPath,
      })
      totalCost += verdict.costUsd || 0
      reviewerSession = verdict.sessionId || reviewerSession

      log.info('review.verdict', {
        repo, issue: issue.key, cycle, verdict: verdict.verdict,
        unmet: verdict.unmetAc.length, tests: verdict.testsRan ? (verdict.testsPassed ? 'green' : 'red') : 'not-run',
      })
      await adapter.onVerdict?.(issue, { ...ctx, cycle }, verdict)

      if (verdict.verdict === 'approve') {
        await adapter.onApproved?.(issue, { ...ctx, cycle }, verdict)
        if (cfg.cleanupOnSuccess !== false) await removeWorktree(adapter.repoPath, worktree)
        return { outcome: OUTCOME.approved, issue: issue.key, cycles: cycle, costUsd: totalCost, ctx }
      }

      if (verdict.verdict === 'blocked') {
        await adapter.onFailed?.(issue, ctx, `reviewer blocked: ${verdict.notes}`)
        return { outcome: OUTCOME.failed, issue: issue.key, reason: verdict.notes, cycles: cycle, costUsd: totalCost, ctx }
      }

      const current = verdict.unmetAc.map((u) => u.criterion)
      if (previousUnmet && objectionsDisjoint(previousUnmet, current)) {
        const reason = 'reviewer objections are disjoint across cycles — not converging'
        log.warn('review.oscillating', { repo, issue: issue.key, cycle })
        await adapter.onFailed?.(issue, ctx, reason)
        return { outcome: OUTCOME.failed, issue: issue.key, reason, cycles: cycle, costUsd: totalCost, ctx }
      }
      previousUnmet = current
      revision = { cycle: cycle + 1, unmet: verdict.unmetAc, notes: verdict.notes }
    }

    const reason = `cycle cap reached (${cfg.maxCycles}) with changes still requested`
    log.warn('review.cap_reached', { repo, issue: issue.key })
    await adapter.onFailed?.(issue, ctx, reason)
    return { outcome: OUTCOME.failed, issue: issue.key, reason, cycles: cfg.maxCycles, costUsd: totalCost, ctx }
  } catch (err) {
    log.error('issue.error', { repo, issue: issue.key, error: err.message })
    await adapter.onFailed?.(issue, ctx, `runner error: ${err.message}`).catch(() => {})
    return { outcome: OUTCOME.failed, issue: issue.key, reason: err.message, costUsd: totalCost, ctx }
  } finally {
    token.release()
    log.info('issue.done', { repo, issue: issue.key, ms: Date.now() - started, cost: totalCost.toFixed(4) })
  }
}
