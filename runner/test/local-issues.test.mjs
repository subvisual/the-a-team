import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as local from '../src/adapters/local.mjs'
import { acceptanceCriteria } from '../src/issue.mjs'

const ticket = (
  id,
  title = 'A round trip',
  dependencies = 'none',
  criteria = '- [ ] Given input, when saved, then it persists',
) =>
  `## ${title}\n${id ? `**ID:** ${id}\n` : ''}**Depends on:** ${dependencies}\n**Requirements:** R-1, R-2\n\n### Description\nA vertical slice.\n\n### Acceptance criteria\n${criteria}\n\n### Technical notes\n**Files touched:** src/save.mjs, test/save.test.mjs\n`

test('stable local ID survives rename while criteria and content versions track their own changes', () => {
  const [original] = local.parseIssuesFile(ticket('ISS-SAVE'))
  const [renamed] = local.parseIssuesFile(ticket('ISS-SAVE', 'Save and reopen'))
  const [changed] = local.parseIssuesFile(
    ticket(
      'ISS-SAVE',
      'Save and reopen',
      'none',
      '- [ ] Given invalid input, when saved, then an error appears',
    ),
  )
  assert.equal(original.key, 'ISS-SAVE')
  assert.equal(renamed.key, original.key)
  assert.deepEqual(original.requirements, ['R-1', 'R-2'])
  assert.match(original.criteriaVersion, /^[a-f0-9]{64}$/)
  assert.equal(original.criteriaVersion, renamed.criteriaVersion)
  assert.notEqual(original.contentVersion, renamed.contentVersion)
  assert.notEqual(renamed.criteriaVersion, changed.criteriaVersion)
  assert.deepEqual(local.parseIssuesFile(ticket('ISS-SAVE'))[0], original)
})

test('full batch validation returns deterministic dependency order', () => {
  assert.equal(typeof local.validateIssues, 'function')
  const issues = local.parseIssuesFile(
    ticket('ISS-END', 'Finish', 'ISS-MID') +
      ticket('ISS-START', 'Start') +
      ticket('ISS-MID', 'Middle', 'ISS-START'),
  )
  assert.deepEqual(
    local.validateIssues(issues).map((i) => i.key),
    ['ISS-START', 'ISS-MID', 'ISS-END'],
  )
})

