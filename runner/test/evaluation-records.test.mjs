import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  readdirSync,
  existsSync,
  mkdirSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fork } from 'node:child_process'
import { saveAgentTrial } from '../src/evaluation.mjs'
const example = () =>
  JSON.parse(readFileSync(new URL('../evaluation/agent-trial.example.json', import.meta.url)))
const workerSource = `
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
process.send('ready')
process.on('message', async ({ root, record, pause }) => {
  if (pause) {
    const opened = new Map(), open = fs.openSync, write = fs.writeFileSync
    fs.openSync = (path, ...args) => { const fd = open(path, ...args); opened.set(fd, String(path)); return fd }
    fs.writeFileSync = (path, ...args) => {
      const name = typeof path === 'number' ? opened.get(path) : String(path)
      if (name?.endsWith('/outcome.json')) {
        process.send({ pausedAt: name })
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)
      }
      return write(path, ...args)
    }
    syncBuiltinESMExports()
  }
  const { saveAgentTrial } = await import(${JSON.stringify(new URL('../src/evaluation.mjs', import.meta.url).href)})
  try { process.send({ saved: saveAgentTrial(root, record) }, () => process.exit(0)) }
  catch (error) { process.send({ error: error.message }, () => process.exit(0)) }
})
`
const workerDetails = new WeakMap()
function workerFailure(child, reason) {
  const details = workerDetails.get(child) || {}
  return Error(
    `Synthetic import worker ${reason}; pid=${child.pid}; exitCode=${details.exitCode ?? child.exitCode}; signal=${details.signal ?? child.signalCode}; stderr=${JSON.stringify(details.stderr || '')}`,
  )
}
function message(child) {
  return new Promise((resolve, reject) => {
    if (workerDetails.get(child)?.closed) {
      reject(workerFailure(child, 'closed before receipt'))
      return
    }
    const timer = setTimeout(() => {
      cleanup()
      child.kill('SIGKILL')
      reject(workerFailure(child, 'timed out'))
    }, 5000)
    const cleanup = () => {
      clearTimeout(timer)
      child.off('error', onError)
      child.off('close', onClose)
      child.off('message', onMessage)
    }
    const onError = (error) => {
      cleanup()
      reject(workerFailure(child, `failed: ${error.message}`))
    }
    const onClose = () => {
      cleanup()
      reject(workerFailure(child, 'closed before receipt'))
    }
    const onMessage = (value) => {
      cleanup()
      resolve(value)
    }
    child.once('message', onMessage)
    child.once('error', onError)
    child.once('close', onClose)
  })
}
function createWorkerScript(root, source = workerSource) {
  const path = join(root, 'worker.mjs')
  // The disposable fixture writes its source once, before any child can load it.
  writeFileSync(path, source)
  return path
}
function worker(t, script) {
  const child = fork(script, [], { execArgv: [], stdio: ['ignore', 'ignore', 'pipe', 'ipc'] })
  const details = { stderr: '', exitCode: null, signal: null, closed: false }
  workerDetails.set(child, details)
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (bytes) => {
    details.stderr = (details.stderr + bytes).slice(-16384)
  })
  child.on('close', (exitCode, signal) =>
    Object.assign(details, { exitCode, signal, closed: true }),
  )
  t.after(() => child.kill('SIGKILL'))
  return child
}
test('simultaneous trial imports admit one group ordinal and expose only complete records', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'ateam-eval-concurrent-'))
  const script = createWorkerScript(root)
  const children = Array.from({ length: 16 }, () => worker(t, script))
  await Promise.all(children.map(message))
  const completed = Promise.all(children.map(message))
  children.forEach((child, index) =>
    child.send({ root, record: { ...example(), id: `trial-${index}` } }),
  )
  const results = await completed
  assert.equal(results.filter((result) => result.saved).length, 1, JSON.stringify(results))
  for (const result of results.filter((result) => result.error)) {
    assert.match(result.error, /writer.*active|writer.*interrupted|trialNumber.*exists/i)
    assert.doesNotMatch(result.error, /ENOENT|Unexpected end/)
  }
  const published = readdirSync(join(root, 'agent-trials'))
  assert.equal(published.length, 1)
  for (const name of ['record', 'outcome', 'trace', 'subjective'])
    assert.doesNotThrow(() =>
      JSON.parse(readFileSync(join(root, 'agent-trials', published[0], `${name}.json`))),
    )
})
test('interrupted staged imports publish no partial trial and keep evidence locked for reconciliation', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'ateam-eval-interrupted-'))
  const child = worker(t, createWorkerScript(root))
  await message(child)
  const paused = message(child)
  const record = example()
  child.send({ root, record, pause: true })
  const checkpoint = await paused
  assert.ok(checkpoint.pausedAt)
  const published = join(root, 'agent-trials', record.id)
  assert.equal(
    existsSync(published),
    false,
    'A trial becomes visible only after every file is durable',
  )
  assert.ok(
    existsSync(join(dirname(checkpoint.pausedAt), 'record.json')),
    'Retain staged evidence for inspection',
  )
  assert.throws(
    () => saveAgentTrial(root, { ...record, id: 'another-trial' }),
    /writer.*active|writer.*interrupted/i,
  )
  const exited = new Promise((resolve) => child.once('exit', resolve))
  child.kill('SIGKILL')
  await exited
  assert.throws(
    () => saveAgentTrial(root, { ...record, id: 'another-trial' }),
    /writer.*active|writer.*interrupted/i,
  )
  assert.equal(existsSync(published), false)
  assert.ok(existsSync(join(dirname(checkpoint.pausedAt), 'record.json')))
})
test('legacy partial records fail closed with retained import evidence instead of being counted', () => {
  const root = mkdtempSync(join(tmpdir(), 'ateam-eval-legacy-partial-'))
  const record = example(),
    prior = join(root, 'agent-trials', record.id)
  mkdirSync(prior, { recursive: true })
  const { outcome, trace, subjective, ...metadata } = record
  writeFileSync(join(prior, 'record.json'), JSON.stringify(metadata))
  assert.throws(
    () => saveAgentTrial(root, { ...record, id: 'new-trial', trialNumber: 2 }),
    /incomplete.*reconciliation/i,
  )
  assert.deepEqual(readdirSync(prior), ['record.json'])
  assert.equal(existsSync(join(root, 'agent-trials/new-trial')), false)
  assert.throws(
    () => saveAgentTrial(root, { ...record, id: 'new-trial', trialNumber: 2 }),
    /writer.*active|writer.*interrupted/i,
  )
})

