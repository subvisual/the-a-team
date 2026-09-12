import {
  existsSync,
  lstatSync,
  rmSync,
  writeFileSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  realpathSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { run } from './sh.mjs'

const SAFE_GIT_CONFIG = [
  '-c',
  'core.hooksPath=/dev/null',
  '-c',
  'core.fsmonitor=false',
  '-c',
  'protocol.ext.allow=never',
  '-c',
  'core.attributesFile=/dev/null',
]
const privateEnvironment = () => ({
  PATH: process.env.PATH,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_TERMINAL_PROMPT: '0',
  GIT_NO_REPLACE_OBJECTS: '1',
})
const git = (cwd, args, opts = {}) => {
  const privateStore = existsSync(join(cwd, '.git', 'ateam-private'))
  return run('git', [...SAFE_GIT_CONFIG, ...args], {
    cwd,
    ...opts,
    ...(privateStore
      ? { env: privateEnvironment(), replaceEnv: true }
      : { env: { ...opts.env, GIT_NO_REPLACE_OBJECTS: '1' } }),
  })
}

export async function ensureClone(repo, dest) {
  if (existsSync(join(dest, '.git'))) {
    await git(dest, ['fetch', '--prune', 'origin'])
    return dest
  }
  await run('gh', ['repo', 'clone', repo, dest])
  return dest
}

export async function defaultBranchLocal(cwd) {
  const { stdout } = await git(cwd, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'], {
    check: false,
  })
  const ref = stdout.trim()
  return ref ? ref.replace('refs/remotes/origin/', '') : 'main'
}

export async function revParse(cwd, ref) {
  const { stdout } = await git(cwd, ['rev-parse', ref])
  return stdout.trim()
}

export async function branchExists(cwd, branch) {
  const { code } = await git(cwd, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], {
    check: false,
  })
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

export async function assertDescendsFrom(cwd, base, head) {
  const { code } = await git(cwd, ['merge-base', '--is-ancestor', base, head], { check: false })
  if (code !== 0) throw new Error('revision does not descend from the declared base')
}

export async function hasCommitsSince(cwd, base, branch) {
  const { stdout } = await git(cwd, ['rev-list', '--count', `${base}..${branch}`])
  return Number(stdout.trim()) > 0
}

export async function push(cwd, branch) {
  await git(cwd, ['push', '--set-upstream', 'origin', branch])
}

export async function diff(cwd, base, head) {
  const { stdout } = await git(cwd, ['diff', '--no-ext-diff', '--no-textconv', `${base}...${head}`])
  return stdout
}

export async function diffStat(cwd, base, head) {
  const { stdout } = await git(cwd, [
    'diff',
    '--no-ext-diff',
    '--no-textconv',
    '--stat',
    `${base}...${head}`,
  ])
  return stdout
}

export async function isClean(cwd) {
  const { stdout } = await git(cwd, ['status', '--porcelain'])
  return stdout.trim().length === 0
}

export { git }

// Agent processes receive independent object stores and a generated local config.
// No credentials, remotes, hooks, alternates or linked supervisor metadata cross
// into this checkout. --no-local prevents Git from sharing source object files.
const privateGit = (cwd, args) =>
  run('git', [...SAFE_GIT_CONFIG, ...args], { cwd, env: privateEnvironment(), replaceEnv: true })

export async function createPrivateCheckout(source, dest, head, branch = null) {
  await privateGit(source, [
    'clone',
    '--no-local',
    '--no-hardlinks',
    '--no-checkout',
    '--',
    source,
    dest,
  ])
  await validatePrivateCheckout(dest)
  await privateGit(dest, ['checkout', '--detach', head])
  if (branch) await privateGit(dest, ['checkout', '-b', branch])
  return dest
}

