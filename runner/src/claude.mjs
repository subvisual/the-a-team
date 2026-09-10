import { writeFileSync, existsSync, realpathSync } from 'node:fs'
import { join, delimiter, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { runSandboxed } from './sandbox.mjs'
import { canonicalPath, within } from './policy.mjs'
import { log } from './log.mjs'
import { ensureDir } from './paths.mjs'
import { DENIED_PATHS } from './deny.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))

// Structured-output strings sometimes arrive with the tail of the tool-call
// scaffolding glued on ("…no scope creep.</notes>\n</invoke>"). It would land
// verbatim in a PR comment, so strip trailing closing tags.
export function cleanModelText(value) {
  if (typeof value !== 'string') return value
  let out = value
  let previous
  do {
    previous = out
    out = out.replace(/\s*<\/[A-Za-z_][\w:.-]*>\s*$/, '')
  } while (out !== previous)
  return out.trim()
}
export const DENY_HOOK = join(HERE, 'hooks', 'deny-paths.mjs')

const shellQuote = (value) => `'${String(value).replace(/'/g, `'"'"'`)}'`

function settingsBlob(policy) {
  const allowed = policy.authorization?.protectedPaths || []
  return JSON.stringify({
    hooks: {
      PreToolUse: [
        {
          matcher: 'Edit|Write|MultiEdit|NotebookEdit|Bash',
          hooks: [
            {
              type: 'command',
              command: `${shellQuote(realpathSync(process.execPath))} ${shellQuote(DENY_HOOK)} ${shellQuote(JSON.stringify(allowed))}`,
            },
          ],
        },
      ],
    },
    permissions: {
      deny: DENIED_PATHS.filter(
        (p) => !allowed.some((a) => a === p || (p.endsWith('/') && a.startsWith(p))),
      ).flatMap((p) => [`Edit(./${p}**)`, `Write(./${p}**)`]),
    },
  })
}

/**
 * Spawn one Claude session behind the required native process boundary.
 * Settings/hooks are defense in depth; filesystem, environment and network
 * restrictions apply to the process and its descendants independently.
 */
export async function runClaude({
  cwd,
  prompt,
  tools,
  model,
  maxBudgetUsd,
  jsonSchema,
  resume,
  role = 'agent',
  runDir,
  timeoutMs,
  policy,
  scratchDir,
  modelEnv = process.env,
}) {
  if (!policy || !scratchDir)
    throw new Error(
      'resolved policy and separate scratch directory are required before Claude launch',
    )
  if (!/^(executor|reviewer)(-|$)/.test(role)) throw new Error(`unsupported sandbox role: ${role}`)
  if (runDir && within(canonicalPath(scratchDir), canonicalPath(runDir)))
    throw new Error('evidence directory must be outside agent scratch')
  const requested = policy.sandbox?.claudeExecutable || 'claude'
  const executable = isAbsolute(requested)
    ? requested
    : (process.env.PATH || '')
        .split(delimiter)
        .map((p) => join(p, requested))
        .find(existsSync)
  if (!executable || !existsSync(executable))
    throw new Error(
      'Claude executable is unavailable; install it or configure sandbox.claudeExecutable',
    )
  const command = realpathSync(executable)
  const args = [
    '-p',
    '--output-format',
    'json',
    '--setting-sources',
    '',
    '--strict-mcp-config',
    '--mcp-config',
    '{"mcpServers":{}}',
    '--disable-slash-commands',
    '--settings',
    settingsBlob(policy),
    '--permission-mode',
    'bypassPermissions',
    '--model',
    model,
  ]
  if (Array.isArray(tools)) args.push('--tools', tools.join(','))
  if (maxBudgetUsd) args.push('--max-budget-usd', String(maxBudgetUsd))
  if (jsonSchema) args.push('--json-schema', JSON.stringify(jsonSchema))
  if (resume) args.push('--resume', resume)
  args.push(prompt)

  if (runDir) {
    ensureDir(runDir)
    writeFileSync(join(runDir, `${role}.prompt.md`), prompt)
    writeFileSync(
      join(runDir, `${role}.argv.json`),
      `${JSON.stringify(args.slice(0, -1), null, 2)}\n`,
    )
  }

  log.info('claude.spawn', { role, model, cwd, resume: resume || undefined, budget: maxBudgetUsd })
  const started = Date.now()
  const { code, stdout, stderr } = await runSandboxed(command, args, {
    cwd,
    scratchDir,
    policy,
    role: role.startsWith('executor') ? 'executor' : 'reviewer',
    env: modelEnv,
    model: true,
    check: false,
    timeoutMs,
  })

  let payload = null
  try {
    payload = JSON.parse(stdout)
  } catch {
    /* non-JSON output handled below */
  }

  if (runDir) {
    writeFileSync(join(runDir, `${role}.result.json`), stdout || '')
    if (stderr.trim()) writeFileSync(join(runDir, `${role}.stderr.txt`), stderr)
  }

  const out = {
    ok: code === 0 && payload?.is_error === false,
    exitCode: code,
    sessionId: payload?.session_id ?? null,
    structured: payload?.structured_output ?? null,
    text: payload?.result ?? '',
    costUsd: payload?.total_cost_usd ?? 0,
    terminalReason: payload?.terminal_reason ?? null,
    errors: payload?.errors ?? (stderr.trim() ? [stderr.trim().split('\n')[0]] : []),
    durationMs: Date.now() - started,
  }

  log.info('claude.done', {
    role,
    ok: out.ok,
    cost: out.costUsd.toFixed?.(4),
    ms: out.durationMs,
    session: out.sessionId,
    reason: out.terminalReason,
  })
  return out
}
