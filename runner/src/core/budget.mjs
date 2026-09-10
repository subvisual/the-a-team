import { openSync, closeSync, readFileSync, writeFileSync, fsyncSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { home, slug, ensureDir } from '../paths.mjs'
import { claim } from './claim.mjs'

export const LIMIT_DEFAULTS = {
  runBudgetUsd: 45,
  executorBudgetUsd: 10,
  reviewerBudgetUsd: 5,
  runTimeoutMs: 7_200_000,
  sessionTimeoutMs: 1_200_000,
  maxCycles: 3,
}
export function resolveLimits(config = {}) {
  const out = {}
  for (const [key, fallback] of Object.entries(LIMIT_DEFAULTS)) {
    const value = config[key] === undefined ? fallback : config[key]
    const integer = key.endsWith('Ms') || key === 'maxCycles'
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value <= 0 ||
      (integer && !Number.isSafeInteger(value)) ||
      (key.endsWith('Ms') && value > 2_147_483_647)
    )
      throw new Error(`${key} must be a positive ${integer ? 'bounded integer' : 'finite number'}`)
    out[key] = value
  }
  return Object.freeze(out)
}
const knownCost = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0
const fail = (message, failureCategory, budget) =>
  Object.assign(new Error(message), { failureCategory, budget })
export const budgetIdentity = (repo, policy) =>
  policy?.target?.remote
    ? policy.target.remote.toLowerCase()
    : policy?.target?.root
      ? `path:${policy.target.root}`
      : repo.startsWith('/')
        ? `path:${repo}`
        : `github.com/${repo.toLowerCase()}`
const ledgerPath = (repo) =>
  join(
    home(),
    'budgets',
    `${slug(repo)}-${createHash('sha256').update(repo).digest('hex').slice(0, 12)}`,
    'events.jsonl',
  )
