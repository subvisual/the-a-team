import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { artifactFixture } from './artifact-fixture.mjs'
import { compileFlow } from '../../src/flow.mjs'

export function fixture() {
  const obligation = (id, category, method, requiredStage) => ({
    id,
    statement: `Prove ${id}`,
    category,
    method,
    requiredStage,
    owner: { role: category, actor: null },
    status: 'pending',
    evidence: [],
  })
  return {
    schemaVersion: 1,
    revision: 1,
    requirements: [
      {
        id: 'R-ROUNDTRIP',
        version: 1,
        obligations: [
          obligation('OBL-CODE', 'engineering', 'automated', 'verification'),
          obligation('OBL-SCREEN', 'design', 'rendered-review', 'verification'),
          obligation('OBL-STUDY', 'product', 'human-study', 'product-validation'),
        ],
      },
    ],
    artifacts: [
      { path: 'prd.md', kind: 'prd', obligationIds: ['OBL-CODE', 'OBL-SCREEN', 'OBL-STUDY'] },
      { path: 'spec.md', kind: 'spec', obligationIds: ['OBL-CODE', 'OBL-SCREEN', 'OBL-STUDY'] },
      {
        path: 'briefs/pages/board.json',
        kind: 'page-brief',
        obligationIds: ['OBL-SCREEN', 'OBL-STUDY'],
      },
      { path: 'issues.md', kind: 'issues', obligationIds: ['OBL-CODE', 'OBL-SCREEN', 'OBL-STUDY'] },
    ],
  }
}

export function snapshots(ledger) {
  return Object.fromEntries(
    ledger.artifacts.map((artifact) => [
      artifact.path,
      ledger.requirements.flatMap((requirement) =>
        requirement.obligations
          .filter((obligation) => artifact.obligationIds.includes(obligation.id))
          .map(({ status, evidence, deferral, ...definition }) => ({
            requirementId: requirement.id,
            requirementVersion: requirement.version,
            ...definition,
            ...(artifact.kind === 'issues'
              ? {
                  disposition:
                    definition.id === 'OBL-CODE'
                      ? { kind: 'ticket', ticketId: 'ISS-CODE' }
                      : { kind: 'outstanding' },
                }
              : {}),
          })),
      ),
    ]),
  )
}

export function writeFixture(directory, ledger = fixture(), records = snapshots(ledger)) {
  const { wireflow, pages, components } = artifactFixture()
  const flow = compileFlow({
    wireflow,
    prototype: {
      schemaVersion: 1,
      id: 'F-SAVE',
      fidelity: 'navigation',
      journeyId: 'J-SAVE',
      initialNodeId: 'N-START',
      scenario: { id: 'S-NAV', initial: {}, sequences: {} },
      states: wireflow.journeys[0].nodes.map((n) => ({
        nodeId: n.id,
        pageId: 'P1',
        kind: 'summary',
      })),
      obligations: [
        { id: 'OBL-SCREEN', capability: 'navigation', requiredTransitions: ['E-OPEN', 'E-SAVE'] },
      ],
    },
  })
  const flowBlock = '\n```flow-contract\n' + JSON.stringify(flow) + '\n```\n'
  mkdirSync(join(directory, 'lofi/src/data'), { recursive: true })
  writeFileSync(join(directory, 'lofi/src/data/flow.json'), JSON.stringify(flow))
  writeFileSync(join(directory, 'design.md'), '# Design\nSave button\n' + flowBlock)
  mkdirSync(join(directory, 'briefs/wireflow'), { recursive: true })
  writeFileSync(join(directory, 'briefs/wireflow/board.json'), JSON.stringify(wireflow))
  writeFileSync(join(directory, 'acceptance.json'), JSON.stringify(ledger, null, 2))
  for (const artifact of ledger.artifacts) {
    const path = join(directory, artifact.path)
    mkdirSync(dirname(path), { recursive: true })
    const data = records[artifact.path]
    if (path.endsWith('.json'))
      writeFileSync(path, JSON.stringify({ ...pages, acceptanceObligations: data }))
    else {
      const body =
        artifact.kind === 'issues'
          ? '# Issues\n\n## Implement persistence\n**ID:** ISS-CODE\n**Depends on:** none\n**Requirements:** R-ROUNDTRIP\n\n### Acceptance criteria\n- [ ] Given saved input, when reopened, then it is restored\n\n### Technical notes\nCode implementation only.\n'
          : `# ${artifact.kind}\n\nRequirement R-ROUNDTRIP describes persistence.\n${artifact.kind === 'spec' ? '\n```component-states\n' + JSON.stringify(components) + '\n```\n' + flowBlock : ''}`
      writeFileSync(
        path,
        `${body}\n\`\`\`acceptance-obligations\n${JSON.stringify(data, null, 2)}\n\`\`\`\n`,
      )
    }
  }
  return directory
}

export const decision = () => ({
  actor: 'Product lead',
  authorized: true,
  reference: 'decisions/D-7.md',
  rationale: 'Approved scope revision',
  consequence: 'New evidence required',
})
