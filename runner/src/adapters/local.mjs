import { readFileSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { claim } from '../core/claim.mjs'
import { runAction, stableActionId, appendEvent } from '../core/history.mjs'
import { recordDelivery, hasDeliveryReceipt } from '../core/approval.mjs'
import { digest } from '../policy.mjs'
import { parseIssuesFile, validateIssues } from '../local-issues.mjs'
export { parseIssuesFile, validateIssues, migrateIssuesText, slugify } from '../local-issues.mjs'
export { migrateIssuesFile } from '../migrate-issues.mjs'
import { resolveLocalBase } from '../local-base.mjs'
export { resolveLocalBase }
import { rebuildLocalState } from '../core/local-recovery.mjs'
import { revParse } from '../git.mjs'
import { log } from '../log.mjs'

/**
 * The pipeline's front-end. No remote Git/GitHub, no PRs: the dev phase's serialized
 * integration and single feature PR stay orchestrator-owned (RUNNER.md,
 * decision 16). Approved branches are left in place and reported.
 */
export function createLocalAdapter({ issuesFile, repoPath, base, testCommand, cfg = {} }) {
  const issues = validateIssues(parseIssuesFile(readFileSync(issuesFile, 'utf8')))
  const report = []

  return {
    name: 'local',
    repo: repoPath,
    repoPath,
    base,
    testCommand,
    issues,
    report,

    async refresh() {
      this.issues = validateIssues(parseIssuesFile(readFileSync(issuesFile, 'utf8')))
      const policy =
        cfg.policy ||
        (await resolveLocalBase({ repoPath, base, cfg, authorization: cfg.authorization }))
      this.state = await rebuildLocalState({ repoPath, issues: this.issues, policy })
      this.base = this.state.base
      return this.state
    },

    async listCandidates() {
      await this.refresh()
      await this.reconcileLocal()
      await this.refresh()
      return this.issues.filter((issue) => !this.state.issues[issue.key].approved)
    },

    async reconcileAction(issue, pending) {
      // These adapter callbacks only update an in-memory report/base or log.
      // Rebuilding that projection accounts for either side of an interruption.
      if (['onClaimed', 'onVerdict', 'onApproved', 'onFailed'].includes(pending.kind))
        return { status: 'confirmed', result: null }
      if (pending.kind === 'onImplemented')
        return { status: 'confirmed', result: { branch: pending.input.branch } }
      const record = this.state?.issues[issue.key]?.record
      if (pending.kind === 'recordDelivery' && record && pending.input.head === record.headSha) {
        if (hasDeliveryReceipt(record, { repo: repoPath }))
          return {
            status: 'confirmed',
            result: join(
              dirname(record.verificationPath),
              basename(record.verificationPath).replace('verification-', 'delivery-'),
            ),
          }
        return {
          status: 'absent',
          evidence: 'current immutable approval has no valid local receipt',
        }
      }
      return { status: 'unknown' }
    },

    async reconcileLocal() {
      for (const issue of this.issues) {
        const entry = this.state.issues[issue.key]
        const record = entry.record
        const localKinds = [
          'onClaimed',
          'onImplemented',
          'onVerdict',
          'onApproved',
          'onFailed',
          'recordDelivery',
        ]
        if (entry.history.unresolvedActions.some((a) => !localKinds.includes(a.kind))) continue
        if (!record && !entry.history.unresolvedActions.length) continue
        const token = claim(repoPath, issue.key, { kind: 'local-reconciliation' })
        if (!token) continue
        try {
          for (const pending of entry.history.unresolvedActions) {
            if (pending.kind === 'recordDelivery' && !record) continue
            await runAction(
              {
                repo: repoPath,
                issue,
                attemptId: pending.attemptId,
                actionId: pending.actionId,
                kind: pending.kind,
                input: pending.input,
                reconcile: (e) => this.reconcileAction(issue, e),
              },
              async () =>
                recordDelivery({
                  record,
                  approvalPath: pending.input.approvalPath,
                  repo: repoPath,
                  kind: 'adapter-approval',
                }),
            )
          }
          if (!record) continue
          const cycle = Number(
            basename(record.verificationPath).match(/^verification-(\d+)\.json$/)[1],
          )
          const dir = dirname(record.verificationPath)
          const approvalPath = join(dir, `approval-${cycle}.json`)
          const prior = entry.history.currentAttempts.find((a) => a.runDir === dir)
          const attemptId = prior?.attemptId || `approval-${digest(record)}`
          if (!hasDeliveryReceipt(record, { repo: repoPath })) {
            const deliveryPath = await runAction(
              {
                repo: repoPath,
                issue,
                attemptId,
                actionId: stableActionId({ attemptId, kind: 'recordDelivery', cycle }),
                kind: 'recordDelivery',
                input: { approvalPath, head: record.headSha },
                reconcile: (e) => this.reconcileAction(issue, e),
              },
              async () =>
                recordDelivery({ record, approvalPath, repo: repoPath, kind: 'adapter-approval' }),
            )
            appendEvent(repoPath, issue, {
              type: 'attempt.recovered',
              attemptId,
              outcome: 'approved',
              failureCategory: null,
              head: record.headSha,
              baseSha: record.baseSha,
              dependencyHeads: entry.dependencyHeads,
              runDir: dir,
              approvalPath,
              deliveryPath,
              stage: 'delivered',
              evidence: { approvalPath, deliveryPath },
            })
          }
          if (
            !report.some(
              (r) => r.issue === issue.key && r.head === record.headSha && r.outcome === 'approved',
            )
          )
            report.push({
              issue: issue.key,
              title: issue.title,
              outcome: 'approved',
              head: record.headSha,
              recovered: true,
              integrated: entry.integrated,
            })
        } finally {
          token.release()
        }
      }
    },

    async openBlockers(issue) {
      await this.refresh()
      return this.state.issues[issue.key]?.blockers || issue.dependsOn
    },

    async dependencyHeads(issue) {
      await this.refresh()
      return Object.fromEntries(
        issue.dependsOn
          .filter((id) => this.state.issues[id]?.selected)
          .map((id) => [id, this.state.issues[id].head]),
      )
    },

    async onNeedsDetail(issue, reason) {
      report.push({ issue: issue.key, title: issue.title, outcome: 'needs-detail', reason })
      log.warn('local.needs_detail', { issue: issue.key, reason })
    },

    async onImplemented(issue, { branch }) {
      // No push, no PR — the orchestrator integrates.
      return { branch }
    },

    async currentApprovalInputs(issue, ctx) {
      const latest = validateIssues(parseIssuesFile(readFileSync(issuesFile, 'utf8'))).find(
        (candidate) => candidate.key === issue.key,
      )
      if (!latest) throw new Error('issue criteria changed or issue disappeared before approval')
      return {
        issue: latest,
        head: await revParse(repoPath, ctx.branch),
        baseSha: (await resolveLocalBase({ repoPath, base: this.base })).target.baseSha,
      }
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
        issue: issue.key,
        title: issue.title,
        outcome: 'approved',
        branch: ctx.branch,
        head: ctx.head,
        cycles: ctx.cycle,
        notes: verdict?.notes,
      })
    },

    async onFailed(issue, ctx, reason) {
      report.push({
        issue: issue.key,
        title: issue.title,
        outcome: 'failed',
        branch: ctx?.branch,
        reason,
      })
    },
  }
}
