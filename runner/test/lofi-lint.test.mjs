import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const lint = fileURLToPath(
  new URL('../../.claude/skills/build-lofi/templates/lofi-lint.mjs', import.meta.url),
)
const fixtures = fileURLToPath(new URL('./fixtures/lofi-lint/', import.meta.url))

function run(fixture) {
  return spawnSync(process.execPath, [lint], {
    cwd: `${fixtures}/${fixture}`,
    encoding: 'utf8',
  })
}

test('actual CLI accepts declared typography, semantic and target token utilities', () => {
  const result = run('valid')

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /lofi-lint: clean/)
  assert.equal(result.stderr, '')
})

test('actual CLI does not confuse legal fractions or safe arbitrary values with colors', () => {
  const result = run('valid')

  assert.equal(result.status, 0, result.stderr)
  assert.doesNotMatch(result.stderr, /w-1\/2|basis-2\/3|translate-x-1\/2/)
  assert.doesNotMatch(result.stderr, /text-\[length:var|bg-\[color:var/)
})

test('actual CLI rejects named and palette colors, including nested ring offsets', () => {
  const result = run('invalid-utilities')

  assert.equal(result.status, 1)
  assert.match(result.stderr, /src\/pages\/index\.astro:1\s+lofi\/no-color-utility\s+bg-red\b/)
  assert.match(result.stderr, /src\/pages\/index\.astro:1\s+lofi\/no-color-utility\s+text-rebeccapurple\b/)
  assert.match(result.stderr, /src\/pages\/index\.astro:2\s+lofi\/no-color-utility\s+ring-offset-red-500\b/)
  assert.match(result.stderr, /src\/pages\/index\.astro:2\s+lofi\/no-color-utility\s+md:hover:ring-offset-blue-400\b/)
  assert.match(result.stderr, /src\/pages\/index\.astro:3\s+lofi\/no-named-color\s+rebeccapurple\b/)
  assert.match(result.stderr, /src\/pages\/index\.astro:4\s+lofi\/no-named-color\s+red\b/)
  assert.match(result.stderr, /src\/pages\/index\.astro:5\s+lofi\/no-named-color\s+rebeccapurple\b/)
  assert.match(result.stderr, /src\/pages\/index\.astro:6\s+lofi\/no-named-color\s+red\b/)
  assert.match(result.stderr, /src\/pages\/index\.astro:6\s+lofi\/no-named-color\s+blue\b/)
  assert.match(result.stderr, /src\/pages\/index\.astro:7\s+lofi\/no-named-color\s+red\b/)
  assert.match(result.stderr, /src\/pages\/index\.astro:11\s+lofi\/no-named-color\s+red\b/)
  assert.match(result.stderr, /src\/pages\/index\.astro:14\s+lofi\/no-named-color\s+red\b/)
  assert.match(result.stderr, /src\/pages\/index\.astro:15\s+lofi\/no-named-color\s+red\b/)
  assert.match(result.stderr, /src\/pages\/index\.astro:16\s+lofi\/no-named-color\s+red\b/)
})

test('actual CLI rejects raw and named arbitrary colors but permits only token-bound target colors', () => {
  const result = run('invalid-arbitrary')

  assert.equal(result.status, 1)
  assert.match(result.stderr, /src\/pages\/index\.astro:1\s+lofi\/no-raw-color\s+#f00\b/)
  assert.match(result.stderr, /src\/pages\/index\.astro:2\s+lofi\/no-raw-color\s+rgb\(/)
  assert.match(result.stderr, /src\/pages\/index\.astro:3\s+lofi\/no-color-utility\s+bg-\[red\]/)
  assert.match(result.stderr, /src\/pages\/index\.astro:3\s+lofi\/no-color-utility\s+ring-offset-\[#fff\]/)
  assert.match(result.stderr, /src\/pages\/index\.astro:4\s+lofi\/no-color-utility\s+bg-danger\b/)
})

test('actual CLI resolves effective target colors and rejects literal token fallbacks', () => {
  const result = run('invalid-config')

  assert.equal(result.status, 1)
  assert.match(result.stderr, /src\/pages\/index\.astro:1\s+lofi\/no-color-utility\s+bg-surface\b/)
  assert.match(result.stderr, /src\/pages\/index\.astro:2\s+lofi\/no-color-utility\s+bg-fallback\b/)
  assert.doesNotMatch(result.stderr, /bg-chain/)
  assert.match(result.stderr, /src\/pages\/index\.astro:4\s+lofi\/no-raw-color\s+#f00\b/)
})
