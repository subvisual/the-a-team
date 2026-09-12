import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import * as context from '../src/context.mjs'

const hash = (text) => createHash('sha256').update(text).digest('hex')

test('obligation IDs select their mapped requirement authority outside changed paths', (t) => {
  const f = fixture(t)
  f.index.sources.push({
    id: 'billing-rule',
    kind: 'requirement',
    path: 'billing.md',
    revision: f.put('billing.md', 'OBL-BILL: retain invoice reference'),
    obligationIds: ['OBL-BILL'],
  })
  f.put('docs/product/context.md', '```ateam-context\n' + JSON.stringify(f.index) + '\n```\n')
  const result = context.selectTaskContext({
    root: f.root,
    task: { title: 'Correct existing label', paths: ['ui/label.mjs'], obligationIds: ['OBL-BILL'] },
  })
  assert.ok(result.selected.some((source) => source.id === 'billing-rule'))
  assert.ok(!result.selected.some((source) => source.id === 'unrelated'))
})
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'ateam-context-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const put = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
    return hash(text)
  }
  const sources = [
    {
      id: 'save',
      kind: 'code',
      path: 'src/save.mjs',
      revision: put('src/save.mjs', 'export const save = () => false'),
      paths: ['src/save.mjs'],
      tags: ['persistence'],
    },
    {
      id: 'rules',
      kind: 'requirement',
      path: 'requirements.md',
      revision: put(
        'requirements.md',
        'OBL-SAVE: persist edits; authorize records; keyboard reachable',
      ),
      global: true,
      tags: ['persistence', 'authorization', 'accessibility'],
    },
    {
      id: 'unrelated',
      kind: 'history',
      path: 'research/raw.md',
      revision: put('research/raw.md', 'unrelated raw interview'),
      paths: ['src/search.mjs'],
      tags: ['search'],
    },
    {
      id: 'commands',
      kind: 'test',
      path: 'package.json',
      revision: put('package.json', '{"scripts":{"test":"node --test"}}'),
      global: true,
    },
  ]
  const index = {
    schemaVersion: 1,
    purpose: 'Save records',
    audience: 'Editors',
    currentState: 'implemented',
    authorityOrder: ['requirements', 'decisions', 'code', 'history'],
    globalInvariants: ['rules'],
    bindings: { design: 'existing tokens', engineering: 'existing local persistence' },
    commands: ['npm test'],
    unresolvedDecisions: [],
    sources,
    facts: [
      {
        id: 'test-command',
        kind: 'observed',
        value: 'npm test',
        sources: ['commands'],
        revisions: { commands: sources[3].revision },
      },
    ],
    history: [],
  }
  const saveIndex = () =>
    put(
      'docs/product/context.md',
      '# Current context\n\n```ateam-context\n' +
        JSON.stringify(index, null, 2) +
        '\n```\n\n## Historical evidence\nKeep this paragraph.\n',
    )
  saveIndex()
  return { root, put, index, saveIndex }
}

test('narrow selection includes crosscutting obligations and omits unrelated raw evidence', (t) => {
  const f = fixture(t)
  assert.equal(typeof context.selectTaskContext, 'function')
  const result = context.selectTaskContext({
    root: f.root,
    task: { paths: ['src/save.mjs'], tags: ['persistence'] },
  })
  assert.equal(result.status, 'current')
  assert.deepEqual(
    result.selected.map((s) => s.id),
    ['save', 'rules', 'commands'],
  )
  assert.match(JSON.stringify(result), /OBL-SAVE/)
  assert.doesNotMatch(JSON.stringify(result), /unrelated raw interview/)
  assert.equal(result.measurement.observedInputTokens, null)
  assert.ok(result.measurement.estimatedTokens > 0)
})

test('changed selected sources invalidate derived facts but unrelated edits do not', (t) => {
  const f = fixture(t)
  f.put('research/raw.md', 'another unrelated interview')
  assert.equal(
    context.selectTaskContext({ root: f.root, task: { tags: ['persistence'] } }).status,
    'current',
  )
  f.put('package.json', '{"scripts":{"test":"node --test test/new.test.mjs"}}')
  const selected = context.selectTaskContext({ root: f.root, task: { tags: ['persistence'] } })
  assert.equal(selected.status, 'stale')
  assert.equal(selected.facts[0].status, 'stale')
  assert.throws(() => context.assertCurrentContext(selected), /test-command.*revalidation/)
})

test('stale discovery-only state conflicts with implemented source and commands', (t) => {
  const f = fixture(t)
  f.index.currentState = 'discovery-only'
  f.saveIndex()
  const selected = context.selectTaskContext({ root: f.root })
  assert.equal(selected.status, 'stale')
  assert.match(selected.conflicts[0].reason, /Discovery-only summary conflicts/)
})

