import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fixture as ledgerFixture, writeFixture } from './helpers/obligations-fixture.mjs'
const feature = await import('../src/feature-state.mjs')
const cli = resolve(import.meta.dirname, '../src/feature-cli.mjs')

for (const command of ['fail', 'abort'])
  test(`${command} preserves its reason across CLI persistence and reload`, async (t) => {
    const f = fixture(t)
    f.init()
    f.run('start', { phase: 'discovery' })
    const result = f.run(command, {
      phase: 'discovery',
      reason: 'Required source evidence is unavailable',
    })
    assert.equal(result.status, 'success')
    assert.equal(result.manifest.last_error, 'Required source evidence is unavailable')
    assert.equal(
      (await feature.loadFeature(f.dir)).last_error,
      'Required source evidence is unavailable',
    )
  })
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'ateam-feature-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const dir = join(root, 'docs/features/save')
  mkdirSync(dir, { recursive: true })
  const index = {
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
  mkdirSync(join(root, 'docs/product'), { recursive: true })
  writeFileSync(
    join(root, 'docs/product/context.md'),
    '# Context\n```ateam-context\n' + JSON.stringify(index) + '\n```\n',
  )
  mkdirSync(join(root, 'docs/product/jtbd'), { recursive: true })
  writeFileSync(join(root, 'docs/product/jtbd/01-save.md'), 'Save work')
  writeFixture(dir)
  let revision = 0,
    event = 0
  const run = (type, input = {}, override = {}) => {
    assert.ok(existsSync(cli), 'phase CLI exists')
    const child = spawnSync(
      process.execPath,
      [
        cli,
        type,
        '--feature',
        dir,
        '--expected-revision',
        String(override.revision ?? revision),
        '--event-id',
        override.eventId || `event-${++event}`,
        '--input',
        JSON.stringify(input),
      ],
      { encoding: 'utf8' },
    )
    assert.equal(child.stderr, '')
    const result = JSON.parse(child.stdout)
    if (result.manifest) revision = result.manifest.revision
    return { ...result, exitCode: child.status }
  }
  const init = () =>
    run('init', {
      slug: 'save',
      repo: root,
      run_brief: {
        mode: 'prototype',
        outcome: 'Try the save flow',
        deliverables: ['prototype'],
        required_verification: ['round trip and rendered review'],
      },
    })
  const completeDiscovery = () => {
    run('start', { phase: 'discovery' })
    return run('complete', {
      phase: 'discovery',
      artifacts: ['../../product/context.md', '../../product/jtbd'],
    })
  }
  return {
    root,
    dir,
    run,
    init,
    completeDiscovery,
    get revision() {
      return revision
    },
  }
}

test('actual phase CLI validates files, persists event identity, and resumes without duplicate approval', (t) => {
  const f = fixture(t)
  assert.equal(f.init().status, 'success')
  assert.equal(f.completeDiscovery().manifest.state, 'definition')
  assert.equal(f.run('start', { phase: 'definition' }).status, 'success')
  assert.equal(f.run('complete', { phase: 'definition', artifacts: ['prd.md'] }).status, 'success')
  const revision = f.revision
  const input = {
    phase: 'definition',
    decision: {
      kind: 'human',
      actor: 'Product owner',
      authorized: true,
      reference: 'conversation:5',
    },
  }
  const approved = f.run('approve', input, { revision, eventId: 'approval-1' })
  assert.equal(approved.status, 'success')
  assert.ok(approved.manifest.phases.definition.bindings['briefs/pages/board.json'])
  const retry = f.run('approve', input, { revision, eventId: 'approval-1' })
  assert.equal(retry.status, 'success')
  assert.equal(retry.replayed, true)
  assert.equal(retry.manifest.phases.definition.decisions.length, 1)
  const collision = f.run('approve', { ...input, provisional: true }, { eventId: 'approval-1' })
  assert.equal(collision.status, 'error')
  assert.match(collision.error.message, /event.*different/i)
  assert.equal(f.run('start', { phase: 'design' }, { revision: 0 }).status, 'error')
})

