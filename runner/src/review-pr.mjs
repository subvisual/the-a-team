import {
  requirePolicy,
  evaluateRevision,
  assertApprovalCurrent,
  findDeliveredApprovalRecord,
  findDeliveredNonapprovalRecord,
  recordNonapprovalDelivery,
  recordDelivery,
  criteriaDigest,
} from './core/approval.mjs'
import { assertSandboxAvailable } from './sandbox.mjs'
import * as gh from './gh.mjs'
import { revParse } from './git.mjs'
import { runDir as runDirFor, stamp, ensureDir } from './paths.mjs'
import { normaliseIssue } from './adapters/github.mjs'
import { review, verdictBody } from './core/review.mjs'
import { log } from './log.mjs'

export function reviewedShas(pr) {
  const bodies = [
    ...(pr.comments || []).map((c) => c.body),
    ...(pr.reviews || []).map((r) => r.body),
  ]
  return new Set(gh.parseVerdictMarkers(bodies).map((m) => m.sha))
}

export function cycleCount(pr) {
  const bodies = [
    ...(pr.comments || []).map((c) => c.body),
    ...(pr.reviews || []).map((r) => r.body),
  ]
  const markers = gh.parseVerdictMarkers(bodies)
  return markers.length ? Math.max(...markers.map((m) => m.cycle)) : 0
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
export async function reviewPullRequest({
  repo,
  repoPath,
  pr,
  cfg,
  labels,
  force = false,
  deps = {},
}) {
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
    const delivered =
      !force &&
      (findDeliveredApprovalRecord(repo, `pr-${pr.number}`, deliveryContext) ||
        findDeliveredApprovalRecord(repo, issue.key, deliveryContext))
    if (delivered) {
      if (pr.baseRefOid !== baseSha)
        throw new Error('current remote base is required before reusing an approval')
      await assertApprovalCurrent(delivered, { repo, issue, head, baseSha, policy, repoPath })
      return {
        skipped: true,
        reason: 'current delivered approval record already exists',
        pr: pr.number,
      }
    }
    const negative =
      !force &&
      (findDeliveredNonapprovalRecord(repo, `pr-${pr.number}`, deliveryContext) ||
        findDeliveredNonapprovalRecord(repo, issue.key, deliveryContext))
    if (negative && pr.baseRefOid === baseSha)
      return {
        skipped: true,
        reason: 'current delivered negative review already exists',
        pr: pr.number,
        previousVerdict: negative.verdict.verdict,
      }
    if (!deps.review) await assertSandboxAvailable(policy)
    const cycle = cycleCount(pr) + 1
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
    const via = await github.postVerdict(repo, pr.number, {
      event: verdict.verdict === 'approve' ? 'approve' : 'request-changes',
      body,
      headSha: head,
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
    await github.setPhaseLabel(repo, issueNumber, phase, all)
    await github.removeLabels(repo, issueNumber, [labels.ready])
    return {
      pr: pr.number,
      issue: issueNumber,
      verdict: verdict.verdict,
      cycle,
      costUsd: verdict.costUsd,
      approvalPath: evaluation.approvalPath,
      deliveryPath,
    }
  } catch (error) {
    log.warn('review.refused', { repo, pr: pr.number, reason: error.message })
    return {
      pr: pr.number,
      issue: issueNumber,
      verdict: 'blocked',
      reason: error.message,
      verificationPath: error.verificationPath,
    }
  }
}
