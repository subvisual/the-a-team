// Additive deterministic cases. No agents, real publishing, or client data.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { digest, json } from '../../src/evaluation.mjs'
import { selectTaskContext } from '../../src/context.mjs'
import { resolvePolicy } from '../../src/policy.mjs'
import { writeCurrentContext } from '../helpers/current-context.mjs'
const output = () =>
  process.env.ATEAM_EVALUATION_CASE_DIR || mkdtempSync(join(tmpdir(), 'ateam-evaluation-case-'))
const git = (root, ...args) =>
  execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
  }).trim()
const put = (root, path, bytes) => {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), bytes)
  return digest(bytes)
}

test('crosscutting invariant survives a narrow unrelated path selection', () => {
  const root = mkdtempSync(join(output(), 'invariant-'))
  writeCurrentContext(root)
  const invariant = 'OBL-AUTH: anonymous users may never save private drafts'
  const index = {
    schemaVersion: 1,
    purpose: 'Synthetic private draft',
    audience: 'Editor',
    currentState: 'implemented',
    authorityOrder: ['requirements', 'code'],
    globalInvariants: ['authorization'],
    bindings: { design: 'Target tokens', engineering: 'Node local storage' },
    commands: ['node --test'],
    unresolvedDecisions: [],
    facts: [],
    history: [],
    sources: [
      {
        id: 'authorization',
        kind: 'requirement',
        path: 'security.md',
        revision: put(root, 'security.md', invariant),
      },
    ],
  }
  put(root, 'docs/product/context.md', '```ateam-context\n' + json(index) + '```\n')
  const selected = selectTaskContext({
    root,
    task: { title: 'Correct label', paths: ['ui/label.mjs'] },
  })
  assert.ok(
    selected.selected.some((s) => s.id === 'authorization' && s.content === invariant),
    'GLOBAL_INVARIANT_DROPPED: narrow task lost authorization obligation',
  )
  put(root, 'selected.json', json(selected))
})

test('two synthetic stacks preserve project facts outputs and exact harness pins', async () => {
  const out = output(),
    harness = resolve(import.meta.dirname, '../../..')
  const pin = git(harness, 'rev-parse', 'HEAD')
  const receipts = []
  const definitions = JSON.parse(
    readFileSync(new URL('../../evaluation/targets.json', import.meta.url)),
  )
  for (const target of definitions.targets) {
    const root = join(out, target.id)
    mkdirSync(root)
    for (const [path, bytes] of Object.entries(target.files)) put(root, path, bytes)
    const index = {
      schemaVersion: 1,
      purpose: target.purpose,
      audience: target.audience,
      currentState: 'implemented',
      authorityOrder: ['requirements', 'design', 'code'],
      globalInvariants: ['requirements', 'design'],
      bindings: { design: target.designSystem, engineering: target.stack },
      commands: [target.testCommand],
      unresolvedDecisions: [],
      facts: [],
      history: [],
      sources: Object.entries(target.sources).map(([id, source]) => ({
        id,
        ...source,
        revision: digest(readFileSync(join(root, source.path))),
      })),
    }
    put(root, 'docs/product/context.md', '```ateam-context\n' + json(index) + '```\n')
    put(
      root,
      'CLAUDE.md',
      `## A-Team Config\n- test command: ${target.testCommand}\n- design system path: ${target.designPath}\n- harness revision: ${pin}\n`,
    )
    git(root, 'init', '-q', '-b', 'main')
    git(root, 'add', '.')
    git(
      root,
      '-c',
      'user.name=Synthetic evaluation',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-qm',
      'Synthetic target baseline',
    )
    const policy = await resolvePolicy({
      repoPath: root,
      base: 'main',
      cfg: { harnessRoot: harness },
    })
    assert.equal(policy.harness.revision, pin)
    assert.equal(policy.bindings.designSystemPath, target.designPath)
    assert.deepEqual(policy.verification.commands, [target.testCommand])
    assert.equal(policy.githubIssues, false)
    const selected = selectTaskContext({
      root,
      policy,
      task: { title: target.task, paths: [target.codePath] },
    })
    assert.equal(selected.status, 'current')
    const rendered = execFileSync(
      target.executable === 'node' ? process.execPath : target.executable,
      target.renderArgs,
      { cwd: root, encoding: 'utf8' },
    )
    const testOutput = execFileSync(
      target.executable === 'node' ? process.execPath : target.executable,
      target.testArgs,
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    )
    const handoff = {
      targetId: target.id,
      harnessRevision: pin,
      harnessDigest: process.env.ATEAM_EVALUATION_HARNESS_DIGEST || null,
      sourceCommit: git(root, 'rev-parse', 'HEAD'),
      stack: selected.authority.bindings.engineering,
      designSystem: selected.authority.bindings.design,
      selected: selected.selected,
      rendered,
      verification: { command: target.testCommand, output: testOutput },
    }
    const bytes = json(handoff)
    for (const foreign of definitions.targets.filter((t) => t.id !== target.id)) {
      assert.ok(
        !bytes.includes(foreign.canary),
        `FACT_CROSSED_TARGET: ${foreign.id} -> ${target.id}`,
      )
      assert.ok(!existsSync(join(root, foreign.outputPath)), 'OUTPUT_CROSSED_TARGET')
    }
    assert.ok(bytes.includes(target.canary))
    assert.ok(rendered.includes(target.canary))
    put(root, target.outputPath, rendered)
    put(root, 'handoff.json', bytes)
    receipts.push({
      targetId: target.id,
      harnessRevision: pin,
      sourceCommit: handoff.sourceCommit,
      stack: target.stack,
      designSystem: target.designSystem,
      output: target.outputPath,
      outputDigest: digest(rendered),
      handoffDigest: digest(bytes),
    })
    put(
      root,
      'CLAUDE.md',
      readFileSync(join(root, 'CLAUDE.md'), 'utf8').replace(pin, '0'.repeat(40)),
    )
    await assert.rejects(
      resolvePolicy({ repoPath: root, cfg: { harnessRoot: harness } }),
      /harness revision mismatch/,
    )
    put(
      root,
      'CLAUDE.md',
      readFileSync(join(root, 'CLAUDE.md'), 'utf8').replace('0'.repeat(40), pin),
    )
  }
  assert.notEqual(receipts[0].sourceCommit, receipts[1].sourceCommit)
  writeFileSync(
    join(out, 'targets-receipt.json'),
    json({
      schemaVersion: 1,
      synthetic: true,
      targets: receipts,
      factsCrossed: false,
      outputsCrossed: false,
    }),
  )
})
