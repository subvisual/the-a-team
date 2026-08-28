// Parsing of issue text. Pure functions — the acceptance-criteria gate
// (RUNNER.md decision 9) and dependency guard (decision 16) both live here.

const AC_HEADING = /^(#{1,6})\s*acceptance\s+criteria\s*:?\s*$/i
const HEADING = /^(#{1,6})\s+/
const BULLET = /^\s*(?:[-*+]\s+(?:\[[ xX]\]\s*)?|\d+[.)]\s+)(.+?)\s*$/
const GHERKIN = /^\s*(given|when|then|and|but)\b/i

// Extract the acceptance-criteria items from an issue body.
// Returns [] when the section is absent or carries no items.
export function acceptanceCriteria(body) {
  const lines = String(body ?? '').split(/\r?\n/)
  let depth = null
  const items = []
  let pending = null

  const flush = () => {
    if (pending) {
      const text = pending.replace(/\s+/g, ' ').trim()
      if (text) items.push(text)
    }
    pending = null
  }

  for (const line of lines) {
    if (depth === null) {
      const m = line.match(AC_HEADING)
      if (m) depth = m[1].length
      continue
    }
    const h = line.match(HEADING)
    if (h && h[1].length <= depth) break

    const b = line.match(BULLET)
    if (b) {
      flush()
      pending = b[1]
      continue
    }
    if (GHERKIN.test(line)) {
      if (pending) pending += ` ${line.trim()}`
      else pending = line.trim()
      continue
    }
    if (!line.trim()) { flush(); continue }
    if (pending) pending += ` ${line.trim()}`
  }
  flush()
  return items
}

export function hasCheckableAC(body) {
  return acceptanceCriteria(body).length > 0
}

// `Blocked by #12`, `blocked-by: #12, #13`, `Depends on #4`.
export function blockedBy(body) {
  const text = String(body ?? '')
  const out = new Set()
  const re = /(?:blocked[\s-]*by|depends?[\s-]*on)\s*:?\s*((?:[#&,\s]*\d+)+)/gi
  let m
  while ((m = re.exec(text))) {
    for (const n of m[1].matchAll(/\d+/g)) out.add(Number(n[0]))
  }
  return [...out].sort((a, b) => a - b)
}

// Normalise a criterion for set comparison across review cycles.
export function normaliseCriterion(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/`+/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Two consecutive review passes that share no unmet criterion are the
// oscillation signature (RUNNER.md decision 13): the reviewer is browsing,
// not converging. Only meaningful when both passes found something.
export function objectionsDisjoint(previous, current) {
  const a = new Set((previous || []).map(normaliseCriterion).filter(Boolean))
  const b = new Set((current || []).map(normaliseCriterion).filter(Boolean))
  if (a.size === 0 || b.size === 0) return false
  for (const x of a) if (b.has(x)) return false
  return true
}
