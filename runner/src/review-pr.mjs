import { claim, inspectClaim } from './core/claim.mjs'
import { randomUUID } from 'node:crypto'
import { appendEvent, readEvents, replayIssue, runAction, stableActionId } from './core/history.mjs'
import { openBudget } from './core/budget.mjs'
import {
  requirePolicy,
  evaluateRevision,
  assertApprovalCurrent,
  validateApprovalRecord,
  recordNonapprovalDelivery,
  recordDelivery,
  criteriaDigest,
} from './core/approval.mjs'
import { authenticatedReviews, recordReviewPublication } from './core/provenance.mjs'
import { assertSandboxAvailable } from './sandbox.mjs'
import * as gh from './gh.mjs'
import { revParse } from './git.mjs'
import { runDir as runDirFor, stamp, ensureDir } from './paths.mjs'
import { normaliseIssue } from './adapters/github.mjs'
import { review, verdictBody } from './core/review.mjs'
import { log } from './log.mjs'

export function reviewedShas(pr, authenticated = []) {
  return new Set(authenticated.map((record) => record.headSha))
}

export function cycleCount(pr, authenticated = []) {
  return authenticated.length ? Math.max(...authenticated.map((record) => record.cycle)) : 0
}

// The issue a PR answers to comes from GitHub's own link, never from the PR
// body — the executor wrote that, and a reviewer must not read it
// (RUNNER.md decision 4).
export function linkedIssueNumber(pr, branchPrefix) {
  const linked = pr.closingIssuesReferences?.[0]?.number
  if (linked) return linked
  const fromBranch = pr.headRefName?.startsWith(branchPrefix)
    ? Number(pr.headRefName.slice(branchPrefix.length))
    : NaN
  return Number.isInteger(fromBranch) ? fromBranch : null
}

/**
 * Review one already-open PR, in its own session, against its issue.
 * Keyed on head sha: a new push is a new sha, so re-review falls out of the
 * key rather than needing an event subscription (RUNNER.md decision 7).
 */
function assertReviewHistory(repo, issue) {
  const history = replayIssue(readEvents(repo, issue.key), issue)
  const incompleteReview = history.currentAttempts.find(
    (attempt) =>
      attempt.entrypoint === 'review' &&
      (!attempt.outcome ||
        (attempt.outcome === 'failed' &&
          attempt.events.some(
            (event) => event.type === 'action.result' && event.kind === 'post-verdict',
          ))),
  )
  if (incompleteReview)
    throw Object.assign(
      new Error(
        `review delivery incomplete for attempt ${incompleteReview.attemptId}; delivery reconciliation is required before another review`,
      ),
      { failureCategory: 'delivery-incomplete' },
    )
  if (history.unresolvedActions.length)
    throw Object.assign(
      new Error('action uncertain: reconcile interrupted supervisor actions before another review'),
      { failureCategory: 'action-uncertain' },
    )
}

