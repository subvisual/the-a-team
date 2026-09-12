import * as gh from './gh.mjs'
import { isClaimed } from './core/claim.mjs'
import { cycleCount, linkedIssueNumber } from './review-pr.mjs'
import { normaliseIssue } from './adapters/github.mjs'
import {
  approvalRecords,
  validateApprovalRecord,
  requirePolicy,
  hasDeliveryReceipt,
} from './core/approval.mjs'
import { resolvePolicy } from './policy.mjs'
import { clonePath } from './paths.mjs'
import { revParse } from './git.mjs'

/**
 * GitHub labels describe observed remote state. Current approval additionally
 * requires local immutable evidence matching current repository and issue inputs.
 */
export async function repoStatus(repo, cfg, labels, deps = {}) {
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
    let approvalReason = 'no current immutable approval record'
    try {
      const issue = normaliseIssue(await github.viewIssue(repo, number))
      const records = [
        ...approvalRecords(repo, issue.key),
        ...approvalRecords(repo, `pr-${full.number}`),
      ].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      const entry = (cfg.repos || []).find((r) => r.repo === repo) || {}
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
              invocationActions: records[0]?.policy?.supervisor?.actions || [],
            },
            authorization: cfg.authorization || {},
          })
      const context = { repo, issue, head: full.headRefOid, baseSha: full.baseRefOid, policy }
      const current = records.find(
        (record) =>
          validateApprovalRecord(record, context).valid &&
          hasDeliveryReceipt(record, { repo, prNumber: full.number }),
      )
      if (current && (await revParse(path, policy.target.base)) === full.baseRefOid) {
        approvalValid = true
        approvalReason = null
      } else if (records.length)
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
      cycles: cycleCount(full),
      reviewed: approvalValid,
      approvalValid,
      approvalReason,
      url: full.url,
    })
  }

  for (const issue of tracked) {
    if (
      issue.phase === labels.approved &&
      !prs.some((pr) => pr.issue === issue.number && pr.approvalValid)
    ) {
      issue.observedPhase = issue.phase
      issue.phase = 'approval-invalid'
    }
  }
  return { repo, issues: tracked, prs }
}

export function renderStatus({ repo, issues, prs }) {
  const out = [`# ${repo}`, '']
  if (!issues.length) out.push('no tracked issues', '')
  for (const i of issues) {
    out.push(
      `  #${String(i.number).padEnd(5)} ${i.phase.padEnd(26)} ${i.claimed ? '[locked] ' : ''}${i.title}`,
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
