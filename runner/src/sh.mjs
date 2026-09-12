import { assertProcessInventory, processTree } from './process-tree.mjs'
import { spawn } from 'node:child_process'

export class CommandError extends Error {
  constructor(cmd, args, code, stdout, stderr) {
    super(
      `${cmd} exited ${code}: ${(stderr || stdout || '').trim().split('\n').slice(0, 4).join(' | ')}`,
    )
    this.name = 'CommandError'
    this.cmd = cmd
    this.args = args
    this.code = code
    this.stdout = stdout
    this.stderr = stderr
  }
}

// Run a command to completion, capturing output. `input` is written to stdin.
export function run(
  cmd,
  args,
  {
    cwd,
    input,
    env,
    replaceEnv = false,
    check = true,
    onStdout,
    timeoutMs,
    killGraceMs = 1000,
  } = {},
) {
  return new Promise((resolve, reject) => {
    for (const [name, value] of [
      ['timeoutMs', timeoutMs],
      ['timeout grace', killGraceMs],
    ])
      if (value !== undefined && (!Number.isSafeInteger(value) || value < 1))
        throw new Error(`${name} must be a positive integer`)
    if (timeoutMs !== undefined && process.platform === 'win32')
      throw new Error('process-tree timeout requires the supported POSIX backend')
    if (timeoutMs !== undefined) assertProcessInventory()
    const child = spawn(cmd, args, {
      cwd,
      env: replaceEnv ? env || {} : env ? { ...process.env, ...env } : process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    })
    const tree = timeoutMs !== undefined && child.pid ? processTree(child.pid) : null
    let stdout = '',
      stderr = '',
      timer = null,
      killTimer = null,
      finishTimer = null
    let timedOut = false,
      forced = false,
      closed = false,
      exitCode,
      signal,
      cleanupError = null
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (d) => {
      stdout += d
      if (onStdout) onStdout(d)
    })
    child.stderr.on('data', (d) => {
      stderr += d
    })
    const terminate = (kind) => {
      try {
        tree?.terminate(kind)
      } catch (error) {
        cleanupError = error.message
        stderr += `\nateam-runner: process-tree cleanup uncertain: ${error.message}`
      }
      // Always stop the original group even if lineage inspection failed.
      try {
        process.kill(-child.pid, kind)
      } catch (error) {
        if (
          error.code !== 'ESRCH' &&
          !(error.code === 'EPERM' && tree && !tree.groupAlive(child.pid))
        ) {
          cleanupError = error.message
          stderr += `\nateam-runner: process-group ${kind} failed: ${error.message}`
        }
      }
    }
    const finish = () => {
      if (!closed || (timedOut && !forced)) return
      if (!timedOut && tree) {
        try {
          if (tree.alive()) {
            finishTimer = setTimeout(finish, 25)
            return
          }
        } catch (error) {
          cleanupError = error.message
        }
      }
      if (finishTimer) clearTimeout(finishTimer)
      if (timer) clearTimeout(timer)
      tree?.close()
      const code = cleanupError || tree?.failure ? 125 : timedOut ? 124 : exitCode
      const result = {
        code,
        signal,
        stdout,
        stderr,
        timedOut,
        ...(cleanupError || tree?.failure
          ? { cleanupUncertain: cleanupError || tree.failure.message }
          : {}),
      }
      if (check && code !== 0) {
        const error = new CommandError(cmd, args, code, stdout, stderr)
        error.timedOut = timedOut
        error.failureCategory = result.cleanupUncertain
          ? 'process-cleanup-uncertain'
          : timedOut
            ? 'timeout'
            : 'process-failure'
        reject(error)
      } else resolve(result)
    }
    if (timeoutMs !== undefined)
      timer = setTimeout(() => {
        timedOut = true
        stderr += `\nateam-runner: timed out after ${timeoutMs}ms; terminating process group`
        terminate('SIGTERM')
        // Keep this timer even if the immediate parent closes: descendants may
        // have ignored TERM or closed their output streams while still running.
        killTimer = setTimeout(() => {
          terminate('SIGKILL')
          forced = true
          finish()
        }, killGraceMs)
      }, timeoutMs)
    child.on('error', (error) => {
      if (timer) clearTimeout(timer)
      if (killTimer) clearTimeout(killTimer)
      tree?.close()
      reject(error)
    })
    child.on('close', (code, endSignal) => {
      closed = true
      exitCode = code
      signal = endSignal
      if (signal) stderr += `\nateam-runner: process terminated by ${signal}`
      finish()
    })
    child.stdin.on('error', (error) => {
      if (error.code !== 'EPIPE') stderr += `\n${error.message}`
    })
    if (input !== undefined) child.stdin.end(input)
    else child.stdin.end()
  })
}

export async function json(cmd, args, opts) {
  const { stdout } = await run(cmd, args, opts)
  return JSON.parse(stdout || 'null')
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
