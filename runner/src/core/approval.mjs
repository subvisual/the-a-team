import { readFileSync, writeFileSync, rmSync, readdirSync, existsSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import {
  createPrivateCheckout,
  assertDescendsFrom,
  assertExactCheckout,
  revParse,
  git,
} from '../git.mjs'
import { canonicalPath, digest, validateChanges } from '../policy.mjs'
import { runSandboxed } from '../sandbox.mjs'
import { ensureDir, home, slug } from '../paths.mjs'
import { validateExecutor, validateReviewer } from './results.mjs'

export const criteriaDigest = (issue) =>
  digest({
    key: issue.key,
    title: issue.title,
    body: issue.body,
    acceptanceCriteria: issue.acceptanceCriteria,
  })
const freeze = (object) => {
  if (object && typeof object === 'object') {
    Object.freeze(object)
    for (const value of Object.values(object)) freeze(value)
  }
  return object
}
export function requirePolicy(cfg, repoPath) {
  const p = cfg?.policy
  if (
    !p ||
    p.schemaVersion !== 1 ||
    !p.harness?.revision ||
    !p.harness?.root ||
    !p.target?.root ||
    !p.target?.base ||
    !/^[0-9a-f]{40,64}$/.test(p.target.baseSha) ||
    typeof p.digest !== 'string' ||
    !Array.isArray(p.verification?.commands)
  )
    throw new Error('resolved execution policy is required before any run effects')
  const { digest: expectedDigest, ...document } = p
  if (digest(document) !== expectedDigest)
    throw new Error('resolved policy digest does not match policy contents')
  if (canonicalPath(repoPath) !== canonicalPath(p.target.root))
    throw new Error('resolved policy target does not match repository')
  if (p.verification.commands.some((c) => typeof c !== 'string' || !c.trim()))
    throw new Error('policy verification commands must be nonempty strings')
  return freeze(structuredClone(p))
}
const writeEvidence = (path, value) => {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o444 })
  return path
}
const outputDigest = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')
export function isDocumentationOnly(paths) {
  return (
    paths.length > 0 &&
    paths.every(
      (p) =>
        /\.(md|rst|adoc)$/i.test(p) &&
        (p.startsWith('docs/') ||
          /^(README|CHANGELOG|CONTRIBUTING|LICENSE|NOTICE)(\.[^.]+)?$/i.test(basename(p))),
    )
  )
}
function verificationExemption(policy, changed) {
  const e = policy.verification.exemption
  return !!(
    e &&
    typeof e.reason === 'string' &&
    e.reason.trim() &&
    policy.authorization?.id &&
    isDocumentationOnly(changed)
  )
}
export function approvalGate({ implementation, verdict, verification, policy, changed }) {
  if (implementation) {
    validateExecutor(implementation)
    if (implementation.status !== 'done')
      throw new Error(`executor blocked: ${implementation.blockedReason}`)
  }
  validateReviewer(verdict)
  if (verdict.verdict !== 'approve')
    throw new Error(`reviewer ${verdict.verdict}: ${verdict.notes}`)
  const exempt = verificationExemption(policy, changed)
  if (!policy.verification.commands.length && !exempt)
    throw new Error(
      'approval refused: no declared verification commands or applicable documentation-only exemption',
    )
  if (!exempt && implementation && (!implementation.testsRan || !implementation.testsPassed))
    throw new Error(
      'executor tests absent, skipped or failed without an applicable verification exemption',
    )
  if (!exempt && (!verdict.testsRan || !verdict.testsPassed))
    throw new Error(
      'reviewer tests absent, skipped or failed without an applicable verification exemption',
    )
  if (verification.commands.length !== policy.verification.commands.length)
    throw new Error('required supervisor verification evidence is missing')
  for (const command of verification.commands)
    if (command.exitCode !== 0)
      throw new Error(
        `supervisor verification failed with exit ${command.exitCode}: ${command.outputRef}`,
      )
  return true
}
const runVerification = ({ command, worktree, scratchDir, policy }) =>
  runSandboxed('/bin/sh', ['-c', command], {
    cwd: worktree,
    scratchDir,
    policy,
    role: 'reviewer',
    check: false,
  })

