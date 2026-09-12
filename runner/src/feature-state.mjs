import { validateFeatureDelivery } from './combined-verification.mjs'
import { createHash, randomUUID } from 'node:crypto'
import {
  readFileSync,
  writeFileSync,
  openSync,
  closeSync,
  fsyncSync,
  renameSync,
  unlinkSync,
  lstatSync,
  readdirSync,
  realpathSync,
  existsSync,
} from 'node:fs'
import { resolve, relative, isAbsolute, join } from 'node:path'
import { validateIssuesPhase } from './obligations-cli.mjs'
import { validateFeatureArtifacts } from './artifacts.mjs'
import { selectTaskContext, assertCurrentContext } from './context.mjs'
import * as refinement from './refinement.mjs'
import { credentialPath, readProjectConfig } from './policy.mjs'

// Deterministic feature state. This module records authorized work and evidence;
// it never invokes an agent, creates a PR, merges, deploys, or grants permission.
export const FEATURE_SCHEMA_VERSION = 2
export const FEATURE_PHASES = ['discovery', 'definition', 'design', 'spec', 'issues', 'dev', 'pr']
export const FEATURE_MILESTONES = [
  'implementation',
  'verification',
  'human_acceptance',
  'integration',
  'release',
  'product_validation',
]
const GATES = new Set(['definition', 'design', 'pr'])
const MODES = {
  'discovery-only': 'discovery',
  prototype: 'dev',
  'implementation-pr': 'pr',
  refinement: 'pr',
}
const PHASE_STAGE = { dev: 'implementation', pr: 'verification' }
const text = (value) => typeof value === 'string' && value.trim().length > 0
const copy = (value) => structuredClone(value)
const fail = (message, code = 'feature-invalid') => {
  throw Object.assign(new Error(message), { code })
}
const ready = (name, phase) =>
  GATES.has(name) ? phase.status === 'approved' : phase.status === 'complete'
const stageFor = (command) =>
  command.type === 'record-milestone'
    ? command.milestone?.replaceAll('_', '-')
    : PHASE_STAGE[command.phase] || command.phase
export { stageFor as featureStage }

function brief(input = {}) {
  const mode = input.mode || 'implementation-pr'
  if (!Object.hasOwn(MODES, mode)) fail(`Unknown run_brief.mode ${mode}`)
  const result = {
    purpose: null,
    fidelity: null,
    timebox: null,
    done_looks_like: null,
    outcome: null,
    assumptions: [],
    deliverables: [],
    required_verification: [],
    limits: {},
    ...copy(input),
    mode,
    stopping_point: input.stopping_point || MODES[mode],
  }
  if (
    !FEATURE_PHASES.includes(result.stopping_point) ||
    FEATURE_PHASES.indexOf(result.stopping_point) > FEATURE_PHASES.indexOf(MODES[mode])
  )
    fail('run_brief stopping point exceeds requested mode')
  for (const key of ['assumptions', 'deliverables', 'required_verification'])
    if (!Array.isArray(result[key])) fail(`run_brief.${key} must be an array`)
  if (!result.limits || typeof result.limits !== 'object' || Array.isArray(result.limits))
    fail('run_brief.limits must be an object')
  for (const [key, value] of Object.entries(result.limits))
    if (typeof value === 'number' && (!Number.isFinite(value) || value <= 0))
      fail(`run_brief.limits.${key} must be positive and finite`)
  return result
}

export function createFeature(input = {}) {
  if (!text(input.slug) || !text(input.repo)) fail('Feature slug and repo are required')
  const phases = Object.fromEntries(
    FEATURE_PHASES.map((name, index) => [
      name,
      {
        status: 'pending',
        attempts: 0,
        artifacts: [],
        bindings: {},
        decisions: [],
        blocking_flags: [],
        depends_on: index ? [FEATURE_PHASES[index - 1]] : [],
        ...(name === 'dev' ? { issues: {} } : {}),
      },
    ]),
  )
  return {
    slug: input.slug,
    prompt: input.prompt || '',
    repo: input.repo,
    base_branch: input.base_branch || 'main',
    branch: input.branch || `feature/${input.slug}`,
    schemaVersion: FEATURE_SCHEMA_VERSION,
    revision: 0,
    state: 'discovery',
    gate_policy: 'block',
    gate_authorization: null,
    execution_policy: null,
    execution_limits: copy(input.execution_limits || null),
    recovery_authorization: copy(input.recovery_authorization || null),
    run_brief: brief(input.run_brief),
    phases,
    milestones: Object.fromEntries(
      FEATURE_MILESTONES.map((name) => [name, { status: 'pending', bindings: {}, records: [] }]),
    ),
    event_history: [],
    last_error: null,
    ...(input.refinement ? { refinement: copy(input.refinement) } : {}),
  }
}

