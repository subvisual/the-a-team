import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  lstatSync,
  existsSync,
  realpathSync,
} from 'node:fs'
import { join, relative, resolve, dirname } from 'node:path'
import { contextPath } from './context.mjs'
import { artifactBlock } from './artifacts.mjs'
import { validateFlow, flowRevision, compileFlow, assessFlowEvidence } from './flow.mjs'

const templates = resolve(import.meta.dirname, '../../.claude/skills/build-lofi/templates')
function featureFiles(featureDir, root) {
  const directory = realpathSync(featureDir),
    target = realpathSync(
      root || JSON.parse(readFileSync(join(directory, 'feature.json'), 'utf8')).repo,
    )
  const path = (name) => contextPath(target, relative(target, join(directory, name)))
  const output = (name) => {
    // Generated names are fixed harness paths. Reject every symlink, including
    // in-target links, so regeneration cannot overwrite unrelated project work.
    if (
      relative(target, directory).startsWith('..') ||
      !name.startsWith('lofi/') ||
      name.split('/').includes('..')
    )
      throw new Error('Prototype output must stay in the feature lofi directory')
    let current = directory
    for (const part of name.split('/')) {
      current = join(current, part)
      try {
        if (lstatSync(current).isSymbolicLink())
          throw new Error(`Prototype output is a symlink: ${name}`)
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
    }
    return current
  }
  return { path, output, read: (name) => readFileSync(path(name), 'utf8') }
}

export function validateFeatureFlow({ featureDir, root, stage = 'design', generated = true }) {
  const diagnostics = [],
    { read } = featureFiles(featureDir, root)
  let contract
  const add = (path, message, id = null) =>
    diagnostics.push({
      path,
      id,
      field: 'flow-contract',
      message,
      severity: 'error',
      code: 'flow-invalid',
    })
  try {
    contract = artifactBlock(read('design.md'), 'flow-contract')
    diagnostics.push(
      ...validateFlow(contract).diagnostics.map((d) => ({
        ...d,
        code: 'flow-invalid',
        severity: 'error',
      })),
    )
    const { revision, ...content } = contract
    const ledger = JSON.parse(read('acceptance.json'))
    const obligationIds = new Set(
      (Array.isArray(ledger?.requirements) ? ledger.requirements : []).flatMap((requirement) =>
        (Array.isArray(requirement?.obligations) ? requirement.obligations : []).map(
          (obligation) => obligation?.id,
        ),
      ),
    )
    for (const obligation of Array.isArray(contract.obligations) ? contract.obligations : [])
      if (!obligationIds.has(obligation?.id))
        add(
          'design.md',
          'Unknown obligation ID; reference the canonical acceptance.json ledger',
          obligation?.id,
        )
    if (revision !== flowRevision(content))
      add('design.md', 'Flow contract revision does not match its content', contract.id)
    const wireflow = JSON.parse(read('briefs/wireflow/board.json'))
    if (
      contract.sourceRevision !== flowRevision(wireflow) ||
      flowRevision(contract.graph) !==
        flowRevision(wireflow.journeys?.find((j) => j?.id === contract.journeyId))
    )
      add(
        'design.md',
        'Flow graph differs from the current wireflow; retain all IDs, conditions and transitions',
        contract.id,
      )
    if (
      generated &&
      flowRevision(JSON.parse(read('lofi/src/data/flow.json'))) !== flowRevision(contract)
    )
      add(
        'lofi/src/data/flow.json',
        'Generated prototype differs from the design flow contract',
        contract.id,
      )
    if (
      !['definition', 'design'].includes(stage) &&
      flowRevision(artifactBlock(read('spec.md'), 'flow-contract')) !== flowRevision(contract)
    )
      add('spec.md', 'Spec must carry the exact accepted design flow contract', contract.id)
  } catch (error) {
    add('design.md / prototype / spec', error.message)
  }
  return { schemaVersion: 1, ok: diagnostics.length === 0, diagnostics, contract }
}

export function generatePrototype({ featureDir, root }) {
  const report = validateFeatureFlow({ featureDir, root, generated: false })
  if (!report.ok)
    throw new Error(
      report.diagnostics.map((d) => `${d.path}:${d.id || '-'} ${d.message}`).join('; '),
    )
  const { output } = featureFiles(featureDir, root)
  // Copy the incumbent scaffold only for a new prototype. Regeneration owns only
  // its generated flow player, local runtime, flow page, data and manifest.
  const scaffold = []
  const walk = (directory, prefix = '') => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const name = prefix + entry.name
      if (entry.isDirectory()) walk(join(directory, entry.name), name + '/')
      else if (entry.isFile()) scaffold.push(name)
    }
  }
  if (!existsSync(output('lofi/package.json'))) walk(templates)
  for (const name of [
    ...scaffold.map((n) => 'lofi/' + n),
    'lofi/src/components/FlowPlayer.astro',
    'lofi/src/lib/flow-runtime.mjs',
    'lofi/src/data/flow.json',
    'lofi/src/pages/flow.astro',
    'lofi/src/pages/index.astro',
    'lofi/flow-manifest.json',
  ])
    output(name)
  const put = (name, value) => {
    const target = output(name)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, value)
  }
  for (const name of scaffold)
    if (!existsSync(output('lofi/' + name)))
      put('lofi/' + name, readFileSync(join(templates, name)))
  for (const name of ['src/components/FlowPlayer.astro', 'src/lib/flow-runtime.mjs'])
    put(`lofi/${name}`, readFileSync(join(templates, name)))
  put('lofi/src/data/flow.json', JSON.stringify(report.contract, null, 2) + '\n')
  put(
    'lofi/src/pages/flow.astro',
    `---\nimport Layout from '../layouts/Layout.astro';\nimport FlowPlayer from '../components/FlowPlayer.astro';\nimport contract from '../data/flow.json';\n---\n<Layout title="Scenario prototype" purpose="Follow the scenario, then reset to repeat the same conditions."><FlowPlayer contract={contract} /></Layout>\n`,
  )
  if (!existsSync(output('lofi/src/pages/index.astro')))
    put('lofi/src/pages/index.astro', `---\nreturn Astro.redirect('/flow');\n---\n`)
  const manifest = {
    schemaVersion: 1,
    flowId: report.contract.id,
    contractRevision: report.contract.revision,
    sourceRevision: report.contract.sourceRevision,
    scenarioId: report.contract.scenario.id,
    fidelity: report.contract.fidelity,
    route: '/flow',
    journeyId: report.contract.graph.id,
    nodes: report.contract.graph.nodes.map((n) => n.id),
    transitions: report.contract.graph.edges.map((e) => ({
      id: e.id,
      from: e.from,
      to: e.to,
      trigger: e.trigger,
      condition: e.condition || null,
    })),
  }
  put('lofi/flow-manifest.json', JSON.stringify(manifest, null, 2) + '\n')
  return { ...report, manifest, path: dirname(output('lofi/package.json')) }
}

export function compileFeatureFlow({ featureDir, root, input }) {
  const { read } = featureFiles(featureDir, root)
  return {
    ok: true,
    contract: compileFlow({
      wireflow: JSON.parse(read('briefs/wireflow/board.json')),
      prototype: JSON.parse(read(input)),
    }),
  }
}
export function assessFeatureFlow({ featureDir, root, input }) {
  const report = validateFeatureFlow({ featureDir, root })
  if (!report.ok) return report
  const { read } = featureFiles(featureDir, root)
  return {
    ok: true,
    ...assessFlowEvidence({ contract: report.contract, receipt: JSON.parse(read(input)) }),
  }
}
