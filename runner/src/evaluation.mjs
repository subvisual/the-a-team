// Evaluation records are evidence, not authority to launch agents or accept a release.
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  existsSync,
  openSync,
  closeSync,
  fsyncSync,
  renameSync,
  unlinkSync,
} from 'node:fs'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

export const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
export const json = (value) => JSON.stringify(value, null, 2) + '\n'
const fail = (message) => {
  throw Error(message)
}
const text = (value, field) => {
  if (typeof value !== 'string' || !value.trim()) fail(`${field} must be nonempty`)
}
const id = (value, field) => {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(value || ''))
    fail(`${field} must be a safe identifier`)
}
const hash = (value, field) => {
  if (!/^[a-f0-9]{64}$/.test(value || '')) fail(`${field} must be a SHA-256 digest`)
}
const sha = (value, field) => {
  if (!/^[a-f0-9]{40}$/.test(value || '')) fail(`${field} must be a full Git revision`)
}
const oneOf = (value, values, field) => {
  if (!values.includes(value)) fail(`Invalid ${field}`)
}
function artifact(value, field) {
  text(value?.id, `${field}.id`)
  hash(value?.digest, `${field}.digest`)
}
export function readCatalog() {
  const catalog = JSON.parse(readFileSync(new URL('../evaluation/catalog.json', import.meta.url)))
  if (catalog.schemaVersion !== 1) fail('Unsupported evaluation catalog schema')
  return catalog
}
export function validateVersions(versions, agent = false) {
  if (!versions) fail('versions required')
  sha(versions.harnessRevision, 'harnessRevision')
  hash(versions.harnessDigest, 'harnessDigest')
  hash(versions.skillBundleDigest, 'skillBundleDigest')
  text(versions.model, 'model')
  if (agent && /^(not-used|not-run|unknown|pending|TBD)/i.test(versions.model))
    fail('Agent model must identify the actual model')
  text(versions.cli?.name, 'cli.name')
  text(versions.cli?.version, 'cli.version')
  sha(versions.sourceCommit, 'sourceCommit')
  for (const field of ['configuration', 'input', 'rubric']) artifact(versions[field], field)
}
function assessment(value, field) {
  text(value?.graderId, `${field}.graderId`)
  text(value?.rubricId, `${field}.rubricId`)
  oneOf(value?.verdict, ['accept', 'reject', 'uncertain'], `${field}.verdict`)
  text(value.rationale, `${field}.rationale`)
}
function validateTrial(record) {
  if (record?.schemaVersion !== 1 || record.kind !== 'agent-trial')
    fail('Unsupported trial schema/kind')
  for (const field of ['id', 'groupId', 'scenarioId']) id(record[field], field)
  if (typeof record.synthetic !== 'boolean')
    fail('synthetic must explicitly identify data provenance')
  for (const field of ['trialNumber', 'scenarioVersion'])
    if (!Number.isInteger(record[field]) || record[field] < 1) fail(`${field} must be positive`)
  validateVersions(record.versions, true)
  oneOf(record.outcome?.status, ['passed', 'failed', 'blocked'], 'outcome.status')
  text(record.outcome.reason, 'outcome.reason')
  if (!Array.isArray(record.trace?.events) || !record.trace.events.length)
    fail('trace.events must retain observations')
  for (const event of record.trace.events) {
    text(event?.type, 'trace.event.type')
    text(event?.detail, 'trace.event.detail')
  }
  oneOf(record.subjective?.status, ['not-scored', 'scored'], 'subjective.status')
  if (!Array.isArray(record.subjective.assessments)) fail('subjective.assessments required')
  if ((record.subjective.status === 'scored') !== record.subjective.assessments.length > 0)
    fail('subjective status must match assessments')
  for (const a of record.subjective.assessments) assessment(a, 'subjective.assessment')
}
const trialParts = ['record', 'outcome', 'trace', 'subjective']
function durableWrite(path, bytes) {
  const descriptor = openSync(path, 'wx')
  try {
    writeFileSync(descriptor, bytes)
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
}
function syncDirectory(path) {
  const descriptor = openSync(path, 'r')
  try {
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
}
function publishedTrial(directory) {
  try {
    const parts = Object.fromEntries(
      trialParts.map((part) => [part, JSON.parse(readFileSync(join(directory, `${part}.json`)))]),
    )
    const trial = {
      ...parts.record,
      outcome: parts.outcome,
      trace: parts.trace,
      subjective: parts.subjective,
    }
    validateTrial(trial)
    return trial
  } catch (error) {
    throw Error(
      `Incomplete or invalid published trial requires reconciliation: ${directory}: ${error.message}`,
    )
  }
}
export function saveAgentTrial(root, record) {
  validateTrial(record)
  const requestBytes = json(record) // Reject unserializable input before any filesystem write.
  const { outcome, trace, subjective, ...metadata } = record
  const parts = { record: metadata, outcome, trace, subjective }
  const bytes = Object.fromEntries(trialParts.map((part) => [part, json(parts[part])]))
  mkdirSync(root, { recursive: true })
  const lockPath = join(root, '.agent-trial-writer.lock')
  let lock
  try {
    lock = openSync(lockPath, 'wx')
  } catch (error) {
    if (error.code === 'EEXIST')
      fail('Trial writer active or interrupted; inspect retained import evidence before retrying')
    throw error
  }
  const importId = randomUUID(),
    attempt = join(root, 'trial-imports', importId)
  const owner = {
    schemaVersion: 1,
    importId,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    trialId: record.id,
    groupId: record.groupId,
    trialNumber: record.trialNumber,
    attempt,
  }
  const base = join(root, 'agent-trials'),
    directory = join(base, record.id)
  const release = () => {
    if (JSON.parse(readFileSync(lockPath)).importId !== importId)
      fail('Trial writer lock changed; reconciliation required')
    unlinkSync(lockPath)
    syncDirectory(root)
  }
  const reject = (message) => {
    throw Object.assign(Error(message), { code: 'evaluation-trial-rejected' })
  }
  try {
    try {
      writeFileSync(lock, json(owner))
      fsyncSync(lock)
    } finally {
      closeSync(lock)
    }
    mkdirSync(attempt, { recursive: true })
    durableWrite(join(attempt, 'intent.json'), json(owner))
    durableWrite(join(attempt, 'request.json'), requestBytes)
    syncDirectory(attempt)
    if (existsSync(base))
      for (const name of readdirSync(base)) {
        const previous = publishedTrial(join(base, name))
        if (previous.groupId !== record.groupId) continue
        if (previous.trialNumber === record.trialNumber) reject('group trialNumber already exists')
        if (
          previous.scenarioId !== record.scenarioId ||
          previous.scenarioVersion !== record.scenarioVersion ||
          previous.synthetic !== record.synthetic ||
          !isDeepStrictEqual(previous.versions, record.versions)
        )
          reject(
            'group versions and input must remain fixed; start a new group for changed conditions',
          )
      }
    if (existsSync(directory)) reject('trial id already exists')
    const candidate = join(attempt, 'candidate')
    mkdirSync(candidate)
    for (const part of trialParts) durableWrite(join(candidate, `${part}.json`), bytes[part])
    syncDirectory(candidate)
    mkdirSync(base, { recursive: true })
    // One local-filesystem rename publishes all parts together. The writer lock
    // covers duplicate checks and publication; staging is never scanned as a trial.
    renameSync(candidate, directory)
    syncDirectory(base)
    durableWrite(
      join(attempt, 'result.json'),
      json({
        schemaVersion: 1,
        status: 'published',
        importId,
        directory,
        digests: Object.fromEntries(trialParts.map((part) => [part, digest(bytes[part])])),
      }),
    )
    syncDirectory(attempt)
    release()
    return Object.fromEntries(trialParts.map((part) => [part, join(directory, `${part}.json`)]))
  } catch (error) {
    if (error.code === 'evaluation-trial-rejected') {
      durableWrite(
        join(attempt, 'result.json'),
        json({ schemaVersion: 1, status: 'rejected', importId, reason: error.message }),
      )
      syncDirectory(attempt)
      release()
      throw error
    }
    // Never guess whether an interrupted publication finished, reclaim a stale
    // lock, delete staged bytes, or overwrite a completed/uncertain receipt.
    try {
      if (existsSync(attempt) && !existsSync(join(attempt, 'result.json')))
        durableWrite(
          join(attempt, 'result.json'),
          json({ schemaVersion: 1, status: 'uncertain', importId, reason: error.message }),
        )
    } catch {
      /* Keep the lock and any available bytes when storage itself fails. */
    }
    throw Error(
      `Trial import uncertain; retained writer lock and evidence require reconciliation: ${error.message}`,
    )
  }
}
export function saveReconciliation(root, record) {
  if (record?.schemaVersion !== 1) fail('Unsupported reconciliation schema')
  id(record.id, 'id')
  id(record.trialId, 'trialId')
  if (!existsSync(join(root, 'agent-trials', record.trialId, 'record.json')))
    fail('Referenced trial must exist')
  if (typeof record.synthetic !== 'boolean') fail('synthetic must be explicit')
  const trial = publishedTrial(join(root, 'agent-trials', record.trialId))
  if (record.synthetic !== trial.synthetic)
    fail('Reconciliation synthetic provenance must match its trial')
  if (!Array.isArray(record.assessments) || record.assessments.length < 2)
    fail('Retain at least two individual assessments')
  const graders = new Set()
  for (const a of record.assessments) {
    assessment(a, 'assessment')
    if (graders.has(a.graderId)) fail('Duplicate grader')
    graders.add(a.graderId)
  }
  if (!Array.isArray(record.rubricRevisions) || !record.rubricRevisions.length)
    fail('rubric revisions required')
  const firstRubric = record.rubricRevisions[0]
  if (
    firstRubric?.id !== trial.versions.rubric.id ||
    firstRubric?.digest !== trial.versions.rubric.digest
  )
    fail('Rubric revision chain must start at the exact trial rubric')
  const rubrics = new Set()
  let previousRubric = null
  for (const rubric of record.rubricRevisions) {
    artifact(rubric, 'rubric')
    text(rubric.text, 'rubric.text')
    if (rubric.digest !== digest(rubric.text)) fail('rubric digest does not match retained text')
    if (rubrics.has(rubric.id) || rubric.supersedes !== previousRubric)
      fail('Invalid rubric revision chain: each revision must supersede its immediate predecessor')
    rubrics.add(rubric.id)
    previousRubric = rubric.id
  }
  if (
    !record.rubricRevisions.some(
      (rubric) =>
        rubric.id === trial.versions.rubric.id && rubric.digest === trial.versions.rubric.digest,
    )
  )
    fail('Reconciliation must retain the exact trial rubric')
  for (const a of record.assessments)
    if (!rubrics.has(a.rubricId)) fail('Assessment references unknown rubric')
  if (
    !Array.isArray(record.examples) ||
    !record.examples.some((e) => e.disposition === 'accepted') ||
    !record.examples.some((e) => e.disposition === 'rejected')
  )
    fail('Retain accepted and rejected calibration examples')
  const examples = new Set()
  for (const e of record.examples) {
    id(e.id, 'example.id')
    if (examples.has(e.id)) fail('Duplicate example')
    examples.add(e.id)
    oneOf(e.disposition, ['accepted', 'rejected'], 'example.disposition')
    if (!rubrics.has(e.rubricId)) fail('Example references unknown rubric')
    hash(e.inputDigest, 'example.inputDigest')
    hash(e.outputDigest, 'example.outputDigest')
    for (const field of ['input', 'output']) {
      if (typeof e[field] !== 'string') fail(`example.${field} must retain inspectable text`)
      if (digest(e[field]) !== e[`${field}Digest`])
        fail(`example.${field} does not match retained digest`)
    }
    text(e.rationale, 'example.rationale')
  }
  text(record.resolution?.actor, 'resolution.actor')
  text(record.resolution.rationale, 'resolution.rationale')
  oneOf(record.resolution.verdict, ['accept', 'reject', 'uncertain'], 'resolution.verdict')
  if (!rubrics.has(record.resolution.rubricId)) fail('Resolution references unknown rubric')
  if ('average' in record.resolution || 'score' in record.resolution)
    fail('resolution must retain a reasoned verdict, not an average')
  const dir = join(root, 'calibration')
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `${record.id}.json`)
  writeFileSync(path, json(record), { flag: 'wx' })
  return path
}