function validateFeature(manifest) {
  if (
    manifest.schemaVersion !== FEATURE_SCHEMA_VERSION ||
    !Number.isSafeInteger(manifest.revision) ||
    manifest.revision < 0
  )
    fail('Unsupported feature schemaVersion or revision')
  if (!manifest.run_brief || !Object.hasOwn(MODES, manifest.run_brief.mode))
    fail('Versioned run_brief required')
  brief(manifest.run_brief)
  if (!Array.isArray(manifest.event_history)) fail('Feature event_history required')
  for (const name of FEATURE_PHASES) {
    const phase = manifest.phases?.[name]
    if (
      !phase ||
      !['pending', 'in_progress', 'complete', 'approved', 'failed', 'stale'].includes(
        phase.status,
      ) ||
      !Array.isArray(phase.decisions) ||
      !Array.isArray(phase.depends_on) ||
      !phase.bindings
    )
      fail(`Invalid phase ${name}`)
    if (
      !Number.isSafeInteger(phase.attempts) ||
      phase.attempts < 0 ||
      !Array.isArray(phase.artifacts) ||
      !Array.isArray(phase.blocking_flags)
    )
      fail(`Invalid phase metadata ${name}`)
    if (
      phase.status === 'approved' &&
      (!GATES.has(name) || !phase.decisions.length || !Object.keys(phase.bindings).length)
    )
      fail(`Phase ${name} approval needs a decision and artifact bindings`)
    if (phase.status === 'complete' && !Object.keys(phase.bindings).length)
      fail(`Phase ${name} completion needs artifact bindings`)
    for (const [path, revision] of Object.entries(phase.bindings))
      if (!text(path) || !/^[a-f0-9]{64}$/.test(revision))
        fail(`Invalid phase binding ${name}.${path}`)
    if (
      phase.depends_on.some(
        (dependency) =>
          !FEATURE_PHASES.includes(dependency) ||
          FEATURE_PHASES.indexOf(dependency) >= FEATURE_PHASES.indexOf(name),
      )
    )
      fail(`Invalid predecessor for ${name}`)
  }
  for (const name of FEATURE_MILESTONES)
    if (
      !['pending', 'recorded', 'stale', 'unknown'].includes(manifest.milestones?.[name]?.status) ||
      !Array.isArray(manifest.milestones[name].records)
    )
      fail(`Invalid milestone ${name}`)
  for (const name of FEATURE_MILESTONES) {
    const milestone = manifest.milestones[name]
    if (
      milestone.status === 'recorded' &&
      (!milestone.records.length || !Object.keys(milestone.bindings || {}).length)
    )
      fail(`Milestone ${name} requires a bound record`)
  }
  return manifest
}

export function normalizeFeature(input) {
  if (input?.schemaVersion === FEATURE_SCHEMA_VERSION) return validateFeature(copy(input))
  if (input?.schemaVersion !== undefined && input.schemaVersion !== 1)
    fail('Unsupported legacy feature schemaVersion')
  const result = createFeature({
    ...input,
    run_brief: { ...input?.run_brief, mode: input?.run_brief?.mode || 'implementation-pr' },
  })
  result.legacy_snapshot = copy(input)
  result.gate_policy = input.gate_policy || 'block'
  result.execution_policy = copy(input.execution_policy || null)
  for (const name of FEATURE_PHASES) {
    const old = input.phases?.[name]
    if (!old) continue
    result.phases[name].attempts = Number.isSafeInteger(old.attempts) ? old.attempts : 0
    if (old.status !== 'pending') {
      result.phases[name].status = 'stale'
      result.phases[name].stale_reason =
        'Legacy state lacks revision-bound evidence; revalidate this phase and gate'
    }
  }
  for (const milestone of Object.values(result.milestones)) milestone.status = 'unknown'
  result.state =
    FEATURE_PHASES.find((name) => result.phases[name].status === 'stale') || 'discovery'
  result.last_error =
    'Legacy manifest migrated without inferring approval, acceptance, integration, release, or product validation'
  return result
}

function nextState(manifest) {
  if (manifest.state === 'aborted') return
  if (manifest.refinement?.configured === true) {
    if (manifest.refinement.result?.status === 'verified') {
      manifest.state = 'stopped'
      manifest.stop_reason = 'Requested refinement completed with current revision evidence'
      return
    }
    if (manifest.refinement.status !== 'ready') {
      manifest.state = manifest.refinement.pendingReviews?.includes('discovery')
        ? 'discovery'
        : 'refinement_review'
      return
    }
    manifest.state = ['dev', 'pr'].find((name) => !ready(name, manifest.phases[name])) || 'stopped'
    return
  }
  const stop = FEATURE_PHASES.indexOf(manifest.run_brief.stopping_point)
  manifest.state =
    FEATURE_PHASES.slice(0, stop + 1).find((name) => !ready(name, manifest.phases[name])) ||
    'stopped'
  if (manifest.state === 'stopped')
    manifest.stop_reason = `Requested ${manifest.run_brief.mode} stopping point reached: ${manifest.run_brief.stopping_point}`
  else delete manifest.stop_reason
}

const intersects = (paths, changed) =>
  paths.some((path) =>
    changed.some(
      (item) => path === item || path.startsWith(`${item}/`) || item.startsWith(`${path}/`),
    ),
  )
