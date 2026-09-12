import { budgetStatus } from './core/budget.mjs'
import { readEvents, replayIssue } from './core/history.mjs'
import * as gh from './gh.mjs'
import { isClaimed } from './core/claim.mjs'
import { cycleCount, linkedIssueNumber } from './review-pr.mjs'
import { normaliseIssue } from './adapters/github.mjs'
import {
  approvalRecords,
  validateApprovalRecord,
  requirePolicy,
  hasDeliveryReceipt,
  criteriaDigest,
} from './core/approval.mjs'
import { authenticatedReviews, reviewEvidenceRecords } from './core/provenance.mjs'
import { resolvePolicy } from './policy.mjs'
import { clonePath } from './paths.mjs'
import { revParse } from './git.mjs'

/**
 * GitHub labels describe observed remote state. Current approval additionally
 * requires local immutable evidence matching current repository and issue inputs.
 */
export async function repoStatus(repo, cfg, labels, deps = {}) {
  repo = repo.toLowerCase()
  const github = deps.gh || gh
  const phase = [
    labels.running,
    labels.needsDetail,
    labels.changesRequested,
    labels.approved,
    labels.failed,
  ]
  const issues = await github.listIssues(repo, { state: 'open' })
  const tracked = issues
    .map((i) => ({
      number: i.number,
      title: i.title,
      labels: (i.labels || []).map((l) => l.name),
    }))
    .filter((i) => i.labels.some((l) => l === labels.ready || phase.includes(l)))
    .map((i) => ({
      ...i,
      phase: i.labels.find((l) => phase.includes(l)) || labels.ready,
      claimed: isClaimed(repo, i.number),
    }))

  const prs = []
  for (const p of await github.listPRs(repo)) {
    if (!p.headRefName?.startsWith(cfg.branchPrefix)) continue
    const full = await github.viewPR(repo, p.number)
    const number = linkedIssueNumber(full, cfg.branchPrefix)
    let approvalValid = false
    let completedReviews = []
    let approvalReason = 'no current immutable approval record'
    try {
      const issue = normaliseIssue(await github.viewIssue(repo, number))
      const records = [
        ...approvalRecords(repo, issue.key),
        ...approvalRecords(repo, `pr-${full.number}`),
      ].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      const entry = (cfg.repos || []).find((r) => r.repo === repo) || {}
      const reviewRecords = reviewEvidenceRecords(repo, [issue.key, `pr-${full.number}`])
      const priorPolicy = [...records, ...reviewRecords].sort((a, b) =>
        String(b.createdAt).localeCompare(String(a.createdAt)),
      )[0]
      const path = cfg.statusPath || entry.path || cfg.policy?.target.root || clonePath(repo)
      const policy = cfg.policy
        ? requirePolicy(cfg, path)
        : await resolvePolicy({
            repoPath: path,
            repo,
            base: full.baseRefName,
            cfg: {
              ...cfg,
              ...entry,
              invocationActions:
                priorPolicy?.policy?.supervisor?.actions || priorPolicy?.supervisorActions || [],
            },
            authorization: cfg.authorization || {},
          })
      const context = { repo, issue, head: full.headRefOid, baseSha: full.baseRefOid, policy }
      const authentication = await authenticatedReviews({
        ...context,
        pr: full,
        prNumber: full.number,
        model: cfg.reviewerModel,
        criteriaDigest: criteriaDigest(issue),
        gh: github,
        validateApproval: (record) => validateApprovalRecord(record, context).valid,
      })
      completedReviews = authentication.completed
      const current = records.find(
        (record) =>
          validateApprovalRecord(record, context).valid &&
          hasDeliveryReceipt(record, { repo, prNumber: full.number }),
      )
      if (
        current &&
        completedReviews.some((r) => r.verdict.verdict === 'approve') &&
        (await revParse(path, policy.target.base)) === full.baseRefOid
      ) {
        approvalValid = true
        approvalReason = null
      } else if (authentication.ignored.length) approvalReason = authentication.ignored[0].reason
      else if (records.length)
        approvalReason =
          validateApprovalRecord(records[0], context).reason ||
          (hasDeliveryReceipt(records[0], { repo, prNumber: full.number })
            ? 'approval base changed'
            : 'approval delivery receipt is missing or invalid')
    } catch (error) {
      approvalReason = error.message
    }
    prs.push({
      number: full.number,
      head: full.headRefOid.slice(0, 8),
      issue: number,
      cycles: cycleCount(full, completedReviews),
      reviewed: completedReviews.length > 0,
      approvalValid,
      approvalReason,
      url: full.url,
    })
  }

  for (const issue of tracked) {
    try {
      issue.history = replayIssue(readEvents(repo, String(issue.number)))
    } catch (error) {
      issue.history = { status: 'history-corrupt', reason: error.message }
    }
    if (
      issue.phase === labels.approved &&
      !prs.some((pr) => pr.issue === issue.number && pr.approvalValid)
    ) {
      issue.observedPhase = issue.phase
      issue.phase = 'approval-invalid'
    }
  }
  let budget
  try {
    budget = budgetStatus(repo)
  } catch (error) {
    budget = { failureCategory: 'accounting-uncertain', reason: error.message }
  }
  return { repo, issues: tracked, prs, budget }
}

export function renderStatus({ repo, issues, prs, budget }) {
  const out = [`# ${repo}`, '']
  if (budget)
    out.push(
      budget.reason
        ? `Budget: ${budget.reason}`
        : `Budget: $${budget.spentUsd} spent, $${budget.remainingUsd} remaining; lifetime known spend $${budget.lifetimeSpentUsd}; unknown costs ${budget.lifetimeUnknownCosts}; unresolved launches ${budget.lifetimePendingLaunches.length}`,
      '',
    )
  if (!issues.length) out.push('no tracked issues', '')
  for (const i of issues) {
    out.push(
      `  #${String(i.number).padEnd(5)} ${i.phase.padEnd(26)} ${i.claimed ? '[locked] ' : ''}${i.title}${i.history?.status ? ` [${i.history.status}]` : ''}`,
    )
  }
  out.push('')
  if (!prs.length) out.push('  no agent PRs open')
  for (const p of prs) {
    out.push(
      `  PR #${String(p.number).padEnd(5)} ${p.head}  issue #${p.issue ?? '?'}  cycles=${p.cycles}  ${p.reviewed ? 'reviewed' : 'AWAITING REVIEW'}`,
    )
  }
  out.push('')
  return out.join('\n')
}
