import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { digest } from '../policy.mjs'
import { home, slug } from '../paths.mjs'
import { validateReviewer } from './results.mjs'
import { buildTestAdequacyAuthority } from './adequacy-authority.mjs'

const read = (path) => JSON.parse(readFileSync(path, 'utf8'))
const write = (path, value) => {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o444 })
  return path
}
export const reviewPointer = (evidenceDigest) =>
  `<!-- ateam-runner:review evidence=${evidenceDigest} -->`
export const publishedVerdictBody = ({ body, headSha, evidenceDigest }) =>
  `Evaluated commit: \`${headSha}\`.\n${reviewPointer(evidenceDigest)}\n\n${body}`

export function writeReviewEvidence({
  repo,
  issue,
  criteriaDigest,
  head,
  baseSha,
  policy,
  verdict,
  cycle,
  model,
  runDir,
  approvalPath = null,
  adequacyAuthority = null,
  renderedAuthority = null,
  renderedReview = null,
}) {
  const authority =
    adequacyAuthority || buildTestAdequacyAuthority({ root: null, issue, selection: null })
  validateReviewer(verdict, { issue, adequacyAuthority: authority })
  const record = {
    schemaVersion: 1,
    kind: 'review-evidence',
    repository: { name: repo, ...policy.target },
    issueKey: issue.key,
    issueVersion: issue.contentVersion || issue.version || criteriaDigest,
    criteriaDigest,
    headSha: head,
    baseSha,
    policyDigest: policy.digest,
    supervisorActions: policy.supervisor?.actions || [],
    evaluator: { model, sessionId: verdict.sessionId || null },
    verdict,
    testAdequacyAuthority: authority,
    renderedAuthority,
    renderedReview: renderedReview
      ? {
          status: renderedReview.status,
          recordPath: renderedReview.recordPath,
          digest: digest(renderedReview.record),
          summary: renderedReview.record,
        }
      : null,
    cycle,
    approvalRef: approvalPath,
    approvalDigest: approvalPath ? digest(read(approvalPath)) : null,
    createdAt: new Date().toISOString(),
  }
  const reviewPath = write(join(runDir, `review-evidence-${cycle}.json`), record)
  return { reviewPath, reviewDigest: digest(record), reviewRecord: record }
}

function receiptPath(reviewPath) {
  const cycle = basename(reviewPath).match(/^review-evidence-(\d+)\.json$/)?.[1]
  if (!cycle) throw new Error('invalid review evidence path')
  return join(dirname(reviewPath), `review-receipt-${cycle}.json`)
}
export function recordReviewPublication({ reviewPath, publication, repo, prNumber }) {
  const record = read(reviewPath)
  if (
    !publication ||
    !['review', 'comment'].includes(publication.via) ||
    !Number.isSafeInteger(publication.id) ||
    publication.id < 1 ||
    !Number.isSafeInteger(publication.authorId) ||
    publication.authorId < 1 ||
    publication.evidenceDigest !== digest(record) ||
    publication.headSha !== record.headSha ||
    publication.event !== (record.verdict.verdict === 'approve' ? 'approve' : 'request-changes') ||
    !/^[0-9a-f]{64}$/.test(publication.bodyDigest || '') ||
    record.repository.name !== repo ||
    !Number.isSafeInteger(prNumber) ||
    prNumber < 1
  )
    throw new Error('publication lacks matching server-issued review provenance')
  const path = receiptPath(reviewPath)
  const receipt = {
    schemaVersion: 1,
    repo,
    prNumber,
    reviewDigest: digest(record),
    publication,
  }
  try {
    return write(path, receipt)
  } catch (error) {
    if (error.code === 'EEXIST' && digest(read(path)) === digest(receipt)) return path
    throw error
  }
}

function evidencePaths(repo, keys) {
  const paths = []
  for (const key of new Set(keys)) {
    const root = join(home(), 'runs', slug(repo), slug(String(key)))
    if (!existsSync(root)) continue
    for (const run of readdirSync(root).sort()) {
      const dir = join(root, run)
      try {
        for (const file of readdirSync(dir).filter((n) => /^review-evidence-\d+\.json$/.test(n)))
          paths.push(join(dir, file))
      } catch {
        /* incomplete run directories cannot authenticate */
      }
    }
  }
  return paths
}

