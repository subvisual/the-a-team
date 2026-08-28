import { readFileSync } from 'node:fs'
import { acceptanceCriteria } from '../issue.mjs'
import { run } from '../sh.mjs'
import { log } from '../log.mjs'

export function slugify(title) {
  return String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/**
 * Parse an issues.md in the shape prd-to-issues / ticket-writer produce:
 * `## <title>`, an optional `**Depends on:**` line, then `### Description`,
 * `### Acceptance criteria`, `### Technical notes`.
 *
 * Only sections carrying an acceptance-criteria subsection are issues — that
 * is what separates them from a leading dependency-graph summary.
 */
export function parseIssuesFile(text) {
  const lines = String(text).split(/\r?\n/)
  const sections = []
  let current = null

  for (const line of lines) {
    const h2 = line.match(/^##\s+(?!#)(.+?)\s*$/)
    if (h2) {
      if (current) sections.push(current)
      current = { title: h2[1].replace(/^\[|\]$/g, '').trim(), lines: [] }
      continue
    }
    if (line.match(/^#\s+(?!#)/)) { if (current) sections.push(current); current = null; continue }
    if (current) current.lines.push(line)
  }
  if (current) sections.push(current)

  return sections
    .map((s) => {
      const body = s.lines.join('\n').trim()
      const criteria = acceptanceCriteria(body)
      const deps = (body.match(/\*\*Depends on:\*\*\s*(.+)/i)?.[1] || '')
        .split(/\s*,\s*/)
        .map((d) => d.replace(/^\[|\]$/g, '').trim())
        .filter((d) => d && !/^none$/i.test(d))
      return {
        key: slugify(s.title),
        title: s.title,
        body,
        acceptanceCriteria: criteria,
        dependsOn: deps,
        blockedBy: [],
      }
    })
    .filter((i) => i.acceptanceCriteria.length > 0 || /###\s*acceptance\s+criteria/i.test(i.body))
}

async function implementedTitles(repoPath) {
  const { stdout } = await run('git', ['log', '--all', '--pretty=%B'], { cwd: repoPath, check: false })
  return stdout
}

/**
 * The pipeline's front-end. No network, no PRs: the dev phase's serialized
 * integration and single feature PR stay orchestrator-owned (RUNNER.md,
 * decision 12). Approved branches are left in place and reported.
 */
export function createLocalAdapter({ issuesFile, repoPath, base, testCommand }) {
  const issues = parseIssuesFile(readFileSync(issuesFile, 'utf8'))
  const report = []

  return {
    name: 'local',
    repo: repoPath,
    repoPath,
    base,
    testCommand,
    issues,
    report,

    async listCandidates() {
      const log_ = await implementedTitles(repoPath)
      return issues.filter((i) => !log_.includes(`Implements issue: ${i.title}`))
    },

    async openBlockers(issue) {
      if (!issue.dependsOn.length) return []
      const log_ = await implementedTitles(repoPath)
      return issue.dependsOn.filter((t) => !log_.includes(`Implements issue: ${t}`))
    },

    async onNeedsDetail(issue, reason) {
      report.push({ issue: issue.key, title: issue.title, outcome: 'needs-detail', reason })
      log.warn('local.needs_detail', { issue: issue.key, reason })
    },

    async onImplemented(issue, { branch }) {
      // No push, no PR — the orchestrator integrates.
      return { branch }
    },

    async onVerdict(issue, ctx, verdict) {
      log.info('local.verdict', { issue: issue.key, cycle: ctx.cycle, verdict: verdict.verdict })
    },

    async onApproved(issue, ctx, verdict) {
      // Serial chaining: the next issue bases on this one's approved branch,
      // so a dependent issue sees its dependency's work without a merge
      // (RUNNER.md decision 16). The orchestrator integrates the chain.
      this.base = ctx.branch
      report.push({
        issue: issue.key, title: issue.title, outcome: 'approved',
        branch: ctx.branch, head: ctx.head, cycles: ctx.cycle, notes: verdict?.notes,
      })
    },

    async onFailed(issue, ctx, reason) {
      report.push({ issue: issue.key, title: issue.title, outcome: 'failed', branch: ctx?.branch, reason })
    },
  }
}
