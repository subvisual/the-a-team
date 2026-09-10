import { readFileSync, writeFileSync, rmSync, readdirSync, existsSync, copyFileSync } from 'node:fs'
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
import { openBudget } from './budget.mjs'
import { writeReviewEvidence } from './provenance.mjs'
import { buildTestAdequacyAuthority, deriveTestAdequacyAuthority } from './adequacy-authority.mjs'

import { deriveRenderedReviewAuthority, validateRenderedAuthority } from './rendered-authority.mjs'
import {
  evaluateRenderedReview,
  validateRenderedReviewRecord,
  summarizeRenderedCandidates,
} from '../rendered-review.mjs'

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
export function approvalGate({
  implementation,
  verdict,
  verification,
  policy,
  changed,
  issue,
  adequacyAuthority,
  renderedAuthority,
  renderedReview,
}) {
  if (renderedAuthority?.required && renderedReview?.status !== 'passed')
    throw new Error(
      'approval refused: required independently observed rendered evidence is missing, pending or failed',
    )
  if (implementation) {
    validateExecutor(implementation)
    if (implementation.status !== 'done')
      throw new Error(`executor blocked: ${implementation.blockedReason}`)
  }
  const authority =
    adequacyAuthority || buildTestAdequacyAuthority({ root: null, issue, selection: null })
  validateReviewer(verdict, { issue, adequacyAuthority: authority })
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
const runVerification = ({ command, worktree, scratchDir, policy, timeoutMs }) =>
  runSandboxed('/bin/sh', ['-c', command], {
    cwd: worktree,
    scratchDir,
    policy,
    role: 'reviewer',
    check: false,
    timeoutMs,
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
  budget,
  attemptId,
  resumeSessionId = null,
  deps = {},
}) {
  const allowance = budget || openBudget({ repo, policy })
  await assertDescendsFrom(source, baseSha, head)
  const changed = await validateChanges(policy, source, baseSha, head)
  const criteria = criteriaDigest(issue)
  const reviewSource = join(runDir, `review-${cycle}-source`)
  // Claude's resumed reviewer needs its own prior session state. Source stays
  // fresh per cycle; only this role's scratch is shared within the run.
  const reviewScratch = ensureDir(join(runDir, 'reviewer-scratch'))
  let verdict
  const authoritySource = join(runDir, `review-${cycle}-authority-source`)
  let adequacyAuthority,
    renderedAuthority,
    renderedReview = null
  await createPrivateCheckout(source, authoritySource, baseSha)
  try {
    await assertExactCheckout(authoritySource, baseSha)
    adequacyAuthority = deriveTestAdequacyAuthority({
      root: authoritySource,
      policy,
      issue,
      paths: changed,
    })
    renderedAuthority = await deriveRenderedReviewAuthority({
      root: authoritySource,
      head: baseSha,
      policy,
      issue,
      paths: changed,
    })
    await assertExactCheckout(authoritySource, baseSha)
  } finally {
    rmSync(authoritySource, { recursive: true, force: true })
  }
  await createPrivateCheckout(source, reviewSource, head)
  try {
    await assertExactCheckout(reviewSource, head)
    if (renderedAuthority.required) {
      renderedReview = renderedAuthority.planPath
        ? await allowance.call(
            'verification',
            async ({ timeoutMs }) =>
              evaluateRenderedReview({
                worktree: reviewSource,
                head,
                policy,
                planPath: renderedAuthority.planPath,
                scratchDir: ensureDir(join(runDir, `rendered-${cycle}-scratch`)),
                evidenceDir: ensureDir(join(runDir, `rendered-${cycle}-evidence`)),
                timeoutMs: Math.min(timeoutMs, 300000),
                authority: renderedAuthority,
              }),
            {
              issueKey: issue.key,
              attemptId,
              cycle,
              headSha: head,
              command: 'supervisor rendered review',
            },
          )
        : {
            status: 'pending',
            recordPath: null,
            record: {
              status: 'pending',
              failure: 'accepted rendered obligations have no pinned declarative plan',
              obligations: renderedAuthority.obligations,
            },
          }
    }
    if (renderedReview?.recordPath) {
      const candidates = []
      for (let previous = 1; previous < cycle; previous++) {
        const path = join(runDir, `rendered-history-${previous}.json`)
        if (existsSync(path)) {
          const prior = JSON.parse(readFileSync(path, 'utf8')).current
          if (prior?.recordPath && !candidates.some((c) => c.recordPath === prior.recordPath))
            candidates.push({
              recordPath: prior.recordPath,
              record: JSON.parse(readFileSync(prior.recordPath, 'utf8')),
            })
        }
      }
      candidates.push(renderedReview)
      renderedReview.candidateHistory = summarizeRenderedCandidates(
        candidates,
        head,
        policy.limits?.maxCycles || 10,
      )
      writeEvidence(join(runDir, `rendered-history-${cycle}.json`), renderedReview.candidateHistory)

      const copyRoot = ensureDir(join(reviewScratch, `rendered-evidence-${cycle}`))
      renderedReview.reviewerCopies = []
      for (const entry of renderedReview.record.cases)
        for (const artifact of [entry.screenshot, entry.machineEvidence].filter(Boolean)) {
          const path = join(copyRoot, basename(artifact.path))
          copyFileSync(artifact.path, path)
          renderedReview.reviewerCopies.push({ path, hash: artifact.hash })
        }
    }
    verdict = await allowance.call(
      'reviewer',
      async (grant) => {
        const result = await review({
          issue,
          base: baseSha,
          head,
          worktree: reviewSource,
          testCommand: policy.verification.commands.join(' && '),
          model,
          budgetUsd: grant.budgetUsd,
          timeoutMs: grant.timeoutMs,
          runDir,
          cycle,
          resumeSessionId,
          repoPath: reviewSource,
          policy,
          scratchDir: reviewScratch,
          adequacyAuthority,
          renderedAuthority,
          renderedReview,
        })
        try {
          return validateReviewer(result, { issue, adequacyAuthority })
        } catch (error) {
          error.costUsd = result?.costUsd
          throw error
        }
      },
      { issueKey: issue.key, attemptId, cycle, headSha: head },
    )
    if (
      renderedAuthority.required &&
      renderedReview.status !== 'passed' &&
      verdict.verdict === 'approve'
    ) {
      verdict = {
        ...verdict,
        verdict: 'request-changes',
        notes:
          verdict.notes +
          '\nSupervisor rendered review: ' +
          renderedReview.status +
          '. ' +
          (renderedReview.record.failure ||
            'Rendered observations or required coverage did not pass.'),
      }
    }
    await assertExactCheckout(reviewSource, head)
  } finally {
    rmSync(reviewSource, { recursive: true, force: true })
  }
  if (criteriaDigest(issue) !== criteria)
    throw new Error('issue acceptance criteria changed during review')
  const reviewEvidence = (approvalPath = null) =>
    writeReviewEvidence({
      repo,
      issue,
      criteriaDigest: criteria,
      head,
      baseSha,
      policy,
      verdict,
      cycle,
      model,
      runDir,
      approvalPath,
      adequacyAuthority,
      renderedAuthority,
      renderedReview,
    })
  if (verdict.verdict !== 'approve') return { verdict, ...reviewEvidence() }

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
      result = await allowance.call(
        'verification',
        async ({ timeoutMs }) =>
          (deps.runVerification || runVerification)({
            command,
            worktree: checkSource,
            scratchDir,
            policy,
            timeoutMs,
          }),
        { issueKey: issue.key, attemptId, cycle, headSha: head, command },
      )
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
      if (error.processResult && !existsSync(outputRef)) {
        const timed = error.processResult
        writeEvidence(outputRef, {
          command,
          exitCode: timed.code,
          stdout: timed.stdout,
          stderr: timed.stderr,
          timedOut: timed.timedOut === true,
        })
        verification.commands.push({
          command,
          exitCode: timed.code,
          outputRef,
          outputDigest: outputDigest(outputRef),
          failureCategory: error.failureCategory,
        })
      }
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
    approvalGate({
      implementation,
      verdict,
      verification,
      policy,
      changed,
      issue,
      adequacyAuthority,
      renderedAuthority,
      renderedReview,
    })
    const record = {
      schemaVersion: 2,
      repository: { name: repo, ...policy.target },
      harness: policy.harness,
      issueKey: issue.key,
      issueVersion: issue.contentVersion || issue.version || criteria,
      criteriaDigest: criteria,
      baseSha,
      headSha: head,
      policyDigest: policy.digest,
      policy,
      evaluator: { model, sessionId: verdict.sessionId || null },
      testAdequacy: verdict.testAdequacy,
      testAdequacyAuthority: adequacyAuthority,
      renderedAuthority,
      renderedReview: renderedReview
        ? {
            status: renderedReview.status,
            recordPath: renderedReview.recordPath,
            digest: digest(renderedReview.record),
          }
        : null,
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
    return {
      verdict,
      verification,
      verificationPath,
      approvalPath,
      record,
      ...reviewEvidence(approvalPath),
    }
  } catch (error) {
    error.verificationPath = verificationPath
    throw error
  }
}

/** Recheck all relevant identities and stored output hashes before reusing evidence. */
export function validateApprovalRecord(record, { repo, issue, head, baseSha, policy }) {
  if (!record || record.schemaVersion !== 2)
    return { valid: false, reason: 'missing versioned approval record' }
  try {
    validateRenderedAuthority(record.renderedAuthority, { baseSha, policy })
  } catch (error) {
    return { valid: false, reason: error.message }
  }
  if (!record.testAdequacyAuthority)
    return { valid: false, reason: 'approval is missing supervisor test adequacy authority' }
  try {
    validateReviewer(
      {
        ok: true,
        exitCode: 0,
        verdict: 'approve',
        unmetAc: [],
        notes: 'stored approval adequacy',
        testsRan: true,
        testsPassed: true,
        testCommand: 'stored-verification',
        testOutput: '',
        testAdequacy: record.testAdequacy,
      },
      { issue, adequacyAuthority: record.testAdequacyAuthority },
    )
  } catch (error) {
    return { valid: false, reason: error.message }
  }
  if (record.renderedAuthority?.required) {
    try {
      const receipt = record.renderedReview
      const rendered = JSON.parse(readFileSync(receipt.recordPath, 'utf8'))
      if (
        receipt.status !== 'passed' ||
        rendered.status !== 'passed' ||
        rendered.headSha !== head ||
        rendered.policyDigest !== policy.digest ||
        rendered.authorityDigest !== record.renderedAuthority.digest ||
        digest(rendered) !== receipt.digest
      )
        throw new Error('rendered review receipt changed')
      for (const entry of rendered.cases || [])
        for (const artifact of [entry.screenshot, entry.machineEvidence])
          if (!artifact || outputDigest(artifact.path) !== artifact.hash)
            throw new Error('rendered screenshot or observation changed')
    } catch (error) {
      return { valid: false, reason: error.message }
    }
  } else if (policy.verification.renderedReview)
    return { valid: false, reason: 'required rendered review authority missing' }
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
  if (record.renderedAuthority?.required) {
    const rendered = await validateRenderedReviewRecord({
      recordPath: record.renderedReview.recordPath,
      head: context.head,
      policy: context.policy,
      sourceRoot: context.repoPath,
      planPath: record.renderedAuthority.planPath,
      authority: record.renderedAuthority,
    })
    if (!rendered.valid) throw new Error(rendered.reason)
  }
  if (
    (await revParse(
      context.repoPath,
      context.baseRef || context.policy.target.baseRef || context.policy.target.base,
    )) !== record.baseSha
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

function writeReceipt(path, value) {
  try {
    return writeEvidence(path, value)
  } catch (error) {
    if (error.code === 'EEXIST') {
      const previous = JSON.parse(readFileSync(path, 'utf8'))
      const withoutTime = ({ publishedAt, ...record }) => record
      if (digest(withoutTime(previous)) === digest(withoutTime(value))) return path
    }
    throw error
  }
}
export function recordDelivery({ record, approvalPath, repo, prNumber = null, kind, via = null }) {
  const paths = deliveryPaths(record)
  if (paths.approvalPath !== approvalPath)
    throw new Error('delivery refers to a different approval record')
  return writeReceipt(paths.receiptPath, {
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
  validateReviewer(verdict, { issue })
  if (!['request-changes', 'blocked'].includes(verdict.verdict))
    throw new Error('negative review receipt cannot represent approval')
  if (!Number.isInteger(prNumber) || prNumber < 1 || !['review', 'comment'].includes(via))
    throw new Error('negative review requires confirmed GitHub delivery')
  return writeReceipt(join(runDir, `review-delivery-${cycle}.json`), {
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
        validateReviewer(record.verdict, { issue })
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
