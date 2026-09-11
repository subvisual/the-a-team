// Deterministic validation of project-authored research. This preserves recorded
// uncertainty and authority; it does not infer demand, run studies or make decisions.
import { readFileSync, readdirSync, existsSync, realpathSync, statSync } from 'node:fs'
import { resolve, relative, isAbsolute, basename, dirname, join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { ACCEPTANCE_STAGES } from './obligations.mjs'
import { contextPath, contentRevision } from './context.mjs'

export const ASSUMPTIONS_SCHEMA_VERSION = 1
export const RESEARCH_PLAN_PATH = 'docs/product/research-plan.md'
const text = (value) => typeof value === 'string' && value.trim().length > 0
const object = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const list = (value) => (Array.isArray(value) ? value : [])
const version = (value) => Number.isSafeInteger(value) && value > 0
const stageName = (stage) =>
  ({ dev: 'implementation', pr: 'verification' })[stage] || stage
const rank = (stage) => ACCEPTANCE_STAGES.indexOf(stageName(stage))
const id = (prefix, value) =>
  new RegExp(`^${prefix}-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$`).test(value || '')
const pathValue = (value) =>
  text(value) && !isAbsolute(value) && !value.split(/[\\/]/).includes('..')
const immutableFields = [
  'statement',
  'risk',
  'loadBearing',
  'features',
  'dependentDecision',
  'requiredStage',
  'disproof',
  'cheapestProbe',
]
const selected = (record, featureSlug) =>
  !featureSlug ||
  list(record?.features).some((slug) => slug === '*' || slug === featureSlug)
const canonical = (value) =>
  JSON.stringify(value, (_, item) =>
    object(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item,
  )
const ledgerHash = (value) => contentRevision(canonical(value))
const priorReports = (manifest) =>
  [
    ...Object.values(manifest.phases || {}).map((phase) => phase?.assumptions),
    ...Object.values(manifest.milestones || {}).map(
      (milestone) => milestone?.assumptions,
    ),
    ...list(manifest.research_decisions).map((record) => record?.research),
    ...list(manifest.event_history).map((event) => event?.result?.research),
  ].filter(
    (report) => report?.source && (report.recordsValid === true || report.ok === true),
  )
const validRecords = (diagnostics) =>
  !diagnostics.some(
    (entry) => entry.severity === 'error' && entry.category !== 'advancement',
  )

export function evaluateAssumptions(
  ledger,
  {
    stage = 'discovery',
    featureSlug,
    previousLedger,
    history = [],
    historical = false,
  } = {},
) {
  const diagnostics = [],
    assumptions = [],
    outcomes = []
  const add = (assumptionId, field, message, severity = 'error', category = 'record') =>
    diagnostics.push({
      code: 'research-assumption',
      severity,
      assumptionId,
      field,
      category,
      message: `${assumptionId || 'research'}: ${field}: ${message}`,
    })
  const requireValue = (valid, aid, field, message) => {
    if (!valid) add(aid, field, message)
  }
  const decision = (record, aid, field) => {
    requireValue(object(record), aid, field, 'explicit decision required')
    for (const key of ['actor', 'reference', 'rationale', 'consequence'])
      requireValue(
        text(record?.[key]),
        aid,
        `${field}.${key}`,
        'recorded decision value required',
      )
    requireValue(
      record?.authorized === true,
      aid,
      `${field}.authorized`,
      'existing explicit authorization required',
    )
  }
  requireValue(
    ledger?.schemaVersion === ASSUMPTIONS_SCHEMA_VERSION,
    null,
    'schemaVersion',
    'expected 1',
  )
  requireValue(version(ledger?.revision), null, 'revision', 'positive integer required')
  requireValue(
    Array.isArray(ledger?.assumptions),
    null,
    'assumptions',
    'explicit assumption array required',
  )
  requireValue(rank(stage) >= 0, null, 'stage', `unknown stage ${stage}`)
  const byId = new Map()
  for (const record of list(ledger?.assumptions)) {
    const aid = record?.id
    if (!object(record)) {
      add(null, 'assumption', 'object required')
      continue
    }
    requireValue(id('ASM', aid), aid, 'id', 'stable ASM-... ID required')
    requireValue(!byId.has(aid), aid, 'id', 'duplicate assumption ID')
    byId.set(aid, record)
    requireValue(
      version(record.version),
      aid,
      'version',
      'positive assumption version required',
    )
    for (const field of ['statement', 'dependentDecision', 'disproof', 'uncertainty'])
      requireValue(
        text(record[field]),
        aid,
        field,
        'explicit authored value required; retain uncertainty',
      )
    requireValue(
      ['value', 'usability', 'feasibility', 'business-viability'].includes(record.risk),
      aid,
      'risk',
      'value, usability, feasibility or business-viability required',
    )
    requireValue(
      typeof record.loadBearing === 'boolean',
      aid,
      'loadBearing',
      'explicit boolean required',
    )
    requireValue(
      Array.isArray(record.features) &&
        record.features.length > 0 &&
        record.features.every(text) &&
        new Set(record.features).size === record.features.length,
      aid,
      'features',
      'feature slug list or ["*"] for a global assumption required',
    )
    requireValue(
      rank(record.requiredStage) >= 0,
      aid,
      'requiredStage',
      'known decision stage required',
    )
    requireValue(
      ['strong', 'moderate', 'directional', 'hypothesis'].includes(record.confidence),
      aid,
      'confidence',
      'explicit supported confidence required',
    )
    requireValue(
      object(record.cheapestProbe) &&
        text(record.cheapestProbe.method) &&
        text(record.cheapestProbe.description),
      aid,
      'cheapestProbe',
      'method and description required',
    )
    if (record.cheapestProbe?.evidenceProducingStage !== undefined)
      requireValue(
        rank(record.cheapestProbe.evidenceProducingStage) >= 0 &&
          rank(record.cheapestProbe.evidenceProducingStage) < rank(record.requiredStage),
        aid,
        'cheapestProbe.evidenceProducingStage',
        'known evidence-producing stage before validation is due required',
      )
    requireValue(
      object(record.owner),
      aid,
      'owner',
      'accountable owner object required; use null actor/role while unresolved',
    )
    const ownerResolved = text(record.owner?.actor) || text(record.owner?.role)
    const applicable = selected(record, featureSlug)
    const effectiveRequiredStage =
      record.disposition === 'defer' &&
      rank(record.decision?.nextDecisionStage) > rank(record.requiredStage)
        ? record.decision.nextDecisionStage
        : record.requiredStage
    const due =
      !historical &&
      applicable &&
      record.loadBearing === true &&
      rank(stage) >= rank(effectiveRequiredStage)
    if (!ownerResolved)
      add(
        aid,
        'owner',
        'accountable owner unresolved',
        due ? 'error' : 'warning',
        'advancement',
      )
    requireValue(
      ['pending', 'proceed', 'defer', 'no-go', 'reshape'].includes(record.disposition),
      aid,
      'disposition',
      'pending, proceed, defer, no-go or reshape required',
    )
    requireValue(
      Array.isArray(record.evidence),
      aid,
      'evidence',
      'explicit evidence array required; [] preserves absence',
    )
    const evidenceIds = new Set()
    for (const evidence of list(record.evidence)) {
      requireValue(
        id('EVD', evidence?.id) && !evidenceIds.has(evidence?.id),
        aid,
        'evidence.id',
        'unique stable EVD-... ID required',
      )
      evidenceIds.add(evidence?.id)
      requireValue(
        version(evidence?.assumptionVersion) &&
          evidence.assumptionVersion <= record.version,
        aid,
        'evidence.assumptionVersion',
        'original assumption version required',
      )
      for (const field of ['reference', 'method', 'actor'])
        requireValue(
          text(evidence?.[field]),
          aid,
          `evidence.${field}`,
          'recorded source provenance required',
        )
      requireValue(
        pathValue(evidence?.path),
        aid,
        'evidence.path',
        'actual source snapshot path relative to target required',
      )
      requireValue(
        /^[a-f0-9]{64}$/.test(evidence?.sha256 || ''),
        aid,
        'evidence.sha256',
        'source SHA-256 required',
      )
      requireValue(
        ['observed', 'synthetic', 'declared-default', 'inference'].includes(
          evidence?.origin,
        ),
        aid,
        'evidence.origin',
        'observed, synthetic, declared-default or inference required',
      )
      requireValue(
        ['support', 'contradict', 'inconclusive'].includes(evidence?.result),
        aid,
        'evidence.result',
        'support, contradict or inconclusive required',
      )
    }
    const currentEvidence = list(record.evidence).filter(
      (entry) => object(entry) && entry.assumptionVersion === record.version,
    )
    if (record.disposition !== 'pending') decision(record.decision, aid, 'decision')
    if (record.disposition === 'proceed') {
      requireValue(
        currentEvidence.some(
          (entry) =>
            entry.result === 'support' &&
            entry.method === record.cheapestProbe?.method &&
            entry.origin === 'observed',
        ),
        aid,
        'evidence',
        'proceed requires observed supporting current-version evidence using the declared method; synthetic results, inference and confidence alone are not validation',
      )
      for (const evidence of currentEvidence.filter(
        (entry) => entry.result === 'contradict',
      ))
        requireValue(
          list(record.decision?.contradictionIds).includes(evidence.id),
          aid,
          'decision.contradictionIds',
          `explicitly address contradictory source ${evidence.id} in the decision rationale`,
        )
    }
    if (record.disposition === 'defer') {
      requireValue(
        rank(record.decision?.nextDecisionStage) > rank(record.requiredStage),
        aid,
        'decision.nextDecisionStage',
        'authorized deferral requires a decision stage after the original required stage',
      )
      if (
        due &&
        rank(record.decision?.nextDecisionStage) >= 0 &&
        rank(stage) >= rank(record.decision.nextDecisionStage)
      )
        add(
          aid,
          'decision.nextDecisionStage',
          `authorized deferral must be revisited at ${record.decision.nextDecisionStage}; its effective research deadline has been reached`,
          'error',
          'advancement',
        )
    }
    if (due && record.disposition === 'pending')
      add(
        aid,
        'evidence',
        `missing evidence or authorized deferral before ${record.requiredStage}: ${record.dependentDecision}`,
        'error',
        'advancement',
      )
    if (applicable && ['no-go', 'reshape'].includes(record.disposition))
      outcomes.push({
        assumptionId: aid,
        kind: record.disposition,
        dependentDecision: record.dependentDecision,
        decision: structuredClone(record.decision || null),
      })
    if (applicable)
      assumptions.push({
        ...structuredClone(record),
        effectiveRequiredStage,
        due,
        ownerResolved,
      })
  }
  if (previousLedger) {
    requireValue(
      ledger?.revision === previousLedger.revision + 1,
      null,
      'revision',
      'must follow previous research revision',
    )
    for (const prior of list(previousLedger.assumptions)) {
      const current = byId.get(prior?.id)
      if (!current) {
        add(
          prior?.id,
          'assumption',
          'assumption dropped; retain its explicit disposition',
        )
        continue
      }
      requireValue(
        current.version >= prior.version,
        current.id,
        'version',
        'assumption version cannot move backwards',
      )
      const changed = immutableFields.filter(
        (field) => !isDeepStrictEqual(prior[field], current[field]),
      )
      const reopened =
        ['no-go', 'reshape'].includes(prior.disposition) &&
        current.disposition !== prior.disposition
      if (changed.length || current.version !== prior.version || reopened) {
        requireValue(
          current.version === prior.version + 1,
          current.id,
          'version',
          'changed assumption requires the next version',
        )
        decision(current.changeDecision, current.id, 'changeDecision')
      }
    }
  }
  // Scan every prior revision, so removing an intermediate evidence entry never
  // permits reintroducing that ID with a different source or result later.
  for (const priorLedger of [...history, previousLedger].filter(Boolean))
    for (const prior of list(priorLedger.assumptions)) {
      const current = byId.get(prior?.id)
      if (!current) {
        add(prior?.id, 'history', 'historical assumption must remain present')
        continue
      }
      for (const evidence of list(prior.evidence)) {
        const retained = list(current.evidence).find(
          (entry) => entry?.id === evidence?.id,
        )
        requireValue(
          isDeepStrictEqual(evidence, retained),
          current.id,
          'evidence.history',
          `${evidence?.id} from revision ${priorLedger.revision} must retain its exact source/version/result provenance`,
        )
      }
    }
  const ok = !diagnostics.some((entry) => entry.severity === 'error')
  return {
    schemaVersion: 1,
    ok,
    recordsValid: validRecords(diagnostics),
    canAdvance: ok && outcomes.length === 0,
    stage: stageName(stage),
    diagnostics,
    assumptions,
    outcomes,
    pending: assumptions.filter((entry) => entry.disposition === 'pending'),
    deferred: assumptions.filter((entry) => entry.disposition === 'defer'),
    unresolvedOwners: assumptions
      .filter((entry) => !entry.ownerResolved)
      .map((entry) => entry.id),
  }
}

export function parseAssumptions(source) {
  let fence = null,
    capture = false,
    lines = []
  const blocks = []
  for (const line of source.split(/\r?\n/)) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/)
    if (fence) {
      if (
        marker &&
        marker[1][0] === fence[0] &&
        marker[1].length >= fence.length &&
        !marker[2].trim()
      ) {
        if (capture) blocks.push(JSON.parse(lines.join('\n')))
        fence = null
        capture = false
        lines = []
      } else if (capture) lines.push(line)
    } else if (marker) {
      fence = marker[1]
      capture = marker[2].trim() === 'ateam-assumptions'
    }
  }
  if (capture) throw new Error('Unterminated ateam-assumptions block')
  if (blocks.length !== 1)
    throw new Error(
      'Research plan requires exactly one top-level ateam-assumptions JSON block; preserve and index existing assumptions',
    )
  return blocks[0]
}

