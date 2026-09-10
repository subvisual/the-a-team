import { cleanModelText } from '../claude.mjs'

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
function shape(value, fields, role) {
  if (!object(value)) throw new Error(`${role}: missing or malformed structured result`)
  for (const key of Object.keys(value))
    if (!Object.hasOwn(fields, key)) throw new Error(`${role}: unknown result field ${key}`)
  for (const [key, type] of Object.entries(fields)) {
    const optional = type.startsWith('?'),
      expected = optional ? type.slice(1) : type
    if (optional && !Object.hasOwn(value, key)) continue
    const v = value[key]
    const valid =
      expected === 'array'
        ? Array.isArray(v)
        : expected === 'nullable-string'
          ? v === null || typeof v === 'string'
          : typeof v === expected
    if (!valid) throw new Error(`${role}: invalid or missing ${key} (expected ${expected})`)
  }
}
function processOutcome(value, role, detail) {
  if (value.ok !== true || value.exitCode !== 0)
    throw new Error(
      `${role}: process failed (ok=${value.ok}, exit=${value.exitCode})${detail ? `: ${detail}` : ''}`,
    )
}
function tests(value, role, names) {
  const [ran, passed, command] = names.map((k) => value[k])
  if (passed && !ran) throw new Error(`${role}: testsPassed contradicts testsRan=false`)
  if (ran && !command.trim()) throw new Error(`${role}: tests ran without a test command`)
}
const meta = { costUsd: '?number', sessionId: '?nullable-string' }
const executorFields = {
  ok: 'boolean',
  exitCode: 'number',
  status: 'string',
  summary: 'string',
  blockedReason: 'string',
  testCommand: 'string',
  testsRan: 'boolean',
  testsPassed: 'boolean',
  ...meta,
}
const reviewerFields = {
  ok: 'boolean',
  exitCode: 'number',
  verdict: 'string',
  unmetAc: 'array',
  notes: 'string',
  testsRan: 'boolean',
  testsPassed: 'boolean',
  testCommand: 'string',
  testOutput: 'string',
  ...meta,
}
function validateMetadata(value, role) {
  if (!Number.isInteger(value.exitCode)) throw new Error(`${role}: invalid exitCode`)
  if (value.costUsd !== undefined && (!Number.isFinite(value.costUsd) || value.costUsd < 0))
    throw new Error(`${role}: invalid costUsd`)
}
export function validateExecutor(value) {
  const role = 'executor'
  shape(value, executorFields, role)
  validateMetadata(value, role)
  if (!['done', 'blocked'].includes(value.status)) throw new Error(`${role}: invalid status`)
  if (value.status === 'done' && value.blockedReason.trim())
    throw new Error(`${role}: done contradicts blocked reason: ${value.blockedReason}`)
  if (value.status === 'done' && value.testsRan && !value.testsPassed)
    throw new Error(`${role}: done contradicts failed tests`)
  if (value.status === 'blocked' && !value.blockedReason.trim())
    throw new Error(`${role}: blocked result has no reason`)
  tests(value, role, ['testsRan', 'testsPassed', 'testCommand'])
  processOutcome(value, role, value.blockedReason)
  return value
}
export function validateReviewer(value) {
  const role = 'reviewer'
  shape(value, reviewerFields, role)
  validateMetadata(value, role)
  if (!['approve', 'request-changes', 'blocked'].includes(value.verdict))
    throw new Error(`${role}: invalid verdict`)
  for (const item of value.unmetAc) {
    shape(item, { criterion: 'string', why: 'string' }, `${role} unmet criterion`)
    if (!item.criterion.trim() || !item.why.trim())
      throw new Error(`${role}: empty unmet criterion or reason`)
  }
  tests(value, role, ['testsRan', 'testsPassed', 'testCommand'])
  if (value.verdict === 'approve' && value.unmetAc.length)
    throw new Error(`${role}: approve contradicts unmet acceptance criteria`)
  if (value.verdict === 'approve' && value.testsRan && !value.testsPassed)
    throw new Error(`${role}: approve contradicts failed tests`)
  if (value.verdict === 'blocked' && !value.notes.trim())
    throw new Error(`${role}: blocked result has no reason`)
  processOutcome(value, role, value.notes)
  return value
}
function validateRawProcess(result, role) {
  if (!object(result) || typeof result.ok !== 'boolean' || !Number.isInteger(result.exitCode))
    throw new Error(`${role}: malformed process outcome`)
  const detail =
    typeof result.structured?.blocked_reason === 'string' && result.structured.blocked_reason.trim()
      ? result.structured.blocked_reason
      : Array.isArray(result.errors)
        ? result.errors.find((error) => typeof error === 'string' && error.trim())
        : null
  processOutcome(
    result,
    role,
    detail || (result.structured == null ? 'missing structured model output' : null),
  )
}
export function normalizeExecutor(result) {
  validateRawProcess(result, 'executor')
  const s = result?.structured
  shape(
    s,
    {
      status: 'string',
      summary: 'string',
      blocked_reason: 'string',
      tests_command: 'string',
      tests_ran: 'boolean',
      tests_passed: 'boolean',
    },
    'executor raw',
  )
  const normalized = {
    ok: result.ok,
    exitCode: result.exitCode,
    status: s.status,
    summary: s.summary,
    blockedReason: s.blocked_reason,
    testCommand: s.tests_command,
    testsRan: s.tests_ran,
    testsPassed: s.tests_passed,
    ...(result.costUsd !== undefined ? { costUsd: result.costUsd } : {}),
    ...(result.sessionId !== undefined ? { sessionId: result.sessionId } : {}),
  }
  validateExecutor(normalized)
  return {
    ...normalized,
    summary: cleanModelText(s.summary),
    blockedReason: cleanModelText(s.blocked_reason),
  }
}
export function normalizeReviewer(result) {
  validateRawProcess(result, 'reviewer')
  const s = result?.structured
  shape(
    s,
    {
      verdict: 'string',
      tests_ran: 'boolean',
      tests_passed: 'boolean',
      test_command: 'string',
      test_output: 'string',
      unmet_ac: 'array',
      notes: 'string',
    },
    'reviewer raw',
  )
  const normalized = {
    ok: result.ok,
    exitCode: result.exitCode,
    verdict: s.verdict,
    testsRan: s.tests_ran,
    testsPassed: s.tests_passed,
    testCommand: s.test_command,
    testOutput: s.test_output,
    unmetAc: s.unmet_ac,
    notes: s.notes,
    ...(result.costUsd !== undefined ? { costUsd: result.costUsd } : {}),
    ...(result.sessionId !== undefined ? { sessionId: result.sessionId } : {}),
  }
  validateReviewer(normalized)
  return {
    ...normalized,
    notes: cleanModelText(s.notes),
    testOutput: cleanModelText(s.test_output),
    unmetAc: s.unmet_ac.map((u) => ({
      criterion: cleanModelText(u.criterion),
      why: cleanModelText(u.why),
    })),
  }
}
