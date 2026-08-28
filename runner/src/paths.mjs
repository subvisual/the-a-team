import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'

export function home() {
  return process.env.ATEAM_RUNNER_HOME || join(homedir(), '.ateam-runner')
}

export function slug(repo) {
  return String(repo).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
}

export function ensureDir(p) {
  mkdirSync(p, { recursive: true })
  return p
}

export const configPath = () => join(home(), 'config.json')
export const lockDir = (repo) => join(home(), 'locks', slug(repo))
export const lockPath = (repo, id) => join(lockDir(repo), `${slug(String(id))}.lock`)
export const clonePath = (repo) => join(home(), 'clones', slug(repo))
export const worktreeRoot = (repo) => join(home(), 'worktrees', slug(repo))
export const worktreePath = (repo, id) => join(worktreeRoot(repo), slug(String(id)))
export const runDir = (repo, id, stamp) => join(home(), 'runs', slug(repo), slug(String(id)), stamp)

export function stamp(d = new Date()) {
  return d.toISOString().replace(/[:.]/g, '-')
}
