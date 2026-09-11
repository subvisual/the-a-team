// Authored synthetic measurements for calculator verification, never a real pilot.
export function syntheticPilot() {
  const milestones = [
    'implementation',
    'verification',
    'human_acceptance',
    'integration',
    'release',
    'product_validation',
  ]
  const project = (id) => ({
    id,
    identity: `fixture:${id}`,
    stack: id === 'alpha' ? 'Node API' : 'Python API',
    designSystem: id === 'alpha' ? 'Compact monochrome' : 'Spacious semantic tokens',
  })
  const attempt = (id, overrides = {}) => ({
    id,
    outcome: 'completed',
    revision: `fixture:${id}:head`,
    reference: `fixture:${id}:attempt`,
    spendUsd: 3,
    humanMinutes: 20,
    activeReviewMinutes: 8,
    decisionsRequested: 1,
    timeAttribution: 'exact',
    context: {
      costUsd: 0.3,
      minutes: 3,
      sufficiency: 'sufficient',
      reference: `fixture:${id}:context`,
    },
    review: { outcome: 'accepted', actor: 'Synthetic reviewer', reference: `fixture:${id}:review` },
    ...overrides,
  })
  const increments = []
  for (const projectId of ['alpha', 'beta'])
    for (const kind of ['new-slice', 'recovery', 'design', 'feature-delta']) {
      const id = `${projectId}-${kind}`,
        final = attempt(`${id}-final`),
        attempts = [final]
      if (id === 'alpha-new-slice')
        attempts.unshift(
          attempt(`${id}-failed`, {
            outcome: 'failed',
            spendUsd: 2,
            humanMinutes: 10,
            activeReviewMinutes: 2,
            review: null,
            context: {
              costUsd: 0.2,
              minutes: 2,
              sufficiency: 'insufficient',
              reference: 'fixture:missing-constraint',
            },
          }),
        )
      if (id === 'alpha-recovery')
        attempts.unshift(
          attempt(`${id}-interrupted`, {
            outcome: 'interrupted',
            spendUsd: 1,
            humanMinutes: 5,
            activeReviewMinutes: 0,
            review: null,
            context: {
              costUsd: 0.1,
              minutes: 1,
              sufficiency: 'unknown',
              reference: 'fixture:interrupted-context',
            },
          }),
        )
      if (id === 'beta-feature-delta') final.review.outcome = 'rejected'
      const records = Object.fromEntries(milestones.map((name) => [name, { status: 'unrun' }]))
      for (const name of ['implementation', 'verification'])
        records[name] = { status: 'recorded', reference: `fixture:${id}:${name}` }
      if (final.review.outcome === 'accepted')
        records.human_acceptance = {
          status: 'recorded',
          reference: final.review.reference,
          attemptId: final.id,
          actor: final.review.actor,
        }
      if (id === 'alpha-new-slice')
        records.integration = { status: 'recorded', reference: 'fixture:merge-only' }
      increments.push({
        id,
        projectId,
        kind,
        attempts,
        milestones: records,
        escapedDefects:
          id === 'alpha-design'
            ? [{ id: 'DEF-1', severity: 'high', reference: 'fixture:post-acceptance-contrast' }]
            : [],
        recovery:
          kind === 'recovery'
            ? { status: 'observed', correct: true, reference: `fixture:${id}:recovery` }
            : { status: 'unrun' },
        primaryJob: { status: 'unrun' },
      })
    }
  return {
    schemaVersion: 1,
    id: 'PILOT-SYNTHETIC-1',
    origin: 'synthetic',
    workflow: 'harness',
    protocolRevision: 'pilot-v1',
    projects: ['alpha', 'beta'].map(project),
    increments,
    limitations: [
      'All measurements are synthetic; no effectiveness or adoption claim.',
      'Target-user studies and release are unrun.',
    ],
    unrunObligations: ['OBL-TARGET-USER-STUDY'],
    comparison: {
      method: 'matched-scope-ordinary-assisted-work',
      status: 'unrun',
      baseline: null,
      comparability: null,
    },
  }
}