for (const part of ['record', 'outcome', 'trace', 'subjective']) {
  for (const damage of ['missing', 'malformed-json', 'invalid-shape']) {
    test(`reconciliation rejects ${damage} ${part} before writing and preserves all existing files`, async () => {
      const { unlinkSync, lstatSync } = await import('node:fs')
      const { saveReconciliation } = await import('../src/evaluation.mjs')
      const root = mkdtempSync(join(tmpdir(), 'ateam-eval-complete-trial-'))
      const record = example(),
        saved = saveAgentTrial(root, record)
      if (damage === 'missing') unlinkSync(saved[part])
      else writeFileSync(saved[part], damage === 'malformed-json' ? '{broken' : '{}')
      const snapshot = () =>
        Object.fromEntries(
          readdirSync(root, { recursive: true })
            .filter((path) => lstatSync(join(root, path)).isFile())
            .map((path) => [path, readFileSync(join(root, path), 'hex')]),
        )
      const before = snapshot()
      const calibration = JSON.parse(
        readFileSync(new URL('../evaluation/reconciliation.example.json', import.meta.url)),
      )
      assert.throws(() => saveReconciliation(root, calibration), /trial|reconciliation/i)
      assert.equal(existsSync(join(root, 'calibration')), false)
      assert.deepEqual(snapshot(), before)
    })
  }
}

test('reconciliation of a complete valid published trial preserves each original part', async () => {
  const { saveReconciliation } = await import('../src/evaluation.mjs')
  const root = mkdtempSync(join(tmpdir(), 'ateam-eval-valid-calibration-'))
  const saved = saveAgentTrial(root, example())
  const before = Object.fromEntries(
    Object.entries(saved).map(([part, path]) => [part, readFileSync(path, 'hex')]),
  )
  const calibration = JSON.parse(
    readFileSync(new URL('../evaluation/reconciliation.example.json', import.meta.url)),
  )
  assert.deepEqual(JSON.parse(readFileSync(saveReconciliation(root, calibration))), calibration)
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(saved).map(([part, path]) => [part, readFileSync(path, 'hex')]),
    ),
    before,
  )
})

test('worker failures report retained stderr and exit details without retries', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'ateam-eval-worker-diagnostic-'))
  const script = createWorkerScript(
    root,
    "process.stderr.write('synthetic worker failure detail\\n'); process.exitCode = 7",
  )
  const child = worker(t, script)
  await assert.rejects(message(child), (error) => {
    assert.match(error.message, /exitCode=7/)
    assert.match(error.message, /signal=null/)
    assert.match(error.message, /synthetic worker failure detail/)
    return true
  })
})