export async function reviewPullRequest({
  repo,
  repoPath,
  pr,
  cfg,
  labels,
  force = false,
  deps = {},
}) {
  repo = repo.toLowerCase()
  const github = deps.gh || gh
  const head = pr.headRefOid
  let policy
  try {
    policy = requirePolicy(cfg, repoPath)
  } catch (error) {
    return { pr: pr.number, verdict: 'blocked', reason: error.message }
  }
  const baseSha = policy.target.baseSha
  const issueNumber = linkedIssueNumber(pr, cfg.branchPrefix)
  if (!issueNumber) return { skipped: true, reason: 'no linked issue', pr: pr.number }
  let issue
  let ignoredEvidence = []
  let budget
  let token
  let attemptId
  let started
  let startingCost = 0
  try {
    issue = normaliseIssue(await github.viewIssue(repo, issueNumber))
    if (!issue.acceptanceCriteria.length)
      return {
        skipped: true,
        reason: `issue #${issueNumber} has no acceptance criteria`,
        pr: pr.number,
      }
    if (pr.baseRefOid && pr.baseRefOid !== baseSha)
      throw new Error('PR base differs from resolved policy base')
    if (pr.baseRefName !== policy.target.base)
      throw new Error('PR base branch differs from resolved policy base')
    const deliveryContext = { repo, issue, head, baseSha, policy, prNumber: pr.number }
    if ((await revParse(repoPath, policy.target.base)) !== baseSha)
      throw new Error('resolved policy base changed before review')
    const authentication = await authenticatedReviews({
      ...deliveryContext,
      pr,
      model: cfg.reviewerModel,
      criteriaDigest: criteriaDigest(issue),
      gh: github,
      validateApproval: (record) => validateApprovalRecord(record, deliveryContext).valid,
    })
    ignoredEvidence = authentication.ignored
    assertReviewHistory(repo, issue)
    const delivered = !force && authentication.completed.sort((a, b) => b.cycle - a.cycle)[0]
    if (delivered && pr.baseRefOid === baseSha)
      return {
        skipped: true,
        reason: 'authenticated completed review already exists',
        pr: pr.number,
        previousVerdict: delivered.verdict.verdict,
        ignoredEvidence: authentication.ignored,
      }
    if (!deps.review) await assertSandboxAvailable(policy)
    token = claim(repo, issue.key, { entrypoint: 'review', prNumber: pr.number })
    if (!token) {
      const state = inspectClaim(repo, issue.key)
      return {
        skipped: true,
        pr: pr.number,
        reason:
          state.status === 'recovery-uncertain'
            ? 'claim recovery is uncertain; reconcile the retained recovery guard'
            : 'already claimed',
        failureCategory: state.status,
      }
    }
    // Another supervisor may have completed between the initial read and claim.
    const currentAuthentication = await authenticatedReviews({
      ...deliveryContext,
      pr,
      model: cfg.reviewerModel,
      criteriaDigest: criteriaDigest(issue),
      gh: github,
      validateApproval: (record) => validateApprovalRecord(record, deliveryContext).valid,
    })
    assertReviewHistory(repo, issue)
    if (!force && currentAuthentication.completed.length && pr.baseRefOid === baseSha)
      return {
        skipped: true,
        pr: pr.number,
        reason: 'authenticated completed review already exists',
        ignoredEvidence: currentAuthentication.ignored,
      }
    budget = openBudget({ repo, policy })
    attemptId = randomUUID()
    startingCost = budget.attemptStatus(attemptId).spentUsd
    started = Date.now()
    appendEvent(repo, issue, {
      type: 'attempt.started',
      attemptId,
      entrypoint: 'review',
      headSha: head,
      baseSha,
      prNumber: pr.number,
    })
    const cycle = cycleCount(pr, authentication.completed) + 1
    const dir = ensureDir(runDirFor(repo, `pr-${pr.number}`, stamp()))
    if ((await revParse(repoPath, policy.target.base)) !== baseSha)
      throw new Error('resolved policy base changed before review')
    const evaluation = await evaluateRevision({
      repo,
      repoPath,
      source: repoPath,
      issue,
      baseSha,
      head,
      policy,
      review: deps.review || review,
      runDir: dir,
      cycle,
      model: cfg.reviewerModel,
      budgetUsd: cfg.reviewerBudgetUsd,
      budget,
      attemptId,
      deps,
    })
    const { verdict } = evaluation
    // Fresh remote metadata and issue criteria are required before any verdict
    // publication. Markers alone never stand in for current validation evidence.
    const latest = await github.viewPR(repo, pr.number)
    if (
      latest.headRefOid !== head ||
      latest.baseRefOid !== baseSha ||
      latest.baseRefName !== policy.target.base
    )
      throw new Error('PR head or base changed before verdict publication')
    const currentIssue = normaliseIssue(await github.viewIssue(repo, issueNumber))
    if (criteriaDigest(currentIssue) !== criteriaDigest(issue))
      throw new Error('issue criteria changed before verdict publication')
    if (verdict.verdict === 'approve')
      await assertApprovalCurrent(evaluation.record, {
        repo,
        issue: currentIssue,
        head: latest.headRefOid,
        baseSha: latest.baseRefOid,
        policy: requirePolicy(cfg, repoPath),
        repoPath,
      })
    const body = verdictBody({ ...verdict, cycle, marker: gh.verdictMarker(head, cycle) })
    const action = (kind, input, perform) =>
      runAction(
        {
          repo,
          issue,
          attemptId,
          kind,
          input,
          actionId: stableActionId({ attemptId, kind, cycle }),
        },
        perform,
      )
    const publication = await action(
      'post-verdict',
      { prNumber: pr.number, headSha: head, evidenceDigest: evaluation.reviewDigest },
      () =>
        github.postVerdict(repo, pr.number, {
          event: verdict.verdict === 'approve' ? 'approve' : 'request-changes',
          body,
          headSha: head,
          evidenceDigest: evaluation.reviewDigest,
        }),
    )
    const via = publication?.via || publication
    if (publication && typeof publication === 'object')
      recordReviewPublication({
        reviewPath: evaluation.reviewPath,
        publication,
        repo,
        prNumber: pr.number,
      })
    const deliveryPath =
      verdict.verdict === 'approve'
        ? recordDelivery({
            record: evaluation.record,
            approvalPath: evaluation.approvalPath,
            repo,
            prNumber: pr.number,
            kind: 'github-verdict',
            via,
          })
        : recordNonapprovalDelivery({
            repo,
            issue,
            head,
            baseSha,
            policy,
            verdict,
            prNumber: pr.number,
            via,
            runDir: dir,
            cycle,
          })
    log.info('verdict.posted', { repo, pr: pr.number, via, verdict: verdict.verdict, cycle })
    const phase = verdict.verdict === 'approve' ? labels.approved : labels.changesRequested
    const all = [
      labels.running,
      labels.needsDetail,
      labels.changesRequested,
      labels.approved,
      labels.failed,
    ]
    await action('set-phase-label', { issueNumber, phase, all }, () =>
      github.setPhaseLabel(repo, issueNumber, phase, all),
    )
    await action('remove-ready-label', { issueNumber, label: labels.ready }, () =>
      github.removeLabels(repo, issueNumber, [labels.ready]),
    )
    appendEvent(repo, issue, {
      type: 'attempt.finished',
      attemptId,
      outcome: verdict.verdict,
      headSha: head,
      baseSha,
      costUsd: budget.attemptStatus(attemptId).spentUsd - startingCost,
      durationMs: Date.now() - started,
      budget: budget.snapshot(),
      evidence: { reviewPath: evaluation.reviewPath, deliveryPath },
      failureCategory:
        verdict.verdict === 'request-changes'
          ? 'reviewer-rejection'
          : verdict.verdict === 'blocked'
            ? 'reviewer-blocked'
            : null,
    })
    return {
      pr: pr.number,
      issue: issueNumber,
      verdict: verdict.verdict,
      cycle,
      costUsd: verdict.costUsd,
      budget: budget.snapshot(),
      approvalPath: evaluation.approvalPath,
      reviewPath: evaluation.reviewPath,
      ignoredEvidence: authentication.ignored,
      deliveryPath,
    }
  } catch (error) {
    if (attemptId)
      appendEvent(repo, issue, {
        type: 'attempt.finished',
        attemptId,
        outcome: 'failed',
        failureCategory: error.failureCategory || error.code || 'infrastructure-interruption',
        headSha: head,
        baseSha,
        costUsd: budget.attemptStatus(attemptId).spentUsd - startingCost,
        durationMs: Date.now() - started,
        budget: budget.snapshot(),
        reason: error.message,
      })
    log.warn('review.refused', { repo, pr: pr.number, reason: error.message })
    return {
      pr: pr.number,
      issue: issueNumber,
      verdict: 'blocked',
      reason: error.message,
      verificationPath: error.verificationPath,
      failureCategory: error.failureCategory,
      budget: error.budget || budget?.snapshot(),
      ignoredEvidence,
    }
  } finally {
    token?.release()
  }
}
