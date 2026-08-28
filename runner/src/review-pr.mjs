import { existsSync } from 'node:fs'
import * as gh from './gh.mjs'
import { addWorktree, removeWorktree, revParse, git } from './git.mjs'
import { worktreePath, runDir as runDirFor, stamp, ensureDir } from './paths.mjs'
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
export async function reviewPullRequest({ repo, repoPath, pr, cfg, labels, force = false }) {
  const head = pr.headRefOid
  if (!force && reviewedShas(pr).has(head)) {
    return { skipped: true, reason: 'sha already reviewed', pr: pr.number }
  }

  const issueNumber = linkedIssueNumber(pr, cfg.branchPrefix)
  if (!issueNumber) {
    return { skipped: true, reason: 'no linked issue', pr: pr.number }
  }

  const raw = await gh.viewIssue(repo, issueNumber)
  const issue = normaliseIssue(raw)
  if (!issue.acceptanceCriteria.length) {
    return { skipped: true, reason: `issue #${issueNumber} has no acceptance criteria`, pr: pr.number }
  }

  const cycle = cycleCount(pr) + 1
  const worktree = worktreePath(repo, `pr-${pr.number}`)
  const dir = ensureDir(runDirFor(repo, `pr-${pr.number}`, stamp()))

  await git(repoPath, ['fetch', '--prune', 'origin'], { check: false })
  if (existsSync(worktree)) await removeWorktree(repoPath, worktree)
  await addWorktree(repoPath, worktree, `review/pr-${pr.number}-${head.slice(0, 8)}`, head)

  try {
    const baseSha = await revParse(repoPath, `origin/${pr.baseRefName}`)
    const verdict = await review({
      issue, base: baseSha, head, worktree,
      testCommand: cfg.testCommand,
      model: cfg.reviewerModel,
      budgetUsd: cfg.reviewerBudgetUsd,
      runDir: dir,
      cycle,
      repoPath,
    })

    const body = verdictBody({ ...verdict, cycle, marker: gh.verdictMarker(head, cycle) })
    const via = await gh.postVerdict(repo, pr.number, {
      event: verdict.verdict === 'approve' ? 'approve' : 'request-changes',
      body,
    })
    log.info('verdict.posted', { repo, pr: pr.number, via, verdict: verdict.verdict, cycle })

    const phase = verdict.verdict === 'approve' ? labels.approved : labels.changesRequested
    const all = [labels.running, labels.needsDetail, labels.changesRequested, labels.approved, labels.failed]
    await gh.setPhaseLabel(repo, issueNumber, phase, all)
    await gh.removeLabels(repo, issueNumber, [labels.ready])

    return { pr: pr.number, issue: issueNumber, verdict: verdict.verdict, cycle, costUsd: verdict.costUsd }
  } finally {
    await removeWorktree(repoPath, worktree)
  }
}
