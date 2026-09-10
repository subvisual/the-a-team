import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fixtureRepo, git, config, issue, verdict } from '../approval-fixtures.mjs'
import { evaluateRevision } from '../../src/core/approval.mjs'

const output = resolve(process.argv[2])
mkdirSync(output, { recursive: true })
const results = []
for (const mode of process.argv[3] ? [process.argv[3]] : ['containment', 'sticky']) {
  const group = join(output, mode)
  mkdirSync(group)
  const repo = fixtureRepo(group)
  copyFileSync(
    new URL('../fixtures/rendered-app/server.mjs', import.meta.url),
    join(repo, 'server.mjs'),
  )
  const viewport = { width: 390, height: 844 }
  const tuple = { obligation: 'OBL-GEOMETRY', state: mode, viewport }
  const source =
    mode === 'containment'
      ? '<!doctype html><html lang="en"><title>Control containment</title><style>body{font:18px sans-serif}button{width:180px;height:50px}#wrapper{width:200px}</style><div id="wrapper"><button id="control">Save changes</button></div></html>'
      : '<!doctype html><html lang="en"><title>Nested sticky</title><style>body{margin:0;font:18px sans-serif}#scroller{margin-top:100px;height:200px;overflow:auto}#control{position:sticky;top:0;height:50px;background:#eee}#content{height:1000px}</style><div id="scroller"><div id="control">Sticky toolbar</div><div id="content">Scrollable content</div></div></html>'
  const plan = {
    schemaVersion: 1,
    serverCommand: 'node server.mjs',
    requirements: [tuple],
    cases: [
      {
        id: 'geometry',
        ...tuple,
        fixture: 'independent ordinary geometry fixture',
        route: '/',
        actions: mode === 'sticky' ? [{ type: 'scroll', selector: '#scroller', y: 100 }] : [],
        assertions:
          mode === 'sticky'
            ? [
                { type: 'scroll', selector: '#scroller', axis: 'y', min: 100 },
                { type: 'sticky', selector: '#control', edge: 'top', tolerance: 2 },
              ]
            : [{ type: 'contained', selector: '#control' }],
      },
    ],
  }
  writeFileSync(join(repo, 'index.html'), source)
  writeFileSync(join(repo, 'rendered.json'), JSON.stringify(plan))
  writeFileSync(join(repo, 'value.txt'), 'good\n')
  git(repo, ['add', '.'])
  git(repo, ['commit', '-m', 'accepted ordinary geometry'])
  const baseSha = git(repo, ['rev-parse', 'HEAD']),
    policy = config(repo).policy
  policy.verification.renderedReview = 'rendered.json'
  policy.sandbox = {
    backend: 'macos-seatbelt',
    playwrightModule: process.env.ATEAM_PLAYWRIGHT_MODULE,
    browserChannel: 'chrome',
  }
  git(repo, ['checkout', '-b', 'implementation'])
  const variants =
    mode === 'sticky'
      ? ['nested-correct', 'viewport-correct', 'bordered-scroller', 'broken-sticky']
      : ['correct', 'clip-path', 'mask', 'visibility-hidden', 'opacity-hidden']
  for (const variant of variants) {
    const html =
      variant === 'clip-path'
        ? source.replace(
            '#wrapper{width:200px}',
            '#wrapper{width:200px;clip-path:inset(0 90% 0 0)}',
          )
        : variant === 'mask'
          ? source.replace(
              '#wrapper{width:200px}',
              '#wrapper{width:200px;mask-image:linear-gradient(to right,black 10%,transparent 10%)}',
            )
          : variant === 'opacity-hidden'
            ? source.replace('#wrapper{width:200px}', '#wrapper{width:200px;opacity:0}')
            : variant === 'visibility-hidden'
              ? source.replace('#wrapper{width:200px}', '#wrapper{width:200px;visibility:hidden}')
              : variant === 'viewport-correct'
                ? source.replace('margin-top:100px', 'margin-top:0')
                : variant === 'bordered-scroller'
                  ? source.replace(
                      'height:200px;overflow:auto',
                      'height:200px;overflow:auto;border:5px solid black',
                    )
                  : variant === 'broken-sticky'
                    ? source.replace('position:sticky', 'position:relative')
                    : source
    writeFileSync(join(repo, 'index.html'), html)
    writeFileSync(join(repo, 'candidate.txt'), variant)
    git(repo, ['add', '.'])
    git(repo, ['commit', '-m', variant])
    const head = git(repo, ['rev-parse', 'HEAD']),
      runDir = join(group, variant)
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
        return verdict
      },
    })
    results.push({
      mode,
      variant,
      head,
      renderedStatus: supplied.renderedReview.status,
      verdict: result.verdict.verdict,
      approvalPath: result.approvalPath || null,
      recordPath: supplied.renderedReview.recordPath,
      cases: supplied.renderedReview.record.cases,
    })
    writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2) + '\n')
    console.log(JSON.stringify({ ...results.at(-1), cases: undefined }))
    const passed = mode === 'sticky' ? variant !== 'broken-sticky' : variant === 'correct'
    assert.equal(supplied.renderedReview.status, passed ? 'passed' : 'failed')
    assert.equal(result.verdict.verdict, passed ? 'approve' : 'request-changes')
    assert.equal(!!result.approvalPath, passed)
  }
}
