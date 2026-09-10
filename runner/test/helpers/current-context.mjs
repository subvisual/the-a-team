import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
export function currentContextFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'ateam-current-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  writeCurrentContext(root)
  return root
}
export function writeCurrentContext(root, commands = []) {
  mkdirSync(join(root, 'docs/product'), { recursive: true })
  const index = {
    schemaVersion: 1,
    purpose: 'Synthetic runner test',
    audience: 'Fixture operator',
    currentState: 'prototype',
    authorityOrder: ['requirements', 'code'],
    globalInvariants: [],
    bindings: { design: 'No interface in fixture', engineering: 'Node test fixture' },
    commands,
    unresolvedDecisions: [],
    sources: [],
    facts: [],
    history: [],
  }
  writeFileSync(
    join(root, 'docs/product/context.md'),
    '```ateam-context\n' + JSON.stringify(index) + '\n```\n',
  )
  return root
}
