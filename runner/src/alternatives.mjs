import { readFileSync, existsSync } from 'node:fs'
import { resolve, relative, join, basename, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { canonicalPath, within, credentialPath } from './policy.mjs'
import { validateFlow, assessFlowEvidence, flowRevision } from './flow.mjs'
import { validateFeatureAssumptions, RESEARCH_PLAN_PATH } from './assumptions.mjs'

const text = (value) => typeof value === 'string' && value.trim().length > 0
const list = (value) => (Array.isArray(value) ? value : [])
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const methods = new Set(['interactive-prototype', 'expert-review', 'human-study'])

// IDs, prose, colours and scale metadata do not establish interaction variety.
// This conservative signature compares editable fields, state kinds and the
// available transitions. Failure to distinguish is a request for clearer
// structural alternatives, not proof that arbitrary graphs are equivalent.
export function interactionStructure(flow) {
  const states = new Map(flow.states.map((state) => [state.nodeId, state]))
  const reachable = new Set(),
    reachableEdges = new Set(),
    visited = new Set()
  const counters = Object.fromEntries(
    Object.keys(flow.scenario.sequences)
      .sort()
      .map((key) => [key, 0]),
  )
  const pending = [{ nodeId: flow.initialNodeId, counters }]
  // Follow the finite scenario counters, not merely graph connectivity. An
  // outcome absent at this request index cannot demonstrate another interaction.
  while (pending.length) {
    const current = pending.pop(),
      key = JSON.stringify(current)
    if (visited.has(key)) continue
    if (visited.size >= 10000)
      throw Error('Comparison exceeds the supported finite scenario exploration bound')
    visited.add(key)
    reachable.add(current.nodeId)
    const state = states.get(current.nodeId)
    for (const edge of flow.graph.edges.filter((edge) => edge.from === current.nodeId)) {
      const nextCounters = { ...current.counters }
      if (state.kind === 'loading') {
        const index = current.counters[state.operation]
        const outcome = flow.scenario.sequences[state.operation][index]
        if (outcome === undefined || edge.trigger !== 'settle' || edge.condition?.value !== outcome)
          continue
        nextCounters[state.operation]++
      } else if (
        edge.trigger === 'settle' ||
        (edge.condition?.kind === 'invalid' && !list(state.fields).some((field) => field.required))
      )
        continue
      reachableEdges.add(edge.id)
      pending.push({ nodeId: edge.to, counters: nextCounters })
    }
  }
  const describe = (state) => ({
    kind: state.kind,
    fields: list(state.fields)
      .map((f) => f.key)
      .sort(),
  })
  return flow.states
    .filter((state) => reachable.has(state.nodeId))
    .map((state) => ({
      ...describe(state),
      exits: flow.graph.edges
        .filter((edge) => edge.from === state.nodeId && reachableEdges.has(edge.id))
        .map((edge) => ({
          destination: describe(states.get(edge.to)),
          condition: edge.condition
            ? {
                kind: edge.condition.kind,
                ...(edge.condition.kind === 'outcome' ? { value: edge.condition.value } : {}),
              }
            : null,
          effect: edge.effect || null,
        }))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
}

export const needsInteractionComparison = (assumption) =>
  assumption.loadBearing && assumption.cheapestProbe?.method === 'interaction-comparison'

export async function validateAlternativeFile({ root, recordPath, featureDir, manifest = {} }) {
  const diagnostics = [],
    bindings = {},
    options = []
  const add = (field, message, optionId = null) => diagnostics.push({ field, message, optionId })
  root = canonicalPath(root)
  function source(path) {
    if (!text(path) || /[\u0000-\u001f]/.test(path))
      throw Error('A concrete source path is required')
    const actual = canonicalPath(resolve(root, path)),
      rel = relative(root, actual)
    if (!within(root, actual) || credentialPath(rel) || rel.split('/').includes('.git'))
      throw Error('Source path escapes the project or enters a protected source')
    const bytes = readFileSync(actual),
      revision = hash(bytes)
    bindings[rel] = revision
    return { path: rel, bytes, revision }
  }
  function bound(ref, field) {
    try {
      const value = source(ref?.path)
      if (value.revision !== ref?.revision) throw Error('Source revision changed or is missing')
      return value
    } catch (error) {
      add(field, error.message)
      return null
    }
  }
  let record
  try {
    record = JSON.parse(source(recordPath).bytes)
    if (!object(record)) throw Error('Comparison record must be a JSON object')
  } catch (error) {
    return {
      ok: false,
      diagnostics: [{ field: 'record', message: error.message }],
      bindings,
      options,
    }
  }
  if (record?.schemaVersion !== 1 || !text(record.id))
    add('schemaVersion', 'Versioned comparison ID required')
  if (!['skip', 'compare'].includes(record.mode))
    add('mode', 'Choose compare or a reasoned routine skip')
  const design = bound(record.designSystem, 'designSystem')
  bound(record.risk, 'risk')
  const scopedPath = relative(root, resolve(root, recordPath)).match(
    /^docs\/features\/([^/]+)\/[^/]+$/,
  )
  featureDir ||= scopedPath ? dirname(resolve(root, recordPath)) : undefined
  const featureSlug = manifest.slug || (featureDir && basename(featureDir)) || record.featureSlug
  if (
    !text(featureSlug) ||
    /[\/\\]/.test(featureSlug) ||
    (record.featureSlug && record.featureSlug !== featureSlug)
  )
    add(
      'featureSlug',
      'Declare the exact feature slug; it must match the feature directory and manifest when supplied',
    )
  const research = await validateFeatureAssumptions({
    root,
    featureDir,
    manifest: { ...manifest, slug: featureSlug },
    stage: 'design',
  })
  const riskSource = record.riskSource
  if (
    !research.ok ||
    !research.canAdvance ||
    riskSource?.path !== RESEARCH_PLAN_PATH ||
    riskSource.sha256 !== research.source?.sha256 ||
    riskSource.revision !== research.source?.revision ||
    !list(riskSource?.assumptionIds).length ||
    new Set(riskSource.assumptionIds).size !== riskSource.assumptionIds.length
  )
    add(
      'riskSource',
      'Bind the current valid research plan and explicit applicable assumption IDs; stopped or invalid research cannot support a comparison',
    )
  const assumptions = list(riskSource?.assumptionIds).map((id) =>
    research.assumptions.find((a) => a.id === id),
  )
  if (assumptions.some((a) => !a))
    add('riskSource', 'Every risk ID must identify an applicable recorded assumption')
  const highRisk = assumptions.some((a) => a && needsInteractionComparison(a))
  if (highRisk && (record.mode !== 'compare' || record.risk?.level !== 'high'))
    add(
      'riskSource',
      'A load-bearing interaction-comparison assumption cannot be downgraded to a routine skip',
    )
  if (!['routine', 'high'].includes(record.risk?.level) || !text(record.risk?.uncertainty))
    add('risk', 'Risk level and concrete interaction uncertainty or settled correction required')
  if (record.mode === 'skip') {
    if (record.risk?.level !== 'routine' || !text(record.reason))
      add('reason', 'Only routine work with a concrete reason can skip structural alternatives')
    if (list(record.options).length || record.selection)
      add('options', 'A skipped comparison must not claim evaluated options or a selection')
    return {
      ok: !diagnostics.length,
      mode: 'skip',
      reason: record.reason,
      diagnostics,
      bindings,
      options,
      selection: null,
    }
  }
  const job = bound(record.job, 'job')
  const front = job?.bytes.toString('utf8').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1]
  const jobId = front?.match(/^id:\s*["']?([^\n"']+)/m)?.[1]?.trim()
  const jobStatus = front?.match(/^status:\s*["']?([^\n"']+)/m)?.[1]?.trim()
  if (
    !/^docs\/product\/jtbd\/[^/]+\.md$/.test(job?.path || '') ||
    jobId !== record.job?.id ||
    jobStatus !== 'active'
  )
    add(
      'job',
      'Use the exact current active job ID from docs/product/jtbd; parked or unrelated sources cannot support the comparison',
    )
  if (!text(record.job?.id)) add('job', 'Compare alternatives against an existing accepted job ID')
  if (!list(record.constraints).length || record.constraints.some((value) => !text(value)))
    add('constraints', 'Shared constraints must be explicit')
  const criteria = new Map()
  for (const criterion of list(record.criteria)) {
    if (
      !text(criterion?.id) ||
      criteria.has(criterion.id) ||
      !text(criterion.question) ||
      !methods.has(criterion.method)
    )
      add(
        'criteria',
        'Each shared criterion needs a unique ID, question and supported evidence method',
      )
    else criteria.set(criterion.id, criterion)
  }
  if (!criteria.size) add('criteria', 'A shared evaluation rubric is required')
  const rubricRevision = flowRevision(list(record.criteria))
  if (list(record.options).length < 2 || record.options.length > 3)
    add('options', 'Compare two or three structural approaches when the uncertainty warrants it')
  const ids = new Set(),
    structures = new Set()
  let jobs = null
  for (const option of list(record.options)) {
    if (!object(option)) {
      add('options', 'Each option must be a JSON object')
      continue
    }
    const optionId = option?.id
    if (!text(optionId) || ids.has(optionId) || !text(option.title))
      add('options', 'Unique option ID and title required', optionId)
    ids.add(optionId)
    if (
      option.designSystem &&
      JSON.stringify(option.designSystem) !== JSON.stringify(record.designSystem)
    )
      add('designSystem', 'Every option must preserve the shared design system binding', optionId)
    for (const type of ['benefits', 'costs'])
      if (
        !list(option.tradeoffs?.[type]).length ||
        option.tradeoffs[type].some((value) => !text(value))
      )
        add('tradeoffs', 'State both benefits and costs of each interaction approach', optionId)
    const file = bound(option.flow, `options.${optionId}.flow`)
    let flow = null
    try {
      if (!file) throw Error('Current flow evidence is unavailable')
      flow = JSON.parse(file.bytes)
      const result = validateFlow(flow)
      if (!result.ok) throw Error(result.diagnostics.map((d) => d.message).join('; '))
      if (
        flow.revision !==
        flowRevision(Object.fromEntries(Object.entries(flow).filter(([key]) => key !== 'revision')))
      )
        throw Error('Compiled flow revision does not match its structure')
      if (flow.fidelity !== 'interactive')
        throw Error('Interaction comparison requires explicit interactive prototype fidelity')
      if (JSON.stringify(flow.scenario) !== JSON.stringify(record.scenario))
        throw Error('All options must use the exact same scenario and fixture data')
      const flowJobs = [...new Set(flow.graph.jtbds || [flow.graph.jtbd])].sort()
      if (
        !flowJobs.includes(record.job?.id) ||
        (jobs && JSON.stringify(jobs) !== JSON.stringify(flowJobs))
      )
        throw Error('All options must address the same accepted job')
      jobs = flowJobs
      structures.add(JSON.stringify(interactionStructure(flow)))
    } catch (error) {
      add('flow', error.message, optionId)
      flow = null
    }
    const seen = new Set(),
      pendingCriteria = []
    for (const observation of list(option.observations)) {
      const criterion = criteria.get(observation?.criterionId)
      if (!criterion || seen.has(observation.criterionId)) {
        add(
          'observations',
          'Each shared criterion needs exactly one observation or explicit unrun disposition',
          optionId,
        )
        continue
      }
      seen.add(observation.criterionId)
      if (observation.method !== undefined && observation.method !== criterion.method)
        add(
          'method',
          'Options cannot substitute a different evidence method for the shared criterion',
          optionId,
        )
      if (!text(observation.note))
        add('observations', 'Explain observations or why evidence remains unrun', optionId)
      if (observation.status === 'unrun') {
        pendingCriteria.push(criterion.id)
        continue
      }
      if (observation.status !== 'observed') {
        add('observations', 'Observation must be observed or unrun', optionId)
        continue
      }
      if (!observation.evidence) {
        add('evidence', 'Observed criteria require actual bound evidence', optionId)
        continue
      }
      const evidence = bound(observation.evidence, `options.${optionId}.${criterion.id}.evidence`)
      if (!evidence || !flow) continue
      try {
        const receipt = JSON.parse(evidence.bytes)
        if (criterion.method === 'interactive-prototype') {
          const assessment = assessFlowEvidence({ contract: flow, receipt })
          if (
            !list(criterion.obligationIds).length ||
            criterion.obligationIds.some(
              (id) => !assessment.obligations.some((o) => o.id === id && o.status === 'observed'),
            )
          )
            throw Error(
              'Interactive evidence must observe every declared criterion obligation at this flow revision',
            )
        } else if (
          receipt.schemaVersion !== 1 ||
          receipt.kind !== criterion.method ||
          receipt.optionId !== optionId ||
          receipt.flowRevision !== flow.revision ||
          receipt.jobId !== record.job.id ||
          receipt.scenarioId !== record.scenario.id ||
          receipt.rubricRevision !== rubricRevision ||
          receipt.criterionId !== criterion.id ||
          !text(receipt.observer?.actor) ||
          !text(receipt.observer?.reference) ||
          !text(receipt.finding)
        ) {
          throw Error(
            'Subjective evidence needs the exact option, flow, job, scenario, rubric, criterion and accountable observer',
          )
        }
      } catch (error) {
        add('evidence', error.message, optionId)
      }
    }
    for (const id of criteria.keys())
      if (!seen.has(id)) add('observations', `Missing shared criterion ${id}`, optionId)
    options.push({
      id: optionId,
      title: option.title,
      flowRevision: flow?.revision || null,
      pendingCriteria,
      tradeoffs: option.tradeoffs,
      observations: option.observations,
    })
  }
  if (structures.size < 2)
    add(
      'structure',
      'Alternatives must differ in interaction structure, not only labels, IDs, palette or scale',
    )
  const selection = record.selection
  if (selection) {
    if (!ids.has(selection.optionId) || !text(selection.rationale))
      add('selection', 'Selection must identify an option and explain its tradeoffs')
    if (selection.status !== 'provisional')
      add(
        'selection',
        'Comparison selection remains provisional; human acceptance is recorded through its separate milestone',
      )
    if (
      !list(selection.pendingUsabilityObligations).length ||
      selection.pendingUsabilityObligations.some((id) => !text(id))
    )
      add(
        'selection',
        'Keep explicit usability obligations visible until separately resolved through the acceptance ledger',
      )
  }
  return {
    ok: !diagnostics.length,
    mode: 'compare',
    id: record.id,
    rubricRevision,
    designSystemRevision: design?.revision || null,
    diagnostics,
    bindings,
    options,
    selection: selection || null,
    limitations: [
      'Prototype observations do not establish production integration.',
      'Subjective judgment remains with accountable reviewers.',
      'This comparison does not record human acceptance or user validation.',
    ],
  }
}

export async function validateFeatureAlternatives({ featureDir, root, manifest = {} }) {
  const research = await validateFeatureAssumptions({ featureDir, root, manifest, stage: 'design' })
  const required = research.assumptions.filter(needsInteractionComparison).map((a) => a.id)
  const recordPath = relative(root, join(featureDir, 'interaction-comparison.json'))
  if (!existsSync(resolve(root, recordPath)))
    return {
      ok: required.length === 0,
      diagnostics: required.length
        ? [
            {
              path: recordPath,
              field: 'riskSource',
              message: `Interaction alternatives required for ${required.join(', ')}`,
            },
          ]
        : [],
      applicability: required.length ? 'required' : 'not-declared',
      bindings: {},
    }
  const report = await validateAlternativeFile({ root, recordPath, featureDir, manifest })
  if (report.selection) {
    try {
      const { artifactBlock } = await import('./artifacts.mjs')
      const current = artifactBlock(
        readFileSync(join(featureDir, 'design.md'), 'utf8'),
        'flow-contract',
      )
      const selected = report.options.find((option) => option.id === report.selection.optionId)
      if (!current?.revision || current.revision !== selected?.flowRevision)
        throw Error('Design must carry the exact provisionally selected comparison flow')
    } catch (error) {
      report.diagnostics.push({ path: 'design.md', field: 'selection', message: error.message })
    }
  }
  try {
    const record = JSON.parse(readFileSync(resolve(root, recordPath)))
    if (required.some((id) => !record.riskSource?.assumptionIds?.includes(id)))
      report.diagnostics.push({
        path: recordPath,
        field: 'riskSource',
        message:
          'Comparison must cover every applicable load-bearing interaction-comparison assumption',
      })
  } catch {
    /* The primary validator already reports unreadable/invalid sources. */
  }
  report.ok = report.diagnostics.length === 0
  return report
}
