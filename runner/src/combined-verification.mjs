import { existsSync, readFileSync, writeFileSync, readdirSync, rmSync, lstatSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { platform, arch, release } from 'node:os'
import { digest, canonicalPath, within, validateChanges } from './policy.mjs'
import { revParse, assertDescendsFrom, createPrivateCheckout, assertExactCheckout } from './git.mjs'
import { runSandboxed } from './sandbox.mjs'
import { home, ensureDir } from './paths.mjs'
import { validateApprovalRecord, requirePolicy, isDocumentationOnly } from './core/approval.mjs'
import { openBudget } from './core/budget.mjs'

const text = (value) => typeof value === 'string' && value.trim().length > 0
const read = (path) => JSON.parse(readFileSync(path, 'utf8'))
const categories = ['suite', 'typecheck', 'build', 'browser', 'integration']
const planPath = (value) =>
  text(value) &&
  !value.startsWith('/') &&
  !value.includes('\\') &&
  !value.split('/').some((part) => !part || part === '.' || part === '..') &&
  !/[\x00-\x1f]/.test(value)
const storeRoot = (root) => join(home(), 'combined', digest(canonicalPath(root)))
const write = (path, value) => {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o444 })
  return path
}
export function resolveDeliveryContract(policy) {
  const value = policy?.verification?.delivery
  if (
    !value ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.checks) ||
    !value.checks.length ||
    !Array.isArray(value.boundaries)
  )
    throw Error('explicit delivery verification contract is required')
  const ids = new Set()
  for (const check of value.checks) {
    if (
      !check ||
      !text(check.id) ||
      ids.has(check.id) ||
      !categories.includes(check.kind) ||
      [check.command, check.renderedReview, check.notApplicable].filter(text).length !== 1 ||
      (text(check.renderedReview) &&
        (!['browser', 'integration'].includes(check.kind) || !planPath(check.renderedReview)))
    )
      throw Error(
        'delivery checks need unique IDs, known kinds and exactly one command, relative renderedReview plan or notApplicable reason',
      )
    if (
      check.timeoutMs !== undefined &&
      (!Number.isSafeInteger(check.timeoutMs) || check.timeoutMs < 1)
    )
      throw Error('delivery command timeout must be positive')
    ids.add(check.id)
  }
  for (const kind of categories)
    if (!value.checks.some((c) => c.kind === kind))
      throw Error(`delivery verification lacks ${kind} coverage or explicit inapplicability`)
  for (const boundary of value.boundaries) {
    if (
      !boundary ||
      !text(boundary.id) ||
      !['real', 'substituted', 'unexecuted'].includes(boundary.status) ||
      !text(boundary.reason) ||
      !Array.isArray(boundary.obligationIds) ||
      boundary.obligationIds.some((id) => !text(id))
    )
      throw Error('delivery boundary needs identity, status, reason and obligation IDs')
  }
  return structuredClone(value)
}
function trustedPath(path, root) {
  const actual = canonicalPath(path),
    base = canonicalPath(storeRoot(root))
  if (!within(base, actual) || lstatSync(path).isSymbolicLink() || dirname(actual) === base)
    throw Error('combined evidence is outside the supervisor record store')
  return actual
}
async function approvalsCurrent(approvedIssues, { root, head, policy }) {
  if (!Array.isArray(approvedIssues))
    throw Error('approvedIssues must be explicit, even when empty')
  const found = new Set(),
    records = []
  for (const entry of approvedIssues) {
    if (!entry?.issue?.key || found.has(entry.issue.key) || !text(entry.approvalPath))
      throw Error(
        'approved issues need unique current issue identities and actual approval records',
      )
    found.add(entry.issue.key)
    let record
    try {
      record = read(entry.approvalPath)
    } catch {
      throw Error(`approval record missing or malformed for ${entry.issue.key}`)
    }
    const approvalRoot = canonicalPath(join(home(), 'runs'))
    if (!within(approvalRoot, canonicalPath(entry.approvalPath)))
      throw Error('approval must come from the supervisor run store')
    if (
      canonicalPath(record.repository?.root || '.') !== canonicalPath(root) ||
      record.repository?.remote !== policy.target.remote ||
      !record.policy
    )
      throw Error('approval target differs from combined application')
    // Each issue retains its own exact base and execution policy. The final check
    // has a separate policy; it does not relabel old evidence as a new evaluation.
    const valid = validateApprovalRecord(record, {
      repo: record.repository.name,
      issue: structuredClone(entry.issue),
      head: record.headSha,
      baseSha: record.baseSha,
      policy: record.policy,
    })
    if (!valid.valid) throw Error(valid.reason)
    await assertDescendsFrom(root, record.headSha, head)
    records.push({
      issue: entry.issue,
      approvalPath: canonicalPath(entry.approvalPath),
      approvalDigest: digest(record),
      headSha: record.headSha,
    })
  }
  return records
}
function history(root) {
  const base = storeRoot(root)
  if (!existsSync(base)) return []
  return readdirSync(base)
    .flatMap((id) => {
      const completed = join(base, id, 'result.json'),
        started = join(base, id, 'started.json')
      if (!existsSync(completed) && !existsSync(started)) return []
      const path = existsSync(completed) ? completed : started
      try {
        const record = read(path),
          status = path === completed ? record.status : 'incomplete'
        if (
          record.kind !== 'combined-verification' ||
          record.schemaVersion !== 1 ||
          !text(record.createdAt) ||
          !text(record.headSha) ||
          !['passed', 'failed', 'incomplete'].includes(status)
        )
          throw Error('malformed retained attempt')
        return [
          {
            recordPath: path,
            digest: digest(record),
            headSha: record.headSha,
            branch: record.branch,
            policyDigest: record.policyDigest,
            status,
            createdAt: record.createdAt,
            disposition:
              status !== 'passed'
                ? {
                    status: 'unresolved',
                    reason:
                      status === 'incomplete'
                        ? 'Attempt has no final result; retained for reconciliation'
                        : 'Prior failure retained; a later pass does not explain or waive this failure',
                  }
                : null,
          },
        ]
      } catch {
        return [
          {
            recordPath: path,
            digest: digest(readFileSync(path, 'utf8')),
            digestEncoding: 'raw',
            headSha: null,
            status: 'unreadable',
            createdAt: lstatSync(path).mtime.toISOString(),
            disposition: {
              status: 'unresolved',
              reason: 'Prior attempt is unreadable; retained bytes require reconciliation',
            },
          },
        ]
      }
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}
const runCommand = ({ command, worktree, scratchDir, policy, timeoutMs }) =>
  runSandboxed('/bin/sh', ['-c', command], {
    cwd: worktree,
    scratchDir,
    policy,
    role: 'reviewer',
    timeoutMs,
    check: false,
  })

async function runRenderedCheck(args) {
  const { evaluateRenderedReview } = await import('./rendered-review.mjs')
  const result = await evaluateRenderedReview({
    worktree: args.worktree,
    head: args.head,
    policy: args.policy,
    planPath: args.check.renderedReview,
    scratchDir: args.scratchDir,
    evidenceDir: args.evidenceDir,
    timeoutMs: Math.min(args.timeoutMs, args.check.timeoutMs || 30000, 300000),
  })
  if (
    !result?.recordPath ||
    !result.record ||
    !['passed', 'failed', 'pending'].includes(result.status)
  )
    throw Error('malformed supervised browser evidence')
  return {
    code: result.status === 'passed' ? 0 : 1,
    stdout: JSON.stringify({ status: result.status, recordPath: result.recordPath }),
    stderr: result.status === 'passed' ? '' : `Rendered review ${result.status}`,
    renderedEvidence: { recordPath: result.recordPath, digest: digest(result.record) },
  }
}

/** Read-only preparation shared by dry-run and execution. */
export async function planCombinedRevision({ root, branch, policy, approvedIssues }) {
  policy = requirePolicy({ policy }, root)
  const contract = resolveDeliveryContract(policy)
  if (!text(branch) || branch.startsWith('-') || /[\s\x00-\x1f]/.test(branch))
    throw Error('explicit local combined branch or commit required')
  if (
    (await revParse(root, `${policy.target.baseRef || policy.target.base}^{commit}`)) !==
    policy.target.baseSha
  )
    throw Error('combined verification base changed; resolve current policy')
  const head = await revParse(root, `${branch}^{commit}`)
  await assertDescendsFrom(root, policy.target.baseSha, head)
  const approvals = await approvalsCurrent(approvedIssues, { root, head, policy })
  const changed = await validateChanges(policy, root, policy.target.baseSha, head)
  if (!contract.checks.some((c) => text(c.command) || text(c.renderedReview))) {
    if (
      !policy.authorization.id ||
      !policy.verification.exemption?.reason ||
      !isDocumentationOnly(changed)
    )
      throw Error(
        'no delivery commands: only an authorized documentation-only exemption can proceed',
      )
  }
  if (within(canonicalPath(root), canonicalPath(storeRoot(root))))
    throw Error('combined supervisor store must be outside target')
  return {
    status: 'planned',
    root: canonicalPath(root),
    branch,
    headSha: head,
    contract,
    approvals,
    changedPaths: changed,
    effects: [],
  }
}

/** Supervisor-owned checks of committed combined bytes. No merge or model calls. */
export async function verifyCombinedRevision({
  repo,
  root,
  branch,
  policy,
  approvedIssues,
  deps = {},
}) {
  policy = requirePolicy({ policy }, root)
  const {
    headSha: head,
    contract,
    approvals,
    changedPaths,
  } = await planCombinedRevision({ root, branch, policy, approvedIssues })
  const previous = history(root),
    dir = ensureDir(join(storeRoot(root), randomUUID()))
  if (within(canonicalPath(root), canonicalPath(dir)))
    throw Error('combined supervisor store must be outside target')
  const record = {
    schemaVersion: 1,
    kind: 'combined-verification',
    repo,
    target: { ...policy.target, root: canonicalPath(root) },
    harness: policy.harness,
    headSha: head,
    branch,
    policyDigest: policy.digest,
    policy,
    contract,
    contractDigest: digest(contract),
    approvals,
    changedPaths,
    history: previous,
    checks: [],
    boundaries: contract.boundaries,
    humanAcceptance: 'unverified',
    release: 'unverified',
    createdAt: new Date().toISOString(),
    status: 'running',
    failure: null,
  }
  write(join(dir, 'started.json'), record)
  let allowance
  try {
    allowance = openBudget({ repo, policy })
  } catch (error) {
    record.failure = error.message
  }
  for (const [index, check] of contract.checks.entries()) {
    if (text(check.notApplicable)) {
      record.checks.push({ ...check, status: 'not-applicable' })
      continue
    }
    if (record.failure) {
      record.checks.push({ ...check, status: 'not-run', reason: 'Earlier delivery check failed' })
      continue
    }
    const worktree = join(dir, `check-${index}-source`),
      scratchDir = ensureDir(join(dir, `check-${index}-scratch`))
    const entry = {
      ...check,
      status: 'running',
      environment: {
        platform: platform(),
        arch: arch(),
        osRelease: release(),
        node: process.version,
        backend: policy.sandbox.backend,
        toolchains: policy.sandbox.toolchainPaths || [],
        network: text(check.renderedReview) ? 'supervised-loopback-origin' : 'none',
        source: 'read-only',
        policyDigest: policy.digest,
      },
    }
    entry.environmentId = digest(entry.environment)
    record.checks.push(entry)
    try {
      await createPrivateCheckout(root, worktree, head)
      await assertExactCheckout(worktree, head)
      const result = await allowance.call(
        'verification',
        ({ timeoutMs }) =>
          (text(check.renderedReview) ? runRenderedCheck : deps.runCommand || runCommand)({
            command: check.command,
            worktree,
            scratchDir,
            policy,
            timeoutMs: Math.min(check.timeoutMs || timeoutMs, timeoutMs),
            head,
            check,
            evidenceDir: join(dir, `check-${index}-browser`),
          }),
        {
          attemptId: dir,
          issueKey: 'combined',
          headSha: head,
          command: check.command || `renderedReview:${check.renderedReview}`,
        },
      )
      if (
        !result ||
        !Number.isInteger(result.code) ||
        typeof result.stdout !== 'string' ||
        typeof result.stderr !== 'string'
      )
        throw Error('malformed combined process evidence')
      entry.output = { stdout: result.stdout, stderr: result.stderr }
      entry.exitCode = result.code
      if (result.renderedEvidence) entry.renderedEvidence = result.renderedEvidence
      await assertExactCheckout(worktree, head)
      if (result.code !== 0)
        throw Error(`delivery check ${check.id} exit ${result.code}: ${result.stderr.trim()}`)
      entry.status = 'passed'
    } catch (error) {
      if (error.processResult) {
        entry.output = {
          stdout: error.processResult.stdout || '',
          stderr: error.processResult.stderr || '',
        }
        entry.exitCode = error.processResult.code
        entry.timedOut = error.processResult.timedOut === true
      }
      entry.status = 'failed'
      entry.reason = error.message
      record.failure = error.message
    } finally {
      entry.outputDigest = digest(entry.output || null)
      write(join(dir, `check-${index}.json`), entry)
      rmSync(worktree, { recursive: true, force: true })
    }
  }
  if (!record.failure)
    try {
      const current = await planCombinedRevision({ root, branch, policy, approvedIssues })
      if (current.headSha !== head) throw Error('combined branch moved during verification')
      if (digest(current.approvals) !== digest(approvals))
        throw Error('combined approval inputs changed during verification')
    } catch (error) {
      record.failure = error.message
    }
  record.status = record.failure ? 'failed' : 'passed'
  record.completedAt = new Date().toISOString()
  record.budget = allowance?.snapshot() || null
  const recordPath = write(join(dir, 'result.json'), record)
  return { status: record.status, recordPath, record }
}

export async function validateCombinedRecord(recordPath, { root, branch, policy, approvedIssues }) {
  try {
    policy = requirePolicy({ policy }, root)
    const path = trustedPath(recordPath, root),
      record = read(path),
      contract = resolveDeliveryContract(policy)
    const recordedPolicy = requirePolicy({ policy: record.policy }, root)
    if (
      record.kind !== 'combined-verification' ||
      record.schemaVersion !== 1 ||
      record.status !== 'passed' ||
      record.failure
    )
      throw Error('combined verification is absent or failed')
    if (record.branch !== branch)
      throw Error(
        'combined verification branch changed; verify the requested branch with its own history',
      )
    if (
      record.target.root !== canonicalPath(root) ||
      recordedPolicy.digest !== policy.digest ||
      record.policyDigest !== policy.digest ||
      record.contractDigest !== digest(contract) ||
      digest(record.contract) !== digest(contract)
    )
      throw Error('combined verification policy or contract changed')
    if (
      (await revParse(root, `${policy.target.baseRef || policy.target.base}^{commit}`)) !==
      policy.target.baseSha
    )
      throw Error('combined verification base changed; resolve current policy')
    const head = await revParse(root, `${branch}^{commit}`)
    if (record.headSha !== head) throw Error('combined revision changed; rerun verification')
    const approvals = await approvalsCurrent(approvedIssues, { root, head, policy })
    if (digest(approvals) !== digest(record.approvals))
      throw Error('combined approval inputs changed')
    if (record.checks.length !== contract.checks.length)
      throw Error('combined check evidence missing')
    for (const [index, check] of contract.checks.entries()) {
      const entry = record.checks[index]
      if (entry.id !== check.id || entry.kind !== check.kind)
        throw Error('combined command identity changed')
      if (text(check.notApplicable)) {
        if (entry.status !== 'not-applicable' || entry.notApplicable !== check.notApplicable)
          throw Error('inapplicability changed')
        continue
      }
      if (
        entry.status !== 'passed' ||
        entry.command !== check.command ||
        entry.renderedReview !== check.renderedReview ||
        entry.exitCode !== 0 ||
        entry.outputDigest !== digest(entry.output) ||
        entry.environmentId !== digest(entry.environment) ||
        digest(entry) !== digest(read(join(dirname(path), `check-${index}.json`)))
      )
        throw Error('combined process evidence changed or failed')
      if (text(check.renderedReview)) {
        const browserPath = canonicalPath(entry.renderedEvidence?.recordPath || '.')
        if (
          !within(canonicalPath(join(dirname(path), `check-${index}-browser`)), browserPath) ||
          digest(read(browserPath)) !== entry.renderedEvidence.digest
        )
          throw Error('combined rendered evidence is missing or changed')
        const { validateRenderedReviewRecord } = await import('./rendered-review.mjs')
        const result = await validateRenderedReviewRecord({
          recordPath: browserPath,
          head,
          policy,
          sourceRoot: root,
          planPath: check.renderedReview,
        })
        if (!result.valid) throw Error(`combined rendered evidence invalid: ${result.reason}`)
      }
    }
    for (const prior of record.history)
      if (
        digest(
          prior.digestEncoding === 'raw'
            ? readFileSync(trustedPath(prior.recordPath, root), 'utf8')
            : read(trustedPath(prior.recordPath, root)),
        ) !== prior.digest
      )
        throw Error('prior combined attempt history changed')
    const captured = new Map(
      record.history.map((prior) => [canonicalPath(dirname(prior.recordPath)), prior]),
    )
    for (const current of history(root)) {
      const attempt = canonicalPath(dirname(current.recordPath))
      if (attempt === canonicalPath(dirname(path))) continue
      const relevant =
        current.status === 'unreadable' ||
        current.headSha === head ||
        current.branch === record.branch
      if (!relevant) continue
      const prior = captured.get(attempt)
      if (
        !prior ||
        canonicalPath(prior.recordPath) !== canonicalPath(current.recordPath) ||
        prior.digest !== current.digest
      )
        throw Error(
          'A newer or unreconciled combined attempt exists; rerun verification and use its current record',
        )
    }
    return { valid: true, record, reason: null }
  } catch (error) {
    return { valid: false, reason: error.message }
  }
}

/** Feature delivery uses its actual issue file and branch, never caller-supplied old criteria. */
export async function validateFeatureDelivery({ featureDir, root, manifest, evidence, policy }) {
  try {
    if (!text(evidence?.combinedVerification))
      throw Error('current combinedVerification record is required')
    const path = trustedPath(evidence.combinedVerification, root),
      record = read(path)
    const { parseIssuesFile, validateIssues } = await import('./local-issues.mjs')
    const issues = validateIssues(
      parseIssuesFile(readFileSync(join(featureDir, 'issues.md'), 'utf8')),
    )
    if (!issues.length || record.approvals.length !== issues.length)
      throw Error('combined evidence must include every current feature issue')
    const approvedIssues = issues.map((issue) => {
      const entry = record.approvals.find((candidate) => candidate.issue.key === issue.key)
      if (!entry) throw Error(`combined approval missing for ${issue.key}`)
      return { issue, approvalPath: entry.approvalPath }
    })
    if (!policy) {
      const { resolvePolicy } = await import('./policy.mjs')
      const { loadConfig } = await import('./config.mjs')
      const prior = requirePolicy({ policy: record.policy }, root)
      // This restores the context of already-executed evidence for a read-only
      // comparison. It never authorizes a new verification or opens a budget.
      const authorization = {
        ...(prior.authorization.id ? { id: prior.authorization.id } : {}),
        protectedPaths: prior.authorization.protectedPaths,
        ...(prior.authorization.recoveryWindow
          ? { recoveryWindow: prior.authorization.recoveryWindow }
          : {}),
        ...(prior.verification.exemption
          ? { documentationExemption: prior.verification.exemption }
          : {}),
      }
      policy = await resolvePolicy({
        repoPath: root,
        base: manifest.base_branch,
        cfg: { ...loadConfig(), invocationActions: prior.supervisor?.actions || [] },
        authorization,
      })
    }
    const result = await validateCombinedRecord(path, {
      root,
      branch: manifest.branch,
      policy,
      approvedIssues,
    })
    if (!result.valid) throw Error(result.reason)
    if (evidence.revision !== result.record.headSha)
      throw Error('milestone revision differs from combined verification')
    return result
  } catch (error) {
    return { valid: false, reason: error.message }
  }
}
