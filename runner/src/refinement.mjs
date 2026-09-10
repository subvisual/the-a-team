import { readFileSync, existsSync, realpathSync, statSync } from 'node:fs'
import { resolve, relative, isAbsolute, join } from 'node:path'
import { git, revParse } from './git.mjs'
import {
  selectTaskContext,
  assertCurrentContext,
  readContextIndex,
  contentRevision,
  contextPath,
} from './context.mjs'
import { parseIssuesFile, validateIssues } from './local-issues.mjs'
import { resolvePolicy } from './policy.mjs'
import {
  approvalRecords,
  validateApprovalRecord,
  hasDeliveryReceipt,
  requirePolicy,
} from './core/approval.mjs'
import { policyAtRecordedBase, isAncestor } from './core/local-recovery.mjs'
import { issueVersion } from './core/history.mjs'

const text = (value) => typeof value === 'string' && value.trim().length > 0
const fail = (message) => {
  throw Object.assign(new Error(message), { code: 'refinement-invalid' })
}
const RISK_REVIEWS = {
  'new-audience': ['discovery'],
  'new-job': ['discovery'],
  'load-bearing-assumption': ['discovery'],
  authorization: ['security-review'],
  'business-rule': ['domain-review'],
  design: ['design-review'],
  interaction: ['design-review'],
  accessibility: ['design-review'],
  'shared-token': ['design-review'],
  architecture: ['architecture-review'],
  migration: ['architecture-review', 'migration-review'],
}
const lists = ['linkedObligations', 'invariants', 'surfaces', 'risks', 'affectedArtifacts']
function validateChange(change) {
  if (change?.schemaVersion !== 1 || !/^REF-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(change?.id || ''))
    fail('Refinement requires schemaVersion 1 and stable REF-... id')
  if (!['bugfix', 'visual', 'feature-delta', 'copy'].includes(change.kind))
    fail('Refinement kind must describe bugfix, visual, feature-delta or copy')
  for (const key of ['outcome', 'authorizedDelta'])
    if (!text(change[key])) fail(`Refinement requires ${key}`)
  for (const key of lists)
    if (
      !Array.isArray(change[key]) ||
      change[key].some((value) => !text(value)) ||
      new Set(change[key]).size !== change[key].length
    )
      fail(`Refinement requires unique ${key}`)
  for (const risk of change.risks)
    if (!Object.hasOwn(RISK_REVIEWS, risk)) fail(`Unknown refinement risk ${risk}`)
  if (!change.linkedObligations.length || !change.surfaces.length)
    fail('Refinement requires linked obligations and affected surfaces')
  if (
    change.authorization?.authorized !== true ||
    !text(change.authorization?.actor) ||
    !text(change.authorization?.reference)
  )
    fail('Refinement requires the existing authorization actor and reference')
  if (!Array.isArray(change.dependencies) || !Array.isArray(change.reviews))
    fail('Refinement requires dependencies and reviews')
}
function safeRelative(root, path) {
  if (
    !text(path) ||
    isAbsolute(path) ||
    path.split(/[\\/]/).includes('..') ||
    path === '.git' ||
    path.startsWith('.git/')
  )
    fail(`Refinement path must stay in target: ${path}`)
  let candidate = resolve(root, path)
  while (!existsSync(candidate)) {
    const parent = resolve(candidate, '..')
    if (parent === candidate) fail(`Cannot resolve refinement path ${path}`)
    candidate = parent
  }
  const rel = relative(realpathSync(root), realpathSync(candidate))
  if (rel === '..' || rel.startsWith('../') || isAbsolute(rel))
    fail(`Refinement path escapes target: ${path}`)
  if (relative(resolve(root), resolve(root, path)) !== path)
    fail(`Refinement path must be canonical and target-relative: ${path}`)
  return path.replace(/\/$/, '')
}
const fileRevision = (root, path) => {
  const absolute = resolve(root, safeRelative(root, path))
  if (!existsSync(absolute)) return null
  if (!statSync(absolute).isFile()) fail(`Refinement evidence/changes must name files: ${path}`)
  return contentRevision(readFileSync(absolute))
}
async function changedFiles(root, base) {
  const tracked = await git(root, ['diff', '--name-only', '-z', base, '--'])
  const untracked = await git(root, ['ls-files', '--others', '--exclude-standard', '-z'])
  return [
    ...new Set([...tracked.stdout.split('\0'), ...untracked.stdout.split('\0')].filter(Boolean)),
  ].sort()
}
export async function planRefinement({ root, change, policy }) {
  validateChange(change)
  const target = realpathSync(root)
  for (const path of [...change.surfaces, ...change.affectedArtifacts]) safeRelative(target, path)
  const index = readContextIndex({ root: target, policy }).index
  if (!index) fail('Current context must be configured before refinement')
  const description =
    `${change.outcome} ${change.authorizedDelta} ${change.surfaces.join(' ')}`.toLowerCase()
  const risks = new Set(change.risks)
  for (const source of index.sources.filter((source) => change.surfaces.includes(source.path)))
    if (source.kind === 'adr') risks.add('architecture')
    else if (source.kind === 'design') risks.add('design')
  const signals = {
    'new-audience': /new audience|new user group|different audience/,
    'new-job': /new job|different job/,
    'load-bearing-assumption': /load-bearing assumption|unvalidated assumption/,
    authorization: /\bauth(?:orization|entication)?\b|permissions?|credentials?/,
    'business-rule': /business.rule|eligibility|pricing rule/,
    interaction: /interaction|keyboard|focus behavior/,
    accessibility: /accessib|screen.reader/,
    'shared-token': /shared.*token|tokens?\.(css|ts|json)|design.system/,
    architecture: /architecture|storage.engine|new service/,
    migration: /migrat|schema change/,
  }
  for (const [risk, signal] of Object.entries(signals))
    if (signal.test(description)) risks.add(risk)
  const context = assertCurrentContext(
    selectTaskContext({
      root: target,
      policy,
      task: {
        title: change.outcome,
        body: change.authorizedDelta,
        paths: change.surfaces,
        tags: [...risks],
        obligationIds: change.linkedObligations,
      },
    }),
  )
  for (const id of change.invariants)
    if (!context.selected.some((source) => source.id === id))
      fail(`Invariant ${id} must resolve to selected current authority`)
  const definitions = context.selected.filter((source) => source.kind === 'requirement')
  for (const id of change.linkedObligations)
    if (
      !/^OBL-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(id) ||
      !definitions.some(
        (source) =>
          source.obligationIds?.includes(id) ||
          (source.content?.match(/\bOBL-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*/g) || []).includes(id),
      )
    )
      fail(`Linked obligation ${id} is absent from selected requirement authority`)
  const baseRevision = await revParse(target, 'HEAD')
  const dirty = {}
  for (const path of await changedFiles(target, baseRevision))
    dirty[path] = fileRevision(target, path)
  const preservedBindings = index.sources
    .filter(
      (source) => ['design', 'adr'].includes(source.kind) && !change.surfaces.includes(source.path),
    )
    .map((source) => ({
      id: source.id,
      path: source.path,
      revision: fileRevision(target, source.path),
    }))
  const requiredReviews = [...new Set([...risks].flatMap((risk) => RISK_REVIEWS[risk]))]
  const reasons = []
  const pendingReviews = []
  for (const kind of requiredReviews) {
    const review = change.reviews.find((review) => review.kind === kind)
    if (!review) {
      pendingReviews.push(kind)
      continue
    }
    if (review.approved !== true || !text(review.actor) || !text(review.reference))
      fail(`Invalid ${kind} approval reference`)
    const evidence = JSON.parse(readFileSync(contextPath(target, review.reference), 'utf8'))
    if (
      evidence.kind !== kind ||
      evidence.actor !== review.actor ||
      evidence.approved !== true ||
      !context.selected.every(
        (source) => evidence.sourceRevisions?.[source.id] === source.actualRevision,
      )
    )
      fail(`Stale or mismatched ${kind} evidence`)
  }
  for (const dependency of change.dependencies) {
    if (
      !text(dependency?.id) ||
      !['satisfied', 'pending', 'blocked', 'unknown'].includes(dependency?.status)
    )
      fail('Dependency requires ID and explicit status')
    if (dependency.status !== 'satisfied')
      reasons.push(`${dependency.id}: ${dependency.reason || dependency.status}`)
  }
  const status = reasons.length
    ? 'blocked'
    : pendingReviews.includes('discovery')
      ? 'reopen-required'
      : pendingReviews.length
        ? 'review-required'
        : 'ready'
  const lowImpact =
    ['copy', 'visual'].includes(change.kind) &&
    ![...risks].some((risk) => !['shared-token', 'design'].includes(risk))
  const persistence =
    !lowImpact &&
    /sav(e|ing)|persist|retry|unsaved/.test(
      `${change.outcome} ${change.authorizedDelta}`.toLowerCase(),
    )
  return {
    schemaVersion: 1,
    id: change.id,
    status,
    reasons,
    pendingReviews,
    risks: [...risks],
    change: structuredClone(change),
    baseRevision,
    baselineDirty: dirty,
    contextRevision: context.indexRevision,
    contextEntrypoint: context.entrypoint,
    selectedSources: context.selected.map(({ id, path, actualRevision }) => ({
      id,
      path,
      revision: actualRevision,
    })),
    invariants: [...new Set([...context.authority.globalInvariants, ...change.invariants])],
    preservedBindings,
    route: [
      'current-context',
      'change-record',
      ...requiredReviews,
      'implementation',
      'independent-review',
      'verification',
      'context-refresh',
    ],
    requiredReviews,
    verification: {
      methods: lowImpact
        ? ['existing-checks', 'rendered-review', 'independent-review']
        : ['regression', 'independent-review'],
      scenarios: persistence
        ? [
            'save-failure-retry',
            'edits-in-flight',
            'dependent-submit-blocked',
            'unsaved-navigation',
          ]
        : [],
    },
    affectedArtifacts: [...new Set([context.entrypoint, ...change.affectedArtifacts])],
    acceptance: 'pending',
    result: null,
  }
}

