import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { writeFixture } from './obligations-fixture.mjs'
import { assumptionsFixture, writeAssumptions } from './assumptions-fixture.mjs'

export const featureCli = resolve(import.meta.dirname, '../../src/feature-cli.mjs')
export const human = {
  kind: 'human',
  actor: 'Synthetic operator',
  authorized: true,
  reference: 'fixture:decision-1',
}
export function operatorFixture(
  root,
  { runnerHome = join(root, 'runner-home'), runtimeUrl } = {},
) {
  const dir = join(root, 'docs/features/save')
  mkdirSync(dir, { recursive: true })
  mkdirSync(join(root, 'docs/product/jtbd'), { recursive: true })
  writeFileSync(join(root, 'docs/product/jtbd/01-save.md'), '# Save work')
  const context = {
    schemaVersion: 1,
    purpose: 'Save work',
    audience: 'Editors',
    currentState: 'planned',
    authorityOrder: ['requirements', 'code'],
    globalInvariants: [],
    bindings: { design: 'existing library', engineering: 'existing repo' },
    commands: [],
    unresolvedDecisions: [],
    sources: [],
    facts: [],
    history: [],
  }
  writeFileSync(
    join(root, 'docs/product/context.md'),
    '# Context\n```ateam-context\n' + JSON.stringify(context) + '\n```\n',
  )
  writeFixture(dir)
  writeAssumptions(root, assumptionsFixture())
  writeFileSync(
    join(dir, 'briefs/pages/index.html'),
    '<!doctype html><title>Save board</title><h1>Save board</h1><p>Synthetic review artifact.</p>',
  )
  let revision = 0,
    event = 0
  const env = { ...process.env, ATEAM_RUNNER_HOME: runnerHome }
  const invoke = (args) =>
    spawnSync(process.execPath, [featureCli, ...args], { encoding: 'utf8', env })
  const run = (type, input = {}, override = {}) => {
    const child = invoke([
      type,
      '--feature',
      dir,
      '--expected-revision',
      String(override.revision ?? revision),
      '--event-id',
      override.eventId || `operator-${++event}`,
      '--input',
      JSON.stringify(input),
    ])
    if (child.stderr) throw new Error(child.stderr)
    const result = JSON.parse(child.stdout)
    if (result.manifest) revision = result.manifest.revision
    return { ...result, exitCode: child.status }
  }
  const status = (format = 'json') =>
    invoke(['status', '--feature', dir, '--format', format])
  const init = () =>
    run('init', {
      slug: 'save',
      prompt: 'A recoverable save flow',
      repo: root,
      run_brief: {
        mode: 'prototype',
        outcome: 'Review the save interaction',
        assumptions: ['ASM-SAVE'],
        deliverables: ['Save prototype'],
        required_verification: ['Round trip and rendered review'],
        ...(runtimeUrl
          ? { runtime_links: [{ label: 'Save prototype', url: runtimeUrl }] }
          : {}),
      },
    })
  const definition = () => {
    run('start', { phase: 'discovery' })
    run('complete', {
      phase: 'discovery',
      artifacts: ['../../product/context.md', '../../product/jtbd'],
    })
    run('start', { phase: 'definition' })
    return run('complete', { phase: 'definition', artifacts: ['prd.md'] })
  }
  return {
    root,
    dir,
    runnerHome,
    run,
    status,
    init,
    definition,
    get revision() {
      return revision
    },
    read: () => JSON.parse(readFileSync(join(dir, 'feature.json'), 'utf8')),
  }
}