export function invalidateFeature(
  input,
  { artifacts = [], phases = [], milestones = [], reason = 'Artifact revision changed' } = {},
) {
  const result = normalizeFeature(input)
  if (!Array.isArray(artifacts) || artifacts.some((path) => !text(path)))
    fail('Changed artifacts must be paths')
  if (
    !Array.isArray(phases) ||
    phases.some((name) => !FEATURE_PHASES.includes(name)) ||
    !Array.isArray(milestones) ||
    milestones.some((name) => !FEATURE_MILESTONES.includes(name))
  )
    fail('Invalid phase or milestone invalidation target')
  const affected = new Set()
  for (const name of FEATURE_PHASES) {
    const phase = result.phases[name]
    if (
      phases.includes(name) ||
      intersects(Object.keys(phase.bindings), artifacts) ||
      phase.depends_on.some((parent) => affected.has(parent))
    ) {
      affected.add(name)
      if (phase.status !== 'pending') {
        phase.status = 'stale'
        phase.stale_reason = reason
      }
    }
  }
  let milestoneChanged = false
  for (const [name, milestone] of Object.entries(result.milestones))
    if (milestones.includes(name) || intersects(Object.keys(milestone.bindings), artifacts)) {
      milestone.status = 'stale'
      milestone.stale_reason = reason
      milestoneChanged = true
    }
  if (result.refinement?.result?.status === 'verified' && (affected.size || milestoneChanged)) {
    result.refinement.result = {
      ...result.refinement.result,
      status: 'stale',
      stale_reason: reason,
    }
    result.refinement.status = 'review-required'
    result.refinement.pendingReviews = ['completion-revalidation']
  }
  nextState(result)
  return result
}

function humanDecision(decision) {
  if (
    !decision ||
    decision.kind !== 'human' ||
    decision.authorized !== true ||
    !text(decision.actor) ||
    !text(decision.reference)
  )
    fail(
      'An explicit authorized human decision with actor and reference is required',
      'feature-blocked',
    )
  return copy(decision)
}
function bind(paths, hashes) {
  if (!Array.isArray(paths) || !paths.length || paths.some((path) => !text(path)))
    fail('Nonempty artifact paths required')
  return Object.fromEntries(
    paths.map((path) => {
      if (!/^[a-f0-9]{64}$/.test(hashes[path] || ''))
        fail(`Artifact missing or unreadable: ${path}`, 'feature-blocked')
      return [path, hashes[path]]
    }),
  )
}
function obligationGate(acceptance, command) {
  if (!acceptance)
    fail(`Actual acceptance validation required for ${stageFor(command)}`, 'feature-blocked')
  let errors = (acceptance.diagnostics || []).filter((item) => item.severity === 'error')
  // A milestone records one observed fact. Earlier unfulfilled obligations must
  // stay visible, but cannot erase an independently observed merge or release.
  if (command.type === 'record-milestone')
    errors = errors.filter((item) => {
      const obligation = acceptance.obligations?.find((entry) => entry.id === item.obligationId)
      return (
        !obligation ||
        !['status', 'owner', 'deferral.nextDecisionStage'].includes(item.field) ||
        obligation.requiredStage === stageFor(command)
      )
    })
  if (errors.length || (!acceptance.ok && command.type !== 'record-milestone'))
    fail(
      `Stage ${stageFor(command)} blocked: ${errors.map((item) => `${item.obligationId ? `${item.obligationId}: ` : ''}${item.message}`).join('; ') || 'acceptance validation failed'}`,
      'feature-blocked',
    )
}
function knownBrief(manifest) {
  for (const key of ['outcome'])
    if (!text(manifest.run_brief[key]))
      fail(`Known run_brief.${key} required before phase work`, 'feature-blocked')
  for (const key of ['deliverables', 'required_verification'])
    if (!manifest.run_brief[key].length || manifest.run_brief[key].some((item) => !text(item)))
      fail(
        `Known run_brief.${key} required before phase work; record an explicit no-check rationale when applicable`,
        'feature-blocked',
      )
}
function withinScope(manifest, phase) {
  if (FEATURE_PHASES.indexOf(phase) > FEATURE_PHASES.indexOf(manifest.run_brief.stopping_point))
    fail(`Phase ${phase} exceeds the authorized stopping point`, 'feature-blocked')
}