test('budget is configurable and keeps constraints visible; estimates are not observed tokens', (t) => {
  const f = fixture(t)
  const selected = context.selectTaskContext({
    root: f.root,
    policy: { bindings: { contextBudgetTokens: 5 } },
    observedInputTokens: 17,
  })
  assert.equal(selected.status, 'over-budget')
  assert.ok(selected.selected.some((s) => s.id === 'rules'))
  assert.equal(selected.measurement.observedInputTokens, 17)
  assert.notEqual(selected.measurement.estimatedTokens, 17)
})

test('completion refresh updates affected observed facts, preserves history and rejects rewriting intent', (t) => {
  const f = fixture(t)
  const before = hash(readFileSync(join(f.root, 'docs/product/context.md'), 'utf8'))
  const newRevision = f.put('package.json', '{"scripts":{"test":"node --test test/new.test.mjs"}}')
  const update = {
    expectedIndexRevision: before,
    integration: {
      id: 'merge-1',
      actor: 'maintainer',
      revision: 'abc123',
      evidence: 'integration-receipt.json',
    },
    sources: [{ id: 'commands', revision: newRevision }],
    facts: [
      {
        id: 'test-command',
        kind: 'observed',
        value: 'npm test',
        sources: ['commands'],
        revisions: { commands: newRevision },
      },
    ],
    commands: ['npm test'],
  }
  f.put('integration-receipt.json', '{"integrated":true,"revision":"abc123"}')
  assert.equal(typeof context.refreshCurrentContext, 'function')
  context.refreshCurrentContext({ root: f.root, update })
  const saved = context.readContextIndex({ root: f.root }).index
  assert.equal(saved.sources.find((s) => s.id === 'commands').revision, newRevision)
  assert.equal(saved.history.length, 1)
  assert.equal(saved.history[0].previous.facts[0].revisions.commands, f.index.sources[3].revision)
  assert.match(readFileSync(join(f.root, 'docs/product/context.md'), 'utf8'), /Keep this paragraph/)
  assert.throws(() => context.refreshCurrentContext({ root: f.root, update }), /changed/)
  const current = context.readContextIndex({ root: f.root })
  assert.throws(
    () =>
      context.refreshCurrentContext({
        root: f.root,
        update: {
          ...update,
          expectedIndexRevision: current.revision,
          facts: [{ ...update.facts[0], kind: 'intent' }],
        },
      }),
    /intent/,
  )
})

test('executor and resumed reviewer enforce freshness before model launch', async (t) => {
  const f = fixture(t)
  const { execute } = await import('../src/core/execute.mjs')
  const { review } = await import('../src/core/review.mjs')
  const issue = {
    title: 'Fix saving',
    body: 'Preserve edits',
    acceptanceCriteria: ['Retry persists edits'],
  }
  let launches = 0
  const deps = {
    runClaude: async (options) => {
      launches++
      assert.match(options.prompt, /Current project authority/)
      assert.match(options.prompt, /OBL-SAVE/)
      return {
        ok: true,
        exitCode: 0,
        result: {
          status: 'done',
          summary: 'done',
          blocked_reason: '',
          tests_command: 'npm test',
          tests_ran: true,
          tests_passed: true,
        },
        structuredOutput: {
          status: 'done',
          summary: 'done',
          blocked_reason: '',
          tests_command: 'npm test',
          tests_ran: true,
          tests_passed: true,
        },
      }
    },
  }
  // Inspect the actual launch prompt; a deliberately interrupted fake boundary
  // avoids treating a model response as verification evidence.
  deps.runClaude = async (options) => {
    launches++
    assert.match(options.prompt, /Current project authority/)
    assert.match(options.prompt, /OBL-SAVE/)
    throw new Error('fake model boundary reached')
  }
  await assert.rejects(
    execute({ issue, worktree: f.root, base: 'main', branch: 'fix', deps }),
    /fake model boundary reached/,
  )
  await assert.rejects(
    review({
      issue,
      worktree: f.root,
      base: 'main',
      head: 'head',
      resumeSessionId: 'review-1',
      deps,
    }),
    /fake model boundary reached/,
  )
  assert.equal(launches, 2)
  f.put('requirements.md', 'Changed persistence contract')
  await assert.rejects(
    execute({ issue, worktree: f.root, base: 'main', branch: 'fix', deps }),
    /Task context stale/,
  )
  await assert.rejects(
    review({
      issue,
      worktree: f.root,
      base: 'main',
      head: 'head',
      resumeSessionId: 'review-1',
      deps,
    }),
    /Task context stale/,
  )
  assert.equal(launches, 2)
})

