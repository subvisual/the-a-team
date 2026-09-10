import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { assertCurrentContext, contextPath, selectTaskContext } from '../context.mjs'
import { evaluateAcceptance } from '../obligations.mjs'

const text = (value) => typeof value === 'string' && value.trim().length > 0
const positive = (value) => Number.isSafeInteger(value) && value > 0
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

export function issueContractSource(issue = {}) {
  return {
    id: `issue:${issue.key || issue.number || 'unkeyed'}`,
    revision: hash({
      key: issue.key ?? null,
      number: issue.number ?? null,
      title: issue.title ?? '',
      body: issue.body ?? '',
      acceptanceCriteria: issue.acceptanceCriteria || [],
    }),
    requirementVersion: positive(issue.requirementVersion) ? issue.requirementVersion : 1,
  }
}

function inside(root, path) {
  const rel = relative(root, path)
  return rel !== '..' && !rel.startsWith(`..${sep}`)
}

function definition(requirement) {
  return (requirement?.obligations || [])
    .map((obligation) => ({
      id: obligation.id,
      statement: obligation.statement,
      category: obligation.category,
      method: obligation.method,
      requiredStage: obligation.requiredStage,
      benchmark: obligation.benchmark,
    }))
    .sort((left, right) => left.id.localeCompare(right.id))
}

function ledgerAuthority({ root, source, issue }) {
  if (basename(source.path) !== 'acceptance.json') return null
  let ledger
  try {
    ledger = JSON.parse(source.content)
  } catch (error) {
    throw new Error(`test adequacy authority: invalid ${source.path}: ${error.message}`)
  }
  if (!positive(ledger?.revision))
    throw new Error(`test adequacy authority: ${source.path} has no positive ledger revision`)

  const physicalRoot = realpathSync(root)
  const featureRoot = resolve(physicalRoot, dirname(source.path))
  const historyDir = resolve(featureRoot, 'acceptance-history')
  if (!inside(physicalRoot, historyDir))
    throw new Error('test adequacy authority: acceptance history escapes target')
  const history = new Map()
  if (existsSync(historyDir)) {
    const physicalHistory = realpathSync(historyDir)
    if (!inside(physicalRoot, physicalHistory))
      throw new Error('test adequacy authority: acceptance history escapes target')
    for (const name of readdirSync(physicalHistory).sort()) {
      if (!/^[1-9][0-9]*\.json$/.test(name))
        throw new Error(`test adequacy authority: unexpected history file ${name}`)
      const number = Number(name.slice(0, -5))
      const path = join(dirname(source.path), 'acceptance-history', name)
      const record = JSON.parse(readFileSync(contextPath(root, path), 'utf8'))
      if (record?.revision !== number)
        throw new Error(`test adequacy authority: ${name} revision does not match filename`)
      history.set(number, record)
    }
  }
  if (history.size !== ledger.revision - 1)
    throw new Error(
      'test adequacy authority: revised ledger requires complete acceptance history',
    )
  for (let revision = 1; revision < ledger.revision; revision += 1) {
    const prior = history.get(revision)
    if (!prior)
      throw new Error(`test adequacy authority: missing acceptance-history/${revision}.json`)
    const result = evaluateAcceptance(prior, {
      historical: true,
      previousLedger: history.get(revision - 1),
      history: [...history.entries()]
        .filter(([number]) => number < revision)
        .map(([, record]) => record),
    })
    const failure = result.diagnostics.find((item) => item.severity === 'error')
    if (failure)
      throw new Error(`test adequacy authority: invalid history revision ${revision}: ${failure.message}`)
  }
  const previous = history.get(ledger.revision - 1)
  const currentResult = evaluateAcceptance(ledger, {
    historical: true,
    previousLedger: previous,
    history: [...history.values()],
  })
  const failure = currentResult.diagnostics.find((item) => item.severity === 'error')
  if (failure) throw new Error(`test adequacy authority: invalid current ledger: ${failure.message}`)

  const scopedIds = new Set(issue.requirements || [])
  const requirements = (ledger.requirements || []).filter(
    (requirement) => !scopedIds.size || scopedIds.has(requirement.id),
  )
  if (scopedIds.size && requirements.length !== scopedIds.size)
    throw new Error('test adequacy authority: issue requirements are absent from the ledger')
  const ledgers = [
    ...[...history.entries()].sort(([left], [right]) => left - right).map(([, item]) => item),
    ledger,
  ]
  const authorizedChanges = []
  for (const current of requirements) {
    for (let index = 1; index < ledgers.length; index += 1) {
      const before = ledgers[index - 1].requirements?.find(
        (requirement) => requirement.id === current.id,
      )
      const introduced = ledgers[index].requirements?.find(
        (requirement) => requirement.id === current.id,
      )
      if (
        before &&
        introduced?.version === current.version &&
        introduced.version === before.version + 1 &&
        !isDeepStrictEqual(definition(before), definition(introduced)) &&
        introduced.decision?.authorized === true &&
        text(introduced.decision.reference)
      ) {
        authorizedChanges.push({
          requirementId: current.id,
          fromVersion: before.version,
          toVersion: introduced.version,
          authorization: introduced.decision.reference,
        })
        break
      }
    }
  }
  return {
    requirementVersions: [...new Set(requirements.map((item) => item.version))].sort(
      (a, b) => a - b,
    ),
    authorizedChanges,
  }
}

