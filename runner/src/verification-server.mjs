import { createServer } from 'node:net'
import { execFileSync } from 'node:child_process'
import { runSandboxed } from './sandbox.mjs'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function freePort() {
  const socket = createServer()
  await new Promise((resolve, reject) => {
    socket.once('error', reject)
    socket.listen(0, '127.0.0.1', resolve)
  })
  const port = socket.address().port
  await new Promise((resolve) => socket.close(resolve))
  return port
}
function assertListenerOwner(port, rootPid) {
  const pids = execFileSync('/usr/sbin/lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
    .trim()
    .split(/\s+/)
    .map(Number)
  if (!pids.length) throw Error('verification server has no observed listener')
  for (let pid of pids) {
    const seen = new Set()
    while (pid !== rootPid && pid > 1 && !seen.has(pid)) {
      seen.add(pid)
      pid = Number(
        execFileSync('/bin/ps', ['-p', String(pid), '-o', 'ppid='], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        }).trim(),
      )
    }
    if (pid !== rootPid)
      throw Error('loopback listener does not belong to the supervised verification process')
  }
}
/** Execute an accepted app server with read-only source and one loopback port.
 * Browser orchestration stays supervisor-owned; model roles receive no listener.
 */
export async function withVerificationServer(
  { command, worktree, scratchDir, policy, timeoutMs = 30000 },
  observe,
) {
  if (typeof command !== 'string' || !command.trim())
    throw Error('verification server command required')
  if (typeof observe !== 'function' || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1)
    throw Error('verification server needs an observer and a positive bounded timeout')
  const port = await freePort(),
    controller = new AbortController(),
    observationController = new AbortController(),
    baseURL = `http://127.0.0.1:${port}`
  let pid,
    result,
    error,
    settled = false
  const running = runSandboxed('/bin/sh', ['-c', command], {
    cwd: worktree,
    scratchDir,
    policy,
    role: 'verification-server',
    serverPort: port,
    timeoutMs,
    signal: controller.signal,
    check: false,
    onSpawn: (value) => {
      pid = value
    },
  }).then(
    (value) => {
      result = value
      settled = true
      observationController.abort()
    },
    (value) => {
      error = value
      settled = true
      observationController.abort()
    },
  )
  let observation, failure
  try {
    const deadline = Date.now() + Math.min(timeoutMs, 15000)
    let ready = false
    while (Date.now() < deadline && !ready) {
      if (settled)
        throw error || Error(`verification server exited before readiness: ${result?.stderr}`)
      try {
        const response = await fetch(baseURL, {
          signal: AbortSignal.timeout(500),
          redirect: 'error',
        })
        await response.body?.cancel()
        ready = response.status < 500
      } catch {}
      if (!ready) await sleep(50)
    }
    if (!ready) throw Error('verification server readiness timed out')
    assertListenerOwner(port, pid)
    observation = await Promise.race([
      Promise.resolve().then(() =>
        observe({ baseURL, port, signal: observationController.signal }),
      ),
      running.then(() => {
        throw error || Error('verification server stopped or timed out during observation')
      }),
    ])
    if (settled) throw error || Error('verification server stopped during observation')
    assertListenerOwner(port, pid)
  } catch (cause) {
    failure = cause instanceof Error ? cause : Error(String(cause))
  } finally {
    observationController.abort()
    controller.abort()
    await running
  }
  const server = {
    command,
    port,
    output: result || null,
    launchError: error?.message || null,
    network: `loopback:${port}`,
    source: 'read-only',
  }
  if (error) failure ||= error
  if (
    result?.cleanupUncertain ||
    result?.timedOut ||
    (result && !result.aborted && result.code !== 0)
  )
    failure ||= Error(`verification server cleanup failed: ${result.stderr}`)
  if (failure) throw Object.assign(failure, { server })
  return { observation, server }
}