test('feature run records a stable harness or agent A/B arm', (t) => {
  const harness = fixture(t)
  const harnessInit = harness.init()
  assert.equal(harnessInit.manifest.orchestration_mode, 'harness')

  const agent = fixture(t)
  const initialized = agent.run('init', {
    slug: 'save',
    repo: agent.root,
    orchestration_mode: 'agent',
    run_brief: { mode: 'prototype' },
  })
  assert.equal(initialized.status, 'success')
  assert.equal(initialized.manifest.orchestration_mode, 'agent')
  assert.equal(JSON.parse(readFileSync(join(agent.dir, 'feature.json'))).orchestration_mode, 'agent')
  const switched = agent.run('configure', {
    orchestration_mode: 'harness',
    authorization: { kind: 'human', authorized: true, actor: 'Owner', reference: 'trial' },
  })
  assert.equal(switched.status, 'error')
  assert.match(switched.error.message, /immutable/)
  assert.equal(JSON.parse(readFileSync(join(agent.dir, 'feature.json'))).orchestration_mode, 'agent')

  const invalidFixture = fixture(t)
  const invalid = invalidFixture.run('init', {
    slug: 'save',
    repo: invalidFixture.root,
    orchestration_mode: 'hybrid',
    run_brief: { mode: 'prototype' },
  })
  assert.equal(invalid.status, 'error')
  assert.match(invalid.error.message, /orchestration_mode/)
})

test('actual artifact edit invalidates approval on reload with old decision preserved', async (t) => {
  const f = fixture(t)
  f.init()
  f.completeDiscovery()
  f.run('start', { phase: 'definition' })
  f.run('complete', { phase: 'definition', artifacts: ['prd.md'] })
  f.run('approve', {
    phase: 'definition',
    decision: { kind: 'human', actor: 'Owner', authorized: true, reference: 'conversation:6' },
  })
  writeFileSync(
    join(f.dir, 'prd.md'),
    readFileSync(join(f.dir, 'prd.md'), 'utf8') + '\nChanged requirement wording\n',
  )
  assert.equal(typeof feature.loadFeature, 'function')
  const reloaded = await feature.loadFeature(f.dir)
  assert.equal(reloaded.phases.definition.status, 'stale')
  assert.equal(reloaded.phases.definition.decisions.length, 1)
  const blocked = f.run('start', { phase: 'design' })
  assert.equal(blocked.status, 'blocked')
  assert.match(blocked.error.message, /definition/)
  assert.equal(blocked.manifest.last_error, blocked.error.message)
})

test('phase CLI refuses unresolved current obligations and stale current context', (t) => {
  const f = fixture(t)
  f.init()
  f.completeDiscovery()
  const ledger = ledgerFixture()
  ledger.requirements[0].obligations[0].requiredStage = 'definition'
  writeFixture(f.dir, ledger)
  f.run('start', { phase: 'definition' })
  const blocked = f.run('complete', { phase: 'definition', artifacts: ['prd.md'] })
  assert.equal(blocked.status, 'blocked')
  assert.match(blocked.error.message, /OBL-CODE.*required by definition/)
  assert.equal(blocked.manifest.phases.definition.status, 'in_progress')
  writeFileSync(join(f.root, 'docs/product/context.md'), '# Legacy prose without current index')
  const context = f.run('start', { phase: 'definition' })
  assert.equal(context.status, 'blocked')
  assert.match(context.error.message, /context|index/i)
})

test('concurrent CAS commands admit one writer and reject stale revision', async (t) => {
  const f = fixture(t)
  f.init()
  assert.equal(typeof feature.applyFeatureCommand, 'function')
  const results = await Promise.all(
    [1, 2].map((number) =>
      feature.applyFeatureCommand({
        featureDir: f.dir,
        expectedRevision: f.revision,
        eventId: `concurrent-${number}`,
        command: { type: 'start', phase: 'discovery' },
      }),
    ),
  )
  assert.equal(results.filter((x) => x.status === 'success').length, 1)
  assert.equal(results.filter((x) => x.status === 'error').length, 1)
  const manifest = JSON.parse(readFileSync(join(f.dir, 'feature.json'), 'utf8'))
  assert.equal(manifest.revision, 2)
  assert.equal(manifest.event_history.length, 2)
})