/** Evaluate only committed bytes, with separate source and scratch for every process. */
export async function evaluateRevision({
  repo,
  repoPath,
  source,
  issue,
  baseSha,
  head,
  policy,
  implementation = null,
  review,
  runDir,
  cycle = 1,
  model,
  budgetUsd,
  resumeSessionId = null,
  deps = {},
}) {
  await assertDescendsFrom(source, baseSha, head)
  const changed = await validateChanges(policy, source, baseSha, head)
  const criteria = criteriaDigest(issue)
  const reviewSource = join(runDir, `review-${cycle}-source`)
  // Claude's resumed reviewer needs its own prior session state. Source stays
  // fresh per cycle; only this role's scratch is shared within the run.
  const reviewScratch = ensureDir(join(runDir, 'reviewer-scratch'))
  let verdict
  await createPrivateCheckout(source, reviewSource, head)
  try {
    await assertExactCheckout(reviewSource, head)
    verdict = validateReviewer(
      await review({
        issue,
        base: baseSha,
        head,
        worktree: reviewSource,
        testCommand: policy.verification.commands.join(' && '),
        model,
        budgetUsd,
        runDir,
        cycle,
        resumeSessionId,
        repoPath: reviewSource,
        policy,
        scratchDir: reviewScratch,
      }),
    )
    await assertExactCheckout(reviewSource, head)
  } finally {
    rmSync(reviewSource, { recursive: true, force: true })
  }
  if (criteriaDigest(issue) !== criteria)
    throw new Error('issue acceptance criteria changed during review')
  if (verdict.verdict !== 'approve') return { verdict }

  const verification = {
    commands: [],
    exemption: verificationExemption(policy, changed)
      ? { ...policy.verification.exemption, authorizationId: policy.authorization.id }
      : null,
  }
  const verificationPath = join(runDir, `verification-${cycle}.json`)
  let failure = null
  for (let i = 0; i < policy.verification.commands.length; i += 1) {
    const command = policy.verification.commands[i]
    const checkSource = join(runDir, `check-${cycle}-${i + 1}-source`)
    const scratchDir = ensureDir(join(runDir, `check-${cycle}-${i + 1}-scratch`))
    const outputRef = join(runDir, `check-${cycle}-${i + 1}-output.json`)
    let result
    await createPrivateCheckout(source, checkSource, head)
    try {
      await assertExactCheckout(checkSource, head)
      result = await (deps.runVerification || runVerification)({
        command,
        worktree: checkSource,
        scratchDir,
        policy,
      })
      if (
        !result ||
        !Number.isInteger(result.code) ||
        typeof result.stdout !== 'string' ||
        typeof result.stderr !== 'string'
      )
        throw new Error('supervisor verification returned malformed process evidence')
      writeEvidence(outputRef, {
        command,
        exitCode: result.code,
        stdout: result.stdout,
        stderr: result.stderr,
      })
      const entry = {
        command,
        environmentId: digest({
          backend: policy.sandbox?.backend,
          toolchains: policy.sandbox?.toolchainPaths || [],
          network: 'none',
          source: 'read-only',
          policy: policy.digest,
        }),
        exitCode: result.code,
        outputRef,
        outputDigest: outputDigest(outputRef),
      }
      verification.commands.push(entry)
      await assertExactCheckout(checkSource, head)
      if (result.code !== 0)
        throw new Error(
          `supervisor verification failed with exit ${result.code}; output: ${outputRef}`,
        )
    } catch (error) {
      failure = error
      break
    } finally {
      rmSync(checkSource, { recursive: true, force: true })
    }
  }
  writeEvidence(verificationPath, {
    schemaVersion: 1,
    headSha: head,
    baseSha,
    criteriaDigest: criteria,
    ...verification,
    outputs: verification.commands.map((c) => JSON.parse(readFileSync(c.outputRef, 'utf8'))),
    failure: failure?.message || null,
  })
  try {
    if (failure) throw failure
    if (criteriaDigest(issue) !== criteria)
      throw new Error('issue acceptance criteria changed during verification')
    approvalGate({ implementation, verdict, verification, policy, changed })
    const record = {
      schemaVersion: 1,
      repository: { name: repo, ...policy.target },
      harness: policy.harness,
      issueKey: issue.key,
      criteriaDigest: criteria,
      baseSha,
      headSha: head,
      policyDigest: policy.digest,
      policy,
      evaluator: { model, sessionId: verdict.sessionId || null },
      implementation: implementation
        ? {
            kind: 'executor',
            sessionId: implementation.sessionId || null,
            exitCode: implementation.exitCode,
          }
        : { kind: 'existing-pr' },
      verification,
      verificationPath,
      createdAt: new Date().toISOString(),
    }
    const approvalPath = writeEvidence(join(runDir, `approval-${cycle}.json`), record)
    return { verdict, verification, verificationPath, approvalPath, record }
  } catch (error) {
    error.verificationPath = verificationPath
    throw error
  }
}

