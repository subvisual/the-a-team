import { isAbsolute, resolve, relative } from 'node:path'

// Paths an agent must never touch: changing CI or agent configuration from
// inside a run is an escalation, not a task (RUNNER.md, "Safety" item 3).
export const DENIED_PATHS = [
  '.github/workflows/',
  '.github/actions/',
  '.git/config',
  '.claude/settings.json',
  '.claude/settings.local.json',
  '.claude/hooks/',
  '.circleci/',
  '.gitlab-ci.yml',
  'Jenkinsfile',
  'azure-pipelines.yml',
]

// Bash the executor has no business running: the runner owns pushing and every
// GitHub write, so an agent reaching for them is out of contract.
export const DENIED_BASH = [
  [/\bgit\s+push\b/, 'the runner owns pushing'],
  [/\bgit\s+remote\s+(add|set-url|remove)\b/, 'remotes are not the agent\u2019s to change'],
  [/\bgh\s+(pr|issue|release|repo|api|auth|secret)\b/, 'the runner owns all GitHub writes'],
  [/\bsudo\b/, 'privilege escalation'],
  [/\b(curl|wget)\b[^|]*\|\s*(ba)?sh\b/, 'piping a download into a shell'],
]

const FILE_KEYS = ['file_path', 'filePath', 'notebook_path', 'notebookPath', 'path']

export function pathsFromToolInput(toolInput = {}) {
  const out = []
  for (const key of FILE_KEYS) {
    if (typeof toolInput[key] === 'string') out.push(toolInput[key])
  }
  if (Array.isArray(toolInput.edits)) {
    for (const e of toolInput.edits) {
      for (const key of FILE_KEYS) if (typeof e?.[key] === 'string') out.push(e[key])
    }
  }
  return out
}

function normalise(p, cwd) {
  const abs = isAbsolute(p) ? p : resolve(cwd, p)
  return relative(cwd, abs).split('\\').join('/')
}

/**
 * Returns a human-readable reason when a tool call must be blocked, else null.
 * Enforcement lives in a PreToolUse hook rather than in permission rules
 * because the executor runs with bypassPermissions — hooks still fire, deny
 * rules do not.
 */
export function denyReason({ toolName, toolInput = {}, cwd }) {
  const base = cwd || process.cwd()

  for (const raw of pathsFromToolInput(toolInput)) {
    const rel = normalise(raw, base)
    if (rel === '' || rel.startsWith('../')) {
      return `path escapes the worktree: ${raw}`
    }
    for (const denied of DENIED_PATHS) {
      const isDir = denied.endsWith('/')
      if (isDir ? rel.startsWith(denied) : rel === denied) {
        return `${denied} is off limits to the agent; escalate instead of editing it`
      }
    }
  }

  if (toolName === 'Bash' && typeof toolInput.command === 'string') {
    for (const [re, why] of DENIED_BASH) {
      if (re.test(toolInput.command)) return `blocked command (${why}): ${toolInput.command.slice(0, 120)}`
    }
  }

  return null
}