test('missing current authority blocks a runner launch instead of inventing constraints', (t) => {
  const f = fixture(t)
  rmSync(join(f.root, 'docs/product/context.md'))
  assert.throws(
    () => context.assertCurrentContext(context.selectTaskContext({ root: f.root })),
    /unconfigured/,
  )
})

test('current observed implementation conflicting with accepted intent remains a conflict', (t) => {
  const f = fixture(t)
  f.index.facts.push({
    id: 'accepted-storage',
    key: 'storage',
    kind: 'intent',
    value: 'local only',
    sources: ['rules'],
    revisions: { rules: f.index.sources[1].revision },
  })
  f.index.facts.push({
    id: 'implemented-storage',
    key: 'storage',
    kind: 'observed',
    value: 'cloud only',
    sources: ['save'],
    revisions: { save: f.index.sources[0].revision },
  })
  f.saveIndex()
  const selected = context.selectTaskContext({ root: f.root, task: { tags: ['persistence'] } })
  assert.equal(selected.status, 'stale')
  assert.ok(selected.conflicts.some((c) => c.id === 'storage'))
})

test('launch evidence records provider counts separately from selection estimates', async (t) => {
  const f = fixture(t)
  const { execute } = await import('../src/core/execute.mjs')
  const runDir = join(f.root, 'evidence')
  await execute({
    worktree: f.root,
    runDir,
    issue: { title: 'Save', body: 'Retry', acceptanceCriteria: ['Persists'] },
    deps: {
      runClaude: async () => ({
        ok: true,
        exitCode: 0,
        usage: { input_tokens: 17 },
        structured: {
          status: 'done',
          summary: 'done',
          blocked_reason: '',
          tests_command: 'npm test',
          tests_ran: true,
          tests_passed: true,
        },
      }),
    },
  })
  const evidence = JSON.parse(readFileSync(join(runDir, 'executor-context.json'), 'utf8'))
  assert.equal(evidence.measurement.observedInputTokens, 17)
  assert.notEqual(evidence.measurement.estimatedTokens, 17)
  assert.equal(
    evidence.measurement.observedScope,
    'provider session input; includes inputs beyond selected context',
  )
})

test('phase context CLI returns selected evidence and a failing status for stale authority', async (t) => {
  const f = fixture(t)
  const { spawnSync } = await import('node:child_process')
  const cli = new URL('../src/context-cli.mjs', import.meta.url)
  const invoke = () =>
    spawnSync(
      process.execPath,
      [
        cli.pathname,
        'select',
        '--root',
        f.root,
        '--task',
        JSON.stringify({ paths: ['src/save.mjs'], tags: ['persistence'] }),
      ],
      { encoding: 'utf8' },
    )
  let result = invoke()
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).result.status, 'current')
  f.put('requirements.md', 'Changed accepted contract')
  result = invoke()
  assert.equal(result.status, 1)
  const envelope = JSON.parse(result.stdout)
  assert.equal(envelope.status, 'blocked')
  assert.ok(envelope.result.stale.some((s) => s.id === 'rules'))
})

test('paths mentioned by ordinary adapter issue text retrieve governing obligations', (t) => {
  const f = fixture(t)
  f.index.sources.push({
    id: 'order-code',
    kind: 'code',
    path: 'src/order.mjs',
    revision: f.put('src/order.mjs', 'export const order = values => values'),
    paths: ['src/order.mjs'],
  })
  f.index.sources.push({
    id: 'order-requirement',
    kind: 'requirement',
    path: 'docs/order.md',
    revision: f.put('docs/order.md', 'OBL-ORDER: ranks ascend'),
    paths: ['src/order.mjs'],
  })
  f.saveIndex()
  const result = context.selectTaskContext({
    root: f.root,
    task: {
      title: 'Order ranks',
      body: 'Change src/order.mjs',
      acceptanceCriteria: ['Ranks ascend'],
    },
  })
  assert.ok(result.selected.some((s) => s.id === 'order-requirement'))
})

