import { ACCEPTANCE_STAGES } from '../obligations.mjs'
import { basename } from 'node:path'
import { digest } from '../policy.mjs'
import { selectTaskContext, assertCurrentContext } from '../context.mjs'
import { readCommittedRenderedPlan } from '../rendered-review.mjs'

/** Called only on the supervisor's private accepted base checkout. */
export async function deriveRenderedReviewAuthority({ root, head, policy, issue, paths = [] }) {
  const selection = selectTaskContext({
    root,
    policy,
    task: { ...issue, paths: [...(issue.paths || []), ...paths] },
  })
  if (selection.status !== 'unconfigured') assertCurrentContext(selection)
  const obligations = new Set(),
    activeLedgerObligations = new Set(),
    dispositions = [],
    sources = []
  for (const source of selection.selected || []) {
    if (!['requirement', 'design'].includes(source.kind)) continue
    sources.push({ id: source.id, path: source.path, revision: source.actualRevision })
    if (source.kind === 'design')
      for (const id of source.obligationIds?.length
        ? source.obligationIds
        : [`design:${source.id}`])
        obligations.add(id)
    if (source.kind === 'requirement' && basename(source.path) === 'acceptance.json') {
      const ledger = JSON.parse(source.content)
      for (const requirement of ledger.requirements || []) {
        if (issue.requirements?.length && !issue.requirements.includes(requirement.id)) continue
        for (const obligation of requirement.obligations || [])
          if (obligation.method === 'rendered-review') {
            if (
              obligation.status === 'deferred' &&
              ACCEPTANCE_STAGES.indexOf(obligation.deferral?.nextDecisionStage) >
                ACCEPTANCE_STAGES.indexOf('verification') &&
              obligation.deferral?.authorized === true &&
              ['actor', 'reference', 'rationale', 'consequence'].every(
                (k) => typeof obligation.deferral[k] === 'string' && obligation.deferral[k].trim(),
              )
            )
              dispositions.push({ obligation: obligation.id, decision: obligation.deferral })
            else {
              activeLedgerObligations.add(obligation.id)
              obligations.add(obligation.id)
            }
          }
      }
    }
  }
  // An accepted ledger disposition also governs a design source mapped to the
  // same obligation, regardless of source ordering. A different active ledger
  // definition remains required rather than being silently waived.
  for (const disposition of dispositions)
    if (!activeLedgerObligations.has(disposition.obligation))
      obligations.delete(disposition.obligation)
  const planPath = policy.verification?.renderedReview || null
  let planDigest = null
  if (planPath) planDigest = (await readCommittedRenderedPlan(root, head, planPath)).digest
  const document = {
    schemaVersion: 1,
    baseSha: head,
    required: !!planPath || obligations.size > 0,
    planPath,
    planDigest,
    obligations: [...obligations].sort(),
    dispositions,
    sources,
  }
  return { ...document, digest: digest(document) }
}

export function validateRenderedAuthority(authority, { baseSha, policy }) {
  if (
    !authority ||
    authority.schemaVersion !== 1 ||
    typeof authority.required !== 'boolean' ||
    !Array.isArray(authority.obligations) ||
    !Array.isArray(authority.dispositions) ||
    !Array.isArray(authority.sources)
  )
    throw Error('missing or invalid supervisor rendered authority')
  if (authority.baseSha !== baseSha) throw Error('supervisor rendered authority base changed')
  const { digest: expected, ...document } = authority
  if (
    digest(document) !== expected ||
    authority.required !== !!(authority.planPath || authority.obligations.length) ||
    authority.planPath !== (policy.verification.renderedReview || null) ||
    (authority.planPath && !/^[a-f0-9]{64}$/.test(authority.planDigest || ''))
  )
    throw Error('supervisor rendered authority changed')
  return authority
}
