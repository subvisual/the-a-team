import { run, json } from './sh.mjs'
import { log } from './log.mjs'

// Every verdict carries this marker so state can be re-derived from GitHub
// alone (RUNNER.md decision 15) whether it landed as a review or a comment.
export const VERDICT_MARKER = 'ateam-runner:verdict'

export const verdictMarker = (sha, cycle) =>
  `<!-- ${VERDICT_MARKER} sha=${sha} cycle=${cycle} -->`

export function parseVerdictMarkers(bodies) {
  const out = []
  const re = new RegExp(`<!--\\s*${VERDICT_MARKER}\\s+sha=([0-9a-f]+)\\s+cycle=(\\d+)\\s*-->`, 'g')
  for (const body of bodies) {
    let m
    while ((m = re.exec(String(body ?? '')))) out.push({ sha: m[1], cycle: Number(m[2]) })
  }
  return out
}

const gh = (args, opts) => run('gh', args, opts)

export async function listIssues(repo, { label, state = 'open', limit = 100 } = {}) {
  const args = ['issue', 'list', '--repo', repo, '--state', state, '--limit', String(limit),
    '--json', 'number,title,body,labels,url,createdAt']
  if (label) args.push('--label', label)
  return (await json('gh', args)) || []
}

export async function viewIssue(repo, number) {
  return json('gh', ['issue', 'view', String(number), '--repo', repo,
    '--json', 'number,title,body,labels,url,state,createdAt'])
}

export async function addLabels(repo, number, labels) {
  if (!labels.length) return
  await gh(['issue', 'edit', String(number), '--repo', repo, ...labels.flatMap((l) => ['--add-label', l])], { check: false })
}

export async function removeLabels(repo, number, labels) {
  if (!labels.length) return
  await gh(['issue', 'edit', String(number), '--repo', repo, ...labels.flatMap((l) => ['--remove-label', l])], { check: false })
}

// Labels are visibility only, never the lock (RUNNER.md, "Claim").
export async function setPhaseLabel(repo, number, phase, allPhases) {
  const drop = allPhases.filter((l) => l !== phase)
  await removeLabels(repo, number, drop)
  if (phase) await addLabels(repo, number, [phase])
}

export async function ensureLabelsExist(repo, labels) {
  for (const [name, color, description] of labels) {
    await gh(['label', 'create', name, '--repo', repo, '--color', color, '--description', description], { check: false })
  }
}

export async function commentIssue(repo, number, body) {
  await gh(['issue', 'comment', String(number), '--repo', repo, '--body-file', '-'], { input: body })
}

export async function listPRs(repo, { limit = 100 } = {}) {
  return (await json('gh', ['pr', 'list', '--repo', repo, '--state', 'open', '--limit', String(limit),
    '--json', 'number,title,headRefName,headRefOid,baseRefName,url,isDraft,author'])) || []
}

export async function viewPR(repo, number) {
  return json('gh', ['pr', 'view', String(number), '--repo', repo,
    '--json', 'number,title,body,headRefName,headRefOid,baseRefName,baseRefOid,url,isDraft,author,comments,reviews,state,closingIssuesReferences'])
}

export async function createPR(repo, { head, base, title, body, draft = false }) {
  const args = ['pr', 'create', '--repo', repo, '--head', head, '--base', base,
    '--title', title, '--body-file', '-']
  if (draft) args.push('--draft')
  const { stdout } = await gh(args, { input: body })
  const url = stdout.trim().split('\n').filter(Boolean).pop()
  const number = Number(url?.match(/\/pull\/(\d+)/)?.[1])
  return { url, number }
}

export async function commentPR(repo, number, body) {
  await gh(['pr', 'comment', String(number), '--repo', repo, '--body-file', '-'], { input: body })
}

// GitHub refuses approve / request-changes on your own PR, and the runner uses
// the operator's own auth — so a real review is attempted, then degraded to a
// marked comment. The marker is what state derivation reads either way.
export async function postVerdict(repo, number, { event, body }) {
  const flag = event === 'approve' ? '--approve' : '--request-changes'
  const { code, stderr } = await gh(['pr', 'review', String(number), '--repo', repo, flag, '--body-file', '-'],
    { input: body, check: false })
  if (code === 0) return 'review'
  log.warn('verdict.review_unavailable', { pr: number, reason: stderr.trim().split('\n')[0] })
  await commentPR(repo, number, body)
  return 'comment'
}

export async function defaultBranch(repo) {
  const data = await json('gh', ['repo', 'view', repo, '--json', 'defaultBranchRef'])
  return data?.defaultBranchRef?.name || 'main'
}

// 404 is a definitive "not protected". 401/403 means we cannot tell — warn,
// do not block (RUNNER.md, "Safety" item 6).
export async function baseProtection(repo, branch) {
  const { code, stdout, stderr } = await gh(['api', `repos/${repo}/branches/${branch}/protection`], { check: false })
  if (code === 0) return { state: 'protected' }
  const text = `${stderr}${stdout}`
  if (/HTTP 404|Branch not protected/i.test(text)) return { state: 'unprotected' }
  return { state: 'unknown', reason: text.trim().split('\n')[0] }
}

export async function whoami() {
  const { stdout, code } = await gh(['api', 'user', '--jq', '.login'], { check: false })
  return code === 0 ? stdout.trim() : null
}

export async function linkBranch(repo, number, branch) {
  // Native issue<->branch link; surfaces the claim in the UI for free.
  await gh(['issue', 'develop', String(number), '--repo', repo, '--branch-repo', repo, '--name', branch], { check: false })
}
