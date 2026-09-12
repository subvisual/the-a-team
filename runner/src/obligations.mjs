// Project-authored acceptance obligations. This validates recorded evidence and
// decisions; it never manufactures approval, runs a study, or accepts code as UX proof.
import { isDeepStrictEqual } from 'node:util'

export const ACCEPTANCE_STAGES = Object.freeze([
  'discovery',
  'definition',
  'design',
  'spec',
  'issues',
  'implementation',
  'verification',
  'human-acceptance',
  'integration',
  'release',
  'product-validation',
])
const stageName = (stage) => ({ dev: 'implementation', pr: 'integration' })[stage] || stage
const rank = (stage) => ACCEPTANCE_STAGES.indexOf(stageName(stage))
const text = (value) => typeof value === 'string' && value.trim().length > 0
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const list = (value) => (Array.isArray(value) ? value : [])
const version = (value) => Number.isSafeInteger(value) && value > 0
const fields = ['id', 'statement', 'category', 'method', 'requiredStage', 'owner', 'benchmark']
const kinds = { prd: 'definition', spec: 'spec', 'page-brief': 'definition', issues: 'issues' }
const requiredKinds = ['prd', 'spec', 'issues']
const stableId = (prefix, value) =>
  new RegExp(`^${prefix}-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$`).test(value || '')

// Snapshot status/evidence are deliberately not copied: only the canonical
// ledger owns those mutable facts. Definitions must survive every decomposition.
export function obligationSnapshot(requirement, obligation) {
  return Object.fromEntries([
    ['requirementId', requirement.id],
    ['requirementVersion', requirement.version],
    ...fields
      .filter((field) => obligation[field] !== undefined)
      .map((field) => [field, obligation[field]]),
  ])
}

