// Synthetic public workflow. No target/client facts or production persistence.
export function saveFlow(fidelity = 'interactive') {
  const nodes = [
    { id: 'N-EDIT', type: 'screen', pageId: 'P-EDIT', text: 'Edit request', col: 0 },
    { id: 'N-INVALID', type: 'screen', pageId: 'P-EDIT', text: 'Enter a request name', col: 1 },
    { id: 'N-SAVING', type: 'system', text: 'Saving request', col: 2 },
    {
      id: 'N-ERROR',
      type: 'screen',
      pageId: 'P-EDIT',
      text: 'Save failed. Your changes are retained.',
      col: 3,
    },
    { id: 'N-REVIEW', type: 'screen', pageId: 'P-REVIEW', text: 'Review saved request', col: 4 },
    { id: 'N-DONE', type: 'screen', pageId: 'P-DONE', text: 'Request submitted', col: 5 },
  ].map((node) => ({ ...node, lane: 'Editor' }))
  const edge = (id, from, to, trigger, label, extra = {}) => ({
    id,
    from,
    to,
    trigger,
    label,
    ...extra,
  })
  const edges = [
    edge('E-INVALID', 'N-EDIT', 'N-INVALID', 'save', 'Save request', {
      condition: { kind: 'invalid' },
    }),
    edge('E-SAVE', 'N-EDIT', 'N-SAVING', 'save', 'Save request', { condition: { kind: 'valid' } }),
    edge('E-STILL-INVALID', 'N-INVALID', 'N-INVALID', 'save', 'Save request', {
      condition: { kind: 'invalid' },
    }),
    edge('E-CORRECT', 'N-INVALID', 'N-SAVING', 'save', 'Save request', {
      condition: { kind: 'valid' },
    }),
    edge('E-FAIL', 'N-SAVING', 'N-ERROR', 'settle', 'Save failed', {
      condition: { kind: 'outcome', value: 'failure' },
    }),
    edge('E-SAVED', 'N-SAVING', 'N-REVIEW', 'settle', 'Save succeeded', {
      condition: { kind: 'outcome', value: 'success' },
      effect: 'persist',
    }),
    edge('E-RETRY', 'N-ERROR', 'N-SAVING', 'retry', 'Retry save'),
    edge('E-SUBMIT', 'N-REVIEW', 'N-DONE', 'submit', 'Submit request'),
    edge('E-EDIT', 'N-REVIEW', 'N-EDIT', 'edit', 'Edit request'),
  ]
  const wireflow = {
    title: 'Synthetic request',
    lanes: ['Editor'],
    jtbds: ['01'],
    journeys: [{ id: 'J-SAVE', title: 'Save and submit', jtbd: '01', jtbds: ['01'], nodes, edges }],
  }
  const field = { key: 'name', label: 'Request name', required: true }
  const prototype = {
    schemaVersion: 1,
    id: 'F-SAVE',
    fidelity,
    journeyId: 'J-SAVE',
    initialNodeId: 'N-EDIT',
    scenario: {
      id: 'S-FAIL-RETRY',
      initial: { name: '' },
      sequences: { save: ['failure', 'success'] },
    },
    states: [
      { nodeId: 'N-EDIT', pageId: 'P-EDIT', kind: 'form', fields: [field] },
      { nodeId: 'N-INVALID', pageId: 'P-EDIT', kind: 'form', fields: [field], invalid: true },
      { nodeId: 'N-SAVING', pageId: 'P-EDIT', kind: 'loading', operation: 'save', delayMs: 300 },
      { nodeId: 'N-ERROR', pageId: 'P-EDIT', kind: 'error' },
      { nodeId: 'N-REVIEW', pageId: 'P-REVIEW', kind: 'summary' },
      { nodeId: 'N-DONE', pageId: 'P-DONE', kind: 'summary' },
    ],
    obligations: [
      { id: 'OBL-NAV', capability: 'navigation', requiredTransitions: ['E-SAVED', 'E-SUBMIT'] },
      {
        id: 'OBL-VALIDATION',
        capability: 'validation',
        requiredTransitions: ['E-INVALID', 'E-CORRECT'],
      },
      {
        id: 'OBL-RECOVERY',
        capability: 'recovery',
        requiredTransitions: ['E-FAIL', 'E-RETRY', 'E-SAVED'],
      },
    ],
  }
  return { wireflow, prototype }
}