test('phase skills call the transition CLI instead of assigning status by hand', () => {
  for (const name of ['discovery', 'definition', 'design', 'spec']) {
    const source = readFileSync(
      resolve(import.meta.dirname, `../../.claude/skills/ateam-${name}/SKILL.md`),
      'utf8',
    )
    assert.match(source, /feature-cli\.mjs complete/)
    assert.doesNotMatch(source, /set (?:\*\*only\*\* )?`phases\.[a-z]+\.status = "complete"`/)
  }
})

test('coded prototype reaches implementation while its planned human study remains pending', (t) => {
  const f = fixture(t)
  f.init()
  f.run('configure', {
    run_brief: {
      mode: 'prototype',
      stopping_point: 'dev',
      required_verification: ['round trip and rendered review'],
    },
    authorization: {
      kind: 'human',
      actor: 'Owner',
      authorized: true,
      reference: 'request:coded-prototype',
    },
  })
  f.completeDiscovery()
  const decision = { kind: 'human', actor: 'Owner', authorized: true, reference: 'request:review' }
  for (const phase of ['definition', 'design', 'spec', 'issues']) {
    assert.equal(f.run('start', { phase }).status, 'success')
    assert.equal(
      f.run('complete', {
        phase,
        artifacts: [
          { definition: 'prd.md', design: 'design.md', spec: 'spec.md', issues: 'issues.md' }[
            phase
          ],
        ],
      }).status,
      'success',
    )
    if (['definition', 'design'].includes(phase))
      assert.equal(f.run('approve', { phase, decision }).status, 'success')
  }
  assert.equal(f.run('start', { phase: 'dev' }).status, 'success')
  writeFileSync(join(f.dir, 'prototype.html'), '<button>Save</button>')
  const end = f.run('complete', { phase: 'dev', artifacts: ['prototype.html'] })
  assert.equal(end.status, 'success')
  assert.equal(end.manifest.state, 'stopped')
  assert.ok(
    end.manifest.phases.dev.acceptance.pending.some((obligation) => obligation.id === 'OBL-STUDY'),
  )
  assert.equal(end.manifest.milestones.product_validation.status, 'pending')
})

test('unknown required verification prevents non-discovery dispatch', (t) => {
  const f = fixture(t)
  f.init()
  f.completeDiscovery()
  const m = JSON.parse(readFileSync(join(f.dir, 'feature.json'), 'utf8'))
  m.run_brief.required_verification = []
  writeFileSync(join(f.dir, 'feature.json'), JSON.stringify(m))
  const blocked = f.run('start', { phase: 'definition' })
  assert.equal(blocked.status, 'blocked')
  assert.match(blocked.error.message, /required_verification/)
})

test('dead writer recovery ignores incomplete temporary bytes and retains the committed manifest', (t) => {
  const f = fixture(t)
  f.init()
  writeFileSync(join(f.dir, '.feature.lock'), JSON.stringify({ pid: 2147483647 }))
  writeFileSync(join(f.dir, '.feature-interrupted.tmp'), '{"revision":999')
  const result = f.run('start', { phase: 'discovery' })
  assert.equal(result.status, 'success')
  assert.equal(result.manifest.revision, 2)
  assert.equal(result.manifest.event_history.length, 2)
  assert.equal(existsSync(join(f.dir, '.feature.lock')), false)
})