export async function validateFeatureAssumptions({
  featureDir,
  root,
  stage = 'discovery',
  manifest = {},
  path = RESEARCH_PLAN_PATH,
} = {}) {
  const diagnostics = [],
    history = [],
    receipts = []
  let source = null,
    ledger = null
  const add = (field, message, assumptionId = null) =>
    diagnostics.push({
      code: 'research-source',
      severity: 'error',
      assumptionId,
      field,
      message,
    })
  let featureSlug = manifest.slug
  try {
    root = realpathSync(root || manifest.repo)
    if (featureDir) {
      const physical = realpathSync(featureDir),
        rel = relative(root, physical)
      if (rel === '..' || rel.startsWith('../') || isAbsolute(rel))
        throw new Error('Feature directory escapes target')
      featureSlug ||= basename(physical)
    }
    if (!pathValue(path)) throw new Error('Research plan path must be target-relative')
    if (!existsSync(resolve(root, path))) {
      if (list(manifest.run_brief?.assumptions).length || priorReports(manifest).length)
        throw new Error(
          'Declared or previously consumed assumptions require retained versioned records in research-plan.md',
        )
      return {
        ...evaluateAssumptions(
          { schemaVersion: 1, revision: 1, assumptions: [] },
          { stage, featureSlug },
        ),
        source: null,
        history: [],
        applicability: 'not-declared',
      }
    }
    const bytes = readFileSync(contextPath(root, path), 'utf8')
    ledger = parseAssumptions(bytes)
    source = {
      path,
      sha256: contentRevision(bytes),
      revision: ledger?.revision,
      ledgerSha256: ledgerHash(ledger),
    }
    const historyDir = join(dirname(path), 'assumptions-history')
    if (existsSync(resolve(root, historyDir))) {
      const physical = realpathSync(resolve(root, historyDir)),
        rel = relative(root, physical)
      if (
        rel === '..' ||
        rel.startsWith('../') ||
        isAbsolute(rel) ||
        !statSync(physical).isDirectory()
      )
        throw new Error('Assumption history escapes target or is not a directory')
      for (const name of readdirSync(physical).sort()) {
        if (!/^[1-9][0-9]*\.json$/.test(name)) {
          add('history', `Unexpected history file ${name}`)
          continue
        }
        const path = join(historyDir, name)
        const bytes = readFileSync(contextPath(root, path), 'utf8')
        const record = JSON.parse(bytes),
          number = Number(name.slice(0, -5))
        if (record?.revision !== number || number >= ledger?.revision)
          add(
            'history',
            `${name}: history revision must match filename and precede current revision`,
          )
        history.push(record)
        receipts.push({
          path,
          sha256: contentRevision(bytes),
          revision: number,
          ledgerSha256: ledgerHash(record),
        })
      }
    }
    history.sort((a, b) => a?.revision - b?.revision)
    if (version(ledger?.revision) && history.length !== ledger.revision - 1)
      add(
        'history',
        'Research revision requires contiguous assumptions-history/<revision>.json snapshots',
      )
    for (const [index, record] of history.entries()) {
      if (record?.revision !== index + 1)
        add('history', `Missing assumptions-history/${index + 1}.json`)
      const report = evaluateAssumptions(record, {
        stage,
        featureSlug,
        historical: true,
        previousLedger: history[index - 1],
        history: history.slice(0, index),
      })
      diagnostics.push(
        ...report.diagnostics.filter((entry) => entry.severity === 'error'),
      )
    }
    for (const previous of priorReports(manifest)) {
      const retained = [source, ...receipts].find(
        (record) => record.revision === previous.source.revision,
      )
      if (
        previous.source.path !== path ||
        !retained ||
        retained.ledgerSha256 !== previous.source.ledgerSha256
      )
        add(
          'history',
          `Previously consumed research revision ${previous.source.revision} changed or disappeared; preserve its original ledger snapshot`,
        )
      for (const receipt of list(previous.history))
        if (
          !receipts.some(
            (current) =>
              current.path === receipt.path && current.sha256 === receipt.sha256,
          )
        )
          add(
            'history',
            `Previously consumed history ${receipt.path} changed or disappeared`,
          )
    }
    for (const record of [...history, ledger])
      for (const assumption of list(record?.assumptions))
        for (const evidence of list(assumption?.evidence)) {
          try {
            if (!pathValue(evidence?.path))
              throw new Error('Source path must be relative to target without traversal')
            const bytes = readFileSync(contextPath(root, evidence.path))
            if (contentRevision(bytes) !== evidence.sha256)
              throw new Error(
                `${evidence.path}: source sha256 changed or does not match authored evidence`,
              )
          } catch (error) {
            add('evidence.source', error.message, assumption?.id)
          }
        }
    const declared = list(manifest.run_brief?.assumptions)
    for (const entry of declared) {
      const aid = typeof entry === 'string' ? entry : entry?.id
      if (
        !list(ledger?.assumptions).some(
          (record) => record?.id === aid && selected(record, featureSlug),
        )
      )
        add(
          'run_brief.assumptions',
          `${aid || 'Unidentified assumption'} must reference an applicable ASM-... research record; do not invent a mapping`,
        )
    }
  } catch (error) {
    add('research-plan', error.message)
  }
  const report = evaluateAssumptions(ledger, {
    stage,
    featureSlug,
    previousLedger: history.at(-1),
    history,
  })
  report.diagnostics.push(...diagnostics)
  report.ok = !report.diagnostics.some((entry) => entry.severity === 'error')
  report.recordsValid = validRecords(report.diagnostics)
  report.canAdvance = report.ok && report.outcomes.length === 0
  return { ...report, source, history: receipts, applicability: 'declared' }
}
