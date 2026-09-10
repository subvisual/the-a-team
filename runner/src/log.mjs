// Structured, greppable log lines: `<iso> <LEVEL> <event> k=v k=v`.
// One format for humans and grep both; no UI in v1 (RUNNER.md, "State").

let quiet = false

export function setQuiet(v) { quiet = !!v }

function fmt(value) {
  const s = String(value ?? '')
  return /[\s"]/.test(s) ? JSON.stringify(s) : s
}

function emit(level, event, fields = {}) {
  if (quiet && level === 'INFO') return
  const parts = [new Date().toISOString(), level, event]
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue
    parts.push(`${k}=${fmt(v)}`)
  }
  const line = parts.join(' ')
  // stdout belongs to the command result, including nested model/adaptor logs.
  console.error(line)
}

export const log = {
  info: (event, fields) => emit('INFO', event, fields),
  warn: (event, fields) => emit('WARN', event, fields),
  error: (event, fields) => emit('ERROR', event, fields),
}
