import { readdirSync, realpathSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  loadFeature,
  inspectFeatureArtifact,
  FEATURE_PHASES,
  featureStage,
} from './feature-state.mjs'
import { validateIssuesPhase } from './obligations-cli.mjs'
import { budgetStatus } from './core/budget.mjs'
import { readEvents, replayIssue } from './core/history.mjs'
import { credentialPath } from './policy.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const text = (value) => (typeof value === 'string' ? value : '')
const labels = {
  human_acceptance: 'Human acceptance',
  product_validation: 'Product validation',
}
const label = (value) =>
  labels[value] || value.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase())
const assumptionDescription = (value) =>
  typeof value === 'string'
    ? value
    : `${value.id}: ${value.statement} · ${value.disposition} · due ${value.effectiveRequiredStage || value.requiredStage}${value.due ? ' (due now)' : ''} · owner ${value.owner?.actor || value.owner?.role || 'unresolved'}. Uncertainty: ${value.uncertainty}`
const researchProblem = (summary) =>
  summary.researchValidation?.ok === false
    ? `Research validation blocked: ${list(summary.researchValidation.diagnostics)
        .filter((entry) => entry.severity === 'error')
        .map((entry) => entry.message)
        .join('; ')}`
    : null
const guarded = (path) =>
  credentialPath(path.toLowerCase()) ||
  /(^|\/)(\.git|\.ssh|node_modules|\.env[^/]*)(\/|$)/i.test(path)
const safeRuntime = (entry) => {
  try {
    const url = new URL(entry?.url)
    // URL.hash retains percent escapes. Filter decoded names, and let malformed
    // escapes fail closed through the same catch as an invalid URL.
    const fragment = decodeURIComponent(url.hash).normalize('NFKC')
    if (
      !text(entry.label).trim() ||
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      /token|secret|password|credential|signature|auth|key|session/i.test(
        [...url.searchParams.keys()].join(' ') + fragment,
      )
    )
      return null
    return { label: entry.label, url: url.href, availability: 'not-checked' }
  } catch {
    return null
  }
}

function currentBudget(manifest, now) {
  try {
    const state = budgetStatus(manifest.repo, now, manifest.execution_policy)
    if (!state)
      return {
        status: 'unknown',
        remainingUsd: null,
        reason:
          'No recorded repository allowance; run-brief limits alone do not establish spend.',
      }
    const uncertain = state.unknownCosts > 0 || state.pendingLaunches.length > 0
    return {
      status: uncertain ? 'uncertain' : 'known',
      scope: 'repository allowance shared across issues and attempts',
      knownSpentUsd: state.spentUsd,
      remainingUsd: uncertain ? null : state.remainingUsd,
      remainingMs: state.remainingMs,
      lifetimeKnownSpentUsd: state.lifetimeSpentUsd,
      unknownCosts: state.unknownCosts,
      pendingLaunches: state.pendingLaunches,
      lifetimeUnknownCosts: state.lifetimeUnknownCosts,
      lifetimePendingLaunches: state.lifetimePendingLaunches,
      windowId: state.windowId,
      limits: state.limits,
      reason: uncertain
        ? 'Reconcile unknown costs or unfinished launches before further execution.'
        : null,
    }
  } catch (error) {
    return { status: 'uncertain', remainingUsd: null, reason: error.message }
  }
}

function executionHistory(manifest) {
  const bindings = list(manifest.run_brief.runner_history)
  const histories = [],
    unresolvedActions = [],
    diagnostics = []
  for (const binding of bindings) {
    if (!text(binding?.repo) || !text(binding?.issue_key)) {
      diagnostics.push('Runner history binding requires exact repo and issue_key.')
      continue
    }
    // Explicit identities only. Never scan other repositories or match titles.
    try {
      const events = readEvents(binding.repo, binding.issue_key)
      const state = replayIssue(events)
      histories.push({
        repo: binding.repo,
        issueKey: binding.issue_key,
        status: state.status,
        attempts: state.attempts.map((a) => ({
          attemptId: a.attemptId,
          branch: a.branch,
          worktree: a.worktree,
          outcome: a.outcome,
          reason: a.reason,
        })),
        eventCount: events.length,
      })
      unresolvedActions.push(
        ...state.unresolvedActions.map((a) => ({
          repo: binding.repo,
          issueKey: binding.issue_key,
          actionId: a.actionId,
          kind: a.kind,
          reason: a.reason || 'Action intent has no confirmed result',
          at: a.at,
        })),
      )
    } catch (error) {
      diagnostics.push(error.message)
    }
  }
  return {
    status: diagnostics.length
      ? 'history-unavailable'
      : unresolvedActions.length
        ? 'action-uncertain'
        : bindings.length
          ? 'observed'
          : 'unavailable',
    histories,
    unresolvedActions,
    diagnostics,
    description:
      'Recorded phase progress does not prove a process is currently running. Exact linked runner histories are read without retrying any action.',
  }
}

