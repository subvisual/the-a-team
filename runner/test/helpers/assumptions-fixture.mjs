import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const sourceHash = (value) => createHash('sha256').update(value).digest('hex')
export const researchPath = 'docs/product/research-plan.md'
export function assumptionsFixture(overrides = {}) {
  return {
    schemaVersion: 1,
    revision: 1,
    assumptions: [
      {
        id: 'ASM-SAVE',
        version: 1,
        statement: 'People can recover their save after a failed attempt',
        risk: 'usability',
        loadBearing: true,
        features: ['save'],
        dependentDecision: 'Commit the save interaction to production',
        requiredStage: 'human-acceptance',
        owner: { actor: null, role: null },
        confidence: 'hypothesis',
        disproof: 'Participants cannot recover without help',
        cheapestProbe: {
          method: 'human-study',
          description: 'Observe the retry task on a prototype',
          evidenceProducingStage: 'design',
        },
        uncertainty: 'No participant observation has been provided',
        evidence: [],
        disposition: 'pending',
        ...overrides,
      },
    ],
  }
}
export const researchDecision = (overrides = {}) => ({
  actor: 'Synthetic fixture owner',
  authorized: true,
  reference: 'fixture:decision-1',
  rationale: 'Synthetic decision for a regression scenario',
  consequence: 'Do not imply a real customer study or approval',
  ...overrides,
})
export function evidenceFixture(
  source = 'Synthetic observation: recovery was confusing.\n',
  overrides = {},
) {
  return {
    id: 'EVD-RECOVERY',
    assumptionVersion: 1,
    path: 'docs/product/research/recovery.md',
    sha256: sourceHash(source),
    reference: 'fixture:observation-1',
    origin: 'synthetic',
    method: 'human-study',
    actor: 'Synthetic observer',
    result: 'contradict',
    ...overrides,
  }
}
export function writeAssumptions(
  root,
  ledger = assumptionsFixture(),
  history = [],
  sources = {},
) {
  mkdirSync(join(root, 'docs/product'), { recursive: true })
  writeFileSync(
    join(root, researchPath),
    '# Research plan\n\n## Assumptions\n\n```ateam-assumptions\n' +
      JSON.stringify(ledger, null, 2) +
      '\n```\n',
  )
  for (const record of history) {
    const path = join(root, 'docs/product/assumptions-history', `${record.revision}.json`)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(record, null, 2))
  }
  for (const [path, content] of Object.entries(sources)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return ledger
}