/** Recheck all relevant identities and stored output hashes before reusing evidence. */
export function validateApprovalRecord(record, { repo, issue, head, baseSha, policy }) {
  if (!record || record.schemaVersion !== 1)
    return { valid: false, reason: 'missing versioned approval record' }
  for (const [key, actual, expected] of [
    ['repository', record.repository?.name, repo],
    ['head', record.headSha, head],
    ['base', record.baseSha, baseSha],
    ['criteria', record.criteriaDigest, criteriaDigest(issue)],
    ['policy', record.policyDigest, policy.digest],
    ['harness', record.harness?.revision, policy.harness.revision],
    ['target', record.repository?.root, policy.target.root],
    ['target remote', record.repository?.remote, policy.target.remote],
    ['harness root', record.harness?.root, policy.harness.root],
  ])
    if (actual !== expected) return { valid: false, reason: `approval ${key} changed` }
  if (
    !record.verification ||
    !Array.isArray(record.verification.commands) ||
    record.verification.commands.length !== policy.verification.commands.length
  )
    return { valid: false, reason: 'approval verification contract changed' }
  if (
    !record.verification.commands.length &&
    !(
      record.verification.exemption?.authorizationId &&
      record.verification.exemption.authorizationId === policy.authorization?.id &&
      record.verification.exemption.reason === policy.verification.exemption?.reason
    )
  )
    return { valid: false, reason: 'approval exemption is missing or changed' }
  for (let i = 0; i < record.verification.commands.length; i += 1) {
    const c = record.verification.commands[i]
    if (
      c.command !== policy.verification.commands[i] ||
      c.exitCode !== 0 ||
      !c.environmentId ||
      !existsSync(c.outputRef) ||
      outputDigest(c.outputRef) !== c.outputDigest
    )
      return { valid: false, reason: 'approval verification evidence changed' }
  }
  return { valid: true, reason: null }
}
export async function assertApprovalCurrent(record, context) {
  const result = validateApprovalRecord(record, context)
  if (!result.valid) throw new Error(result.reason)
  if (
    (await revParse(context.repoPath, context.baseRef || context.policy.target.base)) !==
    record.baseSha
  )
    throw new Error('approval base changed before delivery')
  if (context.branch && (await revParse(context.repoPath, context.branch)) !== record.headSha)
    throw new Error('approval head changed before delivery')
  if (context.source && (await revParse(context.source, 'HEAD')) !== record.headSha)
    throw new Error('executor head changed before delivery')
}
function runRecords(repo, issueKey, pattern) {
  const root = join(home(), 'runs', slug(repo), slug(String(issueKey)))
  if (!existsSync(root)) return []
  const records = []
  for (const run of readdirSync(root).sort().reverse()) {
    try {
      for (const file of readdirSync(join(root, run))
        .filter((n) => pattern.test(n))
        .reverse()) {
        try {
          records.push(JSON.parse(readFileSync(join(root, run, file), 'utf8')))
        } catch {
          /* malformed evidence cannot authorize reuse */
        }
      }
    } catch {
      /* partially written runs are not evidence */
    }
  }
  return records
}
export function approvalRecords(repo, issueKey) {
  return runRecords(repo, issueKey, /^approval-\d+\.json$/)
}
export function findApprovalRecord(repo, issueKey, context) {
  return (
    approvalRecords(repo, issueKey).find(
      (record) => validateApprovalRecord(record, context).valid,
    ) || null
  )
}

function deliveryPaths(record) {
  const cycle =
    typeof record.verificationPath === 'string' &&
    basename(record.verificationPath).match(/^verification-(\d+)\.json$/)?.[1]
  if (!cycle) throw new Error('approval verification path is malformed')
  return {
    approvalPath: join(dirname(record.verificationPath), `approval-${cycle}.json`),
    receiptPath: join(dirname(record.verificationPath), `delivery-${cycle}.json`),
  }
}

