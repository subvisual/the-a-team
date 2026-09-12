// Calculates authored pilot records. It never runs projects or validates a
// participant observation merely because a record says that it was observed.
import { createHash } from 'node:crypto'

export const MILESTONES = [
  'implementation',
  'verification',
  'human_acceptance',
  'integration',
  'release',
  'product_validation',
]
export const PILOT_CASES = [
  'new-slice',
  'interruption-human-revision',
  'recovery',
  'design',
  'feature-delta',
]
const text = (value) => typeof value === 'string' && value.trim().length > 0
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const list = (value) => (Array.isArray(value) ? value : [])
const positive = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0
const rounded = (value) => Math.round(value * 1e6) / 1e6
const canonical = (value) =>
  JSON.stringify(value, (_, child) =>
    object(child)
      ? Object.fromEntries(
          Object.keys(child)
            .sort()
            .map((key) => [key, child[key]]),
        )
      : child,
  )
const hash = (value) => createHash('sha256').update(canonical(value)).digest('hex')

export function calculatePilot(data) {
  const diagnostics = [],
    add = (path, message) => diagnostics.push({ path, message })
  if (
    data?.schemaVersion !== 1 ||
    !text(data.id) ||
    !['synthetic', 'observed'].includes(data.origin)
  )
    add('schema', 'Version 1, pilot ID and explicit synthetic/observed origin required')
  if (!['harness', 'ordinary-assisted'].includes(data?.workflow))
    add('workflow', 'Identify harness or ordinary-assisted work explicitly')
  const projects = new Map()
  for (const p of list(data?.projects)) {
    if (
      !text(p?.id) ||
      projects.has(p.id) ||
      !['identity', 'stack', 'designSystem'].every((key) => text(p[key]))
    )
      add('projects', 'Unique project ID, identity, stack and design system required')
    else projects.set(p.id, p)
  }
  if (!projects.size || !Array.isArray(data?.increments))
    add('scope', 'Projects and an explicit increment cohort are required')
  const increments = [],
    attemptIds = new Set(),
    incrementIds = new Set(),
    samples = []
  const milestones = Object.fromEntries(
    MILESTONES.map((name) => [name, { recorded: 0, unrun: 0, unknown: 0 }]),
  )
  const defects = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0, missingInventories: 0 }
  let accepted = 0,
    reviewed = 0,
    firstPass = 0,
    recoveryTrials = 0,
    correctRecovery = 0,
    recoveryUnrun = 0,
    recoveryUnknown = 0,
    jobTrials = 0,
    jobSuccesses = 0,
    jobUnrun = 0,
    jobUnknown = 0
  for (const increment of list(data?.increments)) {
    const path = `increments.${increment?.id || '?'}`
    if (
      !text(increment?.id) ||
      incrementIds.has(increment.id) ||
      !projects.has(increment.projectId) ||
      !['new-slice', 'recovery', 'design', 'feature-delta'].includes(increment.kind)
    ) {
      add(path, 'Unique increment, known project and supported case required')
      continue
    }
    incrementIds.add(increment.id)
    if (!Array.isArray(increment.attempts) || !increment.attempts.length)
      add(path, 'Retain every attempt, including failed and interrupted work')
    const attempts = list(increment.attempts)
    for (const attempt of attempts) {
      if (
        !text(attempt?.id) ||
        attemptIds.has(attempt.id) ||
        !['completed', 'failed', 'interrupted', 'aborted', 'unknown'].includes(attempt.outcome) ||
        !text(attempt.reference)
      ) {
        add(path, 'Each attempt needs unique identity, outcome and source reference')
        continue
      }
      attemptIds.add(attempt.id)
      samples.push(attempt)
      if (!['exact', 'estimated', 'unknown'].includes(attempt.timeAttribution))
        add(attempt.id, 'State exact, estimated or unknown human-time attribution')
      if (
        attempt.review &&
        (!['accepted', 'rejected'].includes(attempt.review.outcome) ||
          !text(attempt.review.actor) ||
          !text(attempt.review.reference) ||
          attempt.outcome !== 'completed')
      )
        add(attempt.id, 'Human review requires a completed attempt and accountable actor/reference')
      if (
        !['sufficient', 'insufficient', 'unknown'].includes(attempt.context?.sufficiency) ||
        !text(attempt.context?.reference)
      )
        add(attempt.id, 'Context sufficiency and evidence reference must remain explicit')
      for (const [subset, total, label] of [
        [attempt.activeReviewMinutes, attempt.humanMinutes, 'Review time'],
        [attempt.context?.minutes, attempt.humanMinutes, 'Context time'],
        [attempt.context?.costUsd, attempt.spendUsd, 'Context cost'],
      ])
        if (positive(subset) && positive(total) && subset > total)
          add(attempt.id, `${label} is a subset of the total and cannot exceed it`)
    }
    const records = {}
    for (const name of MILESTONES) {
      const record = increment.milestones?.[name],
        status = record?.status || 'unknown'
      if (
        !['recorded', 'unrun', 'unknown'].includes(status) ||
        (status === 'recorded' && !text(record.reference))
      )
        add(`${path}.${name}`, 'Milestone must be recorded with a reference, unrun, or unknown')
      else milestones[name][status]++
      records[name] = record || { status: 'unknown' }
    }
    const acceptance = records.human_acceptance
    const acceptedAttempt = attempts.find((a) => a?.id === acceptance.attemptId)
    const isAccepted =
      acceptance.status === 'recorded' &&
      acceptedAttempt?.review?.outcome === 'accepted' &&
      acceptedAttempt.outcome === 'completed' &&
      acceptance.reference === acceptedAttempt.review.reference &&
      acceptance.actor === acceptedAttempt.review.actor
    if (acceptance.status === 'recorded' && !isAccepted)
      add(
        path,
        'Human acceptance must bind an actual completed accepted attempt and its exact accountable review',
      )
    if (isAccepted) accepted++
    if (attempts.some((a) => a?.review)) reviewed++
    if (isAccepted && acceptedAttempt === attempts[0]) firstPass++
    if (!Array.isArray(increment.escapedDefects)) defects.missingInventories++
    else
      for (const defect of increment.escapedDefects) {
        if (
          !text(defect?.id) ||
          !text(defect.reference) ||
          !['critical', 'high', 'medium', 'low', 'unknown'].includes(defect.severity)
        )
          add(path, 'Escaped defects require ID, severity and source reference')
        else defects[defect.severity]++
      }
    for (const type of ['recovery', 'primaryJob']) {
      const observation = increment[type]
      if (observation?.status === 'observed') {
        if (!text(observation.reference))
          add(`${path}.${type}`, 'Observed measurements require a source reference')
        if (type === 'recovery') {
          if (typeof observation.correct !== 'boolean')
            add(path, 'Observed recovery needs explicit correctness')
          else {
            recoveryTrials++
            if (observation.correct) correctRecovery++
          }
        } else if (
          !Number.isSafeInteger(observation.trials) ||
          observation.trials < 1 ||
          !Number.isSafeInteger(observation.successes) ||
          observation.successes < 0 ||
          observation.successes > observation.trials
        )
          add(path, 'Primary-job observations require successes and nonzero trial denominator')
        else {
          jobTrials += observation.trials
          jobSuccesses += observation.successes
        }
      } else if (observation?.status === 'unrun') {
        if (type === 'recovery') recoveryUnrun++
        else jobUnrun++
      } else {
        if (type === 'recovery') recoveryUnknown++
        else jobUnknown++
      }
    }
    increments.push({
      id: increment.id,
      projectId: increment.projectId,
      kind: increment.kind,
      attemptIds: attempts.map((a) => a?.id),
      accepted: isAccepted,
      milestones: records,
    })
  }
  const sum = (key, read, integer = false) => {
    let knownTotal = 0,
      missingCount = 0
    for (const attempt of samples) {
      const value = read(attempt)
      if (value === null || value === undefined) missingCount++
      else if (!positive(value) || (integer && !Number.isSafeInteger(value))) {
        add(`${attempt.id}.${key}`, 'Use a nonnegative measurement or null for unknown')
        missingCount++
      } else knownTotal += value
    }
    return {
      knownTotal: rounded(knownTotal),
      missingCount,
      measuredCount: samples.length - missingCount,
      total: missingCount ? null : rounded(knownTotal),
    }
  }
  const metrics = {
    spendUsd: sum('spendUsd', (a) => a.spendUsd),
    humanMinutes: sum('humanMinutes', (a) => a.humanMinutes),
    activeReviewMinutes: sum('activeReviewMinutes', (a) => a.activeReviewMinutes),
    decisionsRequested: sum('decisionsRequested', (a) => a.decisionsRequested, true),
    contextCostUsd: sum('context.costUsd', (a) => a.context?.costUsd),
    contextMinutes: sum('context.minutes', (a) => a.context?.minutes),
  }
  const attribution =
    samples.some((a) => a.timeAttribution === 'unknown') || metrics.humanMinutes.total === null
      ? 'unknown'
      : samples.some((a) => a.timeAttribution === 'estimated')
        ? 'estimated'
        : 'exact'
  const denominator = attribution !== 'unknown' ? metrics.humanMinutes.total : null
  const rate = denominator > 0 ? rounded((accepted * 60) / denominator) : null
  const comparison = {
    method: data?.comparison?.method || null,
    status: data?.comparison?.status || 'unknown',
    multiplier: null,
    limitation:
      'A descriptive comparison does not establish a repeatable productivity multiplier or causal effect.',
  }
  if (comparison.status === 'observed') {
    const comparable = data.comparison.comparability
    if (
      comparison.method !== 'matched-scope-ordinary-assisted-work' ||
      comparable?.status !== 'resolved' ||
      !text(comparable.actor) ||
      !text(comparable.reference) ||
      !Array.isArray(comparable.limitations)
    )
      add(
        'comparison',
        'Comparable ordinary-assisted scope and measurement rules need an accountable recorded resolution and limitations',
      )
    else if (!data.comparison.baseline)
      add(
        'comparison',
        'Observed comparison requires the full baseline cohort and its failed attempts',
      )
    else {
      const baseline = calculatePilot({
        ...data.comparison.baseline,
        comparison: { status: 'unrun' },
      })
      const shapes = (values) => values.map((i) => `${i.projectId}:${i.kind}`).sort()
      const projectSet = (values) =>
        [...list(values)].sort((a, b) => {
          const left = String(a?.id ?? ''),
            right = String(b?.id ?? '')
          return left < right ? -1 : left > right ? 1 : 0
        })
      if (
        data.workflow !== 'harness' ||
        data.comparison.baseline.workflow !== 'ordinary-assisted' ||
        data.comparison.baseline.origin !== data.origin ||
        !baseline.ok ||
        canonical(projectSet(data.comparison.baseline.projects)) !==
          canonical(projectSet(data.projects)) ||
        canonical(shapes(baseline.increments)) !== canonical(shapes(increments)) ||
        [...new Set(increments.map((i) => i.kind))].some(
          (kind) => !list(comparable.matchedScope).includes(kind),
        )
      )
        add(
          'comparison',
          'Baseline must preserve matched project/case cohort, evidence origin and valid ordinary-assisted measurement records',
        )
      else {
        comparison.baseline = {
          acceptedIncrements: baseline.acceptedIncrements,
          acceptedPerHumanHour: baseline.acceptedPerHumanHour,
          metrics: baseline.metrics,
        }
        comparison.comparability = structuredClone(comparable)
        comparison.multiplier =
          rate !== null && baseline.acceptedPerHumanHour.value > 0
            ? rounded(rate / baseline.acceptedPerHumanHour.value)
            : null
      }
    }
  } else if (!['unrun', 'unknown'].includes(comparison.status))
    add('comparison', 'Comparison must be observed, unrun or unknown')
  return {
    schemaVersion: 1,
    ok: diagnostics.length === 0,
    id: data?.id,
    origin: data?.origin,
    diagnostics,
    increments,
    attempts: samples.length,
    acceptedIncrements: accepted,
    metrics,
    acceptedPerHumanHour: {
      value: rate,
      numerator: accepted,
      denominatorMinutes: denominator,
      attribution,
      definition:
        'Current human-accepted increments / all attributable human hours across the complete cohort, including failed and interrupted attempts',
    },
    firstPassAcceptance: {
      numerator: firstPass,
      denominator: reviewed,
      value: reviewed ? firstPass / reviewed : null,
      definition:
        'Increment accepted on its first attempt / increments with a recorded human review',
    },
    milestones,
    escapedDefects: defects,
    recovery: {
      numerator: correctRecovery,
      denominator: recoveryTrials,
      value: recoveryTrials ? correctRecovery / recoveryTrials : null,
      unrun: recoveryUnrun,
      unknown: recoveryUnknown,
    },
    primaryJob: {
      numerator: jobSuccesses,
      denominator: jobTrials,
      value: jobTrials ? jobSuccesses / jobTrials : null,
      unrun: jobUnrun,
      unknown: jobUnknown,
    },
    contextSufficiency: Object.fromEntries(
      ['sufficient', 'insufficient', 'unknown'].map((status) => [
        status,
        samples.filter((a) => a.context?.sufficiency === status).length,
      ]),
    ),
    comparison,
    limitations: list(data?.limitations),
    unrunObligations: list(data?.unrunObligations),
  }
}

