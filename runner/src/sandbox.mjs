import { existsSync, realpathSync, mkdirSync } from 'node:fs'
import { dirname, join, delimiter } from 'node:path'
import { run } from './sh.mjs'
import { canonicalPath, within, assertReadableSource } from './policy.mjs'
import { DENIED_PATHS } from './deny.mjs'
import { startNetworkProxy } from './network-proxy.mjs'
import { fileURLToPath } from 'node:url'

const BACKEND = '/usr/bin/sandbox-exec'
const SYSTEM_READ = [
  '/System',
  '/usr',
  '/bin',
  '/sbin',
  '/Library/Apple',
  '/Library/Developer/CommandLineTools',
  '/private/etc/ssl',
  '/private/etc/hosts',
  '/private/etc/resolv.conf',
  '/private/var/db/dyld',
  '/dev/null',
  '/dev/urandom',
  '/dev/random',
]
const HOOK_READ = ['./hooks/deny-paths.mjs', './deny.mjs'].map((p) =>
  fileURLToPath(new URL(p, import.meta.url)),
)
const quote = (path) => JSON.stringify(path)
const filter = (path, exact = false) => `(${exact ? 'literal' : 'subpath'} ${quote(path)})`

export function sandboxEnvironment(scratchDir, supplied = {}, model = false, toolchainPaths = []) {
  // Deliberate replacement, never a merge with the operator environment.
  const env = {
    PATH: [
      dirname(realpathSync(process.execPath)),
      ...toolchainPaths,
      '/usr/bin',
      '/bin',
      '/usr/sbin',
      '/sbin',
    ].join(delimiter),
    HOME: join(scratchDir, 'home'),
    TMPDIR: join(scratchDir, 'tmp'),
    XDG_CONFIG_HOME: join(scratchDir, 'config'),
    XDG_CACHE_HOME: join(scratchDir, 'cache'),
    LANG: 'en_US.UTF-8',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_NO_REPLACE_OBJECTS: '1',
    CLAUDE_CONFIG_DIR: join(scratchDir, 'claude'),
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    DISABLE_AUTOUPDATER: '1',
    CI: '1',
  }
  if (model) {
    for (const key of ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN'])
      if (typeof supplied[key] === 'string') env[key] = supplied[key]
  }
  return env
}

export function sandboxProfile({ cwd, scratchDir, policy, role, command, proxyPort, serverPort }) {
  const root = canonicalPath(cwd),
    scratch = canonicalPath(scratchDir)
  if (within(root, scratch) || within(scratch, root))
    throw new Error('sandbox scratch and source must be disjoint')
  const sourceReads = (policy.readPaths || ['.']).map((p) => {
    const actual = canonicalPath(join(root, p))
    if (!within(root, actual)) throw new Error(`read root escapes source: ${p}`)
    return actual
  })
  const readRoots = [
    ...SYSTEM_READ.filter(existsSync),
    ...HOOK_READ,
    realpathSync(process.execPath),
    canonicalPath(command),
    ...(policy.sandbox?.toolchainPaths || []).map(canonicalPath),
    ...sourceReads,
    join(root, '.git'),
    scratch,
  ]
  const lines = [
    '(version 1)',
    '(deny default)',
    '(allow process-fork process-exec)',
    '(allow signal (target same-sandbox))',
    '(allow sysctl-read)',
    '(allow file-read-metadata)',
    '(allow file-read-data (literal "/"))',
    '(allow mach-lookup (global-name "com.apple.system.logger"))',
  ]
  for (const path of readRoots) lines.push(`(allow file-read* ${filter(path)})`)
  lines.push(
    `(allow file-write* ${filter(scratch)})`,
    '(allow file-write-data (literal "/dev/null"))',
  )
  if (role === 'executor') {
    for (const p of policy.writePaths || ['.']) {
      const actual = canonicalPath(join(root, p))
      if (!within(root, actual)) throw new Error(`write root escapes source: ${p}`)
      lines.push(`(allow file-write* ${filter(actual)})`)
    }
    // This is a private Git store, never the supervisor's linked worktree store.
    lines.push(`(allow file-write* ${filter(join(root, '.git'))})`)
    const approved = policy.authorization?.protectedPaths || []
    const pinned = new Set([root])
    const approvedParents = new Set()
    for (const p of approved) {
      lines.push(`(allow file-write* ${filter(join(root, p), true)})`)
      let parent = dirname(join(root, p))
      while (parent !== root && within(root, parent)) {
        approvedParents.add(parent)
        pinned.add(parent)
        lines.push(`(allow file-write-create ${filter(parent, true)})`)
        parent = dirname(parent)
      }
    }
    for (const p of [
      ...DENIED_PATHS,
      'CLAUDE.md',
      '.git/hooks/',
      '.git/info/',
      '.git/objects/info/',
      '.git/refs/replace/',
      '.git/commondir',
      '.git/ateam-private',
      '.git',
    ]) {
      // An exact authorization grants that file only, including protected
      // single-file CI systems. It never grants a directory or its siblings.
      if (
        approved.includes(p) &&
        !p.startsWith('.git') &&
        !p.startsWith('.claude') &&
        p !== 'CLAUDE.md'
      )
        continue
      const exceptions = approved
        .filter((a) => p.endsWith('/') && a.startsWith(p))
        .map((a) => join(root, a))
      if (p.endsWith('/'))
        exceptions.push(...[...approvedParents].filter((a) => within(join(root, p), a)))
      const rule = filter(join(root, p), !p.endsWith('/'))
      const guard = exceptions.length
        ? `(require-all ${rule} ${exceptions.map((a) => `(require-not ${filter(a, true)})`).join(' ')})`
        : rule
      lines.push(`(deny file-write* ${guard})`)
      let parent = dirname(join(root, p.replace(/\/$/, '')))
      while (within(root, parent)) {
        pinned.add(parent)
        if (parent === root) break
        parent = dirname(parent)
      }
    }
    // A path filter alone does not stop moving its writable ancestor away.
    for (const path of pinned) lines.push(`(deny file-write-unlink ${filter(path, true)})`)
  }
  // Project-local credentials are not model context or test inputs.
  lines.push(
    `(deny file-read* file-write* (regex ${quote(`^${root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(.*/)?(\\.env(\\.[^/]*)?|\\.npmrc|\\.netrc|id_rsa|id_ed25519)$`)}))`,
  )
  if (serverPort !== undefined) {
    if (
      role !== 'verification-server' ||
      !Number.isInteger(serverPort) ||
      serverPort < 1024 ||
      serverPort > 65535
    )
      throw new Error(
        'loopback listener requires a supervisor verification server and one unprivileged port',
      )
    lines.push(`(allow network-inbound (local ip "localhost:${serverPort}"))`)
    lines.push(`(allow network-outbound (remote ip "localhost:${serverPort}"))`)
  }
  if (proxyPort) lines.push(`(allow network-outbound (remote ip "localhost:${proxyPort}"))`)
  return lines.join('\n')
}

export async function assertSandboxAvailable(policy = { sandbox: { backend: 'macos-seatbelt' } }) {
  if (
    policy.sandbox?.backend !== 'macos-seatbelt' ||
    process.platform !== 'darwin' ||
    !existsSync(BACKEND)
  )
    throw new Error('required macos-seatbelt isolation backend is unavailable; execution refused')
  const probe = await run(
    BACKEND,
    ['-p', '(version 1) (deny default) (allow process-exec) (allow file-read*)', '/usr/bin/true'],
    { check: false, env: { PATH: '/usr/bin:/bin' }, replaceEnv: true },
  )
  if (probe.code !== 0)
    throw new Error(
      `required isolation backend is unavailable: ${probe.stderr.trim()}; execution refused`,
    )
}

export async function runSandboxed(
  command,
  args,
  {
    cwd,
    scratchDir,
    policy,
    role = 'reviewer',
    env = {},
    model = false,
    check = false,
    timeoutMs,
    signal,
    serverPort,
    onSpawn,
  } = {},
) {
  if (!policy) throw new Error('resolved execution policy is required')
  await assertSandboxAvailable(policy)
  // No native launch may operate with the supervisor's linked .git metadata.
  if (existsSync(join(cwd, '.git')) && !existsSync(join(cwd, '.git', 'objects')))
    throw new Error('sandbox requires a private Git checkout, not linked supervisor metadata')
  await assertReadableSource(cwd, policy.readPaths)
  const toolchains = policy.sandbox.toolchainPaths || []
  if (serverPort !== undefined && (model || role !== 'verification-server'))
    throw new Error('model and ordinary review sessions cannot start verification listeners')
  const childEnv = sandboxEnvironment(scratchDir, env, model, toolchains)
  if (serverPort !== undefined) childEnv.ATEAM_VERIFICATION_PORT = String(serverPort)
  for (const key of ['HOME', 'TMPDIR', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'CLAUDE_CONFIG_DIR'])
    mkdirSync(childEnv[key], { recursive: true })
  const proxy = model
    ? await startNetworkProxy(policy.sandbox.modelAuthorities || ['api.anthropic.com:443'])
    : null
  if (proxy) {
    childEnv.HTTPS_PROXY = `http://127.0.0.1:${proxy.port}`
    childEnv.HTTP_PROXY = childEnv.HTTPS_PROXY
  }
  try {
    const profile = sandboxProfile({
      cwd,
      scratchDir,
      policy,
      role,
      command,
      proxyPort: proxy?.port,
      serverPort,
    })
    return await run(BACKEND, ['-p', profile, command, ...args], {
      cwd,
      env: childEnv,
      replaceEnv: true,
      check,
      timeoutMs,
      signal,
      onSpawn,
    })
  } finally {
    await proxy?.close()
  }
}