export function recordDelivery({ record, approvalPath, repo, prNumber = null, kind, via = null }) {
  const paths = deliveryPaths(record)
  if (paths.approvalPath !== approvalPath)
    throw new Error('delivery refers to a different approval record')
  return writeEvidence(paths.receiptPath, {
    schemaVersion: 1,
    repo,
    prNumber,
    kind,
    via,
    headSha: record.headSha,
    baseSha: record.baseSha,
    criteriaDigest: record.criteriaDigest,
    policyDigest: record.policyDigest,
    approvalRef: approvalPath,
    approvalDigest: outputDigest(approvalPath),
    recordDigest: digest(record),
    publishedAt: new Date().toISOString(),
  })
}

export function hasDeliveryReceipt(record, { repo, prNumber } = {}) {
  try {
    const { approvalPath, receiptPath } = deliveryPaths(record)
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
    return (
      receipt.schemaVersion === 1 &&
      (receipt.kind === 'adapter-approval'
        ? receipt.prNumber === null
        : receipt.kind === 'github-verdict' &&
          Number.isInteger(receipt.prNumber) &&
          receipt.prNumber > 0 &&
          ['review', 'comment'].includes(receipt.via)) &&
      receipt.repo === repo &&
      (prNumber === undefined || receipt.prNumber === prNumber) &&
      receipt.headSha === record.headSha &&
      receipt.baseSha === record.baseSha &&
      receipt.criteriaDigest === record.criteriaDigest &&
      receipt.policyDigest === record.policyDigest &&
      receipt.approvalRef === approvalPath &&
      receipt.recordDigest === digest(record) &&
      receipt.approvalDigest === outputDigest(approvalPath)
    )
  } catch {
    return false
  }
}

export function findDeliveredApprovalRecord(repo, issueKey, context) {
  return (
    approvalRecords(repo, issueKey).find(
      (record) =>
        validateApprovalRecord(record, context).valid &&
        hasDeliveryReceipt(record, { repo, prNumber: context.prNumber }),
    ) || null
  )
}

// Negative reviews can suppress an unchanged watch tick, but can never authorize
// approval. Only the supervisor writes this record after a successful delivery.
export function recordNonapprovalDelivery({
  repo,
  issue,
  head,
  baseSha,
  policy,
  verdict,
  prNumber,
  via,
  runDir,
  cycle,
}) {
  validateReviewer(verdict)
  if (!['request-changes', 'blocked'].includes(verdict.verdict))
    throw new Error('negative review receipt cannot represent approval')
  if (!Number.isInteger(prNumber) || prNumber < 1 || !['review', 'comment'].includes(via))
    throw new Error('negative review requires confirmed GitHub delivery')
  return writeEvidence(join(runDir, `review-delivery-${cycle}.json`), {
    schemaVersion: 1,
    kind: 'delivered-nonapproval-review',
    repository: { name: repo, ...policy.target },
    harness: policy.harness,
    issueKey: issue.key,
    criteriaDigest: criteriaDigest(issue),
    headSha: head,
    baseSha,
    policyDigest: policy.digest,
    verdict,
    prNumber,
    via,
    publishedAt: new Date().toISOString(),
  })
}

export function findDeliveredNonapprovalRecord(repo, issueKey, context) {
  const { issue, head, baseSha, policy, prNumber } = context
  return (
    runRecords(repo, issueKey, /^review-delivery-\d+\.json$/).find((record) => {
      try {
        validateReviewer(record.verdict)
        return (
          record.schemaVersion === 1 &&
          record.kind === 'delivered-nonapproval-review' &&
          ['request-changes', 'blocked'].includes(record.verdict.verdict) &&
          ['review', 'comment'].includes(record.via) &&
          record.prNumber === prNumber &&
          record.repository?.name === repo &&
          record.repository?.root === policy.target.root &&
          record.repository?.remote === policy.target.remote &&
          record.issueKey === issue.key &&
          record.harness?.root === policy.harness.root &&
          record.harness?.revision === policy.harness.revision &&
          record.criteriaDigest === criteriaDigest(issue) &&
          record.headSha === head &&
          record.baseSha === baseSha &&
          record.policyDigest === policy.digest
        )
      } catch {
        return false
      }
    }) || null
  )
}
