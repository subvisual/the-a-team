import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir, hostname } from 'node:os'
import { join, dirname } from 'node:path'
import { claim, inspectClaim } from '../src/core/claim.mjs'
import { lockPath, ensureDir } from '../src/paths.mjs'
let root
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ateam-claim-'))
  process.env.ATEAM_RUNNER_HOME = root
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  delete process.env.ATEAM_RUNNER_HOME
})
const seed = (holder) => {
  const p = lockPath('r', '1')
  ensureDir(dirname(p))
  writeFileSync(p, JSON.stringify(holder))
  return p
}
test('stale same-host process claim is archived and reclaimed', () => {
  const p = seed({
    schemaVersion: 1,
    repo: 'r',
    id: '1',
    host: hostname(),
    pid: 2147483647,
    processIdentity: 'dead',
    token: 'old',
  })
  const token = claim('r', '1')
  assert.ok(token)
  assert.equal(token.recoveredHolder.token, 'old')
  assert.equal(JSON.parse(readFileSync(p)).token, token.token)
  token.release()
  assert.equal(existsSync(p), false)
})
test('live, foreign-host and legacy unknown claims fail closed', () => {
  const own = claim('r', '1')
  assert.ok(own)
  assert.equal(claim('r', '1'), null)
  own.release()
  seed({
    schemaVersion: 1,
    repo: 'r',
    id: '1',
    host: 'other-host',
    pid: 2147483647,
    processIdentity: 'x',
    token: 'foreign',
  })
  assert.equal(inspectClaim('r', '1').status, 'foreign-host')
  assert.equal(claim('r', '1'), null)
  seed({ pid: 2147483647 })
  assert.equal(inspectClaim('r', '1').status, 'unknown-owner')
  assert.equal(claim('r', '1'), null)
})
test('release cannot remove a replacement owner', () => {
  const token = claim('r', '1')
  seed({
    schemaVersion: 1,
    repo: 'r',
    id: '1',
    host: hostname(),
    pid: process.pid,
    token: 'replacement',
  })
  token.release()
  assert.equal(JSON.parse(readFileSync(token.path)).token, 'replacement')
})

test('an interrupted recovery guard remains explicit and is never silently removed', () => {
  const p = seed({
    schemaVersion: 1,
    repo: 'r',
    id: '1',
    host: hostname(),
    pid: 2147483647,
    processIdentity: 'dead',
    token: 'old',
  })
  writeFileSync(`${p}.recovery`, '')
  assert.equal(inspectClaim('r', '1').status, 'recovery-uncertain')
  assert.equal(claim('r', '1'), null)
  assert.equal(existsSync(`${p}.recovery`), true)
  assert.equal(JSON.parse(readFileSync(p)).token, 'old')
})