test('an observed intended-target merge is independent of pending human acceptance on actual files', (t) => {
  const f = fixture(t)
  f.init()
  const ledger = ledgerFixture()
  ledger.requirements[0].obligations[2].requiredStage = 'human-acceptance'
  writeFixture(f.dir, ledger)
  writeFileSync(
    join(f.dir, 'merge-receipt.json'),
    JSON.stringify({ pr: 8, target: 'main', merged: true, revision: 'abc' }),
  )
  const result = f.run('record-milestone', {
    milestone: 'integration',
    evidence: {
      reference: 'PR8:merge',
      target: 'main',
      merged: true,
      revision: 'abc',
      artifacts: ['merge-receipt.json'],
    },
  })
  assert.equal(result.status, 'success')
  assert.equal(result.manifest.milestones.integration.status, 'recorded')
  assert.equal(result.manifest.milestones.human_acceptance.status, 'pending')
  assert.equal(result.manifest.milestones.release.status, 'pending')
  assert.ok(result.manifest.milestones.integration.records[0].acceptance.pending.length > 0)
})

test('later context refresh does not reopen discovery when its owned JTBD output is unchanged', (t) => {
  const f = fixture(t)
  f.init()
  f.run('start', { phase: 'discovery' })
  assert.equal(
    f.run('complete', { phase: 'discovery', artifacts: ['../../product/jtbd'] }).status,
    'success',
  )
  f.run('start', { phase: 'definition' })
  const contextPath = join(f.root, 'docs/product/context.md')
  writeFileSync(
    contextPath,
    readFileSync(contextPath, 'utf8') + '\nDefinition added a phase-tagged research assumption.\n',
  )
  const result = f.run('complete', { phase: 'definition', artifacts: ['prd.md'] })
  assert.equal(result.status, 'success')
  assert.equal(result.manifest.phases.discovery.status, 'complete')
})

test('actual refinement route reuses phase identities and audits its controller metadata narrowly', async (t) => {
  const f = fixture(t)
  const { createHash } = await import('node:crypto')
  const { auditRefinementChanges } = await import('../src/refinement.mjs')
  mkdirSync(join(f.root, 'src'))
  writeFileSync(join(f.root, 'src/status.mjs'), 'export const label = "Svaed"\n')
  const contextPath = join(f.root, 'docs/product/context.md')
  const index = {
    schemaVersion: 1,
    purpose: 'Save work',
    audience: 'Editors',
    currentState: 'implemented',
    authorityOrder: ['requirements', 'code'],
    globalInvariants: ['contract'],
    bindings: { design: 'existing library', engineering: 'existing repo' },
    commands: [],
    unresolvedDecisions: [],
    sources: [
      {
        id: 'contract',
        kind: 'requirement',
        path: 'docs/features/save/prd.md',
        revision: createHash('sha256')
          .update(readFileSync(join(f.dir, 'prd.md')))
          .digest('hex'),
        global: true,
      },
    ],
    facts: [],
    history: [],
  }
  index.sources.push({
    id: 'status',
    kind: 'code',
    path: 'src/status.mjs',
    revision: createHash('sha256')
      .update(readFileSync(join(f.root, 'src/status.mjs')))
      .digest('hex'),
  })
  writeFileSync(contextPath, '```ateam-context\n' + JSON.stringify(index) + '\n```\n')
  const git = (args) => {
    const child = spawnSync('git', args, {
      cwd: f.root,
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
    })
    assert.equal(child.status, 0, child.stderr)
  }
  git(['init', '--initial-branch=main'])
  git(['config', 'user.name', 'Fixture'])
  git(['config', 'user.email', 'fixture@example.com'])
  git(['add', '.'])
  git(['commit', '-m', 'Accepted fixture baseline'])
  f.init()
  const change = {
    schemaVersion: 1,
    id: 'REF-LABEL',
    kind: 'copy',
    outcome: 'Correct the saved label',
    linkedObligations: ['OBL-CODE'],
    invariants: ['contract'],
    authorization: { actor: 'Owner', authorized: true, reference: 'request:typo' },
    authorizedDelta: 'Fix one status typo',
    surfaces: ['src/status.mjs'],
    dependencies: [],
    risks: [],
    affectedArtifacts: [],
    reviews: [],
  }
  const configured = f.run('configure-refinement', { change })
  assert.equal(configured.status, 'success', configured.error?.message)
  assert.equal(configured.manifest.state, 'dev')
  assert.equal(configured.manifest.phases.definition.status, 'pending')
  const started = f.run('start', { phase: 'dev' })
  assert.equal(started.status, 'success')
  assert.ok(started.manifest.phases.dev.context.selected.some((source) => source.id === 'status'))
  const audit = await auditRefinementChanges({ root: f.root, plan: configured.manifest.refinement })
  assert.equal(audit.status, 'scope-checked', JSON.stringify(audit.violations))
  assert.ok(
    configured.manifest.refinement.affectedArtifacts.includes('docs/features/save/feature.json'),
  )
  assert.ok(!configured.manifest.refinement.affectedArtifacts.includes('docs/features/save'))
  const missing = f.run('finish-refinement', { completion: { passed: true } })
  assert.equal(missing.status, 'blocked')
  assert.equal(missing.manifest.refinement.result, null)
  assert.match(missing.error.message, /completion.*blocked/i)
})

