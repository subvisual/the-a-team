import {
  openSync,
  writeFileSync,
  closeSync,
  rmSync,
  readFileSync,
  existsSync,
  renameSync,
  fsyncSync,
} from 'node:fs'
import { dirname } from 'node:path'
import { hostname } from 'node:os'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { ensureDir, lockPath } from '../paths.mjs'
import { log } from '../log.mjs'

function processIdentity(pid) {
  try {
    const start = execFileSync('ps', ['-p', String(pid), '-o', 'lstart='], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return start ? `ps:${start}` : null
  } catch {
    return null
  }
}
function holderAt(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}
export function inspectClaim(repo, id, { ignoreRecovery = false } = {}) {
  const path = lockPath(repo, id)
  if (!ignoreRecovery && existsSync(`${path}.recovery`))
    return {
      status: 'recovery-uncertain',
      holder: holderAt(path),
      path,
      recoveryPath: `${path}.recovery`,
    }
  if (!existsSync(path)) return { status: 'unclaimed', holder: null, path }
  const holder = holderAt(path)
  if (
    !holder ||
    holder.schemaVersion !== 1 ||
    holder.repo !== repo ||
    String(holder.id) !== String(id) ||
    !holder.token ||
    !holder.processIdentity ||
    !Number.isInteger(holder.pid) ||
    holder.pid < 1
  )
    return { status: 'unknown-owner', holder, path }
  if (holder.host !== hostname()) return { status: 'foreign-host', holder, path }
  try {
    process.kill(holder.pid, 0)
  } catch (error) {
    return { status: error.code === 'ESRCH' ? 'stale' : 'liveness-unknown', holder, path }
  }
  const identity = processIdentity(holder.pid)
  return {
    status:
      identity && holder.processIdentity.startsWith('ps:')
        ? identity === holder.processIdentity
          ? 'live'
          : 'stale'
        : 'live',
    holder,
    path,
  }
}

// The token is authoritative for release; age alone never establishes death.
// Preserve recovered lock metadata beside the lock, including its old run path.
export function claim(repo, id, meta = {}) {
  const path = lockPath(repo, id)
  ensureDir(dirname(path))
  if (existsSync(`${path}.recovery`)) {
    log.warn('claim.recovery_uncertain', { repo, issue: id, path: `${path}.recovery` })
    return null
  }
  let recoveredHolder = null
  let fd
  try {
    fd = openSync(path, 'wx')
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    const state = inspectClaim(repo, id)
    if (state.status !== 'stale') {
      log.warn('claim.held', { repo, issue: id, status: state.status, holder: state.holder?.pid })
      return null
    }
    let recovery
    try {
      recovery = openSync(`${path}.recovery`, 'wx')
    } catch (error) {
      if (error.code === 'EEXIST') return null
      throw error
    }
    try {
      const current = inspectClaim(repo, id, { ignoreRecovery: true })
      if (current.status !== 'stale' || current.holder.token !== state.holder.token) return null
      renameSync(path, `${path}.recovered-${randomUUID()}.json`)
      recoveredHolder = current.holder
      try {
        fd = openSync(path, 'wx')
      } catch (error) {
        if (error.code === 'EEXIST') return null
        throw error
      }
    } finally {
      closeSync(recovery)
      rmSync(`${path}.recovery`, { force: true })
    }
  }
  const token = randomUUID()
  const holder = {
    ...meta,
    schemaVersion: 1,
    pid: process.pid,
    host: hostname(),
    processIdentity:
      processIdentity(process.pid) ||
      `runtime:${process.pid}:${Math.floor(Date.now() - process.uptime() * 1000)}`,
    token,
    at: new Date().toISOString(),
    repo,
    id: String(id),
  }
  try {
    writeFileSync(fd, `${JSON.stringify(holder, null, 2)}\n`)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  log.info('claim.acquired', { repo, issue: id, recovered: !!recoveredHolder })
  let released = false
  return {
    path,
    token,
    recoveredHolder,
    release() {
      if (released) return
      released = true
      if (holderAt(path)?.token !== token) return
      rmSync(path, { force: true })
      log.info('claim.released', { repo, issue: id })
    },
  }
}
export function readHolder(path) {
  return holderAt(path)?.pid ?? null
}
export function isClaimed(repo, id) {
  return existsSync(lockPath(repo, id)) || existsSync(`${lockPath(repo, id)}.recovery`)
}
