// Local fixture interpreter only. No network, storage or application backend.
export function createFlow(contract) {
  contract = structuredClone(contract)
  const nodes = new Map(contract.graph.nodes.map((n) => [n.id, n]))
  const states = new Map(contract.states.map((s) => [s.nodeId, s]))
  let state, counters
  const snapshot = () => structuredClone(state)
  function beginRequest() {
    if (states.get(state.nodeId).kind !== 'loading' || contract.fidelity !== 'interactive') return
    state.pending = structuredClone(state.draft)
    state.requests.push({
      operation: states.get(state.nodeId).operation,
      payload: structuredClone(state.pending),
      outcome: null,
    })
  }
  function reset() {
    counters = Object.create(null)
    state = {
      nodeId: contract.initialNodeId,
      draft: structuredClone(contract.scenario.initial),
      persisted: {},
      requests: [],
      transitions: [],
      pending: null,
    }
    beginRequest()
    return snapshot()
  }
  function move(edge, outcome) {
    if (!edge || edge.from !== state.nodeId || !nodes.has(edge.to))
      throw new Error('Transition is not available from the current node')
    if (edge.effect === 'persist' && contract.fidelity === 'interactive')
      state.persisted = structuredClone(state.pending)
    state.transitions.push(edge.id)
    state.nodeId = edge.to
    if (states.get(edge.to).kind === 'loading' && contract.fidelity === 'interactive') {
      beginRequest()
    } else if (outcome !== undefined) state.pending = null
    return snapshot()
  }
  function change(key, value) {
    if (
      contract.fidelity !== 'interactive' ||
      states.get(state.nodeId).kind !== 'form' ||
      !states.get(state.nodeId).fields.some((f) => f.key === key) ||
      typeof value !== 'string'
    )
      throw new Error('Field is not editable in this state')
    state.draft[key] = value
    return snapshot()
  }
  function transition(trigger, outcome) {
    if (contract.fidelity !== 'interactive')
      throw new Error('Navigation fidelity uses explicit graph links')
    const invalid = (states.get(state.nodeId).fields || []).some(
      (f) => f.required && !state.draft[f.key].trim(),
    )
    const candidates = contract.graph.edges.filter(
      (e) =>
        e.from === state.nodeId &&
        e.trigger === trigger &&
        (!e.condition ||
          (e.condition.kind === 'valid' && !invalid) ||
          (e.condition.kind === 'invalid' && invalid) ||
          (e.condition.kind === 'outcome' && e.condition.value === outcome)),
    )
    if (candidates.length !== 1)
      throw new Error(`Event ${trigger} is not available or has ambiguous conditions`)
    return move(candidates[0], outcome)
  }
  function send(trigger) {
    if (trigger === 'settle')
      throw new Error('Simulated outcomes come only from the scenario sequence')
    return transition(trigger)
  }
  function settle() {
    const current = states.get(state.nodeId)
    if (contract.fidelity !== 'interactive' || current.kind !== 'loading')
      throw new Error('No simulated request is pending')
    const sequence = contract.scenario.sequences[current.operation],
      index = counters[current.operation] || 0
    if (index >= sequence.length) throw new Error('Scenario sequence exhausted; reset to replay it')
    const outcome = sequence[index]
    const requestIndex = state.requests.length - 1
    const next = transition('settle', outcome)
    counters[current.operation] = index + 1
    state.requests[requestIndex].outcome = outcome
    return { ...next, requests: structuredClone(state.requests) }
  }
  function navigate(id) {
    if (contract.fidelity !== 'navigation')
      throw new Error('Interactive fidelity follows event conditions')
    return move(contract.graph.edges.find((e) => e.id === id))
  }
  reset()
  return {
    snapshot,
    reset,
    change,
    send,
    settle,
    navigate,
    receipt: () => ({
      schemaVersion: 1,
      flowId: contract.id,
      contractRevision: contract.revision,
      sourceRevision: contract.sourceRevision,
      fidelity: contract.fidelity,
      scenarioId: contract.scenario.id,
      transitions: [...state.transitions],
      requests: structuredClone(state.requests),
    }),
  }
}
