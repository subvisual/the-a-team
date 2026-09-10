// Read-only reconstruction: commit messages and branch names are never evidence.
import { git } from '../git.mjs'
import { digest } from '../policy.mjs'
import {
  approvalRecords,
  validateApprovalRecord,
  hasDeliveryReceipt,
  requirePolicy,
} from './approval.mjs'
import { readEvents, replayIssue, issueVersion } from './history.mjs'
import { inspectClaim } from './claim.mjs'

const existsCommit = async (repoPath, sha) =>
  /^[0-9a-f]{40,64}$/.test(sha || '') &&
  (await git(repoPath, ['cat-file', '-e', `${sha}^{commit}`], { check: false })).code === 0
export const isAncestor = async (repoPath, base, head) =>
  (await git(repoPath, ['merge-base', '--is-ancestor', base, head], { check: false })).code === 0

// Re-evaluate today's execution contract at the recorded historical base. Git
// ref movement is handled separately with ancestry, not by weakening policy
// identity (harness, commands, authorization and target stay current).
export function policyAtRecordedBase(current, record) {
  const { digest: ignored, ...policy } = structuredClone(current)
  policy.target = { ...policy.target, base: record.policy?.target?.base, baseSha: record.baseSha }
  delete policy.target.baseRef
  if (record.policy?.target?.baseRef) policy.target.baseRef = record.policy.target.baseRef
  // Preserve target property order because policy digest serialization is stable
  // in the resolver's insertion order, including optional baseRef before baseSha.
  const { baseSha, ...target } = policy.target
  policy.target = { ...target, baseSha }
  return { ...policy, digest: digest(policy) }
}
export async function rebuildLocalState({ repoPath, issues, policy }) {
  policy = requirePolicy({ policy }, repoPath)
  const deliveryBase = policy.target.baseSha
  const result = { deliveryBase, base: deliveryBase, issues: {} }
  const approved = new Map()
  // Independent issues can still form a serial Git chain. Their document
  // order carries no ancestry authority: revisit unresolved records until no
  // further approved base becomes reachable. Stable keys also make divergent
  // branch selection deterministic when neither head contains the other.
  const reconstructionOrder = [...issues].sort((a, b) => a.key.localeCompare(b.key))
  let progressed = true
  while (progressed) {
    const before = approved.size
    for (const issue of reconstructionOrder) {
      if (approved.has(issue.key)) continue
      const history = replayIssue(readEvents(repoPath, issue.key), issue)
      const last = history.currentAttempts.at(-1)
      const entry = {
        issue: issue.key,
        status: history.status,
        history,
        claim: inspectClaim(repoPath, issue.key).status,
        approved: false,
        integrated: false,
        selected: false,
        blockers: [],
      }
      result.issues[issue.key] = entry
      if (history.status === 'failed') entry.status = last?.failureCategory || 'failed'
      const records = approvalRecords(repoPath, issue.key)
      for (const record of records) {
        if (record.issueVersion !== issueVersion(issue)) {
          if (entry.status === 'pending') entry.status = 'version-changed'
          continue
        }
        if (
          !(await existsCommit(repoPath, record.headSha)) ||
          !(await existsCommit(repoPath, record.baseSha))
        ) {
          entry.status = 'missing-commit'
          continue
        }
        const validation = validateApprovalRecord(record, {
          repo: repoPath,
          issue,
          head: record.headSha,
          baseSha: record.baseSha,
          policy: policyAtRecordedBase(policy, record),
        })
        if (!validation.valid) {
          entry.status = 'approval-invalid'
          entry.reason = validation.reason
          continue
        }
        if (!(await isAncestor(repoPath, record.baseSha, record.headSha))) {
          entry.status = 'ancestry-invalid'
          continue
        }
        const dependencyHeads = {}
        let dependenciesValid = true
        for (const dependency of issue.dependsOn) {
          const prerequisite = approved.get(dependency)
          if (
            !prerequisite ||
            !(await isAncestor(repoPath, prerequisite.headSha, record.baseSha))
          ) {
            dependenciesValid = false
            break
          }
          dependencyHeads[dependency] = prerequisite.headSha
        }
        if (!dependenciesValid) {
          entry.status = 'dependency-approval-invalid'
          continue
        }
        // A saved approval cannot introduce an arbitrary unapproved continuation.
        if (
          !(await isAncestor(repoPath, record.baseSha, deliveryBase)) &&
          ![...approved.values()].some((r) => r.headSha === record.baseSha)
        ) {
          entry.status = 'unrelated-base'
          continue
        }
        Object.assign(entry, {
          record,
          head: record.headSha,
          baseSha: record.baseSha,
          dependencyHeads,
          approved: true,
          delivered: hasDeliveryReceipt(record, { repo: repoPath }),
          status: 'approved-available',
        })
        approved.set(issue.key, record)
        break
      }
      if (history.unresolvedActions.length) {
        entry.approvalCurrent = entry.approved
        entry.approved = false
        entry.status = 'action-uncertain'
        approved.delete(issue.key)
      }
      if (entry.approved) {
        entry.integrated = await isAncestor(repoPath, entry.head, deliveryBase)
        if (entry.integrated) entry.status = 'integrated'
        if (await isAncestor(repoPath, result.base, entry.head)) result.base = entry.head
      }
    }
    progressed = approved.size > before
  }
  for (const issue of issues) {
    const entry = result.issues[issue.key]
    if (entry.approved) entry.selected = await isAncestor(repoPath, entry.head, result.base)
    entry.blockers = issue.dependsOn.filter(
      (id) => !result.issues[id]?.approved || !result.issues[id]?.selected,
    )
    if (
      !entry.approved &&
      !entry.blockers.length &&
      entry.claim === 'stale' &&
      entry.status === 'pending'
    )
      entry.status = 'stale-claim'
  }
  return result
}
