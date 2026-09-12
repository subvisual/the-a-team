// Supervisor-owned append-only history. One immutable file per event avoids a
// truncated append hiding earlier evidence. Callers serialize issue mutations
// with a claim; atomic event creation also refuses accidental overwrites.
import {
  openSync,
  writeFileSync,
  fsyncSync,
  closeSync,
  readFileSync,
  readdirSync,
  existsSync,
} from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { home, ensureDir, slug } from '../paths.mjs'
import { digest } from '../policy.mjs'

const location = (repo, key) =>
  join(
    home(),
    'history',
    `${slug(repo)}-${digest(repo).slice(0, 12)}`,
    `${slug(key)}-${digest(String(key)).slice(0, 12)}`,
  )
export const issueVersion = (issue) =>
  issue.contentVersion ||
  issue.version ||
  digest({
    key: issue.key,
    title: issue.title,
    body: issue.body,
    acceptanceCriteria: issue.acceptanceCriteria,
  })
export function readEvents(repo, key) {
  const dir = location(repo, key)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((p) => p.endsWith('.json'))
    .sort()
    .map((file) => {
      try {
        const event = JSON.parse(readFileSync(join(dir, file), 'utf8'))
        if (
          event.schemaVersion !== 1 ||
          event.repo !== repo ||
          event.issueKey !== String(key) ||
          !event.type
        )
          throw Error('invalid event identity')
        return event
      } catch (error) {
        throw Object.assign(
          Error(`history is incomplete or corrupt: ${join(dir, file)}: ${error.message}`),
          { code: 'history-corrupt' },
        )
      }
    })
}
export function appendEvent(repo, issue, fields) {
  const key = String(typeof issue === 'object' ? issue.key : issue)
  const previous = readEvents(repo, key)
  const event = {
    ...fields,
    schemaVersion: 1,
    repo,
    issueKey: key,
    ...(typeof issue === 'object'
      ? {
          issueVersion: issueVersion(issue),
          criteriaVersion: issue.criteriaVersion || digest(issue.acceptanceCriteria),
          title: issue.title,
        }
      : {}),
    sequence: (previous.at(-1)?.sequence || 0) + 1,
    eventId: randomUUID(),
    at: new Date().toISOString(),
  }
  const dir = ensureDir(location(repo, key))
  const path = join(dir, `${String(event.sequence).padStart(12, '0')}-${event.eventId}.json`)
  const fd = openSync(path, 'wx', 0o444)
  try {
    writeFileSync(fd, `${JSON.stringify(event)}\n`)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  const directory = openSync(dir, 'r')
  try {
    fsyncSync(directory)
  } finally {
    closeSync(directory)
  }
  return event
}
export function replayIssue(events, issue) {
  const attempts = new Map(),
    actions = new Map()
  for (const event of events) {
    if (event.attemptId) {
      const attempt = attempts.get(event.attemptId) || { attemptId: event.attemptId, events: [] }
      attempt.events.push(event)
      if (event.type === 'attempt.resumed') {
        delete attempt.outcome
        delete attempt.failureCategory
        delete attempt.reason
      }
      if (event.type === 'attempt.executing') {
        delete attempt.implementation
        delete attempt.evaluation
      }
      if (event.type.startsWith('attempt.')) Object.assign(attempt, event)
      attempts.set(event.attemptId, attempt)
    }
    if (event.actionId && event.type.startsWith('action.')) {
      const action = actions.get(event.actionId) || {}
      actions.set(event.actionId, { ...action, ...event })
    }
  }
  const all = [...attempts.values()]
  const current = issue ? all.filter((a) => a.issueVersion === issueVersion(issue)) : all
  const last = current.at(-1)
  const unresolvedActions = [...actions.values()].filter(
    (a) => a.type !== 'action.result' && a.type !== 'action.absent',
  )
  let status = last?.outcome || (last ? 'interrupted' : 'pending')
  if (issue && !current.length && all.length) {
    const prior = all.at(-1)
    status =
      prior.criteriaVersion !== (issue.criteriaVersion || digest(issue.acceptanceCriteria))
        ? 'criteria-changed'
        : prior.title !== issue.title
          ? 'renamed'
          : 'version-changed'
  }
  if (unresolvedActions.length) status = 'action-uncertain'
  return {
    status,
    attempts: all,
    currentAttempts: current,
    unresolvedActions,
    lifetime: {
      attempts: all.filter((a) => a.events.some((e) => e.type === 'attempt.started')).length,
      costUsd: all.reduce((n, a) => n + (a.costUsd || 0), 0),
      durationMs: all.reduce((n, a) => n + (a.durationMs || 0), 0),
    },
  }
}
export const stableActionId = ({ attemptId, kind, cycle = 0 }) => digest({ attemptId, kind, cycle })
export async function runAction(
  { repo, issue, attemptId, actionId, kind, input = {}, reconcile },
  perform,
) {
  const events = readEvents(repo, issue.key).filter((e) => e.actionId === actionId)
  const identity = digest({ kind, input })
  if (events.some((e) => e.inputDigest !== identity))
    throw Object.assign(Error('action identity payload changed'), {
      code: 'action-identity-changed',
    })
  const last = events.at(-1)
  if (last?.type === 'action.result') return last.result
  const fields = { attemptId, actionId, kind, input, inputDigest: identity }
  if (last && last.type !== 'action.absent') {
    const result = await reconcile?.(last)
    if (result?.status === 'confirmed') {
      appendEvent(repo, issue, {
        type: 'action.result',
        ...fields,
        result: result.result ?? null,
        reconciled: true,
      })
      return result.result
    }
    if (result?.status === 'absent')
      appendEvent(repo, issue, {
        type: 'action.absent',
        ...fields,
        reconciled: true,
        evidence: result.evidence,
      })
    else
      throw Object.assign(
        Error(`action uncertain: ${kind} (${actionId}); reconcile its result before retrying`),
        { code: 'action-uncertain', actionId },
      )
  }
  appendEvent(repo, issue, { type: 'action.intent', ...fields })
  try {
    const result = await perform()
    appendEvent(repo, issue, { type: 'action.result', ...fields, result: result ?? null })
    return result
  } catch (error) {
    appendEvent(repo, issue, {
      type: 'action.uncertain',
      ...fields,
      reason: error.message,
      failureCategory: error.code || 'action-uncertain',
    })
    throw Object.assign(Error(`action uncertain: ${kind}: ${error.message}`), {
      code: 'action-uncertain',
      actionId,
      cause: error,
    })
  }
}
