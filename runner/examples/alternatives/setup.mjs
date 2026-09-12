// Creates a new disposable synthetic project; never edits a client project.
import { mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { compileFlow } from '../../src/flow.mjs'
import { isMain } from '../../src/entrypoint.mjs'
import { saveFlow } from '../../test/fixtures/flow/save.mjs'
import {
  writeAssumptions,
  assumptionsFixture,
  researchPath,
} from '../../test/helpers/assumptions-fixture.mjs'

export function interactionFlows() {
  const workspace = saveFlow()
  workspace.prototype.id = 'F-WORKSPACE'
  workspace.prototype.scenario.initial.owner = ''
  const owner = { key: 'owner', label: 'Request owner', required: true }
  for (const state of workspace.prototype.states.filter((s) => s.kind === 'form'))
    state.fields.push(owner)
  const guided = structuredClone(workspace)
  guided.prototype.id = 'F-GUIDED'
  for (const state of guided.prototype.states.filter((s) => s.kind === 'form'))
    state.fields = state.fields.filter((f) => f.key !== 'owner')
  const graph = guided.wireflow.journeys[0]
  for (const edge of graph.edges.filter((e) => e.trigger === 'save')) {
    edge.trigger = 'next'
    edge.label = 'Continue to owner'
    if (edge.condition.kind === 'valid') edge.to = 'N-OWNER'
  }
  for (const [id, text, invalid] of [
    ['N-OWNER', 'Assign an owner', false],
    ['N-OWNER-INVALID', 'Enter a request owner', true],
  ]) {
    graph.nodes.push({ id, type: 'screen', pageId: 'P-OWNER', text, col: 2, lane: 'Editor' })
    guided.prototype.states.push({
      nodeId: id,
      pageId: 'P-OWNER',
      kind: 'form',
      fields: [owner],
      ...(invalid ? { invalid: true } : {}),
    })
    for (const [kind, to] of [
      ['valid', 'N-SAVING'],
      ['invalid', 'N-OWNER-INVALID'],
    ])
      graph.edges.push({
        id: `E-${id}-${kind.toUpperCase()}`,
        from: id,
        to,
        trigger: 'save',
        label: 'Save request',
        condition: { kind },
      })
    graph.edges.push({
      id: `E-${id}-BACK`,
      from: id,
      to: 'N-EDIT',
      trigger: 'back',
      label: 'Back to request',
    })
  }
  return { guided: compileFlow(guided), workspace: compileFlow(workspace) }
}

export function createAlternativeFixture(destination) {
  const root = resolve(destination)
  if (existsSync(root)) throw Error('Choose a new destination; existing paths are preserved')
  mkdirSync(root, { recursive: true })
  const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
  const bind = (path, body) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), body)
    return { path, revision: hash(body) }
  }
  writeAssumptions(
    root,
    assumptionsFixture({
      features: ['*'],
      statement: 'A guided sequence may make ownership clearer than a direct workspace',
      cheapestProbe: {
        method: 'interaction-comparison',
        description: 'Compare required input and failed-save recovery under the same scenario',
        evidenceProducingStage: 'design',
      },
      uncertainty: 'Synthetic hypothesis. No target-user evidence exists for either sequence.',
    }),
  )
  const flows = interactionFlows()
  const designSystem = bind('tokens.css', readFileSync(new URL('./tokens.css', import.meta.url)))
  const record = {
    schemaVersion: 1,
    id: 'COMPARE-REQUEST',
    featureSlug: 'save',
    mode: 'compare',
    risk: {
      level: 'high',
      uncertainty: 'Guided steps or a direct workspace for request ownership?',
      ...bind(
        'risk.md',
        '# Synthetic task-sequence risk\nThe fixture author accepted comparing these two structures. This is not customer evidence.\n',
      ),
    },
    riskSource: {
      path: researchPath,
      sha256: hash(readFileSync(join(root, researchPath))),
      revision: 1,
      assumptionIds: ['ASM-SAVE'],
    },
    job: {
      id: '01',
      ...bind(
        'docs/product/jtbd/01-save.md',
        '---\nid: "01"\nstatus: active\n---\n# Synthetic accepted job\nSubmit a named request with an owner without losing entered work after failure.\nAuthority: synthetic fixture author; no client facts.\n',
      ),
    },
    designSystem,
    scenario: flows.guided.scenario,
    constraints: [
      'Use the same tokens and components',
      'Require name and owner',
      'Retain entered input after a failed save',
    ],
    criteria: [
      {
        id: 'C-RECOVERY',
        question: 'Does a failed save preserve both fields and allow retry?',
        method: 'interactive-prototype',
        obligationIds: ['OBL-RECOVERY', 'OBL-NAV', 'OBL-VALIDATION'],
      },
      {
        id: 'C-USABILITY',
        question: 'Can intended users complete this job without assistance?',
        method: 'human-study',
      },
    ],
    options: Object.entries(flows).map(([id, flow]) => ({
      id,
      title: id === 'guided' ? 'Guided steps' : 'Direct workspace',
      flow: bind(`${id}.json`, JSON.stringify(flow, null, 2) + '\n'),
      designSystem,
      tradeoffs:
        id === 'guided'
          ? {
              benefits: ['One decision at each step'],
              costs: ['Extra navigation to review both fields'],
            }
          : {
              benefits: ['Both decisions visible and editable together'],
              costs: ['More information to consider at once'],
            },
      observations: [
        {
          criterionId: 'C-RECOVERY',
          status: 'unrun',
          note: 'Run the real browser comparison to capture flow evidence.',
        },
        {
          criterionId: 'C-USABILITY',
          status: 'unrun',
          note: 'No target-user study is authorized or represented by this synthetic example.',
        },
      ],
    })),
    selection: {
      optionId: 'guided',
      status: 'provisional',
      rationale:
        'Use the explicit sequence as a discussion candidate; user success has not been compared.',
      pendingUsabilityObligations: ['OBL-STUDY'],
    },
  }
  bind('comparison.json', JSON.stringify(record, null, 2) + '\n')
  for (const file of ['index.html', 'app.mjs'])
    copyFileSync(new URL(file, import.meta.url), join(root, file))
  copyFileSync(
    new URL(
      '../../../.claude/skills/build-lofi/templates/src/lib/flow-runtime.mjs',
      import.meta.url,
    ),
    join(root, 'flow-runtime.mjs'),
  )
  return { root, record, flows }
}
if (isMain(import.meta.url)) {
  if (!process.argv[2]) throw Error('Pass a new disposable destination')
  console.log(
    JSON.stringify({ schemaVersion: 1, ...createAlternativeFixture(process.argv[2]) }, null, 2),
  )
}