export async function auditRefinementChanges({ root, plan }) {
  if (plan?.schemaVersion !== 1 || !plan.change || !text(plan.baseRevision))
    fail('A recorded refinement plan is required')
  validateChange(plan.change)
  const target = realpathSync(root)
  if (!(await isAncestor(target, plan.baseRevision, await revParse(target, 'HEAD'))))
    fail('Refinement base is not an ancestor of current HEAD')
  const current = await changedFiles(target, plan.baseRevision)
  const changedPaths = [...new Set([...current, ...Object.keys(plan.baselineDirty || {})])]
    .filter(
      (path) =>
        !Object.hasOwn(plan.baselineDirty || {}, path) ||
        fileRevision(target, path) !== plan.baselineDirty[path],
    )
    .sort()
  const allowed = new Set([...plan.change.surfaces, ...plan.affectedArtifacts])
  const violations = changedPaths
    .filter((path) => !allowed.has(path))
    .map((path) => ({
      path,
      reason: 'Outside the authorized refinement surfaces and affected artifacts',
    }))
  for (const binding of plan.preservedBindings)
    if (fileRevision(target, binding.path) !== binding.revision)
      violations.push({
        path: binding.path,
        reason: 'Accepted design or architecture binding changed outside the authorized delta',
      })
  const missingReviews = plan.pendingReviews || []
  for (const kind of missingReviews)
    violations.push({ path: null, reason: `Required ${kind} remains unresolved` })
  for (const reason of plan.reasons || []) violations.push({ path: null, reason })
  return {
    schemaVersion: 1,
    status: violations.length ? 'blocked' : 'scope-checked',
    changedPaths,
    violations,
    preservedBindings: plan.preservedBindings,
    refreshArtifacts: plan.affectedArtifacts,
    verification: plan.verification,
    acceptance: 'pending',
  }
}