export function validatePilotHandoff(plan) {
  const diagnostics = [],
    add = (message) => diagnostics.push(message)
  if (plan?.schemaVersion !== 1 || !['planned', 'synthetic'].includes(plan.origin))
    add('Versioned planned or synthetic protocol required')
  if (list(plan?.projects).length !== 2) add('Select two separately authorized targets')
  const projects = list(plan?.projects)
  if (new Set(projects.map((p) => p?.id)).size !== projects.length) add('Target IDs must be unique')
  if (new Set(projects.map((p) => p?.identity)).size !== projects.length)
    add('Target identities must differ')
  if (
    projects.length === 2 &&
    (projects[0]?.stack === projects[1]?.stack ||
      projects[0]?.designSystem === projects[1]?.designSystem)
  )
    add('Repeat on a different stack and design system')
  for (const project of projects) {
    if (!['id', 'identity', 'stack', 'designSystem'].every((key) => text(project?.[key])))
      add('Resolve exact target, stack and design system')
    if (
      project?.authority?.authorized !== true ||
      !text(project.authority.actor) ||
      !text(project.authority.reference) ||
      PILOT_CASES.some((kind) => !list(project.authority.scope).includes(kind))
    )
      add('Each target requires existing accountable authority for all pilot cases')
    if (
      !['operator', 'reviewer', 'productDecisionMaker', 'studyLead'].every((role) =>
        text(project?.roles?.[role]),
      )
    )
      add('Resolve accountable operator, reviewer, product decision maker and study lead')
    const actorKey = (value) =>
      typeof value === 'string'
        ? value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
        : null
    if (
      text(project?.roles?.operator) &&
      actorKey(project.roles.operator) === actorKey(project.roles.reviewer)
    )
      add('The independent reviewer must differ from the operator')
    if (!list(project?.obligations).length || project.obligations.some((id) => !text(id)))
      add('Select project-specific acceptance obligations')
  }
  if (
    plan?.comparison?.method !== 'matched-scope-ordinary-assisted-work' ||
    plan.comparison.resolved !== true ||
    !text(plan.comparison.actor) ||
    !text(plan.comparison.reference)
  )
    add('Resolve the comparable ordinary-assisted baseline method and its accountable owner')
  if (
    plan?.releaseEvidence?.eligible !== true ||
    !text(plan.releaseEvidence.reference) ||
    !Array.isArray(plan.releaseEvidence.unresolvedDependencies) ||
    plan.releaseEvidence.unresolvedDependencies.length
  )
    add(
      'Dependable release evidence and unresolved dependencies require resolution before live execution',
    )
  if (plan?.origin === 'synthetic')
    add('Synthetic authority records cannot authorize live execution')
  return {
    schemaVersion: 1,
    readyForLive: diagnostics.length === 0,
    diagnostics,
    effects: [],
    limitation:
      'This checks recorded handoff completeness; it does not grant project authority or start a pilot.',
  }
}

