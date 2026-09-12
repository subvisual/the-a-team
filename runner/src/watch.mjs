import * as gh from './gh.mjs'
import { sleep } from './sh.mjs'
import { log } from './log.mjs'
import { runIssue } from './core/loop.mjs'
import { createGithubAdapter } from './adapters/github.mjs'
import { reviewPullRequest } from './review-pr.mjs'

let stopping = false
export function requestStop() {
  stopping = true
}

async function outstandingPRs(repo, cfg) {
  const prs = await gh.listPRs(repo)
  const mine = prs.filter((p) => p.headRefName?.startsWith(cfg.branchPrefix))
  const out = []
  for (const p of mine) {
    const full = await gh.viewPR(repo, p.number)
    // The review entrypoint validates current evidence. A marker for this head
    // says nothing about changed criteria/base or whether approval was delivered.
    out.push(full)
  }
  return out
}

/**
 * One tick: finish outstanding review work first, then take the next issue.
 * Serial by design — concurrency 1 means each issue's base is the previous
 * one's merged result (RUNNER.md decision 16).
 */
export async function tick({ targets, cfg, labels }) {
  const results = []

  for (const t of targets) {
    if (stopping) break
    try {
      for (const pr of await outstandingPRs(t.repo, cfg)) {
        if (stopping) break
        log.info('watch.pr', { repo: t.repo, pr: pr.number, sha: pr.headRefOid.slice(0, 8) })
        results.push(
          await reviewPullRequest({
            repo: t.repo,
            repoPath: t.repoPath,
            pr,
            cfg: { ...cfg, policy: t.policy },
            labels,
          }),
        )
      }
    } catch (err) {
      log.error('watch.pr_error', { repo: t.repo, error: err.message })
      results.push({ outcome: 'failed', repo: t.repo, stage: 'review', reason: err.message })
    }
  }

  for (const t of targets) {
    if (stopping) break
    try {
      const adapter = createGithubAdapter({ ...t, labels })
      const candidates = await adapter.listCandidates()
      if (!candidates.length) continue
      const issue = candidates[0]
      log.info('watch.issue', { repo: t.repo, issue: issue.key, title: issue.title })
      results.push(await runIssue({ adapter, issue, cfg: { ...cfg, policy: t.policy } }))
    } catch (err) {
      log.error('watch.issue_error', { repo: t.repo, error: err.message })
      results.push({ outcome: 'failed', repo: t.repo, stage: 'issue', reason: err.message })
    }
  }

  return results
}

export async function watch({ targets, cfg, labels, once = false }) {
  stopping = false
  log.info('watch.start', {
    repos: targets.map((t) => t.repo).join(','),
    poll: cfg.pollSeconds,
    cycles: cfg.maxCycles,
  })
  for (const t of targets) {
    const adapter = createGithubAdapter({ ...t, labels })
    await adapter
      .ensureLabels()
      .catch((err) => log.warn('labels.ensure_failed', { repo: t.repo, error: err.message }))
  }

  const onSignal = () => {
    log.info('watch.stopping')
    requestStop()
  }
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)

  let results = []
  try {
    while (!stopping) {
      results = await tick({ targets, cfg, labels })
      if (results.length === 0) log.info('watch.idle', { repos: targets.length })
      if (once) break
      for (let i = 0; i < cfg.pollSeconds && !stopping; i += 1) await sleep(1000)
    }
    return results
  } finally {
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
    log.info('watch.stopped')
  }
}
