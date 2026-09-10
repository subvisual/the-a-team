import { spawn } from 'node:child_process'

export class CommandError extends Error {
  constructor(cmd, args, code, stdout, stderr) {
    super(`${cmd} exited ${code}: ${(stderr || stdout || '').trim().split('\n').slice(0, 4).join(' | ')}`)
    this.name = 'CommandError'
    this.cmd = cmd
    this.args = args
    this.code = code
    this.stdout = stdout
    this.stderr = stderr
  }
}

// Run a command to completion, capturing output. `input` is written to stdin.
export function run(cmd, args, { cwd, input, env, replaceEnv = false, check = true, onStdout, timeoutMs } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      env: replaceEnv ? (env || {}) : env ? { ...process.env, ...env } : process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (d) => { stdout += d; if (onStdout) onStdout(d) })
    child.stderr.on('data', (d) => { stderr += d })
    let timer = null
    let timedOut = false
    if (timeoutMs) {
      timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM') }, timeoutMs)
    }
    child.on('error', (err) => { if (timer) clearTimeout(timer); reject(err) })
    child.on('close', (code, signal) => {
      if (timer) clearTimeout(timer)
      if (timedOut) stderr += `\nateam-runner: timed out after ${timeoutMs}ms`
      if (signal) stderr += `\nateam-runner: process terminated by ${signal}`
      const result = { code, signal, stdout, stderr }
      if (check && code !== 0) reject(new CommandError(cmd, args, code, stdout, stderr))
      else resolve(result)
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
