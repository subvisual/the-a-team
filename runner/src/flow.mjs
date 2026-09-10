import { createHash } from 'node:crypto'
import { validateWireflow } from './artifacts.mjs'

const text = (v) => typeof v === 'string' && v.trim().length > 0
const list = (v) => (Array.isArray(v) ? v : [])
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
export const flowRevision = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')

export function validateFlow(contract, { path = 'design.md:flow-contract' } = {}) {
  const diagnostics = []
  const add = (id, field, message, reference = null) =>
    diagnostics.push({ path, id, field, message, reference })
  if (contract?.schemaVersion !== 1 || !text(contract.id))
    add(null, 'schemaVersion', 'A versioned flow ID is required')
  if (!['navigation', 'interactive'].includes(contract?.fidelity))
    add(contract?.id, 'fidelity', 'Choose navigation or interactive fidelity explicitly')
  const graph = contract?.graph,
    nodes = list(graph?.nodes),
    edges = list(graph?.edges)
  const report = validateWireflow({ journeys: [graph], jtbds: graph?.jtbds || [] }, { path })
  diagnostics.push(...report.diagnostics)
  const byId = new Map(nodes.map((n) => [n?.id, n])),
    pages = new Set(nodes.filter((n) => n?.type === 'screen').map((n) => n.pageId))
  for (const node of nodes)
    if (node?.type === 'screen' && !text(node.pageId))
      add(node.id, 'pageId', 'Screen requires a stable page ID')
  if (graph?.id !== contract?.journeyId)
    add(contract?.id, 'journeyId', 'Flow must preserve its journey ID', contract?.journeyId)
  if (!byId.has(contract?.initialNodeId))
    add(contract?.id, 'initialNodeId', 'Unknown initial node', contract?.initialNodeId)
  const states = new Map()
  for (const state of list(contract?.states)) {
    if (!object(state) || !byId.has(state.nodeId) || states.has(state.nodeId)) {
      add(state?.nodeId, 'states', 'Each state must reference a unique graph node', state?.nodeId)
      continue
    }
    states.set(state.nodeId, state)
    if (
      !pages.has(state.pageId) ||
      (byId.get(state.nodeId).pageId && state.pageId !== byId.get(state.nodeId).pageId)
    )
      add(state.nodeId, 'pageId', 'Unknown or mismatched state page', state.pageId)
    if (!['form', 'loading', 'error', 'summary'].includes(state.kind))
      add(state.nodeId, 'kind', 'Unsupported prototype state kind')
    if (state.kind === 'form' && (!Array.isArray(state.fields) || !state.fields.length))
      add(state.nodeId, 'fields', 'Form state requires fields')
    const keys = new Set()
    for (const field of list(state.fields)) {
      if (
        !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(field?.key) ||
        ['constructor', 'prototype'].includes(field?.key) ||
        keys.has(field?.key) ||
        !text(field?.label) ||
        typeof field?.required !== 'boolean' ||
        typeof contract?.scenario?.initial?.[field?.key] !== 'string'
      )
        add(
          state.nodeId,
          'fields',
          'Fields require unique safe keys, labels, required flags and initial string values',
          field?.key,
        )
      keys.add(field?.key)
    }
    if (state.kind === 'loading' && contract.fidelity === 'interactive') {
      if (!text(state.operation) || !list(contract?.scenario?.sequences?.[state.operation]).length)
        add(
          state.nodeId,
          'operation',
          'Loading state requires a deterministic scenario sequence',
          state.operation,
        )
      if (!Number.isInteger(state.delayMs) || state.delayMs < 0 || state.delayMs > 10000)
        add(state.nodeId, 'delayMs', 'Use a bounded local delay from 0 to 10000 ms')
    }
  }
  for (const node of nodes)
    if (!states.has(node?.id))
      add(node?.id, 'states', 'Every graph node needs an explicit prototype state')
  if (
    !text(contract?.scenario?.id) ||
    !object(contract?.scenario?.initial) ||
    !object(contract?.scenario?.sequences)
  )
    add(
      contract?.id,
      'scenario',
      'Scenario requires ID, initial values and deterministic sequences',
    )
  for (const [operation, sequence] of Object.entries(contract?.scenario?.sequences || {}))
    if (!Array.isArray(sequence) || !sequence.length || sequence.some((s) => !text(s)))
      add(
        contract?.id,
        'scenario.sequences',
        'Sequence must contain nonempty result names',
        operation,
      )
  const edgeIds = new Set(),
    groups = new Map()
  for (const edge of edges) {
    if (!text(edge?.id) || edgeIds.has(edge?.id))
      add(edge?.id, 'id', 'Flow transitions require unique stable IDs')
    edgeIds.add(edge?.id)
    if (contract.fidelity === 'navigation') continue
    if (edge.trigger === 'settle' && states.get(edge.from)?.kind !== 'loading')
      add(edge.id, 'trigger', 'The settle event is reserved for a loading fixture result')
    if (!text(edge?.trigger) || !text(edge?.label))
      add(edge?.id, 'trigger', 'Every transition requires an event trigger and action label')
    if (edge?.effect !== undefined && edge.effect !== 'persist')
      add(edge.id, 'effect', 'Only local persist simulation is supported')
    if (
      edge?.effect === 'persist' &&
      (states.get(edge.from)?.kind !== 'loading' ||
        edge.condition?.kind !== 'outcome' ||
        edge.condition.value !== 'success')
    )
      add(edge.id, 'effect', 'Persist requires a successful simulated request result')
    if (
      edge?.condition !== undefined &&
      (!['valid', 'invalid', 'outcome'].includes(edge.condition?.kind) ||
        (edge.condition.kind === 'outcome' && !text(edge.condition.value)))
    )
      add(
        edge?.id,
        'condition',
        'Unsupported condition; do not reinterpret prose as executable logic',
      )
    if (
      ['valid', 'invalid'].includes(edge?.condition?.kind) &&
      states.get(edge.from)?.kind !== 'form'
    )
      add(edge.id, 'condition', 'Validation conditions require form fields')
    if (
      edge?.condition?.kind === 'outcome' &&
      (states.get(edge.from)?.kind !== 'loading' || edge.trigger !== 'settle')
    )
      add(edge.id, 'condition', 'Outcome conditions require the loading settle event')
    const key = JSON.stringify([edge?.from, edge?.trigger])
    groups.set(key, [...(groups.get(key) || []), edge])
  }
  for (const group of groups.values()) {
    if (group.length <= 1) continue
    const predicates = group.map((e) =>
      e.condition?.kind === 'outcome' ? `outcome:${e.condition.value}` : e.condition?.kind,
    )
    if (
      predicates.some((p) => !p) ||
      new Set(predicates).size !== group.length ||
      !(
        predicates.every((p) => p.startsWith('outcome:')) ||
        (predicates.length === 2 && predicates.includes('valid') && predicates.includes('invalid'))
      )
    )
      add(
        group[0].from,
        'condition',
        'Ambiguous branching event: use complementary valid/invalid or distinct outcome predicates',
      )
  }
  for (const state of states.values())
    if (state.kind === 'loading' && contract.fidelity === 'interactive') {
      const outgoing = edges.filter((e) => e?.from === state.nodeId)
      if (outgoing.some((e) => e.trigger !== 'settle' || e.condition?.kind !== 'outcome'))
        add(state.nodeId, 'operation', 'Loading transitions must settle a named fixture outcome')
      for (const value of list(contract?.scenario?.sequences?.[state.operation]))
        if (!outgoing.some((e) => e.condition?.value === value))
          add(state.nodeId, 'operation', 'Fixture result has no transition', value)
    }
  const obligationIds = new Set()
  for (const obligation of list(contract?.obligations)) {
    if (
      !text(obligation?.id) ||
      obligationIds.has(obligation?.id) ||
      !['navigation', 'validation', 'recovery'].includes(obligation?.capability) ||
      !list(obligation?.requiredTransitions).length
    )
      add(
        obligation?.id,
        'obligations',
        'Declare unique obligation IDs, capability and required transition IDs',
      )
    obligationIds.add(obligation?.id)
    for (const id of list(obligation?.requiredTransitions))
      if (!edgeIds.has(id)) add(obligation.id, 'requiredTransitions', 'Unknown transition', id)
  }
  return { schemaVersion: 1, ok: diagnostics.length === 0, diagnostics }
}

