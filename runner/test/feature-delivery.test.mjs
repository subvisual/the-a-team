import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { resolvePolicy } from '../src/policy.mjs'
import { loadConfig } from '../src/config.mjs'
import { fixtureRepo, config, git, verdict, adequacyFor } from './approval-fixtures.mjs'
import { fixture as ledgerFixture, writeFixture } from './helpers/obligations-fixture.mjs'
import { parseIssuesFile, validateIssues } from '../src/local-issues.mjs'
import { evaluateRevision } from '../src/core/approval.mjs'
import { verifyCombinedRevision } from '../src/combined-verification.mjs'
import { applyFeatureCommand, loadFeature } from '../src/feature-state.mjs'

for (const scopedAuthorization of [false, true])
  test(`actual feature verification admits current proof and stales changed criteria (scoped authorization: ${scopedAuthorization})`, async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'ateam-feature-delivery-'))
    const previousHome = process.env.ATEAM_RUNNER_HOME
    process.env.ATEAM_RUNNER_HOME = join(dir, 'home')
    t.after(() => {
      rmSync(dir, { recursive: true, force: true })
      if (previousHome === undefined) delete process.env.ATEAM_RUNNER_HOME
      else process.env.ATEAM_RUNNER_HOME = previousHome
    })
    const root = fixtureRepo(dir),
      featureDir = join(root, 'docs/features/save')
    mkdirSync(featureDir, { recursive: true })
    const ledger = ledgerFixture()
    for (const obligation of ledger.requirements[0].obligations.filter(
      (o) => o.requiredStage === 'verification',
    )) {
      obligation.status = 'satisfied'
      obligation.evidence = [
        {
          reference: 'fixture:bounded-evaluation',
          actor: 'Fixture reviewer',
          method: obligation.method,
          requirementVersion: 1,
        },
      ]
    }
    writeFixture(featureDir, ledger)
    git(root, ['add', '.'])
    git(root, ['commit', '-m', 'accepted feature fixture'])
    git(root, ['branch', 'baseline'])
    const contract = {
      schemaVersion: 1,
      checks: [
        { id: 'suite', kind: 'suite', command: 'node check.mjs' },
        ...['typecheck', 'build', 'browser', 'integration'].map((kind) => ({
          id: kind,
          kind,
          notApplicable: 'Gate fixture exercises evidence reuse only',
        })),
      ],
      boundaries: [],
    }
    let policy
    if (scopedAuthorization) {
      writeFileSync(
        join(root, 'CLAUDE.md'),
        '## A-Team Config\n\n```json\n' +
          JSON.stringify({
            baseBranch: 'baseline',
            verificationCommands: ['node check.mjs'],
            deliveryVerification: contract,
          }) +
          '\n```\n',
      )
      git(root, ['add', '.'])
      git(root, ['commit', '-m', 'target bindings'])
      git(root, ['branch', '-f', 'baseline', 'HEAD'])
      policy = await resolvePolicy({
        repoPath: root,
        cfg: loadConfig(),
        authorization: {
          id: 'authorized-ci',
          protectedPaths: ['.github/workflows/verify.yml'],
          recoveryWindow: 'explicit-recovery',
        },
      })
    } else {
      policy = config(root).policy
      policy.target.base = 'baseline'
      policy.verification.delivery = contract
    }
    const cli = (type, args = []) => {
      const child = spawnSync(
        process.execPath,
        [
          resolve(import.meta.dirname, '../src/feature-cli.mjs'),
          type,
          '--feature',
          featureDir,
          ...args,
        ],
        { encoding: 'utf8', env: process.env },
      )
      assert.equal(child.stderr, '')
      return JSON.parse(child.stdout)
    }
    const init = await applyFeatureCommand({
      featureDir,
      policy,
      expectedRevision: 0,
      eventId: 'init',
      command: {
        type: 'init',
        input: { slug: 'save', repo: root, branch: 'main', base_branch: 'baseline' },
      },
    })
    assert.equal(init.status, 'success', JSON.stringify(init.error))
    writeFileSync(join(root, 'value.txt'), 'good\n')
    writeFileSync(join(root, 'check.mjs'), 'console.log("green")\n')
    if (scopedAuthorization) {
      mkdirSync(join(root, '.github/workflows'), { recursive: true })
      writeFileSync(join(root, '.github/workflows/verify.yml'), 'name: synthetic scoped check\n')
    }
    git(root, ['add', '.'])
    git(root, ['commit', '-m', 'combined application'])
    const head = git(root, ['rev-parse', 'HEAD'])
    const issue = validateIssues(
      parseIssuesFile(readFileSync(join(featureDir, 'issues.md'), 'utf8')),
    )[0]
    const runDir = join(process.env.ATEAM_RUNNER_HOME, 'runs', 'o-r', issue.key, 'fixture')
    mkdirSync(runDir, { recursive: true })
    const run = async () => ({ code: 0, stdout: 'bounded fixture output', stderr: '' })
    const approval = await evaluateRevision({
      repo: 'o/r',
      repoPath: root,
      source: root,
      issue,
      baseSha: policy.target.baseSha,
      head,
      policy,
      runDir,
      model: 'synthetic-test-double',
      review: async () => ({
        ...verdict,
        testAdequacy: adequacyFor(issue.acceptanceCriteria, issue),
      }),
      budget: { call: async (role, fn) => fn({ timeoutMs: 2000 }) },
      deps: { runVerification: run },
    })
    assert.ok(approval.approvalPath, JSON.stringify(approval))
    const combined = await verifyCombinedRevision({
      repo: 'o/r',
      root,
      branch: 'main',
      policy,
      approvedIssues: [{ issue, approvalPath: approval.approvalPath }],
      deps: { runCommand: run },
    })
    assert.equal(combined.status, 'passed')
    const command = {
      type: 'record-milestone',
      milestone: 'verification',
      evidence: {
        reference: 'combined:fixture',
        revision: head,
        combinedVerification: combined.recordPath,
        artifacts: ['spec.md'],
      },
    }
    const { type, ...input } = command
    const admitted = scopedAuthorization
      ? cli(type, [
          '--expected-revision',
          String(init.manifest.revision),
          '--event-id',
          'verify',
          '--input',
          JSON.stringify(input),
        ])
      : await applyFeatureCommand({
          featureDir,
          policy,
          expectedRevision: init.manifest.revision,
          eventId: 'verify',
          command,
        })
    assert.equal(admitted.status, 'success', JSON.stringify(admitted.error))
    assert.equal(admitted.manifest.milestones.verification.status, 'recorded')
    assert.equal(admitted.manifest.milestones.human_acceptance.status, 'pending')
    assert.equal(
      (scopedAuthorization ? cli('show').manifest : await loadFeature(featureDir, { policy }))
        .milestones.verification.status,
      'recorded',
    )
    if (scopedAuthorization) {
      const configPath = join(root, 'CLAUDE.md'),
        original = readFileSync(configPath, 'utf8')
      writeFileSync(configPath, original.replace('node check.mjs', 'node changed-check.mjs'))
      assert.equal(cli('show').manifest.milestones.verification.status, 'stale')
      writeFileSync(configPath, original)
      assert.equal(cli('show').manifest.milestones.verification.status, 'recorded')
    }
    const issuePath = join(featureDir, 'issues.md')
    writeFileSync(
      issuePath,
      readFileSync(issuePath, 'utf8').replace(
        'when reopened, then it is restored',
        'when reopened, then every field is restored exactly',
      ),
    )
    const stale = scopedAuthorization
      ? cli('show').manifest
      : await loadFeature(featureDir, { policy })
    assert.equal(stale.milestones.verification.status, 'stale')
    assert.equal(stale.milestones.verification.records.length, 1)
    assert.match(stale.milestones.verification.stale_reason, /criteria|approval|inputs/i)
  })