test('adding a page brief stales the definition decision before downstream dispatch', async (t) => {
  const f = fixture(t)
  f.init()
  f.completeDiscovery()
  f.run('start', { phase: 'definition' })
  f.run('complete', { phase: 'definition', artifacts: ['prd.md'] })
  f.run('approve', {
    phase: 'definition',
    decision: { kind: 'human', actor: 'Owner', authorized: true, reference: 'review:pages' },
  })
  writeFileSync(join(f.dir, 'briefs/pages/new.md'), '# New screen after review')
  const m = await feature.loadFeature(f.dir)
  assert.equal(m.phases.definition.status, 'stale')
  assert.equal(m.phases.definition.decisions.length, 1)
})

for (const output of [
  'lofi/index.html',
  'lofi/public/palette-variants/soft.css',
  '../../product/design-system/scale.ts',
  '../../../ui/tokens.css',
])
  test(`editing reviewed design output ${output} stales its gate and blocks spec`, async (t) => {
    const f = fixture(t)
    const path = resolve(f.dir, output)
    mkdirSync(resolve(path, '..'), { recursive: true })
    writeFileSync(path, 'Reviewed design bytes')
    if (output.includes('ui/tokens.css'))
      writeFileSync(
        join(f.root, 'CLAUDE.md'),
        '## A-Team Config\n- design system path: ui/tokens.css\n',
      )
    f.init()
    f.completeDiscovery()
    const decision = { kind: 'human', actor: 'Owner', authorized: true, reference: 'review:design' }
    for (const phase of ['definition', 'design']) {
      assert.equal(f.run('start', { phase }).status, 'success')
      assert.equal(
        f.run('complete', { phase, artifacts: [phase === 'definition' ? 'prd.md' : 'design.md'] })
          .status,
        'success',
      )
      assert.equal(f.run('approve', { phase, decision }).status, 'success')
    }
    writeFileSync(path, 'Changed after design review')
    const loaded = await feature.loadFeature(f.dir)
    assert.equal(loaded.phases.design.status, 'stale')
    assert.equal(loaded.phases.definition.status, 'approved')
    assert.equal(loaded.phases.design.decisions.length, 1)
    const blocked = f.run('start', { phase: 'spec' })
    assert.equal(blocked.status, 'blocked')
    assert.match(blocked.error.message, /design/)
  })

test('wireflow rendered artifact edits invalidate the definition decision', async (t) => {
  const f = fixture(t)
  mkdirSync(join(f.dir, 'briefs/wireflow'), { recursive: true })
  writeFileSync(join(f.dir, 'briefs/wireflow/board.svg'), '<svg>Reviewed wireflow</svg>')
  f.init()
  f.completeDiscovery()
  f.run('start', { phase: 'definition' })
  f.run('complete', { phase: 'definition', artifacts: ['prd.md'] })
  f.run('approve', {
    phase: 'definition',
    decision: { kind: 'human', actor: 'Owner', authorized: true, reference: 'review:wireflow' },
  })
  writeFileSync(join(f.dir, 'briefs/wireflow/board.svg'), '<svg>New route after review</svg>')
  const loaded = await feature.loadFeature(f.dir)
  assert.equal(loaded.phases.definition.status, 'stale')
  assert.equal(f.run('start', { phase: 'design' }).status, 'blocked')
})

