import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { compileFlow, flowRevision } from '../src/flow.mjs'
import { saveFlow } from './fixtures/flow/save.mjs'
import { createFlow } from '../../.claude/skills/build-lofi/templates/src/lib/flow-runtime.mjs'
const cli = resolve(import.meta.dirname, '../src/prototype-cli.mjs')
function fixture(t, fidelity = 'interactive') {
  const root = mkdtempSync(join(tmpdir(), 'ateam-flow-cli-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const featureDir = join(root, 'feature')
  mkdirSync(join(featureDir, 'briefs/wireflow'), { recursive: true })
  const inputs = saveFlow(fidelity),
    contract = compileFlow(inputs)
  writeFileSync(
    join(featureDir, 'acceptance.json'),
    JSON.stringify({
      schemaVersion: 1,
      requirements: [
        { id: 'R-SAVE', version: 1, obligations: contract.obligations.map((o) => ({ id: o.id })) },
      ],
    }),
  )
  writeFileSync(join(featureDir, 'briefs/wireflow/board.json'), JSON.stringify(inputs.wireflow))
  const markdown = '# Synthetic design\n```flow-contract\n' + JSON.stringify(contract) + '\n```\n'
  writeFileSync(join(featureDir, 'design.md'), markdown)
  writeFileSync(join(featureDir, 'spec.md'), markdown)
  const run = (command, ...args) =>
    spawnSync(process.execPath, [cli, command, '--feature', featureDir, '--root', root, ...args], {
      encoding: 'utf8',
    })
  return { root, featureDir, contract, inputs, run }
}
test('actual prototype command preserves design/graph/spec IDs and refuses stale or missing mappings', (t) => {
  const f = fixture(t),
    result = f.run('generate')
  assert.equal(result.status, 0, result.stdout)
  const generated = JSON.parse(readFileSync(join(f.featureDir, 'lofi/src/data/flow.json'), 'utf8'))
  assert.deepEqual(generated, f.contract)
  const manifest = JSON.parse(readFileSync(join(f.featureDir, 'lofi/flow-manifest.json'), 'utf8'))
  assert.deepEqual(
    manifest.nodes,
    f.inputs.wireflow.journeys[0].nodes.map((n) => n.id),
  )
  assert.deepEqual(manifest.transitions.find((e) => e.id === 'E-FAIL').condition, {
    kind: 'outcome',
    value: 'failure',
  })
  assert.equal(f.run('validate', '--stage', 'spec').status, 0)
  writeFileSync(join(f.featureDir, 'spec.md'), '# Lost flow mapping')
  assert.equal(f.run('validate', '--stage', 'spec').status, 2)
  f.inputs.wireflow.journeys[0].edges[0].to = 'N-MISSING'
  writeFileSync(join(f.featureDir, 'briefs/wireflow/board.json'), JSON.stringify(f.inputs.wireflow))
  assert.equal(f.run('generate').status, 2)
})
test('unknown transition target blocks before any prototype output exists', (t) => {
  const f = fixture(t)
  f.contract.graph.edges[0].to = 'N-NOT-DEFINED'
  const { revision, ...content } = f.contract
  f.contract.revision = flowRevision(content)
  writeFileSync(
    join(f.featureDir, 'design.md'),
    '```flow-contract\n' + JSON.stringify(f.contract) + '\n```\n',
  )
  const result = f.run('generate')
  assert.equal(result.status, 2)
  assert.match(result.stdout, /E-INVALID/)
  assert.match(result.stdout, /N-NOT-DEFINED/)
  assert.equal(existsSync(join(f.featureDir, 'lofi')), false)
})
test('actual evidence command keeps navigation-only validation and recovery unverified', (t) => {
  const f = fixture(t, 'navigation')
  assert.equal(f.run('generate').status, 0)
  const flow = createFlow(f.contract)
  for (const id of ['E-SAVE', 'E-FAIL', 'E-RETRY', 'E-SAVED', 'E-SUBMIT']) flow.navigate(id)
  writeFileSync(join(f.featureDir, 'receipt.json'), JSON.stringify(flow.receipt()))
  const result = f.run('assess', '--input', 'receipt.json')
  assert.equal(result.status, 0, result.stdout)
  const report = JSON.parse(result.stdout)
  assert.equal(report.obligations.find((o) => o.id === 'OBL-NAV').status, 'observed')
  assert.equal(report.obligations.find((o) => o.id === 'OBL-RECOVERY').status, 'unverified')
  assert.equal(report.obligations.find((o) => o.id === 'OBL-VALIDATION').status, 'unverified')
})
test('prototype validation refuses an obligation absent from the canonical ledger', (t) => {
  const f = fixture(t)
  f.contract.obligations[0].id = 'OBL-MISSING'
  const { revision, ...content } = f.contract
  f.contract.revision = flowRevision(content)
  writeFileSync(
    join(f.featureDir, 'design.md'),
    '```flow-contract\n' + JSON.stringify(f.contract) + '\n```\n',
  )
  const result = f.run('generate')
  assert.equal(result.status, 2)
  assert.match(result.stdout, /OBL-MISSING/)
})
