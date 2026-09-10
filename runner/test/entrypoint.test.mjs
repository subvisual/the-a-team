import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const api = existsSync(new URL('../src/entrypoint.mjs', import.meta.url))
  ? await import('../src/entrypoint.mjs')
  : {}
const check = (url, argv) => {
  assert.equal(typeof api.isMain, 'function', 'shared entrypoint detector must exist')
  return api.isMain(url, argv)
}

test('entrypoint detection recognizes the same file through its real path and symlink', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ateam-entrypoint-'))
  try {
    const actual = fileURLToPath(import.meta.url),
      linked = join(dir, 'linked.mjs')
    symlinkSync(actual, linked)
    assert.equal(check(import.meta.url, actual), true)
    assert.equal(check(import.meta.url, linked), true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

for (const argv of ['-', '', null, '/definitely/missing/ateam-entrypoint.mjs', '/']) {
  test(`entrypoint detection returns false without throwing for ${JSON.stringify(argv)}`, () => {
    assert.equal(check(import.meta.url, argv), false)
  })
}

test('imported modules are not treated as the main entrypoint', () => {
  assert.equal(
    check(
      new URL('../src/obligations-cli.mjs', import.meta.url).href,
      fileURLToPath(import.meta.url),
    ),
    false,
  )
})
