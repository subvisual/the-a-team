import * as gh from './gh.mjs'
import { isClaimed } from './core/claim.mjs'
import { reviewedShas, cycleCount, linkedIssueNumber } from './review-pr.mjs'

/**
 * Everything below is re-derived from GitHub. Nothing here reads local state,
 * which is what makes a restart free (RUNNER.md decision 15).
 */
export async function repoStatus(repo, cfg, labels) {
  const phase = [labels.running, labels.needsDetail, labels.changesRequested, labels.approved, labels.failed]
  const issues = await gh.listIssues(repo, { state: 'open' })
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
  for (const p of await gh.listPRs(repo)) {
    if (!p.headRefName?.startsWith(cfg.branchPrefix)) continue
    const full = await gh.viewPR(repo, p.number)
    prs.push({
      number: full.number,
      head: full.headRefOid.slice(0, 8),
      issue: linkedIssueNumber(full, cfg.branchPrefix),
      cycles: cycleCount(full),
      reviewed: reviewedShas(full).has(full.headRefOid),
      url: full.url,
    })
  }

  return { repo, issues: tracked, prs }
}

export function renderStatus({ repo, issues, prs }) {
  const out = [`# ${repo}`, '']
  if (!issues.length) out.push('no tracked issues', '')
  for (const i of issues) {
    out.push(`  #${String(i.number).padEnd(5)} ${i.phase.padEnd(26)} ${i.claimed ? '[locked] ' : ''}${i.title}`)
  }
  out.push('')
  if (!prs.length) out.push('  no agent PRs open')
  for (const p of prs) {
    out.push(`  PR #${String(p.number).padEnd(5)} ${p.head}  issue #${p.issue ?? '?'}  cycles=${p.cycles}  ${p.reviewed ? 'reviewed' : 'AWAITING REVIEW'}`)
  }
  out.push('')
  return out.join('\n')
}
