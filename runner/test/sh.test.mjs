import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { run } from '../src/sh.mjs'

test(
  'timeout terminates a process group including a descendant that ignores TERM',
  { skip: process.platform === 'win32' },
  async (t) => {
    const root = mkdtempSync(join(tmpdir(), 'ateam-timeout-')),
      heartbeat = join(root, 'heartbeat')
    t.after(() => rmSync(root, { recursive: true, force: true }))
    const child = `const fs=require('fs');process.on('SIGTERM',()=>{});setInterval(()=>fs.appendFileSync(${JSON.stringify(heartbeat)},'.'),20);console.log('ready')`
    const parent = `require('child_process').spawn(process.execPath,['-e',${JSON.stringify(child)}],{stdio:'inherit'});setInterval(()=>{},1000)`
    const started = Date.now()
    const result = await run(process.execPath, ['-e', parent], {
      check: false,
      timeoutMs: 350,
      killGraceMs: 100,
    })
    assert.equal(result.timedOut, true)
    assert.equal(result.code, 124, JSON.stringify(result))
    assert.match(result.stdout, /ready/)
    assert.ok(Date.now() - started < 2000)
    const before = existsSync(heartbeat) ? readFileSync(heartbeat, 'utf8') : ''
    await new Promise((r) => setTimeout(r, 100))
    assert.equal(readFileSync(heartbeat, 'utf8'), before)
  },
)

test('invalid timeout limits fail before spawning and ordinary results remain intact', async () => {
  for (const timeoutMs of [0, -1, NaN, Infinity, 1.5])
    await assert.rejects(run(process.execPath, ['-e', 'process.exit(0)'], { timeoutMs }), /timeout/)
  const result = await run(process.execPath, ['-e', "console.log('ok')"], { timeoutMs: 1000 })
  assert.equal(result.code, 0)
  assert.equal(result.stdout.trim(), 'ok')
  assert.equal(result.timedOut, false)
})

test(
  'timeout also stops a detached child with closed output streams',
  { skip: process.platform === 'win32' },
  async (t) => {
    const root = mkdtempSync(join(tmpdir(), 'ateam-detached-')),
      heartbeat = join(root, 'heartbeat'),
      pidFile = join(root, 'pid')
    t.after(() => rmSync(root, { recursive: true, force: true }))
    const code = `const fs=require('fs');process.on('SIGTERM',()=>{});fs.writeFileSync(${JSON.stringify(pidFile)},String(process.pid));setInterval(()=>fs.appendFileSync(${JSON.stringify(heartbeat)},'.'),20)`
    const parent = `require('child_process').spawn(process.execPath,['-e',${JSON.stringify(code)}],{detached:true,stdio:'ignore'});setInterval(()=>{},1000)`
    let pid
    try {
      const result = await run(process.execPath, ['-e', parent], {
        check: false,
        timeoutMs: 400,
        killGraceMs: 100,
      })
      pid = Number(readFileSync(pidFile, 'utf8'))
      assert.equal(result.timedOut, true)
      const before = readFileSync(heartbeat, 'utf8')
      await new Promise((r) => setTimeout(r, 100))
      assert.equal(readFileSync(heartbeat, 'utf8'), before)
      assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
    } finally {
      if (!pid && existsSync(pidFile)) pid = Number(readFileSync(pidFile, 'utf8'))
      if (pid)
        try {
          process.kill(pid, 'SIGKILL')
        } catch {}
    }
  },
)