// A scope audit alone cannot complete implementation. Reuse the supervisor's
// protected approval and output receipts; authored reports supply method-specific
// dispositions that the independent reviewer must inspect in that exact revision.
export async function validateRefinementCompletion({ root, featureDir, plan, completion, policy }) {
  try {
    const target = realpathSync(root)
    if (
      !text(completion?.summary) ||
      !text(completion?.issuesPath) ||
      !text(completion?.ticketId) ||
      !Array.isArray(completion?.evidence) ||
      !/^([0-9a-f]{40}|[0-9a-f]{64})$/.test(completion?.approvedRevision || '')
    )
      fail('Completion requires summary, issuesPath, ticketId, approvedRevision and evidence')
    const audit = await auditRefinementChanges({ root: target, plan })
    if (audit.status !== 'scope-checked')
      fail(audit.violations.map((v) => `${v.path || 'route'}: ${v.reason}`).join('; '))
    const issue = validateIssues(
      parseIssuesFile(readFileSync(contextPath(target, completion.issuesPath), 'utf8')),
    ).find((issue) => issue.key === completion.ticketId)
    if (!issue) fail('Completion ticket is absent from current issues')
    const ids = new Set(issue.body.match(/\b(?:REF|OBL)-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*/g) || [])
    if (!ids.has(plan.id) || plan.change.linkedObligations.some((id) => !ids.has(id)))
      fail('Completion ticket must name the refinement and every linked obligation')
    const currentPolicy = requirePolicy(
      { policy: policy || (await resolvePolicy({ repoPath: target })) },
      target,
    )
    const record = approvalRecords(target, issue.key).find(
      (record) =>
        record.issueKey === issue.key &&
        record.issueVersion === issueVersion(issue) &&
        record.headSha === completion.approvedRevision &&
        validateApprovalRecord(record, {
          repo: target,
          issue,
          head: completion.approvedRevision,
          baseSha: record.baseSha,
          policy: policyAtRecordedBase(currentPolicy, record),
        }).valid &&
        hasDeliveryReceipt(record, { repo: target, prNumber: null }),
    )
    if (!record)
      fail('No current delivered runner approval matches this refinement ticket and revision')
    const head = await revParse(target, 'HEAD')
    if (
      !(await isAncestor(target, plan.baseRevision, record.baseSha)) ||
      !(await isAncestor(target, record.baseSha, record.headSha)) ||
      !(await isAncestor(target, record.headSha, head))
    )
      fail('Refinement and reviewed revision ancestry do not match')
    const beforeReview = (
      await git(target, ['diff', '--name-only', '-z', plan.baseRevision, record.baseSha, '--'])
    ).stdout
      .split('\0')
      .filter(Boolean)
    if (beforeReview.some((path) => plan.change.surfaces.includes(path)))
      fail('Product changes before the reviewed base require a new refinement plan and review')
    const controller = featureDir
      ? [
          relative(target, join(realpathSync(featureDir), 'feature.json')),
          relative(target, join(realpathSync(featureDir), '.feature.lock')),
        ]
      : []
    for (const path of controller) safeRelative(target, path)
    const relevantPaths = new Set([
      ...plan.change.surfaces,
      ...plan.affectedArtifacts,
      ...plan.selectedSources.map((source) => source.path),
      completion.issuesPath,
      ...completion.evidence.map((entry) => entry.reference),
    ])
    const afterReview = (await changedFiles(target, record.headSha)).filter(
      (path) =>
        !controller.includes(path) &&
        !(
          Object.hasOwn(plan.baselineDirty || {}, path) &&
          !relevantPaths.has(path) &&
          fileRevision(target, path) === plan.baselineDirty[path]
        ),
    )
    if (afterReview.length)
      fail(`Files changed after the reviewed revision: ${afterReview.join(', ')}`)
    const context = assertCurrentContext(
      selectTaskContext({
        root: target,
        policy: currentPolicy,
        task: {
          title: plan.change.outcome,
          body: plan.change.authorizedDelta,
          paths: plan.change.surfaces,
          tags: plan.risks,
          obligationIds: plan.change.linkedObligations,
        },
      }),
    )
    const evidence = []
    // Ignored files are absent from git diff/untracked listings. Require every
    // relevant source, context, ticket and report to match the reviewed tree too.
    for (const source of context.selected) relevantPaths.add(source.path)
    for (const path of relevantPaths) {
      if (controller.includes(path)) continue
      safeRelative(target, path)
      const committed = await git(target, ['rev-parse', '--verify', `${record.headSha}:${path}`], {
        check: false,
      })
      if (!existsSync(resolve(target, path))) {
        if (committed.code === 0) fail(`File missing since the reviewed revision: ${path}`)
        continue
      }
      const current = await git(target, ['hash-object', '--no-filters', '--', path])
      if (committed.code !== 0 || committed.stdout.trim() !== current.stdout.trim())
        fail(`File absent or changed from the reviewed revision: ${path}`)
    }
    for (const method of plan.verification.methods.filter(
      (method) => method !== 'independent-review',
    )) {
      const entry = completion.evidence.find((entry) => entry.method === method)
      if (!entry || !text(entry.reference)) fail(`Completion requires ${method} evidence`)
      const report = JSON.parse(readFileSync(contextPath(target, entry.reference), 'utf8'))
      if (
        report.method !== method ||
        report.status !== 'passed' ||
        !text(report.actor) ||
        !text(report.summary) ||
        !plan.change.surfaces.every(
          (path) =>
            Object.hasOwn(report.sourceRevisions || {}, path) &&
            report.sourceRevisions[path] === fileRevision(target, path),
        )
      )
        fail(`Stale or incomplete ${method} evidence`)
      if (
        method === 'regression' &&
        plan.verification.scenarios.some(
          (id) =>
            !report.scenarios?.some(
              (scenario) => scenario.id === id && scenario.status === 'passed',
            ),
        )
      )
        fail('Regression evidence omits required persistence scenarios')
      evidence.push({
        method,
        reference: entry.reference,
        revision: fileRevision(target, entry.reference),
        actor: report.actor,
        summary: report.summary,
      })
    }
    return {
      schemaVersion: 1,
      status: 'verified',
      summary: completion.summary,
      issueKey: issue.key,
      approvedRevision: record.headSha,
      currentRevision: head,
      approvalVerification: record.verificationPath,
      contextRevision: context.indexRevision,
      evidence,
      audit,
      acceptance: 'pending',
      recordedAt: new Date().toISOString(),
    }
  } catch (error) {
    return { schemaVersion: 1, status: 'blocked', reason: error.message, acceptance: 'pending' }
  }
}