export function evaluateAcceptance(
  ledger,
  {
    stage = 'issues',
    artifacts = {},
    issues,
    previousLedger,
    history = [],
    historical = false,
  } = {},
) {
  const diagnostics = []
  const add = (requirementId, obligationId, field, message, severity = 'error', artifact = null) =>
    diagnostics.push({
      code: 'acceptance-obligation',
      severity,
      requirementId,
      obligationId,
      field,
      artifact,
      message: `${obligationId || requirementId || 'acceptance'}: ${field}: ${message}`,
    })
  const requireValue = (valid, requirementId, obligationId, field, message) => {
    if (!valid) add(requirementId, obligationId, field, message)
  }
  const checkDecision = (value, requirementId, obligationId, prefix) => {
    for (const field of ['actor', 'reference', 'rationale', 'consequence'])
      requireValue(
        text(value?.[field]),
        requirementId,
        obligationId,
        `${prefix}.${field}`,
        'explicit decision value required',
      )
    requireValue(
      value?.authorized === true,
      requirementId,
      obligationId,
      `${prefix}.authorized`,
      'explicit authorized decision required',
    )
  }
  // A cleared evidence array does not erase a result's original provenance.
  // Check all earlier revisions, even when this transition only updates status.
  const evidenceKey = (rid, id, reference) => JSON.stringify([rid, id, reference])
  const historicalEvidence = new Map()
  for (const priorLedger of [...list(history), previousLedger].filter(Boolean)) {
    for (const requirement of list(priorLedger.requirements)) {
      for (const obligation of list(requirement?.obligations)) {
        for (const evidence of list(obligation?.evidence)) {
          if (!text(evidence?.reference)) continue
          const key = evidenceKey(requirement.id, obligation.id, evidence.reference)
          const records = historicalEvidence.get(key) || []
          records.push({ ...evidence, revision: priorLedger.revision })
          historicalEvidence.set(key, records)
        }
      }
    }
  }
  if (!object(ledger)) ledger = {}
  requireValue(ledger.schemaVersion === 1, null, null, 'schemaVersion', 'expected 1')
  requireValue(version(ledger.revision), null, null, 'revision', 'positive integer required')
  requireValue(rank(stage) >= 0, null, null, 'stage', `unknown stage ${stage}`)
  requireValue(
    Array.isArray(ledger.requirements) && ledger.requirements.length > 0,
    null,
    null,
    'requirements',
    'nonempty requirement list required',
  )
  requireValue(
    Array.isArray(ledger.artifacts),
    null,
    null,
    'artifacts',
    'artifact declarations required',
  )
  const requirements = [],
    obligations = [],
    byRequirement = new Map(),
    byObligation = new Map()
  for (const requirement of list(ledger.requirements)) {
    if (!object(requirement)) {
      add(null, null, 'requirement', 'object required')
      continue
    }
    const rid = requirement.id
    requireValue(stableId('R', rid), rid, null, 'id', 'stable project-owned R-... ID required')
    requireValue(!byRequirement.has(rid), rid, null, 'id', 'duplicate requirement ID')
    byRequirement.set(rid, requirement)
    requireValue(
      version(requirement.version),
      rid,
      null,
      'version',
      'positive requirement version required',
    )
    requireValue(
      Array.isArray(requirement.obligations) && requirement.obligations.length > 0,
      rid,
      null,
      'obligations',
      'nonempty obligation list required',
    )
    for (const obligation of list(requirement.obligations)) {
      if (!object(obligation)) {
        add(rid, null, 'obligation', 'object required')
        continue
      }
      const id = obligation.id
      requireValue(stableId('OBL', id), rid, id, 'id', 'stable project-owned OBL-... ID required')
      requireValue(!byObligation.has(id), rid, id, 'id', 'duplicate obligation ID')
      byObligation.set(id, { requirement, obligation })
      requireValue(
        text(obligation.statement),
        rid,
        id,
        'statement',
        'checkable requirement statement required',
      )
      requireValue(
        ['product', 'design', 'engineering'].includes(obligation.category),
        rid,
        id,
        'category',
        'product, design or engineering required',
      )
      requireValue(
        [
          'automated',
          'rendered-review',
          'human-study',
          'performance-benchmark',
          'manual-review',
        ].includes(obligation.method),
        rid,
        id,
        'method',
        'explicit supported validation method required',
      )
      requireValue(
        rank(obligation.requiredStage) >= 0,
        rid,
        id,
        'requiredStage',
        'known required stage required',
      )
      requireValue(
        ['pending', 'blocked', 'satisfied', 'deferred'].includes(obligation.status),
        rid,
        id,
        'status',
        'pending, blocked, satisfied or deferred required',
      )
      requireValue(
        object(obligation.owner),
        rid,
        id,
        'owner',
        'accountable owner or role object required',
      )
      const ownerResolved = text(obligation.owner?.role) || text(obligation.owner?.actor)
      // History records drafts as well as completed stages. Validate their
      // contract and provenance without requiring past work to be complete.
      const due = !historical && rank(stage) >= rank(obligation.requiredStage)
      if (!ownerResolved)
        add(rid, id, 'owner', 'accountable owner/role unresolved', due ? 'error' : 'warning')
      requireValue(
        Array.isArray(obligation.evidence),
        rid,
        id,
        'evidence',
        'explicit evidence array required (empty while pending)',
      )
      const benchmark = obligation.benchmark
      if (obligation.method === 'performance-benchmark' || benchmark !== undefined) {
        requireValue(
          obligation.method === 'performance-benchmark',
          rid,
          id,
          'method',
          'benchmark is a performance obligation, separate from human-study',
        )
        requireValue(
          version(benchmark?.version),
          rid,
          id,
          'benchmark.version',
          'positive benchmark version required',
        )
        for (const field of ['workload', 'units', 'method', 'scope'])
          requireValue(
            text(benchmark?.[field]),
            rid,
            id,
            `benchmark.${field}`,
            'explicit benchmark definition required',
          )
        requireValue(
          ['<', '<=', '>', '>=', '='].includes(benchmark?.threshold?.operator) &&
            Number.isFinite(benchmark?.threshold?.value),
          rid,
          id,
          'benchmark.threshold',
          'numeric value and comparison operator required',
        )
      }
      for (const evidence of list(obligation.evidence)) {
        for (const field of ['reference', 'actor'])
          requireValue(
            text(evidence?.[field]),
            rid,
            id,
            `evidence.${field}`,
            'recorded evidence value required',
          )
        requireValue(
          evidence?.method === obligation.method,
          rid,
          id,
          'evidence.method',
          `must match ${obligation.method}; code is not human-study evidence`,
        )
        requireValue(
          evidence?.requirementVersion === requirement.version,
          rid,
          id,
          'evidence.requirementVersion',
          `must match current requirement version ${requirement.version}`,
        )
        if (benchmark)
          requireValue(
            evidence?.benchmarkVersion === benchmark.version,
            rid,
            id,
            'evidence.benchmarkVersion',
            `must match current benchmark version ${benchmark.version}`,
          )
        const prior = list(historicalEvidence.get(evidenceKey(rid, id, evidence?.reference))).find(
          (record) =>
            record.requirementVersion !== evidence?.requirementVersion ||
            record.method !== evidence?.method ||
            record.benchmarkVersion !== evidence?.benchmarkVersion,
        )
        if (prior)
          add(
            rid,
            id,
            'evidence.reference',
            `${evidence.reference} has different method/version provenance in revision ${prior.revision}; record new evidence instead of relabelling an old result`,
          )
      }
      if (obligation.status === 'satisfied')
        requireValue(
          list(obligation.evidence).length > 0,
          rid,
          id,
          'evidence',
          'satisfied requires recorded evidence',
        )
      if (obligation.status === 'deferred') {
        checkDecision(obligation.deferral, rid, id, 'deferral')
        requireValue(
          rank(obligation.deferral?.nextDecisionStage) >= 0 &&
            (historical || rank(obligation.deferral.nextDecisionStage) > rank(stage)),
          rid,
          id,
          'deferral.nextDecisionStage',
          'a known future decision stage is required; revisit deferral when reached',
        )
      } else if (due && obligation.status !== 'satisfied')
        add(
          rid,
          id,
          'status',
          `${obligation.status || 'missing'} obligation is required by ${obligation.requiredStage}`,
        )
      obligations.push({
        ...obligation,
        requirementId: rid,
        requirementVersion: requirement.version,
        due,
        ownerResolved,
      })
    }
  }

  if (previousLedger) {
    requireValue(
      ledger.revision === previousLedger.revision + 1,
      null,
      null,
      'revision',
      'must follow the previous ledger revision',
    )
    for (const priorArtifact of list(previousLedger.artifacts)) {
      const currentArtifact = list(ledger.artifacts).find(
        (item) => item?.path === priorArtifact.path && item.kind === priorArtifact.kind,
      )
      for (const id of list(priorArtifact.obligationIds)) {
        const requirementId = byObligation.get(id)?.requirement.id || null
        requireValue(
          list(currentArtifact?.obligationIds).includes(id),
          requirementId,
          id,
          `artifacts.${priorArtifact.kind}`,
          `coverage dropped from ${priorArtifact.path}; preserve the obligation's artifact lineage`,
        )
      }
    }
    for (const prior of list(previousLedger.requirements)) {
      const current = byRequirement.get(prior.id)
      if (!current) {
        add(prior.id, null, 'requirement', 'requirement dropped from previous revision')
        continue
      }
      requireValue(
        current.version >= prior.version,
        current.id,
        null,
        'version',
        'requirement version cannot move backwards',
      )
      const changes = []
      for (const before of list(prior.obligations)) {
        const after = list(current.obligations).find((item) => item?.id === before.id)
        if (!after) {
          add(
            prior.id,
            before.id,
            'obligation',
            'obligation dropped; retain explicit evidence or authorized outstanding disposition',
          )
          continue
        }
        for (const field of fields.filter((field) => field !== 'owner')) {
          if (isDeepStrictEqual(before[field], after[field])) continue
          if (field === 'benchmark') {
            if (before.benchmark?.version !== after.benchmark?.version) {
              changes.push({ id: before.id, field: 'benchmark.version' })
              requireValue(
                version(after.benchmark?.version) &&
                  after.benchmark.version > (before.benchmark?.version || 0),
                prior.id,
                before.id,
                'benchmark.version',
                'benchmark version must increase',
              )
            }
            for (const key of ['workload', 'units', 'threshold', 'method', 'scope'])
              if (!isDeepStrictEqual(before.benchmark?.[key], after.benchmark?.[key])) {
                changes.push({ id: before.id, field: `benchmark.${key}` })
                requireValue(
                  version(after.benchmark?.version) &&
                    after.benchmark.version > (before.benchmark?.version || 0),
                  prior.id,
                  before.id,
                  `benchmark.${key}`,
                  'changed benchmark requires a newer benchmark version',
                )
              }
          } else changes.push({ id: before.id, field })
        }
      }
      for (const added of list(current.obligations))
        if (!list(prior.obligations).some((old) => old.id === added.id))
          changes.push({ id: added.id, field: 'obligation' })
      if (changes.length || current.version !== prior.version) {
        checkDecision(current.decision, current.id, null, 'decision')
        for (const change of changes)
          requireValue(
            current.version === prior.version + 1,
            current.id,
            change.id,
            change.field,
            'changed obligation requires the next requirement version and an authorized decision',
          )
      }
    }
  }

  const declared = new Map()
  for (const artifact of list(ledger.artifacts)) {
    if (!object(artifact)) {
      add(null, null, 'artifact', 'artifact object required')
      continue
    }
    requireValue(
      text(artifact.path) &&
        !artifact.path.startsWith('/') &&
        !artifact.path.split(/[\\/]/).includes('..'),
      null,
      null,
      'artifact.path',
      'relative feature artifact path required',
    )
    requireValue(
      Object.hasOwn(kinds, artifact.kind),
      null,
      null,
      'artifact.kind',
      'prd, spec, page-brief or issues required',
    )
    if (requiredKinds.includes(artifact.kind))
      requireValue(
        artifact.path === `${artifact.kind}.md`,
        null,
        null,
        'artifact.path',
        `${artifact.kind} coverage must name the actual ${artifact.kind}.md`,
      )
    requireValue(
      !declared.has(artifact.path),
      null,
      null,
      'artifact.path',
      `duplicate artifact ${artifact.path}`,
    )
    declared.set(artifact.path, artifact)
    requireValue(
      Array.isArray(artifact.obligationIds),
      null,
      null,
      'artifact.obligationIds',
      'explicit coverage list required',
    )
    const ids = list(artifact.obligationIds)
    requireValue(
      ids.length === new Set(ids).size,
      null,
      null,
      'artifact.obligationIds',
      'duplicate coverage ID',
    )
    const records = artifacts[artifact.path]
    if (historical || rank(stage) < rank(kinds[artifact.kind])) continue
    requireValue(
      Array.isArray(records),
      null,
      null,
      'artifact.snapshot',
      `missing parsed snapshots for ${artifact.path}`,
    )
    const seen = new Set()
    for (const record of list(records)) {
      const id = record?.id,
        entry = byObligation.get(id)
      if (!entry) {
        add(null, id, 'id', 'unknown obligation snapshot', 'error', artifact.path)
        continue
      }
      requireValue(
        !seen.has(id),
        entry.requirement.id,
        id,
        'snapshot',
        `duplicate snapshot in ${artifact.path}`,
      )
      seen.add(id)
      if (!ids.includes(id))
        add(
          entry.requirement.id,
          id,
          'snapshot',
          'snapshot not declared in artifact coverage',
          'error',
          artifact.path,
        )
      const expected = obligationSnapshot(entry.requirement, entry.obligation)
      for (const field of new Set([...Object.keys(expected), ...fields])) {
        if (isDeepStrictEqual(expected[field], record[field])) continue
        if (field === 'benchmark' && object(expected.benchmark) && object(record.benchmark)) {
          for (const key of new Set([
            ...Object.keys(expected.benchmark),
            ...Object.keys(record.benchmark),
          ]))
            if (!isDeepStrictEqual(expected.benchmark[key], record.benchmark[key]))
              add(
                entry.requirement.id,
                id,
                `benchmark.${key}`,
                `missing or changed in ${artifact.path}`,
                'error',
                artifact.path,
              )
        } else
          add(
            entry.requirement.id,
            id,
            field,
            `missing or changed in ${artifact.path}`,
            'error',
            artifact.path,
          )
      }
      if (artifact.kind === 'issues') {
        const disposition = record.disposition
        requireValue(
          ['ticket', 'outstanding'].includes(disposition?.kind),
          entry.requirement.id,
          id,
          'disposition',
          'explicit ticket or outstanding disposition required',
        )
        if (disposition?.kind === 'ticket') {
          const ticket = list(issues).find((item) => item.id === disposition.ticketId)
          requireValue(
            text(disposition.ticketId) &&
              (issues === undefined || ticket?.requirements.includes(entry.requirement.id)),
            entry.requirement.id,
            id,
            'disposition.ticketId',
            'must name a real ticket with this requirement in Requirements metadata',
          )
        }
      }
    }
    for (const id of ids) {
      const entry = byObligation.get(id)
      if (!entry) add(null, id, 'artifact.obligationIds', `unknown obligation in ${artifact.path}`)
      else if (!seen.has(id))
        add(
          entry.requirement.id,
          id,
          'snapshot',
          `missing from ${artifact.path}`,
          'error',
          artifact.path,
        )
    }
  }
  for (const [id, { requirement }] of byObligation) {
    for (const kind of requiredKinds) {
      if (
        !list(ledger.artifacts).some(
          (artifact) => artifact?.kind === kind && list(artifact.obligationIds).includes(id),
        )
      )
        add(
          requirement.id,
          id,
          `artifacts.${kind}`,
          `obligation must survive ${kind} decomposition`,
        )
    }
  }
  for (const requirement of byRequirement.values())
    requirements.push({
      id: requirement.id,
      version: requirement.version,
      accepted:
        !historical &&
        list(requirement.obligations).length > 0 &&
        list(requirement.obligations).every((item) => item.status === 'satisfied') &&
        !diagnostics.some(
          (item) =>
            item.severity === 'error' &&
            (!item.requirementId || item.requirementId === requirement.id),
        ),
      obligationIds: list(requirement.obligations).map((item) => item.id),
    })
  return {
    ok: !diagnostics.some((item) => item.severity === 'error'),
    stage: stageName(stage),
    diagnostics,
    requirements,
    obligations,
    pending: obligations.filter((item) => item.status === 'pending'),
    blocked: obligations.filter((item) => item.status === 'blocked'),
    deferred: obligations.filter((item) => item.status === 'deferred'),
    unresolvedOwners: obligations.filter((item) => !item.ownerResolved).map((item) => item.id),
  }
}
