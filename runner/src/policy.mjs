import { existsSync, readFileSync, realpathSync, lstatSync } from 'node:fs'
import { resolve, dirname, relative, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { git, revParse } from './git.mjs'
import { resolveLimits, LIMIT_DEFAULTS } from './core/budget.mjs'
import { DENIED_PATHS } from './deny.mjs'

const HARNESS_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const KEYS = {
  'harness root': 'harnessRoot',
  'harness revision': 'harnessRevision',
  'target remote': 'targetRemote',
  'base branch': 'baseBranch',
  'test command': 'testCommand',
  'verification commands': 'verificationCommands',
  'design system path': 'designSystemPath',
  'current context': 'currentContext',
  'context budget tokens': 'contextBudgetTokens',
  'product context': 'productContext',
  'package manager': 'packageManager',
  'github issues': 'githubIssues',
  'output paths': 'outputPaths',
  'read paths': 'readPaths',
  'write paths': 'writePaths',
  'supervisor actions': 'supervisorActions',
  'run budget usd': 'runBudgetUsd',
  'executor budget usd': 'executorBudgetUsd',
  'reviewer budget usd': 'reviewerBudgetUsd',
  'run timeout ms': 'runTimeoutMs',
  'session timeout ms': 'sessionTimeoutMs',
  'max cycles': 'maxCycles',
}
const ALLOWED = new Set(Object.values(KEYS))
const ALWAYS_PROTECTED = [
  '.git/',
  'CLAUDE.md',
  '.claude/settings.json',
  '.claude/settings.local.json',
  '.claude/hooks/',
]
export const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export const credentialPath = (path) =>
  /(^|\/)(\.env(\.[^/]*)?|\.npmrc|\.netrc|id_rsa|id_ed25519)$/.test(path)

export async function assertReadableSource(root, readPaths = ['.']) {
  // A Git object store contains every tracked path and reachable history. A
  // narrower working-tree filter cannot make those blobs confidential.
  if (!readPaths.includes('.'))
    throw new Error(
      'macos-seatbelt Git execution requires read paths ["."] for complete source and history; narrower confidential read scopes are unsupported',
    )
  if (!existsSync(join(root, '.git'))) return
  const { stdout } = await git(root, [
    'log',
    '--all',
    '--full-history',
    '--root',
    '-m',
    '--no-renames',
    '--format=',
    '--name-only',
    '-z',
  ])
  const sensitive = stdout
    .split('\0')
    .map((p) => p.replace(/^\n+/, ''))
    .find(credentialPath)
  if (sensitive)
    throw new Error(
      `credential-named path in Git history is outside the supported source boundary: ${sensitive}; prepare a sanitized source repository before execution`,
    )
}

export function readInvocationAuthorization(path) {
  if (!path) return {}
  const value = JSON.parse(readFileSync(resolve(path), 'utf8'))
  if (!value || Array.isArray(value) || typeof value !== 'object')
    throw new Error('invocation authorization must be a JSON object')
  for (const key of Object.keys(value))
    if (!['id', 'protectedPaths', 'documentationExemption', 'recoveryWindow'].includes(key))
      throw new Error(`unsupported invocation authorization key: ${key}`)
  return value
}

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}

export function canonicalPath(path) {
  const absolute = resolve(path)
  if (existsSync(absolute)) return realpathSync(absolute)
  // A broken symlink is not an absent directory that may be created safely.
  try {
    if (lstatSync(absolute).isSymbolicLink()) throw new Error(`broken symlink: ${absolute}`)
  } catch (e) {
    if (e.code !== 'ENOENT') throw e
  }
  const parent = dirname(absolute)
  if (parent === absolute) throw new Error(`cannot resolve path: ${absolute}`)
  return join(canonicalPath(parent), relative(parent, absolute))
}

export function within(root, path) {
  const rel = relative(root, path)
  return !isAbsolute(rel) && rel !== '..' && !rel.startsWith('../')
}

export function remoteIdentity(raw) {
  if (!raw) return null
  let host, path
  const scp = raw.match(/^(?:[^/@]+@)?([^/:]+):([^/].*)$/)
  if (scp && !raw.includes('://')) [, host, path] = scp
  else {
    let url
    try {
      url = new URL(raw)
    } catch {
      throw new Error('target remote must have an explicit network Git identity')
    }
    if (url.password || (url.username && !['ssh:', 'git:'].includes(url.protocol)))
      throw new Error('target remote embeds credentials; remove them before execution')
    host = url.hostname
    path = url.pathname
  }
  return `${host.toLowerCase()}/${path
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.git$/i, '')
    .toLowerCase()}`
}