function finish(document) {
  return { ...document, digest: hash(document) }
}

export function buildTestAdequacyAuthority({ root, issue, selection }) {
  const fallback = issueContractSource(issue)
  const requirementSources = selection?.selected?.filter((source) => source.kind === 'requirement') || []
  if (!requirementSources.length)
    return finish({
      schemaVersion: 1,
      issueSource: fallback,
      contextIndexRevision: selection?.indexRevision || null,
      sources: [
        {
          id: fallback.id,
          revision: fallback.revision,
          path: null,
          requirementVersions: [fallback.requirementVersion],
          authorizedChanges: [],
        },
      ],
    })

  const sources = requirementSources.map((source) => {
    if (typeof source.content !== 'string')
      throw new Error(`test adequacy authority: unreadable requirement source: ${source.id}`)
    const actualRevision = createHash('sha256').update(source.content).digest('hex')
    if (actualRevision !== source.actualRevision)
      throw new Error(`test adequacy authority: requirement source changed: ${source.id}`)
    const ledger = ledgerAuthority({ root, source, issue })
    return {
      id: source.id,
      revision: source.actualRevision,
      path: source.path,
      requirementVersions: ledger?.requirementVersions || [fallback.requirementVersion],
      authorizedChanges: ledger?.authorizedChanges || [],
    }
  })
  return finish({
    schemaVersion: 1,
    issueSource: fallback,
    contextIndexRevision: selection.indexRevision,
    sources,
  })
}

export function deriveTestAdequacyAuthority({ root, policy, issue, paths = [] }) {
  const selection = selectTaskContext({
    root,
    policy,
    task: { ...issue, paths: [...(issue.paths || []), ...paths] },
  })
  if (selection.status !== 'unconfigured') assertCurrentContext(selection)
  return buildTestAdequacyAuthority({ root, issue, selection })
}

export function validateTestAdequacyAuthority(authority, issue) {
  if (
    authority?.schemaVersion !== 1 ||
    !Array.isArray(authority.sources) ||
    !authority.sources.length
  )
    throw new Error('reviewer test adequacy: supervisor requirement authority is required')
  const { digest, ...document } = authority
  if (digest !== hash(document))
    throw new Error('reviewer test adequacy: supervisor requirement authority digest changed')
  const expectedIssue = issueContractSource(issue)
  if (!isDeepStrictEqual(authority.issueSource, expectedIssue))
    throw new Error('reviewer test adequacy: issue contract source changed')
  if (
    authority.contextIndexRevision === null &&
    (authority.sources.length !== 1 ||
      authority.sources[0].id !== expectedIssue.id ||
      authority.sources[0].revision !== expectedIssue.revision)
  )
    throw new Error('reviewer test adequacy: standalone source is not the exact issue contract')
  const ids = new Set()
  for (const source of authority.sources) {
    if (!text(source.id) || !text(source.revision))
      throw new Error('reviewer test adequacy: malformed supervisor requirement source')
    if (ids.has(source.id))
      throw new Error('reviewer test adequacy: duplicate supervisor requirement source')
    ids.add(source.id)
    if (
      !Array.isArray(source.requirementVersions) ||
      !source.requirementVersions.length ||
      source.requirementVersions.some((value) => !positive(value)) ||
      !Array.isArray(source.authorizedChanges)
    )
      throw new Error('reviewer test adequacy: malformed requirement version authority')
    for (const change of source.authorizedChanges)
      if (
        !text(change?.requirementId) ||
        !positive(change?.fromVersion) ||
        !positive(change?.toVersion) ||
        change.toVersion !== change.fromVersion + 1 ||
        !text(change?.authorization)
      )
        throw new Error('reviewer test adequacy: malformed authorized requirement change')
  }
  return authority
}

export function validateAdequacyMapAuthority(entries, { authority, issue }) {
  validateTestAdequacyAuthority(authority, issue)
  for (const entry of entries) {
    const source = authority.sources.find(
      (candidate) =>
        candidate.id === entry.requirementSource.id &&
        candidate.revision === entry.requirementSource.revision,
    )
    if (!source)
      throw new Error(
        `reviewer test adequacy: requirement source ${entry.requirementSource.id}@${entry.requirementSource.revision} is not current supervisor authority`,
      )
    const baseline = entry.baselineExpectations
    if (!source.requirementVersions.includes(baseline.requirementVersion))
      throw new Error(
        `reviewer test adequacy: requirement version ${baseline.requirementVersion} is not current source authority`,
      )
    if (baseline.status === 'preserved' && baseline.authorization.trim())
      throw new Error('reviewer test adequacy: preserved baseline cannot claim change authorization')
    if (baseline.status === 'changed-authorized') {
      const accepted = source.authorizedChanges.some(
        (change) =>
          change.toVersion === baseline.requirementVersion &&
          change.authorization === baseline.authorization,
      )
      if (!accepted)
        throw new Error(
          'reviewer test adequacy: changed baseline lacks an actual versioned authorized requirement change',
        )
    }
  }
  return entries
}