function chooseAction(manifest, stage, execution, budget, report) {
  const phase = manifest.phases[stage]
  if (manifest.state === 'aborted')
    return {
      reason: manifest.last_error || 'Operator aborted this feature',
      nextAction:
        'Inspect retained artifacts, branches and history; this run cannot resume.',
      actions: [],
    }
  if (manifest.control?.status === 'paused')
    return {
      reason: manifest.control.reason,
      nextAction:
        'Inspect retained evidence, then resume the scheduling hold when ready.',
      actions: [
        { command: 'resume', reasonRequired: true },
        ...(FEATURE_PHASES.includes(stage)
          ? [{ command: 'revise', phase: stage, reasonRequired: true }]
          : []),
        { command: 'abort', reasonRequired: true },
      ],
    }
  const controls = [
    { command: 'pause', reasonRequired: true },
    { command: 'abort', reasonRequired: true },
  ]
  if (execution.unresolvedActions.length || execution.diagnostics.length)
    return {
      reason: execution.unresolvedActions[0]?.reason || execution.diagnostics[0],
      nextAction:
        'Reconcile the exact retained runner action or history before dispatching work; do not repeat its effect.',
      actions: controls,
    }
  if (
    budget.status === 'uncertain' ||
    (budget.status === 'known' && (budget.remainingUsd <= 0 || budget.remainingMs <= 0))
  )
    return {
      reason: budget.reason || 'Repository allowance exhausted',
      nextAction:
        'Reconcile accounting or supply separately authorized recovery through the existing runner controls.',
      actions: controls,
    }
  if (manifest.state === 'stopped')
    return {
      reason: manifest.stop_reason,
      nextAction:
        'Review the separate milestones and any outstanding provisional decisions.',
      actions: controls,
    }
  if (manifest.state === 'refinement_review')
    return {
      reason: `Required refinement reviews: ${list(manifest.refinement?.pendingReviews).join(', ')}`,
      nextAction: 'Complete the named reviews and revalidate the refinement plan.',
      actions: controls,
    }
  const failureReason =
    phase?.status === 'failed' &&
    manifest.event_history.findLast(
      (e) => e.command.type === 'fail' && e.command.phase === stage,
    )?.command.reason
  const blocked =
    manifest.last_error ||
    phase?.stale_reason ||
    failureReason ||
    (phase?.status === 'complete' &&
      report.diagnostics.find((d) => d.severity === 'error')?.message)
  if (phase?.status === 'failed' || phase?.status === 'stale')
    return {
      reason: blocked || `Phase ${stage} failed`,
      nextAction: `Resolve the reason, then revise ${stage} with a new event ID and current revision.`,
      actions: [{ command: 'revise', phase: stage, reasonRequired: true }, ...controls],
    }
  if (
    phase?.status === 'complete' &&
    ['definition', 'design', 'pr'].includes(stage) &&
    report.ok
  )
    return {
      reason: blocked || `Current ${stage} artifacts await an authorized decision`,
      nextAction: blocked
        ? `Resolve the recorded command error, then approve ${stage} with an authorized human decision and a new event ID. Revise only if the evidence needs to change.`
        : `Review the evidence, then approve or revise ${stage}.`,
      actions: [
        { command: 'approve', phase: stage, humanDecisionRequired: true },
        { command: 'revise', phase: stage, reasonRequired: true },
        ...controls,
      ],
    }
  if (blocked)
    return {
      reason: blocked,
      nextAction:
        'Read the retained state with show, resolve the command error, then retry the applicable phase command with a new event ID and current revision.',
      actions: [{ command: 'show', readOnly: true }, ...controls],
    }
  return {
    reason:
      phase?.status === 'in_progress'
        ? `Work is recorded in progress at ${stage}; live process state is unknown`
        : `Ready for ${stage}`,
    nextAction:
      phase?.status === 'in_progress'
        ? 'Read retained work with show and check runner receipts before continuing the existing phase.'
        : `Start ${stage} after checking current inputs.`,
    actions: [
      phase?.status === 'in_progress'
        ? { command: 'show', readOnly: true }
        : { command: 'start', phase: stage },
      ...controls,
    ],
  }
}

