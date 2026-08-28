import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { run } from './sh.mjs'

const git = (cwd, args, opts = {}) => run('git', args, { cwd, ...opts })

export async function ensureClone(repo, dest) {
  if (existsSync(join(dest, '.git'))) {
    await git(dest, ['fetch', '--prune', 'origin'])
    return dest
  }
  await run('gh', ['repo', 'clone', repo, dest])
  return dest
}

export async function defaultBranchLocal(cwd) {
  const { stdout } = await git(cwd, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'], { check: false })
  const ref = stdout.trim()
  return ref ? ref.replace('refs/remotes/origin/', '') : 'main'
}

export async function revParse(cwd, ref) {
  const { stdout } = await git(cwd, ['rev-parse', ref])
  return stdout.trim()
}

export async function branchExists(cwd, branch) {
  const { code } = await git(cwd, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], { check: false })
  return code === 0
}

export async function remoteBranchExists(cwd, branch) {
  const { stdout } = await git(cwd, ['ls-remote', '--heads', 'origin', branch])
  return stdout.trim().length > 0
}

export async function addWorktree(cwd, path, branch, base) {
  if (await branchExists(cwd, branch)) {
    await git(cwd, ['worktree', 'add', '--force', path, branch])
  } else {
    await git(cwd, ['worktree', 'add', '--force', '-b', branch, path, base])
  }
  return path
}

export async function removeWorktree(cwd, path) {
  await git(cwd, ['worktree', 'remove', '--force', path], { check: false })
  await git(cwd, ['worktree', 'prune'], { check: false })
}

export async function hasCommitsSince(cwd, base, branch) {
  const { stdout } = await git(cwd, ['rev-list', '--count', `${base}..${branch}`])
  return Number(stdout.trim()) > 0
}

export async function push(cwd, branch) {
  await git(cwd, ['push', '--set-upstream', 'origin', branch])
}

export async function diff(cwd, base, head) {
  const { stdout } = await git(cwd, ['diff', `${base}...${head}`])
  return stdout
}

export async function diffStat(cwd, base, head) {
  const { stdout } = await git(cwd, ['diff', '--stat', `${base}...${head}`])
  return stdout
}

export async function isClean(cwd) {
  const { stdout } = await git(cwd, ['status', '--porcelain'])
  return stdout.trim().length === 0
}

export { git }