test('spec.md changes invalidate spec and prevent issues dispatch', async (t) => {
  const f = fixture(t)
  f.init()
  f.completeDiscovery()
  const decision = { kind: 'human', actor: 'Owner', authorized: true, reference: 'review:source' }
  for (const phase of ['definition', 'design', 'spec']) {
    assert.equal(f.run('start', { phase }).status, 'success')
    assert.equal(
      f.run('complete', {
        phase,
        artifacts: [{ definition: 'prd.md', design: 'design.md', spec: 'spec.md' }[phase]],
      }).status,
      'success',
    )
    if (phase !== 'spec') assert.equal(f.run('approve', { phase, decision }).status, 'success')
  }
  writeFileSync(
    join(f.dir, 'spec.md'),
    readFileSync(join(f.dir, 'spec.md'), 'utf8') + '\nNew interaction after completion\n',
  )
  assert.equal((await feature.loadFeature(f.dir)).phases.spec.status, 'stale')
  assert.equal(f.run('start', { phase: 'issues' }).status, 'blocked')
})

test('new design output tree after approval requires review of its previously unbound files', async (t) => {
  const f = fixture(t)
  f.init()
  f.completeDiscovery()
  const decision = { kind: 'human', actor: 'Owner', authorized: true, reference: 'review:design' }
  for (const phase of ['definition', 'design']) {
    f.run('start', { phase })
    f.run('complete', { phase, artifacts: [phase === 'definition' ? 'prd.md' : 'design.md'] })
    f.run('approve', { phase, decision })
  }
  mkdirSync(join(f.dir, 'lofi/public'))
  writeFileSync(join(f.dir, 'lofi/public/new.html'), '<button>New unreviewed screen</button>')
  assert.equal((await feature.loadFeature(f.dir)).phases.design.status, 'stale')
  assert.equal(f.run('start', { phase: 'spec' }).status, 'blocked')
})

function approvedDefinitionWithDueEvidence(t) {
  const f = fixture(t)
  const ledger = ledgerFixture()
  const due = ledger.requirements[0].obligations[0]
  due.requiredStage = 'definition'
  due.status = 'satisfied'
  due.evidence = [
    {
      reference: 'checks:definition-1',
      actor: 'Reviewer',
      method: 'automated',
      requirementVersion: 1,
    },
  ]
  writeFixture(f.dir, ledger)
  f.init()
  f.completeDiscovery()
  f.run('start', { phase: 'definition' })
  assert.equal(f.run('complete', { phase: 'definition', artifacts: ['prd.md'] }).status, 'success')
  const approved = f.run('approve', {
    phase: 'definition',
    decision: {
      kind: 'human',
      actor: 'Owner',
      authorized: true,
      reference: 'review:definition-evidence',
    },
  })
  assert.equal(approved.status, 'success')
  return { ...f, ledger, approved: approved.manifest }
}

test('withdrawing due canonical evidence stales the approved gate and blocks downstream dispatch', async (t) => {
  const f = approvedDefinitionWithDueEvidence(t)
  f.ledger.requirements[0].obligations[0].status = 'pending'
  f.ledger.requirements[0].obligations[0].evidence = []
  writeFileSync(join(f.dir, 'acceptance.json'), JSON.stringify(f.ledger))
  const loaded = await feature.loadFeature(f.dir)
  assert.equal(loaded.phases.definition.status, 'stale')
  assert.match(loaded.phases.definition.stale_reason, /OBL-CODE.*required by definition/)
  assert.deepEqual(loaded.phases.definition.decisions, f.approved.phases.definition.decisions)
  const blocked = f.run('start', { phase: 'design' })
  assert.equal(blocked.status, 'blocked')
  assert.match(blocked.error.message, /OBL-CODE.*required by definition/)
})

