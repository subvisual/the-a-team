import { budgetReadiness } from './core/budget.mjs'
// Read-only command planning. Keep this boundary independent of setup and
// execution adapters: a preview must never obtain context by creating it.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { repoEntry } from './config.mjs'
import { clonePath, configPath } from './paths.mjs'
import { run } from './sh.mjs'
import * as gh from './gh.mjs'
import { normaliseIssue, PHASE_LABELS } from './adapters/github.mjs'
import { parseIssuesFile, validateIssues, resolveLocalBase } from './adapters/local.mjs'
import { linkedIssueNumber } from './review-pr.mjs'
import { isClaimed } from './core/claim.mjs'
import { rebuildLocalState } from './core/local-recovery.mjs'
import { resolvePolicy } from './policy.mjs'
import { criteriaDigest, validateApprovalRecord } from './core/approval.mjs'
import { authenticatedReviews } from './core/provenance.mjs'

function prerequisite(code, message, details = {}) {
  return { code, message, ...details }
}

async function describeTarget(repo, args, cfg, command) {
  repo = repo.toLowerCase()
  const entry = repoEntry(cfg, repo)
  const repoPath = resolve(args.path || entry.path || clonePath(repo))
  const prerequisites = []
  if (!existsSync(join(repoPath, '.git'))) {
    prerequisites.push(
      prerequisite('missing-clone', `clone not available: ${repoPath}`, { repo, path: repoPath }),
    )
  }
  let base = args.base || entry.base || (await gh.defaultBranch(repo))
  let policy = null
  if (!prerequisites.length) {
    try {
      policy = await resolvePolicy({
        repoPath,
        repo,
        base: args.base,
        cfg: { ...cfg, ...entry, base },
        authorization: cfg.authorization,
      })
      base = policy.target.base
      budgetReadiness({ repo, policy })
    } catch (err) {
      prerequisites.push(prerequisite('policy-conflict', err.message))
    }
  }
  return {
    repo,
    repoPath,
    base,
    policy,
    prerequisites,
    actions: ['check-base-policy', ...(command === 'review' ? [] : ['ensure-labels'])],
  }
}

function issueCandidate(
  issue,
  target,
  cfg,
  { blockers = [], prerequisites = [], implemented = false } = {},
) {
  const missing = [...target.prerequisites, ...prerequisites]
  const candidate = {
    kind: 'issue',
    repo: target.repo,
    issue: issue.key,
    title: issue.title,
    disposition: 'ready',
    reason: null,
    blockers,
    prerequisites: missing,
    branch: `${cfg.branchPrefix}${issue.key}`,
    actions: [
      'claim',
      'create-private-checkout',
      'execute',
      ...(target.source === 'local'
        ? ['review', 'verify-committed-revision', 'report-branch']
        : [
            'push-branch',
            'open-pr',
            'review',
            'verify-committed-revision',
            'post-verdict',
            'update-labels',
          ]),
    ],
  }
  if (implemented) {
    return { ...candidate, disposition: 'skipped', reason: 'already implemented', actions: [] }
  }
  if (!issue.acceptanceCriteria.length) {
    return {
      ...candidate,
      disposition: 'malformed',
      reason: 'no checkable acceptance criteria',
      actions: ['request-detail'],
    }
  }
  if (missing.length)
    return {
      ...candidate,
      disposition: 'blocked',
      reason: missing.map((p) => p.message).join('; '),
    }
  if (blockers.length)
    return {
      ...candidate,
      disposition: 'blocked',
      reason: `blocked by ${blockers.join(', ')}`,
      actions: ['wait-for-dependencies'],
    }
  if (isClaimed(target.repo, issue.key)) {
    return {
      ...candidate,
      disposition: 'blocked',
      reason: 'already claimed',
      actions: ['wait-for-claim'],
    }
  }
  return candidate
}

async function githubIssueCandidate(issue, target, cfg) {
  const blockers = []
  const prerequisites = []
  // Missing criteria take precedence in the actual issue loop as well.
  if (issue.acceptanceCriteria.length) {
    for (const number of issue.blockedBy) {
      try {
        const other = await gh.viewIssue(target.repo, number)
        if (other.state === 'OPEN') blockers.push(number)
        else if (other.state !== 'CLOSED')
          prerequisites.push(
            prerequisite('unknown-blocker', `cannot determine state of issue #${number}`, {
              issue: number,
            }),
          )
      } catch (err) {
        prerequisites.push(
          prerequisite('unavailable-blocker', `cannot inspect blocker #${number}: ${err.message}`, {
            issue: number,
          }),
        )
      }
    }
  }
  return issueCandidate(issue, target, cfg, { blockers, prerequisites })
}