function readLedger(path) {
  if (!existsSync(path)) return []
  const bytes = readFileSync(path, 'utf8')
  if (bytes && !bytes.endsWith('\n'))
    throw fail('budget history is incomplete; accounting is uncertain', 'accounting-uncertain')
  try {
    const events = bytes.trim()
      ? bytes
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
      : []
    const windows = new Set(),
      launches = new Map(),
      finished = new Set()
    for (const event of events) {
      if (event.schemaVersion !== 1 || !event.id || !Number.isFinite(event.at) || !event.windowId)
        throw new Error('malformed event')
      if (event.type === 'window-opened') {
        if (windows.has(event.windowId)) throw new Error('duplicate window')
        if (JSON.stringify(resolveLimits(event.limits)) !== JSON.stringify(event.limits))
          throw new Error('incomplete limits')
        windows.add(event.windowId)
      } else {
        if (!windows.has(event.windowId)) throw new Error('unknown window')
        if (event.type === 'launch-started') {
          if (
            launches.has(event.launchId) ||
            !['executor', 'reviewer', 'verification'].includes(event.role)
          )
            throw new Error('invalid launch')
          launches.set(event.launchId, event.windowId)
        } else if (event.type === 'launch-finished') {
          if (
            launches.get(event.launchId) !== event.windowId ||
            finished.has(event.launchId) ||
            !(event.costUsd === null || knownCost(event.costUsd))
          )
            throw new Error('invalid accounting')
          finished.add(event.launchId)
        } else if (event.type !== 'budget-stop') throw new Error('unknown event')
      }
    }
    return events
  } catch (error) {
    throw fail(
      `budget history is malformed; accounting is uncertain: ${error.message}`,
      'accounting-uncertain',
    )
  }
}
function append(path, event) {
  const fd = openSync(path, 'a', 0o600)
  try {
    writeFileSync(fd, `${JSON.stringify({ schemaVersion: 1, id: randomUUID(), ...event })}\n`)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  const directory = openSync(dirname(path), 'r')
  try {
    fsyncSync(directory)
  } finally {
    closeSync(directory)
  }
}
function materialize(events, windowId, now) {
  const window = events.find(
    (event) => event.type === 'window-opened' && event.windowId === windowId,
  )
  const completed = events.filter((event) => event.type === 'launch-finished')
  const active = completed.filter((event) => event.windowId === windowId)
  const unfinished = events.filter(
    (event) =>
      event.type === 'launch-started' &&
      !completed.some((result) => result.launchId === event.launchId),
  )
  const sum = (items) =>
    items.reduce((total, event) => total + (knownCost(event.costUsd) ? event.costUsd : 0), 0)
  const spentUsd = sum(active)
  return {
    windowId,
    limits: window.limits,
    openedAt: window.at,
    spentUsd,
    remainingUsd: Math.max(0, window.limits.runBudgetUsd - spentUsd),
    remainingMs: Math.max(0, window.at + window.limits.runTimeoutMs - now),
    unknownCosts: active.filter((event) => event.costUsd === null).length,
    pendingLaunches: unfinished
      .filter((event) => event.windowId === windowId)
      .map((event) => event.launchId),
    lifetimeSpentUsd: sum(completed),
    lifetimeUnknownCosts: completed.filter((event) => event.costUsd === null).length,
    lifetimePendingLaunches: unfinished.map((event) => event.launchId),
  }
}

// One durable allowance per repository, shared by issues, attempts and both roles.
// The ledger transaction lock protects reservations across supervisor processes.
export function openBudget({ repo, policy, now = Date.now }) {
  const limits = resolveLimits(policy.limits)
  const recovery = policy.authorization?.recoveryWindow
  if (
    recovery !== undefined &&
    (typeof recovery !== 'string' || !recovery.trim() || !policy.authorization?.id)
  )
    throw fail(
      'fresh recovery window requires an explicit invocation authorization ID and nonempty window ID',
      'invalid-authorization',
    )
  const identity = budgetIdentity(repo, policy)
  const path = ledgerPath(identity)
  const transaction = (fn) => {
    const token = claim(`${identity}/budget-ledger`, 'accounting')
    if (!token)
      throw fail('budget accounting is locked by another supervisor', 'accounting-uncertain')
    try {
      return fn(readLedger(path))
    } finally {
      token.release()
    }
  }
  const windowId = transaction((events) => {
    const windows = events.filter((event) => event.type === 'window-opened')
    let latest = windows.at(-1)
    if (recovery && recovery !== latest?.recoveryWindow) {
      if (windows.some((event) => event.recoveryWindow === recovery))
        throw fail(
          'recovery window was already consumed; use its retained history or a newly authorized window',
          'budget-exhausted',
        )
      latest = null
    }
    if (!latest) {
      latest = {
        type: 'window-opened',
        windowId: randomUUID(),
        at: now(),
        authorizationId: policy.authorization?.id || null,
        recoveryWindow: recovery || null,
        limits,
      }
      ensureDir(dirname(path))
      append(path, latest)
    } else if (JSON.stringify(latest.limits) !== JSON.stringify(limits))
      throw fail(
        'budget limits changed; authorize a fresh recovery window',
        'budget-policy-changed',
      )
    return latest.windowId
  })
  const snapshot = () => materialize(readLedger(path), windowId, now())
  return {
    snapshot,
    attemptStatus(attemptId) {
      const events = readLedger(path).filter(
        (event) => event.type === 'launch-finished' && event.attemptId === attemptId,
      )
      return {
        spentUsd: events.reduce(
          (sum, event) => sum + (knownCost(event.costUsd) ? event.costUsd : 0),
          0,
        ),
        unknownCosts: events.filter((event) => event.costUsd === null).length,
      }
    },
    async call(role, fn, context = {}) {
      const launchId = randomUUID()
      const started = now()
      const grant = transaction((events) => {
        const state = materialize(events, windowId, now())
        let error
        if (events.filter((event) => event.type === 'window-opened').at(-1).windowId !== windowId)
          error = fail(
            'budget window was superseded by an authorized recovery',
            'budget-exhausted',
            state,
          )
        else if (state.unknownCosts || state.pendingLaunches.length)
          error = fail(
            'budget accounting is uncertain; reconcile evidence or authorize a fresh recovery window',
            'accounting-uncertain',
            state,
          )
        else if (state.remainingMs <= 0) error = fail('run wall-time exhausted', 'timeout', state)
        else if (role !== 'verification' && state.remainingUsd <= 0)
          error = fail('run budget exhausted', 'budget-exhausted', state)
        if (error) {
          append(path, {
            type: 'budget-stop',
            windowId,
            at: now(),
            failureCategory: error.failureCategory,
            budget: state,
            ...context,
          })
          throw error
        }
        const budgetUsd =
          role === 'verification' ? 0 : Math.min(limits[`${role}BudgetUsd`], state.remainingUsd)
        if (role !== 'verification' && !knownCost(budgetUsd))
          throw new Error(`invalid budget role: ${role}`)
        const timeoutMs = Math.max(
          1,
          Math.floor(Math.min(limits.sessionTimeoutMs, state.remainingMs)),
        )
        append(path, {
          ...context,
          type: 'launch-started',
          windowId,
          launchId,
          role,
          at: now(),
          budgetUsd,
          timeoutMs,
        })
        return { budgetUsd, timeoutMs }
      })
      let result, error
      try {
        result = await fn(grant)
      } catch (caught) {
        error = caught
      }
      const costUsd =
        role === 'verification'
          ? 0
          : knownCost((error || result)?.costUsd)
            ? (error || result).costUsd
            : null
      const failureCategory =
        error?.failureCategory ||
        (error
          ? 'infrastructure-interruption'
          : result?.timedOut
            ? 'timeout'
            : result?.verdict === 'request-changes'
              ? 'reviewer-rejection'
              : result?.status === 'blocked'
                ? 'executor-blocked'
                : result?.verdict === 'blocked'
                  ? 'reviewer-blocked'
                  : null)
      transaction(() =>
        append(path, {
          ...context,
          type: 'launch-finished',
          windowId,
          launchId,
          role,
          at: now(),
          costUsd,
          durationMs: Math.max(0, now() - started),
          outcome: error ? 'failed' : 'completed',
          failureCategory,
        }),
      )
      const state = snapshot()
      if (error) {
        error.budget = state
        error.failureCategory = failureCategory
        throw error
      }
      if (costUsd === null)
        throw fail(
          'provider returned unknown cost; continuation requires accounting or an authorized fresh recovery window',
          'accounting-uncertain',
          state,
        )
      if (state.spentUsd > limits.runBudgetUsd)
        throw fail('provider-reported spend exceeded run budget', 'budget-exhausted', state)
      if (result?.timedOut || state.remainingMs <= 0)
        throw Object.assign(fail('run or session wall-time exhausted', 'timeout', state), {
          processResult: result,
        })
      return result
    },
  }
}

// Read-only status/planning never opens a window or obtains a claim.
export function budgetStatus(repo, now = Date.now(), policy) {
  const events = readLedger(ledgerPath(budgetIdentity(repo, policy)))
  const window = events.filter((event) => event.type === 'window-opened').at(-1)
  return window ? materialize(events, window.windowId, now) : null
}
export function budgetReadiness({ repo, policy, now = Date.now() }) {
  const events = readLedger(ledgerPath(budgetIdentity(repo, policy)))
  const windows = events.filter((event) => event.type === 'window-opened')
  const latest = windows.at(-1)
  const recovery = policy.authorization?.recoveryWindow
  if (recovery && recovery !== latest?.recoveryWindow) {
    if (windows.some((event) => event.recoveryWindow === recovery))
      throw fail('recovery window was already consumed', 'budget-exhausted')
    return { freshRecoveryWindow: recovery }
  }
  if (!latest) return null
  const state = materialize(events, latest.windowId, now)
  if (JSON.stringify(latest.limits) !== JSON.stringify(resolveLimits(policy.limits)))
    throw fail(
      'budget limits changed; authorize a fresh recovery window',
      'budget-policy-changed',
      state,
    )
  if (state.unknownCosts || state.pendingLaunches.length)
    throw fail('budget accounting is uncertain', 'accounting-uncertain', state)
  if (state.remainingMs <= 0) throw fail('run wall-time exhausted', 'timeout', state)
  if (state.remainingUsd <= 0) throw fail('run budget exhausted', 'budget-exhausted', state)
  return state
}
