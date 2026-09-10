import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fixtureRepo, git, config, issue, verdict } from '../approval-fixtures.mjs'
import { evaluateRevision, validateApprovalRecord } from '../../src/core/approval.mjs'
const output = resolve(process.argv[2] || '../rendered-evaluator/seam-evidence')
mkdirSync(output, { recursive: true })
const repo = fixtureRepo(output),
  html = readFileSync(resolve(import.meta.dirname, '../fixtures/rendered-app/index.html'), 'utf8'),
  v = { width: 390, height: 844 }
copyFileSync(
  resolve(import.meta.dirname, '../fixtures/rendered-app/server.mjs'),
  join(repo, 'server.mjs'),
)
writeFileSync(join(repo, 'index.html'), html)
writeFileSync(join(repo, 'value.txt'), 'good\n')
writeFileSync(
  join(repo, 'rendered.json'),
  JSON.stringify({
    schemaVersion: 1,
    serverCommand: 'node server.mjs',
    requirements: [{ obligation: 'OBL-SCREEN', state: 'empty', viewport: v }],
    cases: [
      {
        id: 'empty',
        obligation: 'OBL-SCREEN',
        state: 'empty',
        viewport: v,
        fixture: 'synthetic independent review',
        route: '/',
        actions: [],
        assertions: [
          { type: 'contained', selector: '#save' },
          { type: 'text', selector: '#save', equals: 'Save' },
        ],
      },
    ],
  }),
)
git(repo, ['add', '.'])
git(repo, ['commit', '-m', 'accepted rendered plan'])
const policy = config(repo).policy,
  baseSha = git(repo, ['rev-parse', 'HEAD'])
policy.verification.renderedReview = 'rendered.json'
policy.sandbox = {
  backend: 'macos-seatbelt',
  playwrightModule: process.env.ATEAM_PLAYWRIGHT_MODULE,
  browserChannel: 'chrome',
}
git(repo, ['checkout', '-b', 'implementation'])
const results = []
for (const [index, variant] of [
  'correct',
  'nested-correct',
  'clipped',
  'nested-clipped',
  'restored',
].entries()) {
  writeFileSync(
    join(repo, 'index.html'),
    variant === 'clipped'
      ? html.replace('.clip{overflow:hidden}', '.clip{overflow:hidden;width:25px}')
      : variant === 'nested-clipped'
        ? html.replace(
            '<button id="save">Save</button>',
            '<button id="save"><span style="display:block;width:5px;overflow:hidden;white-space:nowrap">Save</span></button>',
          )
        : variant === 'nested-correct'
          ? html.replace(
              '<button id="save">Save</button>',
              '<button id="save"><span style="display:block">Save</span></button>',
            )
          : html,
  )
  writeFileSync(join(repo, 'candidate.txt'), variant)
  git(repo, ['add', '.'])
  git(repo, ['commit', '-m', variant])
  const head = git(repo, ['rev-parse', 'HEAD']),
    runDir = join(output, variant)
  mkdirSync(runDir)
  let supplied
  const result = await evaluateRevision({
    repo: 'o/r',
    repoPath: repo,
    source: repo,
    issue,
    baseSha,
    head,
    policy,
    runDir,
    model: 'synthetic-provider-fixture',
    budget: { call: async (role, fn) => fn({ budgetUsd: 1, timeoutMs: 60000 }) },
    review: async (args) => {
      supplied = args
      assert.equal(args.renderedAuthority.required, true)
      assert.ok(args.renderedReview.reviewerCopies.length)
      for (const item of args.renderedReview.reviewerCopies)
        assert.ok(readFileSync(item.path).length)
      return verdict
    },
  })
  assert.equal(result.verdict.verdict, variant.includes('clipped') ? 'request-changes' : 'approve')
  assert.equal(!!result.approvalPath, !variant.includes('clipped'))
  if (result.approvalPath) {
    const context = { repo: 'o/r', issue, head, baseSha, policy }
    assert.equal(validateApprovalRecord(result.record, context).valid, true)
    const omitted = { ...result.record }
    delete omitted.renderedAuthority
    assert.equal(validateApprovalRecord(omitted, context).valid, false)
    assert.equal(
      validateApprovalRecord({ ...result.record, renderedAuthority: null }, context).valid,
      false,
    )
  }
  results.push({
    variant,
    head,
    verdict: result.verdict.verdict,
    approvalPath: result.approvalPath || null,
    renderedRecordPath: supplied.renderedReview.recordPath,
  })
  console.log(JSON.stringify(results.at(-1)))
}
writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2) + '\n')