async function reviewCandidate(pr, target, cfg, force) {
  const candidate = {
    kind: 'review',
    repo: target.repo,
    pr: pr.number,
    head: pr.headRefOid,
    disposition: 'ready',
    reason: null,
    prerequisites: [...target.prerequisites],
    actions: [
      'create-private-checkout',
      'review',
      'verify-committed-revision',
      'post-verdict',
      'update-labels',
    ],
  }
  const number = linkedIssueNumber(pr, cfg.branchPrefix)
  if (!number)
    return { ...candidate, disposition: 'skipped', reason: 'no linked issue', actions: [] }
  candidate.issue = String(number)
  const issue = normaliseIssue(await gh.viewIssue(target.repo, number))
  if (!issue.acceptanceCriteria.length)
    return {
      ...candidate,
      disposition: 'malformed',
      reason: `issue #${number} has no acceptance criteria`,
      actions: [],
    }
  if (
    !force &&
    target.policy &&
    pr.baseRefName === target.policy.target.base &&
    pr.baseRefOid === target.policy.target.baseSha
  ) {
    const context = {
      repo: target.repo,
      issue,
      head: pr.headRefOid,
      baseSha: pr.baseRefOid,
      policy: target.policy,
    }
    const authentication = await authenticatedReviews({
      ...context,
      pr,
      prNumber: pr.number,
      model: cfg.reviewerModel,
      criteriaDigest: criteriaDigest(issue),
      gh,
      validateApproval: (record) => validateApprovalRecord(record, context).valid,
    })
    candidate.ignoredEvidence = authentication.ignored
    if (authentication.completed.length)
      return {
        ...candidate,
        disposition: 'skipped',
        reason: 'authenticated completed review already exists',
        actions: [],
      }
  }
  if (!pr.headRefOid || !pr.baseRefName) {
    candidate.prerequisites.push(
      prerequisite('missing-pr-refs', 'PR head and base refs are required'),
    )
  }
  if (candidate.prerequisites.length) {
    candidate.disposition = 'blocked'
    candidate.reason = candidate.prerequisites.map((p) => p.message).join('; ')
  }
  return candidate
}

async function localPlan(args, cfg) {
  const issuesFile = resolve(args.issues)
  const repoPath = resolve(args.path || process.cwd())
  const prerequisites = []
  const available = existsSync(join(repoPath, '.git'))
  if (!available)
    prerequisites.push(
      prerequisite('missing-clone', `local repository not available: ${repoPath}`, {
        path: repoPath,
      }),
    )
  if (!existsSync(issuesFile) || !statSync(issuesFile).isFile()) {
    prerequisites.push(
      prerequisite('missing-issues-file', `issues file not available: ${issuesFile}`, {
        path: issuesFile,
      }),
    )
  }
  let base = args.base || cfg.base || null
  let policy = null
  if (available) {
    try {
      policy = await resolveLocalBase({
        repoPath,
        base: args.base,
        cfg,
        authorization: cfg.authorization,
      })
      base = policy.target.base
    } catch (err) {
      prerequisites.push(
        prerequisite(err.code === 'missing-local-base' ? err.code : 'policy-conflict', err.message),
      )
    }
  }
  const target = {
    source: 'local',
    repo: repoPath,
    repoPath,
    base,
    policy,
    prerequisites,
    actions: ['check-base-policy'],
  }
  const plan = { dryRun: true, targets: [target], candidates: [], prerequisites, actions: [] }
  if (prerequisites.some((p) => p.code === 'missing-issues-file')) return plan
  let batch = parseIssuesFile(readFileSync(issuesFile, 'utf8'))
  try {
    batch = validateIssues(batch)
  } catch (err) {
    if (!err.diagnostics) throw err
    prerequisites.push(
      ...err.diagnostics.map((d) => prerequisite(d.code, d.message, { issue: d.issue })),
    )
  }
  let state = null
  if (policy && !prerequisites.length) {
    try {
      state = await rebuildLocalState({ repoPath, issues: batch, policy })
      target.continuationBase = state.base
      target.deliveryBase = state.deliveryBase
      budgetReadiness({ repo: repoPath, policy })
    } catch (error) {
      prerequisites.push(
        prerequisite(error.failureCategory || error.code || 'unavailable-history', error.message),
      )
    }
  }
  const issues = batch.filter((i) => !args.issue || i.key === args.issue)
  if (args.issue && !issues.length)
    prerequisites.push(
      prerequisite('missing-issue', `issue not found in ${issuesFile}: ${args.issue}`),
    )
  for (const issue of issues) {
    const recovered = state?.issues[issue.key]
    const pending =
      recovered &&
      ['action-uncertain', 'cycle-exhausted', 'budget-exhausted', 'missing-checkout'].includes(
        recovered.status,
      )
        ? [prerequisite(recovered.status, recovered.reason || recovered.status)]
        : []
    const candidate = issueCandidate(issue, target, cfg, {
      blockers: recovered?.blockers || issue.dependsOn,
      prerequisites: pending,
      implemented: !!recovered?.approved,
    })
    if (recovered?.approved)
      candidate.reason = recovered.integrated
        ? 'approved revision integrated into delivery base'
        : 'approved revision available on retained chain'
    candidate.recovery = recovered
      ? {
          status: recovered.status,
          head: recovered.head,
          integrated: recovered.integrated,
          selected: recovered.selected,
          claim: recovered.claim,
          lifetime: recovered.history.lifetime,
        }
      : null
    plan.candidates.push(candidate)
  }
  return plan
}