for (const [name, text, expected] of [
  ['missing stable ID', ticket(null), /stable ID.*migrate-issues/i],
  ['duplicate stable ID', ticket('ISS-SAME') + ticket('ISS-SAME', 'Other'), /duplicate.*ISS-SAME/i],
  ['unknown dependency', ticket('ISS-A', 'A', 'ISS-MISSING'), /unknown.*ISS-MISSING/i],
  [
    'dependency cycle',
    ticket('ISS-A', 'A', 'ISS-B') + ticket('ISS-B', 'B', 'ISS-A'),
    /cycle.*ISS-A.*ISS-B/i,
  ],
  ['empty acceptance criteria', ticket('ISS-A', 'A', 'none', 'TBD'), /ISS-A.*acceptance criteria/i],
  [
    'missing acceptance heading',
    '## A\n**ID:** ISS-A\n### Description\nOnly prose\n',
    /ISS-A.*acceptance criteria/i,
  ],
  ['invalid ID', ticket('../escape'), /invalid.*ID/i],
]) {
  test(`adapter rejects ${name} before any execution or history lookup`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'ateam-issue-validation-'))
    const file = join(dir, 'issues.md')
    writeFileSync(file, text)
    try {
      assert.throws(
        () =>
          local.createLocalAdapter({ issuesFile: file, repoPath: '/missing/repo', base: 'main' }),
        expected,
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
}

test('migration persists IDs once, resolves legacy titles, and never imports approval state', () => {
  assert.equal(typeof local.migrateIssuesText, 'function')
  const source = '# Synthetic issues\n\n' + ticket(null, 'Login') + ticket(null, 'Logout', 'Login')
  const migrated = local.migrateIssuesText(source)
  assert.equal(migrated.changed, true)
  const issues = local.validateIssues(local.parseIssuesFile(migrated.text))
  assert.match(issues[0].key, /^ISS-/)
  assert.deepEqual(issues[1].dependsOn, [issues[0].key])
  assert.equal(issues[0].approved, undefined)
  assert.equal(local.migrateIssuesText(migrated.text).changed, false)
  assert.equal(local.migrateIssuesText(migrated.text).text, migrated.text)
  const renamed = migrated.text.replace('## Login\n', '## Sign in\n')
  assert.equal(local.parseIssuesFile(renamed)[0].key, issues[0].key)
})

for (const [name, source, expected] of [
  [
    'ambiguous legacy title',
    ticket(null, 'Same') + ticket(null, 'Same') + ticket(null, 'Child', 'Same'),
    /ambiguous|collision/i,
  ],
  ['legacy slug collision', ticket(null, 'Save now') + ticket(null, 'Save-now'), /collision/i],
  ['unknown legacy title', ticket(null, 'First', 'Missing'), /unknown.*Missing/i],
  ['duplicate existing ID', ticket('ISS-X') + ticket('ISS-X', 'Other'), /duplicate.*ISS-X/i],
]) {
  test(`migration refuses ${name} with diagnostics`, () => {
    assert.equal(typeof local.migrateIssuesText, 'function')
    assert.throws(() => local.migrateIssuesText(source), expected)
  })
}

test('ticket-writer required references exist and its checked-in issues example runs through the adapter', () => {
  const skill = new URL('../../.claude/skills/ticket-writer/', import.meta.url)
  const source = readFileSync(new URL('SKILL.md', skill), 'utf8')
  const references = [
    ...new Set([
      ...(source.match(/references\/[a-z_\/-]+\.md/g) || []),
      'references/ticket_bug_template.md',
      'references/ticket_chore_template.md',
    ]),
  ]
  assert.ok(references.includes('references/decomposition.md'))
  for (const path of references)
    assert.equal(existsSync(new URL(path, skill)), true, `missing ticket-writer reference: ${path}`)
  const file = new URL('examples/issues.md', skill)
  assert.equal(existsSync(file), true)
  const adapter = local.createLocalAdapter({ issuesFile: file, repoPath: '/unused', base: 'main' })
  assert.deepEqual(
    adapter.issues.map((i) => i.key),
    ['ISS-DIGEST-ROUNDTRIP', 'ISS-DIGEST-RETRY', 'ISS-DIGEST-TIMEZONE'],
  )
  assert.deepEqual(
    adapter.issues.map((i) => i.acceptanceCriteria.length),
    [2, 2, 2],
  )
  assert.deepEqual(
    adapter.issues.map((i) => i.requirements),
    [['R-1'], ['R-2'], ['R-3']],
  )
  assert.deepEqual(
    adapter.issues.map((i) => i.dependsOn),
    [[], ['ISS-DIGEST-ROUNDTRIP'], ['ISS-DIGEST-ROUNDTRIP']],
  )
  for (const issue of adapter.issues)
    for (const criterion of issue.acceptanceCriteria) {
      assert.match(criterion, /^Given .+, when .+, then .+/i)
    }
})

test('standalone GitHub acceptance headings remain supported', () => {
  for (const depth of ['#', '##', '###'])
    assert.deepEqual(
      acceptanceCriteria(
        `${depth} Acceptance Criteria\n- [ ] Given input, when saved, then it persists`,
      ),
      ['Given input, when saved, then it persists'],
    )
})

test('empty checklist markers never become acceptance criteria in local or standalone GitHub issues', () => {
  for (const criterion of ['- [ ]', '- [x]', '- [X]', '1. [ ]', '* [ ]   ']) {
    assert.deepEqual(acceptanceCriteria(`## Acceptance criteria\n${criterion}\n`), [])
    const issues = local.parseIssuesFile(ticket('ISS-EMPTY', 'Empty', 'none', criterion))
    assert.deepEqual(issues[0].acceptanceCriteria, [])
    assert.throws(() => local.validateIssues(issues), /no checkable acceptance criteria/)
  }
})

for (const fence of ['```', '~~~']) {
  test(`fenced ${fence} metadata samples stay in the body without affecting identity, dependencies or duplicate detection`, () => {
    const sample = `${fence}markdown\n**ID:** ISS-SAMPLE\n**Depends on:** ISS-PARENT\n**Requirements:** R-SAMPLE\n${fence}\n`
    const source = ticket('ISS-EXPORT', 'Export') + sample
    const [issue] = local.parseIssuesFile(source)
    assert.doesNotThrow(() => local.validateIssues([issue]))
    assert.equal(issue.id, 'ISS-EXPORT')
    assert.deepEqual(issue.dependsOn, [])
    assert.deepEqual(issue.requirements, ['R-1', 'R-2'])
    assert.equal(issue.body, source.slice(source.indexOf('\n') + 1).trim())
    assert.ok(issue.body.includes(sample.trim()))
    assert.equal(local.migrateIssuesText(source).text, source)
  })
}

test('migration changes the actual legacy dependency while preserving an earlier fenced sample', () => {
  const sample = '```markdown\n**ID:** ISS-SAMPLE\n**Depends on:** ISS-PARENT\n```\n'
  const source =
    ticket(null, 'Parent') +
    `## Export\n${sample}**Depends on:** Parent\n### Acceptance criteria\n- [ ] Given saved work, when exported, then a file downloads\n`
  const migrated = local.migrateIssuesText(source)
  const issues = local.validateIssues(local.parseIssuesFile(migrated.text))
  assert.equal(issues[1].id === 'ISS-SAMPLE', false)
  assert.deepEqual(issues[1].dependsOn, [issues[0].id])
  assert.ok(migrated.text.includes(sample))
})

test('an ID only inside a fenced sample does not satisfy stable identity validation', () => {
  const source = ticket(null, 'Export') + '```markdown\n**ID:** ISS-SAMPLE\n```\n'
  const [issue] = local.parseIssuesFile(source)
  assert.equal(issue.id, null)
  assert.throws(() => local.validateIssues([issue]), /stable ID required/)
})