export async function featureStatus(featureDir, { now = Date.now(), policy } = {}) {
  const directory = realpathSync(resolve(featureDir))
  const manifest = await loadFeature(directory, { policy })
  const root = realpathSync(manifest.repo)
  const stage = manifest.control?.next_state || manifest.state
  const validationStage = FEATURE_PHASES.includes(stage)
    ? featureStage({ type: 'complete', phase: stage })
    : featureStage({ type: 'complete', phase: manifest.run_brief.stopping_point })
  const report = await validateIssuesPhase({
    featureDir: directory,
    stage: validationStage,
  })
  const artifactMap = new Map()
  const inspect = (path) => {
    if (!text(path) || guarded(path)) return null
    if (artifactMap.has(path)) return artifactMap.get(path)
    let item
    try {
      const observed = inspectFeatureArtifact(directory, root, path)
      if (guarded(relative(root, observed.absolute))) return null
      item = {
        path,
        status: 'present',
        hash: observed.hash,
        kind: observed.kind,
        ...(observed.kind === 'file'
          ? { href: pathToFileURL(observed.absolute).href }
          : {}),
      }
    } catch (error) {
      // Invalid/escaping paths stay inert and their destination is never exposed.
      item = {
        path,
        status: error.code === 'ENOENT' ? 'missing' : 'unavailable',
        hash: null,
      }
    }
    artifactMap.set(path, item)
    return item
  }
  const phases = FEATURE_PHASES.map((name) => {
    const phase = manifest.phases[name]
    for (const path of [...phase.artifacts, ...Object.keys(phase.bindings)]) inspect(path)
    return {
      name,
      status: phase.status,
      decision:
        phase.status === 'stale'
          ? 'stale'
          : phase.status === 'approved'
            ? phase.provisional
              ? 'provisional'
              : 'accepted'
            : 'pending',
      reason: phase.stale_reason || phase.revision_reason || null,
      attempts: phase.attempts,
      artifacts: Object.entries(phase.bindings).map(([path, hash]) => ({
        path,
        reviewedHash: hash,
        current: inspect(path)?.hash === hash,
      })),
      decisions: phase.decisions.map((d) => ({
        kind: d.kind,
        at: d.at,
        featureRevision: d.feature_revision,
        reference: d.decision?.reference || d.authorization?.reference,
      })),
    }
  })
  const milestones = Object.entries(manifest.milestones).map(([name, record]) => ({
    name,
    status: record.status,
    reason: record.stale_reason || null,
    records: record.records.map((r) => ({
      at: r.at,
      reference: r.evidence.reference,
      revision: r.evidence.revision,
      artifacts: Object.keys(r.artifacts || {}).map((path) => {
        inspect(path)
        return path
      }),
    })),
  }))
  const changesSinceReview = []
  for (const [name, phase] of Object.entries(manifest.phases)) {
    const decision = phase.decisions.at(-1)
    for (const [path, reviewedHash] of Object.entries(decision?.artifacts || {})) {
      const current = inspect(path)
      if (current?.hash !== reviewedHash)
        changesSinceReview.push({
          phase: name,
          path,
          reviewedHash,
          currentHash: current?.hash || null,
          change: current?.status === 'missing' ? 'missing' : 'changed',
        })
    }
  }
  // A compact index of existing authored documents and rendered boards. Do not
  // crawl dependencies, dotfiles, symlinks, or an arbitrary external tree.
  let indexed = 0
  const scan = (path, depth = 0) => {
    if (depth > 4 || indexed >= 200 || guarded(path)) return
    for (const entry of readdirSync(join(directory, path), { withFileTypes: true }).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      if (indexed >= 200) break
      const child = path ? `${path}/${entry.name}` : entry.name
      if (entry.name.startsWith('.') || entry.isSymbolicLink() || guarded(child)) continue
      if (entry.isDirectory() && ['briefs', 'lofi'].includes(child.split('/')[0]))
        scan(child, depth + 1)
      else if (
        entry.isFile() &&
        /\.(md|html|json|png|svg|pdf)$/i.test(child) &&
        child !== 'feature.json'
      ) {
        inspect(child)
        indexed++
      }
    }
  }
  scan('')
  const runtimeLinks = list(manifest.run_brief.runtime_links)
    .map(safeRuntime)
    .filter(Boolean)
  const budget = currentBudget(manifest, now)
  const execution = executionHistory(manifest)
  const action = chooseAction(manifest, stage, execution, budget, report)
  const provisional = phases
    .filter((p) => p.decision === 'provisional')
    .map((p) => p.name)
  const lastReviewRevision = Math.max(
    -1,
    ...Object.values(manifest.phases).flatMap((p) =>
      p.decisions.map((d) => d.feature_revision ?? -1),
    ),
  )
  const reviewInputEvents = manifest.event_history
    .filter(
      (e) =>
        e.revision > lastReviewRevision &&
        ['configure', 'revise', 'configure-refinement'].includes(e.command.type),
    )
    .map((e) => ({
      revision: e.revision,
      command: e.command.type,
      phase: e.command.phase,
      reason: e.command.reason || 'Review inputs were configured',
    }))
  return {
    schemaVersion: 1,
    generatedAt: new Date(now).toISOString(),
    featureDir: directory,
    slug: manifest.slug,
    revision: manifest.revision,
    goal: manifest.run_brief.outcome || manifest.prompt,
    state: manifest.state,
    stage,
    waiting:
      manifest.state === 'paused' ||
      manifest.state === 'aborted' ||
      manifest.state === 'refinement_review' ||
      Boolean(manifest.last_error) ||
      manifest.phases[stage]?.status !== 'in_progress',
    ...action,
    mode: manifest.run_brief.mode,
    stoppingPoint: manifest.run_brief.stopping_point,
    control: {
      status: manifest.control?.status || 'active',
      description:
        'Cooperative scheduling control. In-flight observations may finish; no process is suspended or killed. Resume never launches work or repeats side effects.',
    },
    gate: {
      stage,
      recommendation: changesSinceReview.length
        ? 'Revalidate changed artifacts before accepting this direction.'
        : provisional.length
          ? `Review provisional ${provisional.join(', ')} decisions before the next gate.`
          : action.nextAction,
      decisionNeeded:
        manifest.phases[stage]?.status === 'complete'
          ? `Explicit human approval or revision of ${stage}`
          : provisional.length
            ? `Human review of provisional ${provisional.join(', ')}`
            : 'Resolve the current next action; no acceptance is inferred.',
      consequence:
        'Continuing authorizes only the next in-scope phase. Provisional choices remain subject to revision; implementation, verification, human acceptance, integration, release and product validation require their own evidence.',
    },
    phases,
    milestones,
    provisional,
    changesSinceReview,
    reviewInputEvents,
    assumptions:
      manifest.research_validation?.applicability === 'declared'
        ? list(manifest.research_validation.assumptions)
        : list(manifest.run_brief.assumptions),
    researchValidation: manifest.research_validation || null,
    researchOutcome: manifest.research_outcome || null,
    unresolved: report.obligations
      .filter((o) => o.status !== 'satisfied')
      .map((o) => ({
        id: o.id,
        requirementId: o.requirementId,
        status: o.status,
        statement: o.statement,
        requiredStage: o.requiredStage,
        due: o.due,
        owner: o.owner,
        deferral: o.deferral,
      })),
    diagnostics: report.diagnostics,
    artifacts: [...artifactMap.values()],
    indexTruncated: indexed >= 200,
    runtimeLinks,
    budget,
    execution,
    branches: [
      ...new Set(
        [
          manifest.branch,
          ...Object.values(manifest.phases.dev.issues).flatMap((i) =>
            i.records.map((r) => r.evidence.branch),
          ),
          ...execution.histories.flatMap((h) => h.attempts.map((a) => a.branch)),
        ].filter(Boolean),
      ),
    ],
    history: manifest.event_history.map((e) => ({
      id: e.id,
      revision: e.revision,
      command: e.command.type,
      phase: e.command.phase,
      status: e.status,
      at: e.at,
      reason: e.error?.message || e.command.reason || null,
    })),
    containment: {
      issue: 37,
      status: 'unresolved',
      description:
        'A detached child whose intermediate parent exits may escape native macOS cleanup. This is an accepted limitation in #37. Cooperative controls do not establish process termination.',
    },
  }
}