export function transitionFeature(
  input,
  command,
  {
    artifactHashes = {},
    acceptance,
    refinementPlan,
    refinementCompletion,
    now = new Date().toISOString(),
  } = {},
) {
  let result = normalizeFeature(input)
  if (!command || !text(command.type)) fail('Feature command type required')
  if (result.state === 'aborted') fail('Feature is aborted', 'feature-blocked')
  const phase = result.phases[command.phase]
  if (['start', 'complete', 'approve', 'revise', 'fail'].includes(command.type) && !phase)
    fail(`Unknown feature phase ${command.phase}`)
  const errors = []
  switch (command.type) {
    case 'start': {
      withinScope(result, command.phase)
      if (command.phase !== 'discovery') knownBrief(result)
      const scoped = result.refinement?.configured === true && command.phase === 'dev'
      if (scoped && refinementPlan?.status !== 'ready')
        fail(
          `Refinement requires revalidation: ${(refinementPlan?.pendingReviews || refinementPlan?.reasons || ['validated refinement plan missing']).join(', ')}`,
          'feature-blocked',
        )
      if (!scoped)
        for (const predecessor of phase.depends_on)
          if (!ready(predecessor, result.phases[predecessor]))
            errors.push(
              `${predecessor}${result.phases[predecessor].stale_reason ? `: ${result.phases[predecessor].stale_reason}` : ''}`,
            )
      if (errors.length)
        fail(`Unresolved predecessor phases: ${errors.join(', ')}`, 'feature-blocked')
      if (!['pending', 'in_progress', 'stale'].includes(phase.status))
        fail(`Cannot start ${command.phase} from ${phase.status}`)
      phase.status = 'in_progress'
      phase.bindings = {}
      delete phase.stale_reason
      break
    }
    case 'complete': {
      if (phase.status !== 'in_progress') fail(`Complete requires in_progress ${command.phase}`)
      if (command.phase !== 'discovery') obligationGate(acceptance, command)
      knownBrief(result)
      phase.artifacts = copy(command.artifacts)
      if (command.required_artifacts) phase.required_artifacts = copy(command.required_artifacts)
      phase.bindings = bind(command.artifacts, artifactHashes)
      phase.blocking_flags = copy(command.blocking_flags || [])
      if (!Array.isArray(phase.blocking_flags) || phase.blocking_flags.some((flag) => !text(flag)))
        fail('blocking_flags must be concrete strings')
      if (phase.blocking_flags.length)
        fail(
          `Phase ${command.phase} blocked: ${phase.blocking_flags.join('; ')}`,
          'feature-blocked',
        )
      phase.acceptance = copy(acceptance || null)
      if (command.phase === 'pr')
        phase.combined_verification = copy(command.combined_verification || null)
      phase.status = 'complete'
      phase.completed_at = now
      break
    }
    case 'approve': {
      if (!GATES.has(command.phase)) fail(`Phase ${command.phase} has no approval gate`)
      if (!['complete', 'approved'].includes(phase.status))
        fail(`Approval requires complete ${command.phase}`)
      if (Object.entries(phase.bindings).some(([path, hash]) => artifactHashes[path] !== hash))
        fail(
          `Reviewed ${command.phase} artifact changed; revalidate before approval`,
          'feature-blocked',
        )
      obligationGate(acceptance, command)
      if (phase.blocking_flags.length)
        fail(`Gate blocked: ${phase.blocking_flags.join('; ')}`, 'feature-blocked')
      let record
      if (command.provisional) {
        const auth = result.gate_authorization
        if (
          command.phase === 'pr' ||
          result.gate_policy === 'block' ||
          !auth?.scope?.includes(command.phase)
        )
          fail(
            'Scoped provisional authorization required; final PR review always blocks',
            'feature-blocked',
          )
        humanDecision(auth)
        record = { kind: 'provisional', authorization: copy(auth) }
      } else record = { kind: 'approval', decision: humanDecision(command.decision) }
      phase.decisions.push({
        ...record,
        at: now,
        feature_revision: result.revision,
        artifacts: copy(phase.bindings),
      })
      phase.provisional = command.provisional === true
      phase.status = 'approved'
      phase.acceptance = copy(acceptance)
      break
    }
    case 'configure-refinement': {
      if (
        !refinementPlan ||
        !['ready', 'review-required', 'reopen-required', 'blocked'].includes(refinementPlan.status)
      )
        fail('A validated refinement plan computed from actual target context is required')
      result = invalidateFeature(result, {
        artifacts: command.affectedFeatureArtifacts || [],
        reason: 'Authorized refinement delta requires affected evidence to be revalidated',
      })
      result.refinement = { ...copy(refinementPlan), configured: true }
      result.run_brief = brief({
        ...result.run_brief,
        mode: 'refinement',
        stopping_point: 'pr',
        outcome: refinementPlan.change.outcome || result.run_brief.outcome,
        deliverables: [refinementPlan.change.authorizedDelta || result.run_brief.deliverables[0]],
        required_verification:
          refinementPlan.verification?.methods || result.run_brief.required_verification,
      })
      if (refinementPlan.status === 'ready')
        for (const name of ['dev', 'pr']) result.phases[name].status = 'pending'
      break
    }
    case 'finish-refinement': {
      if (!result.refinement?.configured || refinementCompletion?.status !== 'verified')
        fail('Freshly verified refinement completion is required', 'feature-blocked')
      if (
        ['implementation', 'verification'].some(
          (name) => result.milestones[name].status !== 'recorded',
        )
      )
        fail(
          'Record current implementation and verification milestones before finishing refinement',
          'feature-blocked',
        )
      result.refinement.result = copy(refinementCompletion)
      result.refinement.result_history = [
        ...(result.refinement.result_history || []),
        copy(refinementCompletion),
      ]
      result.refinement.completed_at = now
      break
    }
    case 'record-issue': {
      if (result.phases.dev.status !== 'in_progress')
        fail('Issue recording requires in_progress dev')
      if (
        !text(command.issueId) ||
        !['complete', 'failed', 'needs-detail'].includes(command.status)
      )
        fail('Issue ID and runner outcome required')
      if (!text(command.evidence?.reference) || !text(command.evidence?.revision))
        fail('Issue evidence reference and committed revision required')
      const previous = result.phases.dev.issues[command.issueId] || { attempts: 0, records: [] }
      const record = {
        status: command.status,
        evidence: copy(command.evidence),
        artifacts: bind(command.evidence.artifacts, artifactHashes),
        at: now,
      }
      result.phases.dev.issues[command.issueId] = {
        ...previous,
        status: command.status,
        attempts: previous.attempts + (command.status === 'failed' ? 1 : 0),
        records: [...previous.records, record],
      }
      if (command.execution_policy) result.execution_policy = copy(command.execution_policy)
      break
    }
    case 'configure': {
      const authorization = humanDecision(command.authorization)
      if (command.run_brief) result.run_brief = brief({ ...result.run_brief, ...command.run_brief })
      if (command.gate_policy) {
        if (!['block', 'notify-and-continue', 'run-to-pr'].includes(command.gate_policy))
          fail('Invalid gate_policy')
        if (
          command.gate_policy !== 'block' &&
          (!Array.isArray(authorization.scope) ||
            authorization.scope.some((name) => !['definition', 'design'].includes(name)))
        )
          fail('Provisional authorization scope must name definition and/or design')
        result.gate_policy = command.gate_policy
        result.gate_authorization = authorization
      }
      break
    }
    case 'revise': {
      if (!text(command.reason)) fail('Revision reason required')
      result = invalidateFeature(result, {
        artifacts: Object.keys(phase.bindings),
        reason: command.reason,
      })
      result.phases[command.phase].status = 'pending'
      result.phases[command.phase].revision_reason = command.reason
      break
    }
    case 'record-milestone': {
      if (!FEATURE_MILESTONES.includes(command.milestone))
        fail(`Unknown milestone ${command.milestone}`)
      const evidence = command.evidence
      if (!text(evidence?.reference) || !text(evidence?.revision))
        fail('Milestone evidence reference and revision required')
      if (
        command.milestone === 'integration' &&
        (evidence.merged !== true || evidence.target !== result.base_branch)
      )
        fail(
          `Integration requires observed merged evidence into intended target ${result.base_branch}`,
          'feature-blocked',
        )
      if (command.milestone === 'human_acceptance') humanDecision(command.decision)
      obligationGate(acceptance, command)
      const milestone = result.milestones[command.milestone]
      milestone.bindings = bind(evidence.artifacts, artifactHashes)
      milestone.records.push({
        evidence: copy(evidence),
        decision: copy(command.decision || null),
        at: now,
        artifacts: copy(milestone.bindings),
        acceptance: copy(acceptance),
      })
      milestone.status = 'recorded'
      delete milestone.stale_reason
      break
    }
    case 'fail':
      if (!text(command.reason)) fail('Failure reason required')
      phase.attempts += 1
      phase.status = 'failed'
      result.last_error = command.reason
      break
    case 'abort':
      if (!text(command.reason)) fail('Abort reason required')
      result.state = 'aborted'
      result.last_error = command.reason
      break
    default:
      fail(`Unknown feature command ${command.type}`)
  }
  nextState(result)
  return validateFeature(result)
}