export function compileFlow({ wireflow, prototype }) {
  const graph = wireflow?.journeys?.find((j) => j?.id === prototype?.journeyId)
  const contract = {
    ...structuredClone(prototype),
    graph: structuredClone(graph),
    sourceRevision: flowRevision(wireflow),
  }
  const report = validateFlow(contract)
  if (!report.ok)
    throw new Error(
      report.diagnostics
        .map(
          (d) =>
            `${d.path}:${d.id || '-'} ${d.field}: ${d.message}${d.reference ? ` (${d.reference})` : ''}`,
        )
        .join('; '),
    )
  return { ...contract, revision: flowRevision(contract) }
}

export function assessFlowEvidence({ contract, receipt }) {
  const current =
    receipt?.flowId === contract.id &&
    receipt?.contractRevision === contract.revision &&
    receipt?.sourceRevision === contract.sourceRevision &&
    receipt?.scenarioId === contract.scenario.id &&
    receipt?.fidelity === contract.fidelity
  const observed = new Set(current ? list(receipt.transitions) : [])
  return {
    schemaVersion: 1,
    current,
    classification: 'deterministic prototype observation; no production or human-study acceptance',
    obligations: list(contract.obligations).map((obligation) => {
      const supported =
        contract.fidelity === 'interactive' || obligation.capability === 'navigation'
      return {
        id: obligation.id,
        status:
          current && supported && obligation.requiredTransitions.every((id) => observed.has(id))
            ? 'observed'
            : 'unverified',
        reason: !current
          ? 'Stale or mismatched scenario evidence'
          : !supported
            ? 'Navigation-only fidelity cannot assess validation or recovery'
            : 'Requires actual scenario observations; keep the canonical method and acceptance stage',
      }
    }),
  }
}