export async function planCommand(command, args, cfg, labels) {
  if (command === 'init') {
    const path = configPath()
    return {
      dryRun: true,
      targets: [],
      candidates: [],
      prerequisites: [],
      actions: [{ action: 'write-config', path, overwrite: existsSync(path) }],
    }
  }
  if (command === 'run' && args.source === 'local') return localPlan(args, cfg)
  const repos = args.repos.length ? args.repos : (cfg.repos || []).map((r) => r.repo)
  const plan = { dryRun: true, targets: [], candidates: [], prerequisites: [], actions: [] }
  for (const repo of repos) {
    const target = await describeTarget(repo, args, cfg, command)
    plan.targets.push(target)
    plan.prerequisites.push(...target.prerequisites)
    if (command === 'run') {
      const issue = normaliseIssue(await gh.viewIssue(repo, Number(args.issue)))
      plan.candidates.push(await githubIssueCandidate(issue, target, cfg))
    } else if (command === 'review') {
      plan.candidates.push(
        await reviewCandidate(await gh.viewPR(repo, Number(args.pr)), target, cfg, args.force),
      )
    } else if (command === 'watch') {
      for (const pr of await gh.listPRs(repo)) {
        if (!pr.headRefName?.startsWith(cfg.branchPrefix)) continue
        plan.candidates.push(
          await reviewCandidate(await gh.viewPR(repo, pr.number), target, cfg, false),
        )
      }
      const issues = (await gh.listIssues(repo, { label: labels.ready }))
        .map(normaliseIssue)
        .filter(
          (i) => !i.labels.some((l) => l !== labels.ready && PHASE_LABELS(labels).includes(l)),
        )
        .sort((a, b) => a.number - b.number)
      for (const [index, issue] of issues.entries()) {
        plan.candidates.push({
          ...(await githubIssueCandidate(issue, target, cfg)),
          selected: index === 0,
        })
      }
    }
  }
  return plan
}

export function renderPlan(plan) {
  const lines = ['Plan (dry run):']
  for (const action of plan.actions)
    lines.push(`  ${action.action}: ${action.path}${action.overwrite ? ' (replace existing)' : ''}`)
  for (const target of plan.targets)
    lines.push(
      `  target: ${target.repo} at ${target.repoPath} (base: ${target.base || 'unavailable'})`,
    )
  for (const missing of plan.prerequisites) lines.push(`  prerequisite: ${missing.message}`)
  for (const candidate of plan.candidates) {
    const name = candidate.kind === 'review' ? `PR #${candidate.pr}` : `issue ${candidate.issue}`
    lines.push(
      `  ${candidate.disposition.padEnd(10)} ${name}${candidate.reason ? ` — ${candidate.reason}` : ''}`,
    )
    if (candidate.actions.length) lines.push(`    would: ${candidate.actions.join(', ')}`)
    for (const evidence of candidate.ignoredEvidence || [])
      lines.push(`    ignored evidence: ${evidence.reason}`)
  }
  if (!plan.candidates.length && !plan.actions.length) lines.push('  no candidates')
  return `${lines.join('\n')}\n`
}
