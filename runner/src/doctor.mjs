import { accessSync, constants, existsSync, realpathSync, statSync, readFileSync } from 'node:fs'
import { dirname, delimiter, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { git, withReadOnlyGit } from './git.mjs'
import { canonicalPath, readProjectConfig, resolvePolicy, within } from './policy.mjs'
import { assertSandboxAvailable } from './sandbox.mjs'
import { home, configPath } from './paths.mjs'

const HARNESS = fileURLToPath(new URL('../../', import.meta.url))
export function readDoctorConfig() {
  try {
    const raw = existsSync(configPath()) ? JSON.parse(readFileSync(configPath(), 'utf8')) : {}
    if (
      !raw ||
      typeof raw !== 'object' ||
      Array.isArray(raw) ||
      (raw.repos !== undefined && !Array.isArray(raw.repos)) ||
      (raw.sandbox !== undefined &&
        (!raw.sandbox || typeof raw.sandbox !== 'object' || Array.isArray(raw.sandbox)))
    )
      throw Error('invalid operator configuration envelope')
    return { cfg: raw, configError: false }
  } catch {
    return { cfg: {}, configError: true }
  }
}
const readable = (path) => {
  try {
    accessSync(path, constants.R_OK)
    return true
  } catch {
    return false
  }
}
const writableAncestor = (path) => {
  let current = resolve(path)
  while (!existsSync(current) && dirname(current) !== current) current = dirname(current)
  try {
    accessSync(current, constants.W_OK | constants.X_OK)
    return true
  } catch {
    return false
  }
}
function findBinary(name) {
  for (const directory of (process.env.PATH || '').split(delimiter).filter(Boolean)) {
    const path = resolve(directory, name)
    try {
      accessSync(path, constants.X_OK)
      if (statSync(path).isFile()) return realpathSync(path)
    } catch {}
  }
  return null
}
function versionProbe(name, path) {
  // These fixed version probes never run a target command or a provider CLI.
  return execFileSync(path, ['--version'], {
    encoding: 'utf8',
    timeout: 5000,
    env: { PATH: '/usr/bin:/bin', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}
function policyCondition(error) {
  const message = String(error?.message || '')
  for (const [pattern, condition, repair] of [
    [
      /partial\/promisor/,
      'Source history is incomplete or configured for lazy object retrieval.',
      'Prepare a complete local repository explicitly; doctor never fetches missing objects.',
    ],
    [
      /credential|embeds credentials/,
      'Source history or remote contains a credential boundary violation.',
      'Remove credentials from the remote URL; prepare sanitized source history before execution.',
    ],
    [
      /identity mismatch/,
      'Configured target identity differs from the actual origin.',
      'Compare targetRemote with the intended origin locally and correct the binding deliberately.',
    ],
    [
      /harness revision mismatch/,
      'The pinned harness revision differs from the invoked revision.',
      'Review the proposed harness upgrade and rerun target checks before updating the pin.',
    ],
    [
      /harness root differs/,
      'The configured harness location differs from the invoked harness.',
      'Invoke the pinned harness checkout or deliberately correct the binding.',
    ],
    [
      /overlap|harness repository|renamed harness/,
      'The target overlaps or identifies as the harness.',
      'Use a separate synthetic or authorized project repository.',
    ],
    [
      /escapes|confidential read scopes/,
      'A configured path exceeds the supported source boundary.',
      'Keep target paths within the project and use the documented native source boundary.',
    ],
    [
      /base|revision|unknown revision|ambiguous argument/,
      'The configured base cannot be resolved to a local commit.',
      'Prepare the intended local base explicitly; doctor does not fetch.',
    ],
  ])
    if (pattern.test(message)) return { condition, repair }
  return {
    condition: 'Target policy cannot be resolved.',
    repair:
      'Check the supported A-Team Config keys, local base, path bindings and budget values against runner/EXECUTION.md.',
  }
}

// No installation, configuration writes, model starts, network calls, checkout
// creation or remote authentication. Findings contain allowlisted descriptions;
// arbitrary configuration, remote URLs and subprocess errors are never echoed.
export async function doctor(
  { root, cfg = {}, configError = false, requiredReferences } = {},
  deps = {},
) {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
    cfg = {}
    configError = true
  }
  const checks = [],
    binaries = {}
  const add = (id, status, condition, repair = 'No repair needed.') =>
    checks.push({ id, status, condition, repair })
  const target = canonicalPath(root || process.cwd()),
    harness = canonicalPath(HARNESS)
  let harnessConfigValid = true
  if (cfg.harnessRoot !== undefined) {
    try {
      harnessConfigValid =
        typeof cfg.harnessRoot === 'string' &&
        !cfg.harnessRoot.includes('://') &&
        canonicalPath(cfg.harnessRoot) === harness
    } catch {
      harnessConfigValid = false
    }
    if (!harnessConfigValid)
      add(
        'harness-config',
        'blocked',
        'Configured harness location is invalid or differs from the invoked checkout.',
        'Invoke the reviewed harness checkout and correct the local path binding deliberately. Configured values are withheld.',
      )
  }
  const find = deps.findBinary || findBinary
  add(
    'runtime:node',
    Number(process.versions.node.split('.')[0]) >= 20 ? 'passed' : 'blocked',
    `Node ${process.versions.node}; required >=20.`,
    'Use Node 20 or newer; this diagnostic does not install it.',
  )
  for (const name of ['git', 'python3', 'claude', 'gh']) {
    let path = find(name)
    if (path && within(target, resolve(path))) path = null
    binaries[name] = path
    add(
      `binary:${name}`,
      path ? 'passed' : name === 'gh' ? 'warning' : 'blocked',
      path
        ? `${name} is available outside target source.`
        : `${name} is unavailable outside target source.`,
      name === 'gh'
        ? 'GitHub mode requires gh; local planning and execution do not.'
        : `Install ${name} explicitly and expose it through your trusted runtime PATH.`,
    )
  }
  return withReadOnlyGit(binaries.git, async () => {
    for (const name of ['git', 'python3']) {
      if (!binaries[name]) continue
      try {
        const raw = await (deps.versionProbe || versionProbe)(name, binaries[name])
        const version = String(raw).match(
          name === 'git' ? /git version (\d+\.\d+(?:\.\d+)?)/ : /Python (\d+\.\d+(?:\.\d+)?)/,
        )?.[1]
        const supported = version && Number(version.split('.')[0]) >= (name === 'git' ? 2 : 3)
        add(
          `version:${name}`,
          supported ? 'passed' : 'blocked',
          version ? `${name} ${version}` : `${name} version could not be identified.`,
          `Use ${name === 'git' ? 'Git 2' : 'Python 3'} or newer.`,
        )
      } catch {
        add(
          `version:${name}`,
          'blocked',
          `${name} version probe failed.`,
          `Check your trusted ${name} installation; raw process output is withheld.`,
        )
      }
    }
    add(
      'provider-version',
      'warning',
      'Provider CLI compatibility and authentication are unverified; no provider CLI was started.',
      'Before separately authorized execution, verify the installed Claude Code version and scratch credential setup described in runner/EXECUTION.md.',
    )
    let harnessRevision = null
    try {
      if (!binaries.git) throw Error('trusted Git unavailable')
      harnessRevision = (await git(harness, ['rev-parse', 'HEAD'])).stdout.trim()
      if (!/^[a-f0-9]{40,64}$/.test(harnessRevision)) throw Error('invalid revision')
      const paths =
        requiredReferences ||
        (await git(harness, ['ls-tree', '-r', '--name-only', '-z', harnessRevision])).stdout
          .split('\0')
          .filter(Boolean)
      if (!paths.length) throw Error('missing references')
      for (const path of [
        ...new Set([
          'CONTRACT.md',
          'PLAN.md',
          'RUNNER.md',
          'SKILLS.md',
          'runner/EXECUTION.md',
          '.claude/skills/feature/SKILL.md',
          ...paths,
        ]),
      ]) {
        const resolved = resolve(harness, path)
        const available =
          within(harness, resolved) &&
          readable(resolved) &&
          statSync(resolved).isFile() &&
          within(realpathSync(harness), realpathSync(resolved))
        add(
          `reference:${path}`,
          available ? 'passed' : 'blocked',
          available
            ? 'Required harness resource is readable.'
            : 'Required harness resource is missing or unreadable.',
          'Restore this resource from the pinned harness revision; do not invent replacement project facts.',
        )
      }
    } catch {
      add(
        'harness-resources',
        'blocked',
        'Pinned harness revision or required resources are unavailable.',
        'Use a complete, readable Git checkout of the selected harness revision.',
      )
    }
    let project = null,
      policy = null
    if (configError)
      add(
        'operator-config',
        'blocked',
        'Operator configuration is invalid or unreadable.',
        'Repair the JSON configuration locally. Values and parser excerpts are withheld.',
      )
    else add('operator-config', 'passed', 'Operator configuration parsed without exposing values.')
    try {
      project = readProjectConfig(target)
      add('target-config', 'passed', 'Target configuration parsed without exposing values.')
      add(
        'harness-pin',
        /^[a-f0-9]{40,64}$/.test(project.harnessRevision || '') ? 'passed' : 'blocked',
        project.harnessRevision
          ? 'Target declares a harness revision pin.'
          : 'Target has no explicit harness revision pin.',
        'Record the reviewed full harness commit in A-Team Config.',
      )
    } catch {
      add(
        'target-config',
        'blocked',
        'Target configuration is invalid, unreadable or escapes the repository.',
        'Use one valid A-Team Config block with documented keys and target-contained paths. Values and parser excerpts are withheld.',
      )
    }
    try {
      if (!binaries.git) throw Error('trusted Git unavailable')
      const dirty =
        (
          await git(target, ['status', '--porcelain=v1', '--untracked-files=all'], {
            env: { GIT_OPTIONAL_LOCKS: '0' },
          })
        ).stdout.length > 0
      add(
        'target-clean',
        dirty ? 'blocked' : 'passed',
        dirty
          ? 'Target has tracked or untracked changes.'
          : 'Target working tree and index are clean.',
        'Preserve current work; commit it deliberately or choose a separate clean target before execution.',
      )
    } catch (error) {
      const filters = error.code === 'ATEAM_DIAGNOSTIC_FILTERS'
      const submodules = error.code === 'ATEAM_DIAGNOSTIC_SUBMODULES'
      add(
        'target-clean',
        'blocked',
        filters
          ? 'Dirty-state inspection is blocked by repository-configured Git filters.'
          : submodules
            ? 'Nested submodule state cannot be safely established by this diagnostic.'
            : 'Target is not a readable Git repository.',
        filters
          ? 'Use an explicitly prepared target without executable Git filters. Doctor does not run or remove those filters.'
          : submodules
            ? 'Use a separately prepared target without submodules; doctor leaves nested checkouts untouched.'
            : 'Prepare a separate existing target repository; doctor does not clone or initialize it.',
      )
    }
    if (project && !configError && harnessConfigValid && binaries.git) {
      try {
        policy = await resolvePolicy({
          repoPath: target,
          cfg: { ...cfg, harnessRoot: harness, invocationActions: [] },
        })
        add(
          'target-policy',
          'passed',
          policy.target.remote
            ? 'Target identity, local base and configuration bindings agree.'
            : 'Local-only target has no origin; local base and configuration bindings agree.',
        )
        for (const [name, path] of Object.entries({
          currentContext: policy.bindings.currentContext,
          designSystemPath: policy.bindings.designSystemPath,
        })) {
          if (!path) continue
          add(
            `binding:${name}`,
            readable(resolve(target, path)) ? 'passed' : 'blocked',
            `Configured ${name} resource ${readable(resolve(target, path)) ? 'is readable' : 'is missing or unreadable'}.`,
            'Prepare the declared project resource explicitly or correct its binding with project authority.',
          )
        }
      } catch (error) {
        const { condition, repair } = policyCondition(error)
        add('target-policy', 'blocked', condition, repair)
      }
    }
    try {
      await (deps.isolationProbe || assertSandboxAvailable)(
        policy || { sandbox: cfg.sandbox || { backend: 'macos-seatbelt' } },
      )
      add('isolation', 'passed', 'The configured native isolation probe succeeded.')
    } catch {
      add(
        'isolation',
        'blocked',
        'The configured macOS Seatbelt backend is unavailable or denied.',
        'Use the supported native macOS setup and grant its required local execution permissions; there is no unsandboxed fallback.',
      )
    }
    add(
      'containment',
      'warning',
      'Whole-process-tree containment is an accepted limitation (#37); native availability does not establish that guarantee.',
      'Keep this limitation visible when assessing execution authority. This diagnostic does not select or start a VM.',
    )
    add(
      'permissions:target',
      readable(target) && writableAncestor(target) ? 'passed' : 'blocked',
      'Inspected target read access and nearest existing writable directory without creating files.',
      'Grant required target access or choose a writable authorized target.',
    )
    add(
      'permissions:evidence',
      writableAncestor(home()) ? 'passed' : 'blocked',
      'Inspected the nearest existing supervisor evidence directory without creating it.',
      'Choose an operator-owned ATEAM_RUNNER_HOME outside target source.',
    )
    if (within(target, canonicalPath(home())))
      add(
        'evidence-location',
        'blocked',
        'Supervisor evidence location is inside target source.',
        'Set ATEAM_RUNNER_HOME to a separate operator-owned directory.',
      )
    return {
      schemaVersion: 1,
      status: checks.some((c) => c.status === 'blocked') ? 'blocked' : 'ready',
      effects: [],
      harness: { root: harness, revision: harnessRevision },
      checks,
      nextAction:
        'Repair blocked findings, then run the documented local --dry-run. Execution and publishing still require their own existing project authority.',
    }
  })
}

export function renderDoctor(result) {
  return (
    [
      `Setup: ${result.status}`,
      ...result.checks
        .filter((c) => c.status !== 'passed')
        .map((c) => `${c.status}: ${c.id}: ${c.condition}\n  ${c.repair}`),
      result.nextAction,
    ].join('\n') + '\n'
  )
}