test('valid future-study evidence updates preserve definition approval without rebinding the ledger', async (t) => {
  const f = approvedDefinitionWithDueEvidence(t)
  const study = f.ledger.requirements[0].obligations[2]
  study.status = 'satisfied'
  study.evidence = [
    { reference: 'study:1', actor: 'Researcher', method: 'human-study', requirementVersion: 1 },
  ]
  writeFileSync(join(f.dir, 'acceptance.json'), JSON.stringify(f.ledger))
  let loaded = await feature.loadFeature(f.dir)
  assert.equal(loaded.phases.definition.status, 'approved')
  assert.deepEqual(loaded.phases.definition.decisions, f.approved.phases.definition.decisions)
  study.status = 'pending'
  study.evidence = []
  writeFileSync(join(f.dir, 'acceptance.json'), JSON.stringify(f.ledger))
  loaded = await feature.loadFeature(f.dir)
  assert.equal(loaded.phases.definition.status, 'approved')
  assert.equal(f.run('start', { phase: 'design' }).status, 'success')
})

test('phase evidence withdrawal does not stale independent target integration even with shared artifact references', async (t) => {
  const f = approvedDefinitionWithDueEvidence(t)
  assert.equal(
    f.run('record-milestone', {
      milestone: 'integration',
      evidence: {
        reference: 'merge:1',
        revision: 'abc',
        target: 'main',
        merged: true,
        artifacts: ['prd.md'],
      },
    }).status,
    'success',
  )
  f.ledger.requirements[0].obligations[0].status = 'pending'
  f.ledger.requirements[0].obligations[0].evidence = []
  writeFileSync(join(f.dir, 'acceptance.json'), JSON.stringify(f.ledger))
  const loaded = await feature.loadFeature(f.dir)
  assert.equal(loaded.phases.definition.status, 'stale')
  assert.equal(loaded.milestones.integration.status, 'recorded')
})

test('withdrawing product-validation evidence stales only that milestone while earlier gates and integration remain current', async (t) => {
  const f = approvedDefinitionWithDueEvidence(t)
  const study = f.ledger.requirements[0].obligations[2]
  study.status = 'satisfied'
  study.evidence = [
    {
      reference: 'study:validated',
      actor: 'Researcher',
      method: 'human-study',
      requirementVersion: 1,
    },
  ]
  writeFileSync(join(f.dir, 'acceptance.json'), JSON.stringify(f.ledger))
  for (const milestone of ['integration', 'product_validation']) {
    const recorded = f.run('record-milestone', {
      milestone,
      evidence: {
        reference: milestone === 'integration' ? 'merge:1' : 'study:validated',
        revision: 'abc',
        target: 'main',
        merged: true,
        artifacts: ['prd.md'],
      },
    })
    assert.equal(recorded.status, 'success')
  }
  const before = await feature.loadFeature(f.dir)
  study.status = 'pending'
  study.evidence = []
  writeFileSync(join(f.dir, 'acceptance.json'), JSON.stringify(f.ledger))
  const loaded = await feature.loadFeature(f.dir)
  assert.equal(loaded.milestones.product_validation.status, 'stale')
  assert.match(loaded.milestones.product_validation.stale_reason, /OBL-STUDY.*product-validation/)
  assert.deepEqual(
    loaded.milestones.product_validation.records,
    before.milestones.product_validation.records,
  )
  assert.equal(loaded.phases.definition.status, 'approved')
  assert.equal(loaded.milestones.integration.status, 'recorded')
})

test('verification milestone refuses an arbitrary passing report without combined revision proof', (t) => {
  const f = fixture(t)
  f.init()
  writeFixture(f.dir, ledgerFixture())
  const result = f.run('record-milestone', {
    milestone: 'verification',
    evidence: { reference: 'passing-report', revision: 'abc', artifacts: ['prd.md'] },
  })
  assert.equal(result.status, 'blocked')
  assert.match(result.error.message, /combinedVerification/)
  assert.notEqual(result.manifest.milestones.verification.status, 'recorded')
})
