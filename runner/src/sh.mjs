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
    onSpawn,
    timeoutMs,
    signal: cancellation,
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
    if (cancellation?.aborted) throw new Error('supervisor command was cancelled before launch')
    if (cancellation && timeoutMs === undefined)
      throw new Error('cancellable commands require a bounded timeout')
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
    let aborted = false,
      timedOut = false,
      forced = false,
      closed = false,
      exitCode,
      signal,
      cleanupError = null,
      startupError = null
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
      if (!closed || ((timedOut || aborted) && !forced)) return
      if (!timedOut && !aborted && tree) {
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
      cancellation?.removeEventListener('abort', cancel)
      tree?.close()
      const code = cleanupError || tree?.failure ? 125 : timedOut ? 124 : aborted ? 130 : exitCode
      const result = {
        code,
        signal,
        stdout,
        stderr,
        timedOut,
        ...(aborted ? { aborted: true } : {}),
        ...(cleanupError || tree?.failure
          ? { cleanupUncertain: cleanupError || tree.failure.message }
          : {}),
      }
      if (startupError) {
        reject(
          Object.assign(startupError, {
            processResult: result,
            failureCategory: 'infrastructure-interruption',
          }),
        )
      } else if (check && code !== 0) {
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
    const stop = () => {
      terminate('SIGTERM')
      killTimer = setTimeout(() => {
        terminate('SIGKILL')
        forced = true
        finish()
      }, killGraceMs)
    }
    const cancel = () => {
      if (aborted || timedOut) return
      aborted = true
      if (timer) clearTimeout(timer)
      stderr += '\nateam-runner: supervisor cancelled command; terminating observed process group'
      stop()
    }
    cancellation?.addEventListener('abort', cancel, { once: true })
    if (cancellation?.aborted) cancel()
    if (timeoutMs !== undefined && !aborted)
      timer = setTimeout(() => {
        timedOut = true
        stderr += `\nateam-runner: timed out after ${timeoutMs}ms; terminating process group`
        stop()
      }, timeoutMs)
    child.on('error', (error) => {
      cancellation?.removeEventListener('abort', cancel)
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
    if (child.pid && onSpawn) {
      try {
        onSpawn(child.pid)
      } catch (error) {
        startupError = error instanceof Error ? error : Error(String(error))
        cancel()
      }
    }
  })
}

export async function json(cmd, args, opts) {
  const { stdout } = await run(cmd, args, opts)
  return JSON.parse(stdout || 'null')
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
