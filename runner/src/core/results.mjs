import { cleanModelText } from '../claude.mjs'
import { validateAdequacyMapAuthority } from './adequacy-authority.mjs'

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
  testAdequacy: 'array',
  ...meta,
}
const adequacyStatuses = {
  expectedValues: ['independent', 'implementation-mirroring', 'not-applicable'],
  publicBehavior: ['exercised', 'not-exercised', 'not-applicable'],
  substitutedBoundaries: ['appropriate', 'inappropriate', 'none'],
}
const unacceptableAdequacyStatuses = new Set([
  'implementation-mirroring',
  'not-exercised',
  'inappropriate',
])
function validateAspect(value, role, field) {
  shape(value, { status: 'string', evidence: 'string' }, `${role} ${field}`)
  if (!adequacyStatuses[field].includes(value.status))
    throw new Error(`${role}: invalid ${field} status`)
  if (!value.evidence.trim()) throw new Error(`${role}: ${field} evidence is required`)
}
export function validateTestAdequacy(
  value,
  { issue, acceptanceCriteria, adequacyAuthority } = {},
) {
  const role = 'reviewer test adequacy'
  if (!Array.isArray(value) || !value.length)
    throw new Error(`${role}: obligation-to-check map is required`)
  const seen = new Set()
  for (const entry of value) {
    shape(
      entry,
      {
        criterion: 'string',
        expectedValues: 'object',
        publicBehavior: 'object',
        substitutedBoundaries: 'object',
        requirementSource: 'object',
        baselineExpectations: 'object',
        judgment: 'string',
        why: 'string',
      },
      role,
    )
    if (!entry.criterion.trim() || seen.has(entry.criterion))
      throw new Error(`${role}: criteria must be nonempty and unique`)
    seen.add(entry.criterion)
    validateAspect(entry.expectedValues, role, 'expectedValues')
    validateAspect(entry.publicBehavior, role, 'publicBehavior')
    validateAspect(entry.substitutedBoundaries, role, 'substitutedBoundaries')
    shape(entry.requirementSource, { id: 'string', revision: 'string' }, `${role} source`)
    if (!entry.requirementSource.id.trim() || !entry.requirementSource.revision.trim())
      throw new Error(`${role}: current requirement source id and revision are required`)
    shape(
      entry.baselineExpectations,
      { status: 'string', requirementVersion: 'number', authorization: 'string' },
      `${role} baseline`,
    )
    if (!['preserved', 'changed-authorized', 'weakened'].includes(entry.baselineExpectations.status))
      throw new Error(`${role}: invalid baseline status`)
    if (!Number.isSafeInteger(entry.baselineExpectations.requirementVersion) || entry.baselineExpectations.requirementVersion < 1)
      throw new Error(`${role}: positive requirement version is required`)
    if (
      entry.baselineExpectations.status === 'changed-authorized' &&
      !entry.baselineExpectations.authorization.trim()
    )
      throw new Error(`${role}: changed baseline requires versioned authorization`)
    if (!['adequate', 'inadequate'].includes(entry.judgment) || !entry.why.trim())
      throw new Error(`${role}: explicit semantic judgment and reason are required`)
  }
  const expected = acceptanceCriteria || issue?.acceptanceCriteria
  if (expected) {
    if (
      expected.length !== value.length ||
      expected.some((criterion) => !seen.has(criterion))
    )
      throw new Error(`${role}: map must cover the current acceptance criteria exactly once`)
  }
  if (adequacyAuthority)
    validateAdequacyMapAuthority(value, { authority: adequacyAuthority, issue })
  return value
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
export function validateReviewer(value, options = {}) {
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
  validateTestAdequacy(value.testAdequacy, options)
  if (value.verdict === 'approve' && value.unmetAc.length)
    throw new Error(`${role}: approve contradicts unmet acceptance criteria`)
  if (value.verdict === 'approve' && value.testsRan && !value.testsPassed)
    throw new Error(`${role}: approve contradicts failed tests`)
  if (
    value.verdict === 'approve' &&
    value.testAdequacy.some(
      (entry) =>
        entry.judgment !== 'adequate' ||
        entry.baselineExpectations.status === 'weakened' ||
        [entry.expectedValues, entry.publicBehavior, entry.substitutedBoundaries].some((aspect) =>
          unacceptableAdequacyStatuses.has(aspect.status),
        ),
    )
  )
    throw new Error(`${role}: approve contradicts inadequate tests or weakened baseline expectations`)
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
function normalizeAdequacyEntry(entry) {
  const role = 'reviewer raw test adequacy'
  shape(
    entry,
    {
      criterion: 'string',
      expected_values: 'object',
      public_behavior: 'object',
      substituted_boundaries: 'object',
      requirement_source: 'object',
      baseline_expectations: 'object',
      judgment: 'string',
      why: 'string',
    },
    role,
  )
  for (const [field, value] of [
    ['expected_values', entry.expected_values],
    ['public_behavior', entry.public_behavior],
    ['substituted_boundaries', entry.substituted_boundaries],
  ])
    shape(value, { status: 'string', evidence: 'string' }, `${role} ${field}`)
  shape(entry.requirement_source, { id: 'string', revision: 'string' }, `${role} source`)
  shape(
    entry.baseline_expectations,
    { status: 'string', requirement_version: 'number', authorization: 'string' },
    `${role} baseline`,
  )
  return {
    criterion: entry.criterion,
    expectedValues: entry.expected_values,
    publicBehavior: entry.public_behavior,
    substitutedBoundaries: entry.substituted_boundaries,
    requirementSource: entry.requirement_source,
    baselineExpectations: {
      status: entry.baseline_expectations.status,
      requirementVersion: entry.baseline_expectations.requirement_version,
      authorization: entry.baseline_expectations.authorization,
    },
    judgment: entry.judgment,
    why: entry.why,
  }
}
export function normalizeReviewer(result, options = {}) {
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
      test_adequacy: 'array',
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
    testAdequacy: s.test_adequacy.map(normalizeAdequacyEntry),
    unmetAc: s.unmet_ac,
    notes: s.notes,
    ...(result.costUsd !== undefined ? { costUsd: result.costUsd } : {}),
    ...(result.sessionId !== undefined ? { sessionId: result.sessionId } : {}),
  }
  validateReviewer(normalized, options)
  return {
    ...normalized,
    notes: cleanModelText(s.notes),
    testOutput: cleanModelText(s.test_output),
    unmetAc: s.unmet_ac.map((u) => ({
      criterion: u.criterion,
      why: cleanModelText(u.why),
    })),
    testAdequacy: normalized.testAdequacy.map((entry) => ({
      ...entry,
      criterion: entry.criterion,
      expectedValues: {
        ...entry.expectedValues,
        evidence: cleanModelText(entry.expectedValues.evidence),
      },
      publicBehavior: {
        ...entry.publicBehavior,
        evidence: cleanModelText(entry.publicBehavior.evidence),
      },
      substitutedBoundaries: {
        ...entry.substitutedBoundaries,
        evidence: cleanModelText(entry.substitutedBoundaries.evidence),
      },
      requirementSource: {
        id: entry.requirementSource.id,
        revision: entry.requirementSource.revision,
      },
      baselineExpectations: {
        ...entry.baselineExpectations,
        authorization: entry.baselineExpectations.authorization,
      },
      why: cleanModelText(entry.why),
    })),
  }
}