export function sanitizePrivateCheckout(cwd) {
  const store = join(cwd, '.git')
  if (
    !existsSync(join(store, 'objects')) ||
    !lstatSync(store).isDirectory() ||
    lstatSync(store).isSymbolicLink()
  )
    throw new Error('private checkout has unsafe Git metadata')
  // An ordinary commondir file redirects Git just as effectively as a symlink.
  // Refuse it before any Git subprocess or metadata rewrite follows that store.
  if (existsSync(join(store, 'commondir')) || isSymlink(join(store, 'commondir')))
    throw new Error('private Git metadata contains a commondir redirect')
  const inspect = (path) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name)
      if (entry.isSymbolicLink()) throw new Error('private Git metadata contains a symlink')
      if (entry.isDirectory()) inspect(child)
    }
  }
  inspect(store)
  for (const rel of ['config', 'hooks', 'objects/info', 'info/attributes', 'refs/replace']) {
    rmSync(join(store, rel), { recursive: true, force: true })
  }
  const packedRefs = join(store, 'packed-refs')
  if (existsSync(packedRefs)) {
    let dropping = false
    const lines = readFileSync(packedRefs, 'utf8')
      .split('\n')
      .filter((line) => {
        if (line.startsWith('^')) return !dropping
        dropping = /^[0-9a-f]+ refs\/replace\//.test(line)
        return !dropping
      })
    writeFileSync(packedRefs, lines.join('\n'))
  }
  writeFileSync(join(store, 'ateam-private'), 'supervisor-created private checkout\n')
  writeFileSync(
    join(store, 'config'),
    '[core]\n\trepositoryformatversion = 0\n\tfilemode = true\n\tbare = false\n\tlogallrefupdates = true\n\thooksPath = /dev/null\n\tfsmonitor = false\n[user]\n\tname = A-Team Runner\n\temail = ateam-runner@localhost\n',
  )
}

export async function validatePrivateCheckout(cwd) {
  sanitizePrivateCheckout(cwd)
  const { stdout } = await privateGit(cwd, [
    'rev-parse',
    '--path-format=absolute',
    '--git-dir',
    '--git-common-dir',
    '--git-path',
    'objects',
  ])
  const store = realpathSync(join(cwd, '.git'))
  const actual = stdout
    .trim()
    .split('\n')
    .map((path) => realpathSync(resolve(cwd, path)))
  const expected = [store, store, join(store, 'objects')]
  if (actual.length !== expected.length || actual.some((path, i) => path !== expected[i]))
    throw new Error('private Git metadata resolves outside its independent store')
}

export async function importPrivateHead(repoPath, source, head, branch) {
  await git(repoPath, ['check-ref-format', `refs/heads/${branch}`])
  await git(repoPath, [
    'fetch',
    '--no-tags',
    '--no-write-fetch-head',
    '--',
    source,
    `${head}:refs/heads/${branch}`,
  ])
  if ((await revParse(repoPath, branch)) !== head)
    throw new Error('imported branch differs from validated executor head')
}

export async function assertExactCheckout(cwd, head) {
  if ((await revParse(cwd, 'HEAD')) !== head)
    throw new Error('review source HEAD changed from the immutable revision')
  const status = await git(cwd, [
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
    '--ignored=matching',
  ])
  if (status.stdout.trim()) throw new Error('review source or index mutated during evaluation')
  // Check tracked bytes even when an injected evaluator toggles assume-unchanged
  // or skip-worktree flags. Git status alone would conceal those edits.
  const entries = (await git(cwd, ['ls-tree', '-r', '-z', head])).stdout.split('\0').filter(Boolean)
  for (const entry of entries) {
    const match = entry.match(/^(\d+) (\w+) ([0-9a-f]+)\t([\s\S]+)$/)
    if (!match || match[2] !== 'blob')
      throw new Error('review source contains unsupported non-file entry')
    const path = join(cwd, match[4]),
      expected = match[3]
    if (!existsSync(path) && !isSymlink(path))
      throw new Error(`review source file is missing: ${match[4]}`)
    const metadata = lstatSync(path)
    if (match[1] === '120000' ? !metadata.isSymbolicLink() : !metadata.isFile()) {
      throw new Error(`review source file type changed: ${match[4]}`)
    }
    if (match[1] !== '120000' && Boolean(metadata.mode & 0o111) !== (match[1] === '100755')) {
      throw new Error(`review source executable mode changed: ${match[4]}`)
    }
    const bytes = match[1] === '120000' ? Buffer.from(readlinkSync(path)) : readFileSync(path)
    const format = expected.length === 64 ? 'sha256' : 'sha1'
    const actual = createHash(format).update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
    if (actual !== expected) throw new Error(`review source changed: ${match[4]}`)
  }
  const indexTree = (await git(cwd, ['write-tree'])).stdout.trim()
  if (indexTree !== (await revParse(cwd, `${head}^{tree}`)))
    throw new Error('review source index changed')
}
const isSymlink = (path) => {
  try {
    return lstatSync(path).isSymbolicLink()
  } catch {
    return false
  }
}