function validateCorrection(record) {
  const allowed = [
    'id',
    'category',
    'summary',
    'changedAssumption',
    'sourceEvidence',
    'generalizedFollowup',
    'publicationReview',
    'sequence',
    'previousHash',
    'hash',
  ]
  if (!object(record) || Object.keys(record).some((key) => !allowed.includes(key)))
    throw Error(
      'Checkpoint exports only the generalized correction schema; omit unrelated source bodies',
    )
  if (
    !text(record?.id) ||
    !['context', 'requirement', 'design', 'execution', 'evaluator'].includes(record.category) ||
    !text(record.summary)
  )
    throw Error('Correction requires stable ID, supported category and generalized summary')
  const assumption = record.changedAssumption
  for (const [value, keys] of [
    [assumption, ['id', 'beforeVersion', 'afterVersion', 'change']],
    [record.generalizedFollowup, ['kind', 'reference', 'description']],
    [record.publicationReview, ['generalized', 'actor', 'reference']],
  ])
    if (!object(value) || Object.keys(value).some((key) => !keys.includes(key)))
      throw Error('Use only the generalized checkpoint fields; omit unrelated source bodies')
  if (
    !text(assumption?.id) ||
    !Number.isSafeInteger(assumption.beforeVersion) ||
    assumption.beforeVersion < 1 ||
    assumption.afterVersion !== assumption.beforeVersion + 1 ||
    !text(assumption.change)
  )
    throw Error('Changed assumption needs stable ID, next version and generalized change')
  if (!list(record.sourceEvidence).length)
    throw Error('Correction requires source evidence references')
  for (const source of record.sourceEvidence)
    if (
      !text(source?.reference) ||
      !/^[a-f0-9]{64}$/.test(source.sha256 || '') ||
      Object.keys(source).some((key) => !['reference', 'sha256'].includes(key))
    )
      throw Error(
        'Keep source reference/hash only; do not copy source bodies into generalized checkpoints',
      )
  if (
    !['fixture', 'skill', 'contract'].includes(record.generalizedFollowup?.kind) ||
    !text(record.generalizedFollowup.reference) ||
    !text(record.generalizedFollowup.description)
  )
    throw Error('Generalized followup must identify a fixture, skill or contract correction')
  if (
    record.publicationReview?.generalized !== true ||
    !text(record.publicationReview.actor) ||
    !text(record.publicationReview.reference)
  )
    throw Error(
      'Require an accountable generalized publication review; source facts remain in their authorized location',
    )
}
export function validateCheckpointTrail(trail) {
  const diagnostics = [],
    ids = new Set()
  if (!Array.isArray(trail))
    return { ok: false, diagnostics: ['Checkpoint trail must be an explicit array'] }
  for (const [index, record] of trail.entries()) {
    try {
      validateCorrection(record)
      if (ids.has(record.id)) throw Error('Duplicate checkpoint ID')
      ids.add(record.id)
      if (record.sequence !== index + 1 || record.previousHash !== (trail[index - 1]?.hash || null))
        throw Error('Checkpoint history chain changed')
      const { hash: recordedHash, ...content } = record
      if (hash(content) !== recordedHash) throw Error('Checkpoint bytes changed')
    } catch (error) {
      diagnostics.push(error.message)
    }
  }
  return { ok: diagnostics.length === 0, diagnostics }
}
export function appendCheckpoint(trail, correction) {
  const previous = validateCheckpointTrail(trail)
  if (!previous.ok) throw Error(previous.diagnostics.join('; '))
  validateCorrection(correction)
  if (trail.some((record) => record.id === correction.id)) throw Error('Duplicate checkpoint ID')
  if (['sequence', 'previousHash', 'hash'].some((key) => Object.hasOwn(correction, key)))
    throw Error('Checkpoint ordering and hashes are assigned from the retained prior trail')
  const content = {
    ...structuredClone(correction),
    sequence: trail.length + 1,
    previousHash: trail.at(-1)?.hash || null,
  }
  return [...structuredClone(trail), { ...content, hash: hash(content) }]
}
