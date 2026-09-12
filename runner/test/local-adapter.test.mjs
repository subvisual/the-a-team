import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseIssuesFile, slugify } from '../src/adapters/local.mjs'

const FILE = `# Auth feature — issues

## Dependency graph

- Tracer bullet first, then the rest.

## Tracer bullet: login round trip

**Depends on:** none

### Description
Wire a login form through to a session cookie.

### Acceptance criteria
- [ ] Given valid credentials, when the form is submitted, then a session cookie is set
- [ ] Given invalid credentials, when the form is submitted, then an error is shown

### Technical notes
Follow the existing form helpers.

## Password reset

**Depends on:** Tracer bullet: login round trip

### Description
Email a reset link.

### Acceptance criteria
- [ ] Given a known address, when reset is requested, then a mail is queued
`

test('parses issues in the prd-to-issues shape', () => {
  const issues = parseIssuesFile(FILE)
  assert.equal(issues.length, 2)
  assert.equal(issues[0].title, 'Tracer bullet: login round trip')
  assert.equal(issues[0].acceptanceCriteria.length, 2)
  assert.deepEqual(issues[0].dependsOn, [])
  assert.deepEqual(issues[1].dependsOn, ['Tracer bullet: login round trip'])
})

test('a dependency-graph preamble is not an issue', () => {
  assert.equal(
    parseIssuesFile(FILE).some((i) => i.title === 'Dependency graph'),
    false,
  )
})

test('legacy planning keys remain title slugs until explicit migration', () => {
  assert.equal(parseIssuesFile(FILE)[0].key, 'tracer-bullet-login-round-trip')
  assert.equal(slugify('Add /api/v2 — “quotes” & things'), 'add-api-v2-quotes-things')
})

test('an issue whose acceptance-criteria section is empty still parses, and fails the gate later', () => {
  const issues = parseIssuesFile(
    '## Thing\n\n### Acceptance criteria\n\n### Technical notes\nnone\n',
  )
  assert.equal(issues.length, 1)
  assert.deepEqual(issues[0].acceptanceCriteria, [])
})

import { createLocalAdapter, migrateIssuesText } from '../src/adapters/local.mjs'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('an approved branch becomes the next issue’s base', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ateam-local-'))
  const file = join(dir, 'issues.md')
  writeFileSync(file, migrateIssuesText(FILE).text)
  try {
    const adapter = createLocalAdapter({ issuesFile: file, repoPath: dir, base: 'feature/auth' })
    assert.equal(adapter.base, 'feature/auth')
    await adapter.onApproved(
      adapter.issues[0],
      { branch: 'feature/auth-issue-1', head: 'abc', cycle: 1 },
      {},
    )
    assert.equal(adapter.base, 'feature/auth-issue-1')
    assert.equal(adapter.report[0].outcome, 'approved')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
