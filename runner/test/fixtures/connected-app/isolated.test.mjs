import { test } from 'node:test'
import assert from 'node:assert/strict'
import { testOnlyGuard } from './test-only-controller.mjs'
test('isolated controller rejects anonymous calls', () => {
  assert.equal(testOnlyGuard(null), false)
  assert.equal(testOnlyGuard('synthetic-local-session'), true)
})