const hash = (value) => createHash('sha256').update(value).digest('hex')
const canonical = (value) =>
  JSON.stringify(value, function (key, item) {
    return item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item
  })
const inside = (root, path) => {
  const rel = relative(root, path)
  return rel !== '..' && !rel.startsWith('../') && !isAbsolute(rel)
}
function targetRoot(featureDir, manifest) {
  const root = realpathSync(manifest.repo)
  if (!inside(root, featureDir)) fail('Feature directory escapes manifest target repo')
  return root
}
function artifactHash(featureDir, root, path) {
  if (!text(path) || isAbsolute(path)) fail('Artifact paths must be relative to feature directory')
  const absolute = resolve(featureDir, path)
  const rel = relative(root, absolute)
  if (!inside(root, absolute) || credentialPath(rel) || /(^|\/)\.git(\/|$)/.test(rel))
    fail(`Artifact escapes readable target: ${path}`)
  const physical = realpathSync(absolute)
  if (
    !inside(root, physical) ||
    credentialPath(relative(root, physical)) ||
    /(^|\/)\.git(\/|$)/.test(relative(root, physical))
  )
    fail(`Artifact symlink escapes readable target: ${path}`)
  const info = lstatSync(physical)
  if (info.isFile()) return hash(readFileSync(physical))
  if (!info.isDirectory()) fail(`Artifact is not a file or directory: ${path}`)
  const children = readdirSync(physical)
    .sort()
    .map((name) => [
      name,
      artifactHash(featureDir, root, relative(featureDir, join(physical, name))),
    ])
  return hash(canonical(children))
}
function allBindings(manifest) {
  return [...Object.values(manifest.phases), ...Object.values(manifest.milestones)].flatMap(
    (record) => Object.entries(record.bindings || {}),
  )
}
function actualHashes(featureDir, root, paths) {
  return Object.fromEntries(
    [...new Set(paths)].map((path) => {
      try {
        return [path, artifactHash(featureDir, root, path)]
      } catch (error) {
        if (error.code === 'ENOENT') return [path, null]
        throw error
      }
    }),
  )
}
export async function loadFeature(featureDir, { policy } = {}) {
  const directory = realpathSync(resolve(featureDir))
  const path = join(directory, 'feature.json')
  if (lstatSync(path).isSymbolicLink()) fail('feature.json must not be a symlink')
  let manifest = normalizeFeature(JSON.parse(readFileSync(path, 'utf8')))
  const root = targetRoot(directory, manifest)
  for (const name of FEATURE_PHASES) {
    const phase = manifest.phases[name]
    if (!['complete', 'approved'].includes(phase.status)) continue
    const required = requiredArtifacts(directory, name, root, policy)
    if (
      required.some((path) => !Object.hasOwn(phase.bindings, path)) ||
      (phase.required_artifacts &&
        canonical([...phase.required_artifacts].sort()) !== canonical([...required].sort()))
    ) {
      manifest = invalidateFeature(manifest, {
        artifacts: Object.keys(phase.bindings),
        reason: `Required ${name} artifact set changed; review the current outputs and configured source`,
      })
    }
  }
  const bindings = allBindings(manifest)
  const hashes = actualHashes(
    directory,
    root,
    bindings.map(([path]) => path),
  )
  const changed = bindings
    .filter(([path, expected]) => hashes[path] !== expected)
    .map(([path]) => path)
  if (changed.length)
    manifest = invalidateFeature(manifest, {
      artifacts: changed,
      reason: `Artifact content changed: ${[...new Set(changed)].join(', ')}`,
    })
  // Ledger status/evidence may change without changing the reviewed definition
  // files. Reuse is conditional on the obligations due at each original stage;
  // future studies are not an implicit new approval gate for earlier work.
  const reports = new Map()
  const reportFor = async (command) => {
    const stage = stageFor(command)
    const key = `${command.type}:${stage}`
    if (!reports.has(key)) {
      const report =
        command.type === 'complete'
          ? await validateFeatureArtifacts({ featureDir: directory, root, stage })
          : await validateIssuesPhase({ featureDir: directory, stage })
      reports.set(
        key,
        command.type === 'complete'
          ? { ...report.acceptance, ok: report.ok, diagnostics: report.diagnostics }
          : report,
      )
    }
    return reports.get(key)
  }
  for (const name of FEATURE_PHASES) {
    const phase = manifest.phases[name]
    if (name === 'discovery' || !['complete', 'approved'].includes(phase.status)) continue
    const command = { type: 'complete', phase: name }
    const report = await reportFor(command)
    phase.acceptance_validation = copy(report)
    try {
      obligationGate(report, command)
      if (name === 'pr') {
        const combined = await validateFeatureDelivery({
          featureDir: directory,
          root,
          manifest,
          evidence: phase.combined_verification,
          policy,
        })
        if (!combined.valid) fail(combined.reason, 'feature-blocked')
      }
    } catch (error) {
      if (error.code !== 'feature-blocked') throw error
      // Semantic gate invalidation must not pretend its artifact bytes changed
      // and invalidate an independent milestone sharing those artifact paths.
      manifest = invalidateFeature(manifest, { phases: [name], reason: error.message })
    }
  }
  for (const name of FEATURE_MILESTONES) {
    const milestone = manifest.milestones[name]
    if (milestone.status !== 'recorded') continue
    const command = { type: 'record-milestone', milestone: name }
    const report = await reportFor(command)
    milestone.acceptance_validation = copy(report)
    try {
      obligationGate(report, command)
      if (name === 'verification') {
        const evidence = milestone.records.at(-1)?.evidence
        const combined = await validateFeatureDelivery({
          featureDir: directory,
          root,
          manifest,
          evidence,
          policy,
        })
        if (!combined.valid) fail(combined.reason, 'feature-blocked')
      }
    } catch (error) {
      if (error.code !== 'feature-blocked') throw error
      manifest = invalidateFeature(manifest, { milestones: [name], reason: error.message })
    }
  }
  return manifest
}
function acquire(directory) {
  const path = join(directory, '.feature.lock')
  const tryOpen = () => {
    const fd = openSync(path, 'wx', 0o600)
    writeFileSync(fd, JSON.stringify({ pid: process.pid }))
    fsyncSync(fd)
    return () => {
      closeSync(fd)
      unlinkSync(path)
    }
  }
  try {
    return tryOpen()
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    // Recover only a definitely dead writer, never a lock merely judged old.
    let owner
    try {
      owner = JSON.parse(readFileSync(path, 'utf8'))
    } catch {
      fail('Feature writer lock is unreadable; inspect the interrupted writer', 'feature-conflict')
    }
    if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0)
      fail('Feature writer lock has no valid owner', 'feature-conflict')
    try {
      process.kill(owner.pid, 0)
    } catch (probe) {
      if (probe.code === 'ESRCH') {
        unlinkSync(path)
        return tryOpen()
      }
    }
    fail('Another feature writer holds the lock', 'feature-conflict')
  }
}
function persist(directory, manifest) {
  const path = join(directory, 'feature.json')
  const temporary = join(directory, `.feature-${randomUUID()}.tmp`)
  const fd = openSync(temporary, 'wx', 0o600)
  try {
    writeFileSync(fd, JSON.stringify(manifest, null, 2) + '\n')
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(temporary, path)
  const dirfd = openSync(directory, 'r')
  try {
    fsyncSync(dirfd)
  } finally {
    closeSync(dirfd)
  }
}
function requiredArtifacts(directory, phase, root, policy) {
  const mandatory =
    {
      discovery: ['../../product/jtbd'],
      definition: ['prd.md'],
      design: ['design.md'],
      spec: ['spec.md'],
      issues: ['issues.md'],
    }[phase] || []
  if (phase === 'design') {
    // These rendered/source bytes are what the human reviews. Bind the trees
    // so edits, deletions and additions cannot retain an old design decision.
    if (existsSync(join(directory, 'lofi'))) mandatory.push('lofi')
    const configured =
      policy?.bindings?.designSystemPath ?? readProjectConfig(root).designSystemPath
    if (text(configured) && !/^(none|n\/a)$/i.test(configured)) {
      mandatory.push(relative(directory, resolve(root, configured)))
    } else if (existsSync(join(root, 'docs/product/design-system'))) {
      mandatory.push(relative(directory, join(root, 'docs/product/design-system')))
    }
  }
  if (phase === 'definition') {
    if (existsSync(join(directory, 'briefs'))) mandatory.push('briefs')
    const scan = (path) => {
      if (!existsSync(join(directory, path))) return
      for (const entry of readdirSync(join(directory, path), { withFileTypes: true })) {
        const child = `${path}/${entry.name}`
        if (entry.isDirectory()) scan(child)
        else if (entry.name.endsWith('.md') || entry.name === 'board.json') mandatory.push(child)
      }
    }
    scan('briefs')
  }
  return mandatory
}

export async function applyFeatureCommand({
  featureDir,
  command,
  expectedRevision,
  eventId,
  policy,
} = {}) {
  let release,
    manifest,
    context = null
  try {
    if (
      !text(featureDir) ||
      !text(eventId) ||
      !Number.isSafeInteger(expectedRevision) ||
      expectedRevision < 0
    )
      fail('featureDir, eventId and nonnegative expectedRevision are required')
    const directory = realpathSync(resolve(featureDir))
    release = acquire(directory)
    const fingerprint = hash(canonical(command))
    const path = join(directory, 'feature.json')
    if (command?.type === 'init') {
      if (existsSync(path)) manifest = await loadFeature(directory, { policy })
      else {
        manifest = createFeature(command.input)
        targetRoot(directory, manifest)
      }
    } else manifest = await loadFeature(directory, { policy })
    const oldEvent = manifest.event_history.find((event) => event.id === eventId)
    if (oldEvent) {
      if (oldEvent.fingerprint !== fingerprint)
        fail('Event identity reused for a different command', 'feature-conflict')
      return {
        status: oldEvent.status,
        manifest,
        context: null,
        error: oldEvent.error || null,
        replayed: true,
      }
    }
    if (manifest.revision !== expectedRevision)
      fail(
        `Feature revision conflict: expected ${expectedRevision}, current ${manifest.revision}`,
        'feature-conflict',
      )
    if (command.type === 'init' && existsSync(path))
      fail('Feature already exists; resume it', 'feature-conflict')
    const root = targetRoot(directory, manifest)
    let next = manifest,
      error = null,
      status = 'success'
    try {
      const effective = copy(command)
      let refinementPlan, refinementCompletion
      if (
        command.type === 'configure-refinement' ||
        (command.type === 'start' && command.phase === 'dev' && manifest.refinement?.configured)
      ) {
        try {
          refinementPlan = await refinement.planRefinement({
            root,
            change:
              command.type === 'configure-refinement'
                ? {
                    ...command.change,
                    affectedArtifacts: [
                      ...new Set([
                        ...(command.change?.affectedArtifacts || []),
                        relative(root, path),
                        relative(root, join(directory, '.feature.lock')),
                      ]),
                    ],
                  }
                : manifest.refinement.change,
            policy,
          })
        } catch (cause) {
          fail(`Refinement planning blocked: ${cause.message}`, 'feature-blocked')
        }
        if (command.type === 'configure-refinement')
          effective.affectedFeatureArtifacts = [
            ...new Set([...refinementPlan.affectedArtifacts, ...refinementPlan.change.surfaces]),
          ].map((path) => relative(directory, resolve(root, path)))
      }
      if (command.type === 'finish-refinement') {
        if (!manifest.refinement?.configured)
          fail('No configured refinement to finish', 'feature-blocked')
        try {
          refinementCompletion = await refinement.validateRefinementCompletion({
            root,
            featureDir: directory,
            plan: manifest.refinement,
            completion: command.completion,
            policy,
          })
        } catch (cause) {
          fail(`Refinement completion blocked: ${cause.message}`, 'feature-blocked')
        }
        if (refinementCompletion.status !== 'verified')
          fail(
            `Refinement completion blocked: ${JSON.stringify(refinementCompletion.violations || refinementCompletion.reasons || refinementCompletion.error || refinementCompletion)}`,
            'feature-blocked',
          )
      }
      if (command.type === 'start') {
        try {
          context = selectTaskContext({
            root,
            policy,
            task:
              command.task ||
              (refinementPlan
                ? {
                    title: refinementPlan.change.outcome,
                    body: refinementPlan.change.authorizedDelta,
                    paths: refinementPlan.change.surfaces,
                    tags: refinementPlan.risks,
                    obligationIds: refinementPlan.change.linkedObligations,
                  }
                : {
                    title: `${manifest.prompt}: ${command.phase}`,
                    paths: (manifest.phases[command.phase]?.artifacts || []).map((path) =>
                      relative(root, resolve(directory, path)),
                    ),
                  }),
          })
          assertCurrentContext(context)
        } catch (cause) {
          fail(`Current context blocks phase dispatch: ${cause.message}`, 'feature-blocked')
        }
      }
      if (command.type === 'complete') {
        effective.required_artifacts = requiredArtifacts(directory, command.phase, root, policy)
        effective.artifacts = [
          ...new Set([...(command.artifacts || []), ...effective.required_artifacts]),
        ]
      }
      const paths = [
        ...allBindings(manifest).map(([path]) => path),
        ...(effective.artifacts || []),
        ...(effective.evidence?.artifacts || []),
      ]
      const artifactHashes = actualHashes(directory, root, paths)
      if (['complete', 'approve'].includes(command.type) && command.phase !== 'discovery') {
        const artifacts = await validateFeatureArtifacts({
          featureDir: directory,
          root,
          stage: stageFor(command),
        })
        if (!artifacts.ok)
          fail(
            `Artifact gate blocked: ${artifacts.diagnostics.map((d) => `${d.path || d.artifact || 'artifact'} ${d.id || d.obligationId || ''}: ${d.message}`).join('; ')}`,
            'feature-blocked',
          )
      }
      if (
        (command.type === 'record-milestone' && command.milestone === 'verification') ||
        (['complete', 'approve'].includes(command.type) && command.phase === 'pr')
      ) {
        const evidence =
          command.evidence || manifest.milestones.verification.records.at(-1)?.evidence
        const combined = await validateFeatureDelivery({
          featureDir: directory,
          root,
          manifest,
          evidence,
          policy,
        })
        if (!combined.valid)
          fail(`Combined verification blocks delivery: ${combined.reason}`, 'feature-blocked')
        if (command.phase === 'pr') effective.combined_verification = copy(evidence)
      }
      const acceptance =
        ['complete', 'approve', 'record-milestone'].includes(command.type) &&
        command.phase !== 'discovery'
          ? await validateIssuesPhase({ featureDir: directory, stage: stageFor(command) })
          : null
      if (command.type !== 'init')
        next = transitionFeature(manifest, effective, {
          artifactHashes,
          acceptance,
          refinementPlan,
          refinementCompletion,
        })
      if (context && effective.phase)
        next.phases[effective.phase].context = {
          revision: context.indexRevision,
          selected: context.selected.map((source) => ({
            id: source.id,
            path: source.path,
            revision: source.actualRevision,
          })),
        }
      if (!['fail', 'abort'].includes(command.type)) next.last_error = null
    } catch (cause) {
      if (cause.code !== 'feature-blocked') throw cause
      error = { code: cause.code, message: cause.message }
      status = 'blocked'
      next = copy(manifest)
      next.last_error = cause.message
    }
    next.revision = manifest.revision + 1
    next.event_history.push({
      id: eventId,
      fingerprint,
      command: copy(command),
      revision: next.revision,
      status,
      error,
      result: {
        state: next.state,
        phase: command.phase ? copy(next.phases[command.phase]) : null,
        refinement: ['configure-refinement', 'finish-refinement'].includes(command.type)
          ? copy(next.refinement || null)
          : null,
      },
      at: new Date().toISOString(),
    })
    persist(directory, next)
    return { status, manifest: next, context, error, replayed: false }
  } catch (error) {
    return {
      status: 'error',
      manifest: manifest || null,
      context,
      error: { code: error.code || 'feature-invalid', message: error.message },
    }
  } finally {
    if (release) release()
  }
}