test('executor can record source revalidation before independent review, without claiming integration', async (t) => {
  const f = fixture(t)
  const { execute } = await import('../src/core/execute.mjs')
  const { review } = await import('../src/core/review.mjs')
  const issue = {
    title: 'Fix saving',
    body: 'Change src/save.mjs',
    acceptanceCriteria: ['Saving succeeds'],
  }
  await execute({
    worktree: f.root,
    issue,
    deps: {
      runClaude: async () => {
        const revision = f.put('src/save.mjs', 'export const save = () => true')
        f.put(
          'inspection.json',
          JSON.stringify({
            sourceRevisions: { save: revision },
            method: 'source-inspection',
            summary: 'Save implementation now returns true',
          }),
        )
        assert.equal(typeof context.revalidateCurrentContext, 'function')
        context.revalidateCurrentContext({
          root: f.root,
          update: {
            expectedIndexRevision: context.readContextIndex({ root: f.root }).revision,
            validation: { id: 'check-1', actor: 'executor-1', evidence: 'inspection.json' },
            sources: [{ id: 'save', revision }],
            facts: [],
          },
        })
        return {
          ok: true,
          exitCode: 0,
          structured: {
            status: 'done',
            summary: 'done',
            blocked_reason: '',
            tests_command: 'npm test',
            tests_ran: true,
            tests_passed: true,
          },
        }
      },
    },
  })
  let launches = 0
  await assert.rejects(
    review({
      worktree: f.root,
      issue,
      base: 'main',
      head: 'HEAD',
      deps: {
        runClaude: async () => {
          launches++
          throw new Error('independent review reached')
        },
      },
    }),
    /independent review reached/,
  )
  assert.equal(launches, 1)
  const history = context.readContextIndex({ root: f.root }).index.history
  assert.equal(history[0].kind, 'revalidation')
  assert.equal(history[0].integration, undefined)
})

test('resolved decision refresh needs a decision receipt and preserves the previous pending entry', (t) => {
  const f = fixture(t)
  f.index.unresolvedDecisions = ['DEC-STORAGE']
  f.saveIndex()
  f.put('integration.json', JSON.stringify({ integrated: true, revision: 'abc' }))
  f.put(
    'decision.json',
    JSON.stringify({
      id: 'DEC-STORAGE',
      actor: 'product-owner',
      authorized: true,
      rationale: 'Approved existing local storage',
      sourceIds: ['rules'],
    }),
  )
  const update = {
    expectedIndexRevision: context.readContextIndex({ root: f.root }).revision,
    integration: {
      id: 'merge-1',
      actor: 'maintainer',
      revision: 'abc',
      evidence: 'integration.json',
    },
    sources: [],
    facts: [],
    unresolvedDecisions: [],
  }
  assert.throws(() => context.refreshCurrentContext({ root: f.root, update }), /decision receipt/)
  context.refreshCurrentContext({
    root: f.root,
    update: {
      ...update,
      decisions: [{ id: 'DEC-STORAGE', actor: 'product-owner', reference: 'decision.json' }],
    },
  })
  const index = context.readContextIndex({ root: f.root }).index
  assert.deepEqual(index.unresolvedDecisions, [])
  assert.deepEqual(index.history[0].previous.unresolvedDecisions, ['DEC-STORAGE'])
})

test('a direct changed source path is selected without redundant selector metadata', (t) => {
  const f = fixture(t)
  delete f.index.sources[0].paths
  delete f.index.sources[0].tags
  f.saveIndex()
  f.put('src/save.mjs', 'Changed direct source')
  const selected = context.selectTaskContext({ root: f.root, task: { paths: ['src/save.mjs'] } })
  assert.equal(selected.status, 'stale')
  assert.ok(selected.stale.some((source) => source.id === 'save'))
})

test('archived Markdown examples cannot become the current authority index', (t) => {
  const f = fixture(t)
  f.put(
    'docs/product/context.md',
    '````markdown\n```ateam-context\n' + JSON.stringify(f.index) + '\n```\n````\n',
  )
  assert.throws(() => context.readContextIndex({ root: f.root }), /requires one.*index block/)
})

test('executor supplied context tool preserves the effective runner configuration', async (t) => {
  const f = fixture(t)
  f.put('docs/current.md', readFileSync(join(f.root, 'docs/product/context.md'), 'utf8'))
  rmSync(join(f.root, 'docs/product/context.md'))
  const { execute } = await import('../src/core/execute.mjs')
  const { spawnSync } = await import('node:child_process')
  const policy = {
    bindings: { currentContext: 'docs/current.md', contextBudgetTokens: 10000 },
    verification: { commands: ['npm test'] },
  }
  await assert.rejects(
    execute({
      worktree: f.root,
      policy,
      scratchDir: join(f.root, 'scratch'),
      issue: { title: 'Save', acceptanceCriteria: ['Works'] },
      deps: {
        runClaude: async (options) => {
          const tool = options.prompt.match(/^Context tools: (.+)$/m)[1],
            snapshot = options.prompt.match(/^Context policy: (.+)$/m)[1]
          const result = spawnSync(
            process.execPath,
            [tool, 'select', '--root', f.root, '--policy', snapshot],
            { encoding: 'utf8' },
          )
          assert.equal(result.status, 0, result.stderr + result.stdout)
          const selection = JSON.parse(result.stdout).result
          assert.equal(selection.entrypoint, 'docs/current.md')
          assert.equal(selection.measurement.budgetTokens, 10000)
          throw new Error('effective policy preserved')
        },
      },
    }),
    /effective policy preserved/,
  )
})
