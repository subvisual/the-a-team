import { openSync, writeSync, closeSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { ensureDir, lockPath } from '../paths.mjs'
import { log } from '../log.mjs'

/**
 * v1 claim: an O_EXCL lockfile. Single writer per repo is assumed
 * (RUNNER.md, "Claim"). The seam exists so the atomic-ref version can replace
 * the body without touching callers.
 *
 * Returns a token with a release(), or null when the issue is already claimed.
 */
export function claim(repo, id, meta = {}) {
  const path = lockPath(repo, id)
  ensureDir(dirname(path))
  let fd
  try {
    fd = openSync(path, 'wx')
  } catch (err) {
    if (err.code === 'EEXIST') {
      log.warn('claim.held', { repo, issue: id, lock: path, holder: readHolder(path) })
      return null
    }
    throw err
  }
  writeSync(fd, `${JSON.stringify({ pid: process.pid, at: new Date().toISOString(), repo, id, ...meta }, null, 2)}\n`)
  closeSync(fd)
  log.info('claim.acquired', { repo, issue: id })

  let released = false
  return {
    path,
    release() {
      if (released) return
      released = true
      rmSync(path, { force: true })
      log.info('claim.released', { repo, issue: id })
    },
  }
}

export function readHolder(path) {
  try { return JSON.parse(readFileSync(path, 'utf8'))?.pid } catch { return null }
}

export function isClaimed(repo, id) {
  return existsSync(lockPath(repo, id))
}