// These records supply read-only reconstruction metadata, not authentication.
export function reviewEvidenceRecords(repo, keys) {
  return evidencePaths(repo, keys).flatMap((path) => {
    try {
      return [{ ...read(path), reviewPath: path }]
    } catch {
      return []
    }
  })
}

export function matchesRemotePublication(remote, publication, { repo, prNumber }) {
  const target = publication.via === 'review' ? remote?.pull_request_url : remote?.issue_url
  let targetPath
  try {
    targetPath = new URL(target).pathname.toLowerCase()
  } catch {
    return false
  }
  if (
    targetPath !==
    `/repos/${repo.toLowerCase()}/${publication.via === 'review' ? 'pulls' : 'issues'}/${prNumber}`
  )
    return false
  return (
    remote?.id === publication.id &&
    remote.user?.id === publication.authorId &&
    typeof remote.body === 'string' &&
    digest(remote.body) === publication.bodyDigest &&
    remote.body.includes(reviewPointer(publication.evidenceDigest)) &&
    (publication.via === 'comment' ||
      (remote.commit_id === publication.headSha &&
        remote.state === (publication.event === 'approve' ? 'APPROVED' : 'CHANGES_REQUESTED')))
  )
}

/** Markers are display pointers. Reuse starts from a local immutable record and
 * authenticates the exact server-issued publication, including its stable author ID. */
export async function authenticatedReviews(context) {
  const {
    repo,
    issue,
    head,
    baseSha,
    policy,
    prNumber,
    model,
    criteriaDigest,
    gh,
    validateApproval,
  } = context
  const completed = [],
    ignored = []
  for (const path of evidencePaths(repo, [`pr-${prNumber}`, issue.key])) {
    try {
      const record = read(path),
        receipt = read(receiptPath(path))
      validateReviewer(record.verdict, { issue })
      if (
        record.schemaVersion !== 1 ||
        record.kind !== 'review-evidence' ||
        record.repository?.name !== repo ||
        record.repository?.root !== policy.target.root ||
        record.repository?.remote !== policy.target.remote ||
        record.issueKey !== issue.key ||
        record.issueVersion !== (issue.contentVersion || issue.version || criteriaDigest) ||
        record.criteriaDigest !== criteriaDigest ||
        record.headSha !== head ||
        record.baseSha !== baseSha ||
        record.policyDigest !== policy.digest ||
        record.evaluator?.model !== model ||
        typeof record.evaluator?.model !== 'string' ||
        !record.evaluator.model.trim() ||
        typeof record.evaluator?.sessionId !== 'string' ||
        !record.evaluator.sessionId.trim() ||
        !Number.isSafeInteger(record.cycle) ||
        record.cycle < 1
      )
        throw new Error('review inputs or evaluator policy changed')
      if (record.verdict.verdict === 'blocked')
        throw new Error('blocked review is not completed evaluation')
      if (
        receipt.schemaVersion !== 1 ||
        receipt.repo !== repo ||
        receipt.prNumber !== prNumber ||
        receipt.reviewDigest !== digest(record) ||
        receipt.publication?.evidenceDigest !== digest(record) ||
        receipt.publication?.headSha !== head ||
        receipt.publication?.event !==
          (record.verdict.verdict === 'approve' ? 'approve' : 'request-changes')
      )
        throw new Error('review delivery receipt is missing or inconsistent')
      if (record.verdict.verdict === 'approve') {
        const approval = read(record.approvalRef)
        if (digest(approval) !== record.approvalDigest || !validateApproval?.(approval))
          throw new Error('approval evidence is missing or invalid')
      }
      const remote = await gh.readPublication(repo, prNumber, receipt.publication)
      if (!matchesRemotePublication(remote, receipt.publication, { repo, prNumber }))
        throw new Error('remote review author, outcome or evidence pointer does not match')
      completed.push({ ...record, reviewPath: path, publication: receipt.publication })
    } catch (error) {
      ignored.push({ path, reason: error.message })
    }
  }
  if (
    !completed.length &&
    [...(context.pr?.comments || []), ...(context.pr?.reviews || [])].some((entry) =>
      /<!--\s*ateam-runner:(?:verdict|review)\b/.test(entry.body || ''),
    )
  )
    ignored.push({
      reason: 'display markers have no matching authenticated completed review evidence',
    })
  return { completed, ignored }
}