export function renderFeatureStatus(summary) {
  const s = summary
  return [
    `${s.slug} — ${s.state} / ${s.stage} (revision ${s.revision})`,
    s.goal,
    '',
    `Reason: ${s.reason}`,
    `Next action: ${s.nextAction}`,
    `Recommendation: ${s.gate.recommendation}`,
    `Decision needed: ${s.gate.decisionNeeded}`,
    `Consequence: ${s.gate.consequence}`,
    `Budget: ${s.budget.status}${s.budget.status === 'known' ? `; $${s.budget.knownSpentUsd} known spent; $${s.budget.remainingUsd} remaining; ${s.budget.remainingMs}ms remaining` : `; ${s.budget.reason}`}`,
    '',
    'Milestones:',
    ...s.milestones.map(
      (m) => `  ${label(m.name)}: ${m.status}${m.reason ? ` — ${m.reason}` : ''}`,
    ),
    '',
    'Phase decisions:',
    ...s.phases.map((p) => `  ${label(p.name)}: ${p.status}; decision ${p.decision}`),
    '',
    'Assumptions:',
    ...(researchProblem(s) ? [researchProblem(s)] : []),
    ...(s.researchOutcome
      ? [
          `Research outcome: ${s.researchOutcome.kind} (${s.researchOutcome.status}) · ${s.researchOutcome.assumptionIds.join(', ')}`,
        ]
      : []),
    ...s.assumptions.map((a) => `  ${assumptionDescription(a)}`),
    '',
    'Outstanding obligations:',
    ...s.unresolved.map(
      (o) => `  ${o.id}: ${o.status}; due ${o.requiredStage}; ${o.statement}`,
    ),
    '',
    'Changes since review:',
    ...s.changesSinceReview.map((c) => `  ${c.phase}: ${c.path} ${c.change}`),
    ...s.reviewInputEvents.map((e) => `  r${e.revision} ${e.command}: ${e.reason}`),
    '',
    'Artifacts:',
    ...s.artifacts.map((a) => `  ${a.path}: ${a.status}${a.href ? ` — ${a.href}` : ''}`),
    '',
    'Runtime links (availability not checked):',
    ...s.runtimeLinks.map((l) => `  ${l.label}: ${l.url}`),
    '',
    `Recorded branches (preserved): ${s.branches.join(', ') || 'none'}`,
    s.control.description,
    s.execution.description,
    ...s.execution.unresolvedActions.map(
      (a) => `Unresolved action ${a.actionId}: ${a.reason}`,
    ),
    `Native containment: ${s.containment.status} — ${s.containment.description}`,
    '',
  ].join('\n')
}

