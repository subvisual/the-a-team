#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync, accessSync, constants, realpathSync } from 'node:fs'
import { resolve, join, delimiter } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const harness = fileURLToPath(new URL('../../../', import.meta.url))
const target = process.argv[2] && resolve(process.argv[2])
if (!target || existsSync(target))
  throw Error(
    'Pass a new, non-existing synthetic target directory. Existing paths are never overwritten.',
  )
const binary = (process.env.PATH || '')
  .split(delimiter)
  .filter(Boolean)
  .map((path) => resolve(path, 'git'))
  .find((path) => {
    try {
      accessSync(path, constants.X_OK)
      return true
    } catch {
      return false
    }
  })
if (!binary) throw Error('Trusted Git is unavailable; setup did not create a target.')
const gitBinary = realpathSync(binary)
const git = (cwd, ...args) =>
  execFileSync(gitBinary, ['-c', 'core.hooksPath=/dev/null', ...args], {
    cwd,
    encoding: 'utf8',
    env: {
      PATH: '/usr/bin:/bin',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_TERMINAL_PROMPT: '0',
      GIT_NO_REPLACE_OBJECTS: '1',
    },
  }).trim()
const revision = git(harness, 'rev-parse', 'HEAD')
mkdirSync(join(target, 'docs/product'), { recursive: true })
mkdirSync(join(target, 'docs/features/sample'), { recursive: true })
writeFileSync(
  join(target, 'CLAUDE.md'),
  `# Synthetic onboarding target\n\n## A-Team Config\n\`\`\`json\n${JSON.stringify({ harnessRoot: harness, harnessRevision: revision, baseBranch: 'main', testCommand: 'node --test', currentContext: 'docs/product/context.md', githubIssues: false, supervisorActions: ['record-local-approval'] }, null, 2)}\n\`\`\`\n`,
)
writeFileSync(
  join(target, 'docs/product/context.md'),
  '# Synthetic context\n```ateam-context\n' +
    JSON.stringify(
      {
        schemaVersion: 1,
        purpose: 'Practice planning without starting a model',
        audience: 'Synthetic operator',
        currentState: 'sample',
        authorityOrder: ['requirements', 'code'],
        globalInvariants: [],
        bindings: { design: 'headless sample', engineering: 'Node built-in tests' },
        commands: ['node --test'],
        unresolvedDecisions: [],
        sources: [],
        facts: [],
        history: [],
      },
      null,
      2,
    ) +
    '\n```\n',
)
writeFileSync(
  join(target, 'issues.md'),
  '# Synthetic issues\n\n## Preserve whitespace in saved notes\n**ID:** ISS-NOTE\n**Depends on:** none\n\n### Acceptance criteria\n- [ ] Given a note containing leading and trailing spaces, when the note is saved and loaded, then the original text is returned exactly\n\n### Technical notes\nStandalone synthetic maintenance task. No product job or publishing is implied.\n',
)
writeFileSync(
  join(target, 'notes.mjs'),
  'export const roundTrip = value => JSON.parse(JSON.stringify({ value })).value\n',
)
writeFileSync(
  join(target, 'notes.test.mjs'),
  "import { test } from 'node:test'\nimport assert from 'node:assert/strict'\nimport { roundTrip } from './notes.mjs'\ntest('preserve exact input', () => assert.equal(roundTrip('  sample  '), '  sample  '))\n",
)
git(target, 'init', '-q', '-b', 'main')
git(target, 'config', 'user.name', 'Synthetic onboarding')
git(target, 'config', 'user.email', 'synthetic@example.invalid')
git(target, 'add', '.')
git(target, 'commit', '-qm', 'Create synthetic onboarding target')
process.stdout.write(
  JSON.stringify(
    {
      schemaVersion: 1,
      target,
      harness,
      revision,
      remote: null,
      modelsStarted: 0,
      next: 'Run doctor and the local dry-run from the README.',
    },
    null,
    2,
  ) + '\n',
)
