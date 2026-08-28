import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { run } from './sh.mjs'
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

function settingsBlob() {
  return JSON.stringify({
    hooks: {
      PreToolUse: [
        {
          matcher: 'Edit|Write|MultiEdit|NotebookEdit|Bash',
          hooks: [{ type: 'command', command: `node ${JSON.stringify(DENY_HOOK)}` }],
        },
      ],
    },
    permissions: {
      deny: DENIED_PATHS.flatMap((p) => [`Edit(./${p}**)`, `Write(./${p}**)`]),
    },
  })
}

/**
 * Spawn one hermetic Claude session.
 *
 * Hermetic means: none of the operator's settings sources, no MCP servers, no
 * skills. Measured 4x cheaper than an inherited environment, and it keeps a
 * spawned run from picking up personal configuration. The target repo's own
 * CLAUDE.md still loads — that is context the executor should have.
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
}) {
  const args = [
    '-p',
    '--output-format', 'json',
    '--setting-sources', '',
    '--strict-mcp-config',
    '--mcp-config', '{"mcpServers":{}}',
    '--disable-slash-commands',
    '--settings', settingsBlob(),
    '--permission-mode', 'bypassPermissions',
    '--model', model,
  ]
  if (Array.isArray(tools)) args.push('--tools', tools.join(','))
  if (maxBudgetUsd) args.push('--max-budget-usd', String(maxBudgetUsd))
  if (jsonSchema) args.push('--json-schema', JSON.stringify(jsonSchema))
  if (resume) args.push('--resume', resume)
  args.push(prompt)

  if (runDir) {
    ensureDir(runDir)
    writeFileSync(join(runDir, `${role}.prompt.md`), prompt)
    writeFileSync(join(runDir, `${role}.argv.json`), `${JSON.stringify(args.slice(0, -1), null, 2)}\n`)
  }

  log.info('claude.spawn', { role, model, cwd, resume: resume || undefined, budget: maxBudgetUsd })
  const started = Date.now()
  const { code, stdout, stderr } = await run('claude', args, { cwd, check: false, timeoutMs })

  let payload = null
  try { payload = JSON.parse(stdout) } catch { /* non-JSON output handled below */ }

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
    role, ok: out.ok, cost: out.costUsd.toFixed?.(4), ms: out.durationMs,
    session: out.sessionId, reason: out.terminalReason,
  })
  return out
}