const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )
const item = (content) => `<li>${content}</li>`
const rows = (entries, render, empty) =>
  entries.length
    ? `<ul>${entries.map((e) => item(render(e))).join('')}</ul>`
    : `<p class="muted">${escape(empty)}</p>`
export function renderFeaturePreview(s) {
  // Compact operate surface: inherit the shipped grayscale/system-font baseline.
  // Lead with the operator's reason and next action, then independent milestones.
  // Use document sections and native links; no decorative dashboard or fake controls.
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${escape(s.slug)} — Feature status</title><style>
:root{font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;color:#111;background:#fafafa;font-size:16px;line-height:1.55}
*{box-sizing:border-box}body{margin:0}main{max-width:78rem;margin:auto;padding:2rem}header{border-bottom:1px solid #aaa;padding-bottom:1.5rem}
h1{font-size:2rem;line-height:1.2;margin:.5rem 0}h2{font-size:1.25rem;margin:0 0 .75rem}section h2:not(:first-child){margin-top:1.5rem}p{max-width:72ch;margin:.6rem 0}a{color:#333;text-decoration-thickness:1px;text-underline-offset:3px}a:hover{color:#000}a:focus-visible,summary:focus-visible{outline:3px solid #333;outline-offset:3px}
.muted{color:#555}.state{font-weight:700}section{margin-top:2rem}ul{padding-left:1.4rem;margin:.5rem 0}li{margin:.5rem 0;overflow-wrap:anywhere}code{font-family:ui-monospace,monospace;font-size:.9rem;overflow-wrap:anywhere}
.columns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:2.5rem}dl{margin:0}dt{font-weight:650}dd{margin:.15rem 0 1rem;overflow-wrap:anywhere}.milestones{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem;border-block:1px solid #aaa;padding:1rem 0}.milestones dd{margin-bottom:0}
.decision{font-weight:700}.provisional{background:#e8e8e8;padding:.15rem .4rem}details{margin-top:1rem}summary{cursor:pointer;padding:.4rem 0}footer{border-top:1px solid #aaa;margin-top:2rem;padding-top:1rem;color:#555}nav{display:flex;gap:1.5rem;flex-wrap:wrap;margin-top:1rem}nav a{padding:.25rem 0;min-height:2rem}
@media(max-width:720px){main{padding:1.25rem}.columns{grid-template-columns:1fr;gap:0}.milestones{grid-template-columns:repeat(2,minmax(0,1fr))}h1{font-size:1.75rem}}
</style></head><body><main>
<header><p class="muted">Feature status · ${escape(s.slug)} · revision ${s.revision}</p><h1>${escape(s.goal)}</h1><p class="state">${escape(label(s.state))} · ${escape(label(s.stage))}</p><p>${escape(s.reason)}</p><p><strong>Next action:</strong> ${escape(s.nextAction)}</p><nav aria-label="Status sections"><a href="#review">Review decision</a><a href="#evidence">Evidence and previews</a><a href="#history">History and controls</a></nav></header>
<section aria-labelledby="milestones"><h2 id="milestones">Independent milestones</h2><dl class="milestones">${s.milestones.map((m) => `<div><dt>${escape(label(m.name))}</dt><dd>${escape(m.status)}${m.reason ? ` — ${escape(m.reason)}` : ''}</dd></div>`).join('')}</dl><p class="muted">A phase approval or passing check does not establish any other milestone.</p></section>
<div class="columns"><section id="review"><h2>Review decision</h2><dl><dt>Recommendation</dt><dd>${escape(s.gate.recommendation)}</dd><dt>Decision needed</dt><dd>${escape(s.gate.decisionNeeded)}</dd><dt>Consequence of continuing</dt><dd>${escape(s.gate.consequence)}</dd></dl>
${rows(
  s.phases.filter((p) => p.decisions.length || p.name === s.stage),
  (p) =>
    `<strong>${escape(label(p.name))}</strong> · ${escape(p.status)} · <span class="decision ${p.decision === 'provisional' ? 'provisional' : ''}">${escape(p.decision === 'provisional' ? 'Provisional — human review pending' : p.decision === 'accepted' ? 'Accepted phase decision' : p.decision === 'stale' ? 'Stale — prior decision retained' : 'Decision pending')}</span>`,
  'No phase decisions recorded.',
)}
<h2>Changes since review</h2>${rows(s.changesSinceReview, (c) => `${escape(c.path)} · ${escape(c.change)} since ${escape(c.phase)} review`, 'No changed bound artifact bytes detected; this does not establish acceptance.')}${rows(s.reviewInputEvents, (e) => `r${e.revision} ${escape(e.command)} · ${escape(e.reason)}`, 'No later configuration or revision events.')}</section>
<section><h2>Assumptions and outstanding work</h2>${researchProblem(s) ? `<p>${escape(researchProblem(s))}</p>` : ''}${s.researchOutcome ? `<p>Research outcome: ${escape(s.researchOutcome.kind)} (${escape(s.researchOutcome.status)}) · ${escape(s.researchOutcome.assumptionIds.join(', '))}</p>` : ''}${rows(s.assumptions, (a) => escape(assumptionDescription(a)), 'No assumptions recorded in the run brief. Review research-plan.md where present.')}${rows(s.unresolved, (o) => `<strong>${escape(o.id)}</strong> · ${escape(o.status)} · due ${escape(o.requiredStage)}<br>${escape(o.statement)}`, 'No unresolved obligations returned by the current ledger validation.')}${rows(
    s.diagnostics.filter((d) => d.severity === 'error'),
    (d) => escape(`${d.obligationId || d.artifact || d.field || ''}: ${d.message}`),
    'No current ledger validation errors.',
  )}
<h2>Repository budget</h2><p>${escape(s.budget.status === 'known' ? `$${s.budget.knownSpentUsd} known spent · $${s.budget.remainingUsd} remaining · ${s.budget.remainingMs}ms remaining` : `${label(s.budget.status)} — ${s.budget.reason}`)}</p><p class="muted">${escape(s.budget.scope || 'No fresh allowance is opened by status or resume.')}</p></section></div>
<section id="evidence"><h2>Evidence and previews</h2><p class="muted">Files were checked when this snapshot was generated. A present file is not automatically accepted. Runtime availability is not checked.</p>${rows(s.runtimeLinks, (l) => `<a href="${escape(l.url)}" rel="noreferrer">${escape(l.label)}</a> · runtime, availability not checked`, 'No runtime links recorded.')}<details open><summary>Documents and boards (${s.artifacts.length})</summary>${rows(s.artifacts, (a) => `${a.href ? `<a href="${escape(a.href)}">${escape(a.path)}</a>` : escape(a.path)} · ${escape(a.status)}`, 'No authored artifacts found.')}</details>${s.indexTruncated ? '<p>Preview index limited to 200 files; bound evidence is still checked.</p>' : ''}
<details><summary>Current artifact digests</summary>${rows(
    s.artifacts.filter((a) => a.hash),
    (a) => `${escape(a.path)} · <code>${escape(a.hash)}</code>`,
    'No readable artifact digests.',
  )}</details><details><summary>Milestone receipts</summary>${rows(
    s.milestones.flatMap((m) =>
      m.records.map((r) => ({ ...r, name: m.name, status: m.status })),
    ),
    (r) =>
      `${escape(label(r.name))} · ${escape(r.status)} · ${escape(r.reference)} · revision <code>${escape(r.revision)}</code>`,
    'No milestone receipts recorded.',
  )}</details></section>
<section id="history"><h2>History and controls</h2><p>${escape(s.control.description)}</p><p>${escape(s.execution.description)}</p>${rows(s.execution.unresolvedActions, (a) => `<strong>Reconcile ${escape(a.kind)}</strong> · <code>${escape(a.actionId)}</code> · ${escape(a.reason)}`, 'No unresolved actions found in the explicitly linked histories.')}${rows(s.execution.diagnostics, escape, s.execution.status === 'unavailable' ? 'Runner history is unavailable until exact repo and issue identities are recorded.' : 'Linked history is readable.')}
<p>Available commands: ${s.actions.map((a) => `<code>${escape(a.command)}${a.phase ? ` ${escape(a.phase)}` : ''}</code>`).join(', ') || 'inspect retained history'}. Read commands use only <code>--feature &lt;feature-dir&gt;</code>. Mutation commands also require the current revision, a stable event ID, and the required reason or human decision.</p><p>Recorded branches retained: ${escape(s.branches.join(', ') || 'none')}</p><details><summary>Command history (${s.history.length})</summary>${rows(s.history, (e) => `r${e.revision} · ${escape(e.command)} ${escape(e.phase || '')} · ${escape(e.status)}${e.reason ? ` · ${escape(e.reason)}` : ''}`, 'No events recorded.')}</details></section>
<footer><p>Snapshot generated ${escape(s.generatedAt)}. Rerun status to verify current evidence.</p><p>Native containment limitation: ${escape(s.containment.description)}</p></footer>
</main></body></html>\n`
}
