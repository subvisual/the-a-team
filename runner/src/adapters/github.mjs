import * as gh from '../gh.mjs'
import { push } from '../git.mjs'
import { acceptanceCriteria, blockedBy } from '../issue.mjs'
import { verdictBody } from '../core/review.mjs'
import { log } from '../log.mjs'

export const PHASE_LABELS = (labels) => [
  labels.running,
  labels.needsDetail,
  labels.changesRequested,
  labels.approved,
  labels.failed,
]

export const LABEL_DEFINITIONS = (labels) => [
  [labels.ready, '0e8a16', 'Agent may pick this issue up'],
  [labels.running, 'fbca04', 'Claimed by the runner; executor in flight'],
  [labels.needsDetail, 'd93f0b', 'Refused: no checkable acceptance criteria'],
  [labels.changesRequested, 'e99695', 'Independent reviewer requested changes'],
  [labels.approved, '0e8a16', 'Reviewer approved; awaiting a human merge'],
  [labels.failed, 'b60205', 'Runner gave up; needs a human'],
]

export function normaliseIssue(raw) {
  return {
    key: String(raw.number),
    number: raw.number,
    title: raw.title,
    body: raw.body || '',
    url: raw.url,
    labels: (raw.labels || []).map((l) => l.name),
    acceptanceCriteria: acceptanceCriteria(raw.body),
    blockedBy: blockedBy(raw.body),
  }
}

export function createGithubAdapter({ repo, repoPath, base, labels, testCommand }) {
  return {
    name: 'github',
    repo,
    repoPath,
    base,
    testCommand,

    async listCandidates() {
      const raw = await gh.listIssues(repo, { label: labels.ready })
      return (
        raw
          .map(normaliseIssue)
          // A phase label means the runner already reached a terminal state here.
          .filter(
            (i) => !i.labels.some((l) => l !== labels.ready && PHASE_LABELS(labels).includes(l)),
          )
          .sort((a, b) => a.number - b.number)
      )
    },

    async openBlockers(issue) {
      const open = []
      for (const n of issue.blockedBy) {
        const other = await gh.viewIssue(repo, n).catch(() => null)
        if (other && other.state === 'OPEN') open.push(n)
      }
      return open
    },

    async onNeedsDetail(issue, reason) {
      await gh.setPhaseLabel(repo, issue.number, labels.needsDetail, PHASE_LABELS(labels))
      await gh.removeLabels(repo, issue.number, [labels.ready])
      await gh.commentIssue(
        repo,
        issue.number,
        [
          '## Not picked up — no checkable acceptance criteria',
          '',
          reason,
          '',
          'The runner refuses issues it cannot verify: an independent reviewer has to be able to check the diff',
          'against a concrete list, and prose does not give it one. Add a section like:',
          '',
          '```markdown',
          '## Acceptance criteria',
          '',
          '- [ ] Given <state>, when <action>, then <observable outcome>',
          '```',
          '',
          `Then re-apply \`${labels.ready}\`.`,
        ].join('\n'),
      )
    },

    async onClaimed(issue, { branch }) {
      await gh.setPhaseLabel(repo, issue.number, labels.running, PHASE_LABELS(labels))
      await gh.linkBranch(repo, issue.number, branch)
    },

    async onImplemented(issue, { branch, worktree, prNumber, summary }) {
      await push(repoPath, branch)
      if (prNumber) return { prNumber }
      const body = [
        `Closes #${issue.number}`,
        '',
        '## What this implements',
        '',
        summary || '(no summary returned)',
        '',
        '## Acceptance criteria',
        '',
        ...issue.acceptanceCriteria.map((c) => `- [ ] ${c}`),
        '',
        '---',
        '',
        '🤖 Opened by `ateam-runner`. An independent reviewer session assesses this diff against the',
        'acceptance criteria above and posts its verdict below. A human owns the merge.',
      ].join('\n')
      const pr = await gh.createPR(repo, { head: branch, base, title: issue.title, body })
      log.info('pr.opened', { repo, issue: issue.key, pr: pr.number, url: pr.url })
      return { prNumber: pr.number, prUrl: pr.url }
    },

    async currentApprovalInputs(issue, ctx) {
      if (!ctx.prNumber) throw new Error('approval requires a published PR identity')
      const latestIssue = normaliseIssue(await gh.viewIssue(repo, issue.number))
      const latestPR = await gh.viewPR(repo, ctx.prNumber)
      if (latestPR.baseRefName !== base || latestPR.headRefName !== ctx.branch)
        throw new Error('PR branch or base changed before approval')
      return { issue: latestIssue, head: latestPR.headRefOid, baseSha: latestPR.baseRefOid }
    },

    async onVerdict(issue, ctx, verdict) {
      if (!ctx.prNumber) return
      const body = verdictBody({
        ...verdict,
        cycle: ctx.cycle,
        marker: gh.verdictMarker(ctx.head, ctx.cycle),
      })
      const via = await gh.postVerdict(repo, ctx.prNumber, {
        event: verdict.verdict === 'approve' ? 'approve' : 'request-changes',
        body,
        headSha: ctx.head,
      })
      log.info('verdict.posted', { repo, pr: ctx.prNumber, via, verdict: verdict.verdict })
      if (verdict.verdict !== 'approve') {
        await gh.setPhaseLabel(repo, issue.number, labels.changesRequested, PHASE_LABELS(labels))
      }
      return via
    },

    async onApproved(issue) {
      await gh.setPhaseLabel(repo, issue.number, labels.approved, PHASE_LABELS(labels))
      await gh.removeLabels(repo, issue.number, [labels.ready])
    },

    async onFailed(issue, ctx, reason) {
      await gh.setPhaseLabel(repo, issue.number, labels.failed, PHASE_LABELS(labels))
      await gh.removeLabels(repo, issue.number, [labels.ready])
      const where = ctx?.prUrl ? `\n\nPartial work: ${ctx.prUrl}` : ''
      await gh.commentIssue(
        repo,
        issue.number,
        [
          '## Runner gave up',
          '',
          reason,
          where,
          '',
          `Nothing was merged and nothing was silently skipped. Remove \`${labels.failed}\` and re-apply \`${labels.ready}\` to retry.`,
        ].join('\n'),
      )
    },

    async ensureLabels() {
      await gh.ensureLabelsExist(repo, LABEL_DEFINITIONS(labels))
    },
  }
}