export function readProjectConfig(repoPath) {
  const p = join(repoPath, 'CLAUDE.md')
  if (!existsSync(p)) return {}
  if (!within(canonicalPath(repoPath), canonicalPath(p)))
    throw new Error('A-Team Config path escapes target')
  const source = readFileSync(p, 'utf8')
  const blocks = source.split(/^##\s+A-Team Config\s*$/m)
  if (blocks.length === 1) return {}
  if (blocks.length !== 2) throw new Error('duplicate A-Team Config blocks')
  const block = blocks[1].split(/^##\s+/m)[0]
  const fenced = block.match(/```json\s*\n([\s\S]*?)\n```/)
  const out = fenced ? JSON.parse(fenced[1]) : {}
  if (!out || Array.isArray(out) || typeof out !== 'object')
    throw new Error('A-Team Config must be an object')
  for (const line of block.replace(/```[\s\S]*?```/g, '').split('\n')) {
    const match = line.match(/^\s*-\s+([^:]+):\s*(.*?)\s*$/)
    if (!match) continue
    const key = KEYS[match[1].toLowerCase()]
    if (!key) throw new Error(`unsupported A-Team Config key: ${match[1]}`)
    if (Object.hasOwn(out, key)) throw new Error(`duplicate A-Team Config key: ${key}`)
    const value = match[2].replace(/^`(.*)`$/, '$1')
    out[key] =
      Object.hasOwn(LIMIT_DEFAULTS, key) || key === 'contextBudgetTokens'
        ? Number(value)
        : value.startsWith('[')
          ? JSON.parse(value)
          : value
  }
  for (const key of Object.keys(out))
    if (!ALLOWED.has(key)) throw new Error(`unsupported A-Team Config key: ${key}`)
  return out
}

function list(value, fallback) {
  const values = value === undefined ? fallback : Array.isArray(value) ? value : [value]
  if (!Array.isArray(values) || values.some((x) => typeof x !== 'string' || !x.trim()))
    throw new Error('policy list must contain nonempty strings')
  return values
}
function relativePaths(root, paths) {
  return paths.map((p) => {
    const actual = canonicalPath(resolve(root, p))
    if (!within(root, actual)) throw new Error(`path escapes target: ${p}`)
    return relative(root, actual) || '.'
  })
}
const matches = (path, rule) =>
  rule === '.' || path === rule.replace(/\/$/, '') || (rule.endsWith('/') && path.startsWith(rule))
export function protectedPath(path) {
  return [...DENIED_PATHS, ...ALWAYS_PROTECTED].some((p) => matches(path, p))
}
export function pathAuthorized(policy, path) {
  if (credentialPath(path)) return false
  if (ALWAYS_PROTECTED.some((p) => matches(path, p))) return false
  if (protectedPath(path)) return policy.authorization.protectedPaths.includes(path)
  return policy.writePaths.some((p) => p === '.' || path === p || path.startsWith(`${p}/`))
}

export async function resolvePolicy({
  repoPath,
  repo,
  base,
  cfg = {},
  authorization = {},
  continuationBase,
  baseRef,
}) {
  const root = canonicalPath(repoPath)
  const top = canonicalPath((await git(root, ['rev-parse', '--show-toplevel'])).stdout.trim())
  if (root !== top) throw new Error('target must be the repository root')
  const project = readProjectConfig(root)
  const harness = canonicalPath(cfg.harnessRoot || HARNESS_ROOT)
  const revision = await revParse(harness, 'HEAD')
  if (project.harnessRoot && canonicalPath(resolve(root, project.harnessRoot)) !== harness)
    throw new Error('configured harness root differs from the invoked harness')
  const pin = project.harnessRevision || cfg.harnessRevision
  if (pin && pin !== revision)
    throw new Error(
      `harness revision mismatch: expected ${pin}, running ${revision}; upgrade deliberately`,
    )
  const remote = (await git(root, ['remote', 'get-url', 'origin'], { check: false })).stdout.trim()
  const identity = remoteIdentity(remote)
  const expected = project.targetRemote
    ? remoteIdentity(project.targetRemote)
    : repo && (repo.includes('://') ? remoteIdentity(repo) : `github.com/${repo.toLowerCase()}`)
  if (expected && identity !== expected)
    throw new Error(
      `target identity mismatch: expected ${expected}, found ${identity || 'no remote'}`,
    )
  if (
    within(harness, root) ||
    within(root, harness) ||
    identity?.endsWith('/subvisual/the-a-team') ||
    (existsSync(join(root, 'CONTRACT.md')) && existsSync(join(root, 'intake')))
  )
    throw new Error(
      'ordinary project execution cannot target or overlap a harness repository or renamed harness',
    )
  const selectedBase = continuationBase || base || project.baseBranch || cfg.base || 'main'
  if (
    typeof selectedBase !== 'string' ||
    !selectedBase ||
    selectedBase.startsWith('-') ||
    /[\s\x00-\x1f]/.test(selectedBase)
  )
    throw new Error('base branch must be an explicit Git ref')
  const baseSha = await revParse(root, `${baseRef || selectedBase}^{commit}`)
  const merged = { ...cfg, ...project }
  const verification =
    project.verificationCommands !== undefined || project.testCommand !== undefined
      ? project
      : merged
  const commands = list(
    verification.verificationCommands,
    verification.testCommand && !/^(none|n\/a)$/i.test(verification.testCommand)
      ? [verification.testCommand]
      : [],
  )
  const readPaths = relativePaths(root, list(merged.readPaths, ['.']))
  const writePaths = relativePaths(root, list(merged.writePaths, ['.']))
  const outputPaths = relativePaths(root, list(merged.outputPaths, ['docs']))
  await assertReadableSource(root, readPaths)
  const bindings = {
    currentContext: merged.currentContext || 'docs/product/context.md',
    productContext: merged.productContext || 'docs/product/',
    designSystemPath: merged.designSystemPath || null,
    packageManager: merged.packageManager || null,
    contextBudgetTokens: merged.contextBudgetTokens ?? null,
  }
  if (
    bindings.contextBudgetTokens !== null &&
    (!Number.isFinite(bindings.contextBudgetTokens) || bindings.contextBudgetTokens <= 0)
  )
    throw new Error('context budget tokens must be positive and finite')
  relativePaths(
    root,
    Object.values(bindings).filter((x, i) => i < 3 && x),
  )
  const approved = list(authorization.protectedPaths, [])
  if (
    authorization.id !== undefined &&
    (typeof authorization.id !== 'string' || !authorization.id.trim())
  )
    throw new Error('invocation authorization ID must be a nonempty string')
  if (approved.length && (typeof authorization.id !== 'string' || !authorization.id.trim()))
    throw new Error('protected paths require an explicit invocation authorization ID')
  for (const p of approved) {
    if (
      !protectedPath(p) ||
      p.endsWith('/') ||
      p === '.' ||
      p.includes('*') ||
      isAbsolute(p) ||
      p.split('/').includes('..') ||
      ALWAYS_PROTECTED.some((r) => matches(p, r))
    )
      throw new Error(`protected exception must name one eligible file: ${p}`)
  }
  if (
    authorization.recoveryWindow !== undefined &&
    (!authorization.id ||
      typeof authorization.recoveryWindow !== 'string' ||
      !authorization.recoveryWindow.trim())
  )
    throw new Error(
      'fresh recovery window needs an invocation authorization ID and nonempty window ID',
    )
  const actions = list(cfg.invocationActions, [])
  const configuredActions = list(merged.supervisorActions, actions)
  for (const action of actions)
    if (!configuredActions.includes(action))
      throw new Error(`invoked supervisor action is disabled by target policy: ${action}`)
  const policy = {
    schemaVersion: 1,
    harness: { root: harness, revision },
    target: {
      root,
      remote: identity,
      base: selectedBase,
      ...(baseRef ? { baseRef } : {}),
      baseSha,
    },
    bindings,
    readPaths,
    writePaths,
    outputPaths,
    githubIssues: project.githubIssues === true || project.githubIssues === 'on',
    supervisor: { actions },
    verification: { commands, exemption: authorization.documentationExemption || null },
    authorization: {
      id: authorization.id || null,
      protectedPaths: approved,
      ...(authorization.recoveryWindow !== undefined
        ? { recoveryWindow: authorization.recoveryWindow }
        : {}),
    },
    limits: resolveLimits(merged),
    sandbox: cfg.sandbox || { backend: 'macos-seatbelt' },
  }
  if (
    policy.verification.exemption &&
    (!authorization.id ||
      typeof policy.verification.exemption.reason !== 'string' ||
      !policy.verification.exemption.reason.trim())
  )
    throw new Error('documentation exemption needs an authorization ID and reason')
  for (const p of list(cfg.requestedPaths, [])) {
    const [actual] = relativePaths(root, [p])
    if (!pathAuthorized(policy, p) || !pathAuthorized(policy, actual))
      throw new Error(
        `requested path is protected or outside write scope: ${p}; supply a scoped invocation authorization`,
      )
  }
  return freeze({ ...policy, digest: digest(policy) })
}

export async function validateChanges(policy, worktree, base, head) {
  const root = canonicalPath(worktree)
  const changed = (
    await git(root, ['diff', '--no-ext-diff', '--no-textconv', '--name-only', '-z', base, head])
  ).stdout
    .split('\0')
    .filter(Boolean)
  const untracked = (await git(root, ['ls-files', '--others', '--exclude-standard', '-z'])).stdout
    .split('\0')
    .filter(Boolean)
  for (const p of new Set([...changed, ...untracked])) {
    const actual = canonicalPath(join(root, p))
    if (!within(root, actual)) throw new Error(`changed path escapes worktree: ${p}`)
    if (!pathAuthorized(policy, p) || !pathAuthorized(policy, relative(root, actual)))
      throw new Error(`changed path is protected or outside write scope: ${p}`)
  }
  for (const p of policy.outputPaths)
    if (!within(root, canonicalPath(join(root, p))))
      throw new Error(`output path escapes worktree: ${p}`)
  return changed
}
