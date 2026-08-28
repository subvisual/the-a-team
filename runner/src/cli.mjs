import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadConfig, writeConfig, repoEntry, DEFAULTS, LABELS } from './config.mjs'
import { clonePath } from './paths.mjs'
import { ensureClone, defaultBranchLocal } from './git.mjs'
import * as gh from './gh.mjs'
import { log, setQuiet } from './log.mjs'
import { runIssue, OUTCOME } from './core/loop.mjs'
import { createGithubAdapter, normaliseIssue } from './adapters/github.mjs'
import { createLocalAdapter } from './adapters/local.mjs'
import { reviewPullRequest } from './review-pr.mjs'
import { watch } from './watch.mjs'
import { repoStatus, renderStatus } from './status.mjs'

const USAGE = `ateam-runner — issue to PR to independent verdict

  init                                     write a starter config
  run    --repo O/R --issue N              take one GitHub issue end to end
  run    --source local --issues PATH      take issues.md end to end (no network)
  review --repo O/R --pr N                 review one open PR in a fresh session
  watch  [--repo O/R ...]                  poll for ready issues and unreviewed PRs
  status [--repo O/R]                      re-derive run state from GitHub

Common flags
  --path DIR              local clone to build worktrees from (default: auto-clone)
  --base BRANCH           base branch (default: the repo's default branch)
  --model NAME            executor model (default: ${DEFAULTS.executorModel})
  --reviewer-model NAME   reviewer model (default: ${DEFAULTS.reviewerModel})
  --max-cycles N          implement/review cycles before giving up (default: ${DEFAULTS.maxCycles})
  --budget USD            per-executor-session cap (default: ${DEFAULTS.executorBudgetUsd})
  --reviewer-budget USD   per-reviewer-session cap (default: ${DEFAULTS.reviewerBudgetUsd})
  --test-cmd CMD          test command, if the repo's is not discoverable
  --branch-prefix P       branch name prefix (default: ${DEFAULTS.branchPrefix})
  --poll SECONDS          watch interval (default: ${DEFAULTS.pollSeconds})
  --once                  one watch tick, then exit
  --force                 review a sha that already has a verdict
  --dry-run               list what would run, change nothing
  --allow-unprotected-base  proceed against an unprotected base branch
  --json                  machine-readable result
  --quiet                 warnings and errors only
`

export function parseArgs(argv) {
  const out = { _: [], repos: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (!a.startsWith('--')) { out._.push(a); continue }
    const key = a.slice(2)
    const takesValue = ![
      'once', 'force', 'dry-run', 'json', 'quiet', 'help', 'allow-unprotected-base',
    ].includes(key)
    const value = takesValue ? argv[++i] : true
    if (key === 'repo') out.repos.push(value)
    else out[key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value
  }
  return out
}

export function cfgFrom(args) {
  const base = loadConfig()
  const cfg = { ...base }
  if (args.maxCycles) cfg.maxCycles = Number(args.maxCycles)
  if (args.poll) cfg.pollSeconds = Number(args.poll)
  if (args.model) cfg.executorModel = args.model
  if (args.reviewerModel) cfg.reviewerModel = args.reviewerModel
  if (args.budget) cfg.executorBudgetUsd = Number(args.budget)
  if (args.reviewerBudget) cfg.reviewerBudgetUsd = Number(args.reviewerBudget)
  if (args.testCmd) cfg.testCommand = args.testCmd
  if (args.branchPrefix) cfg.branchPrefix = args.branchPrefix
  return cfg
}

async function resolveTarget(repo, args, cfg) {
  const entry = repoEntry(cfg, repo)
  const path = resolve(args.path || entry.path || clonePath(repo))
  await ensureClone(repo, path)
  const base = args.base || entry.base || (await gh.defaultBranch(repo))
  return { repo, repoPath: path, base, testCommand: args.testCmd || entry.testCommand || cfg.testCommand }
}

// The real backstop is branch protection; everything else is defence in depth
// behind it (RUNNER.md, "Safety" item 6). Unknown is not the same as absent.
async function assertBaseSafe(target, args) {
  const p = await gh.baseProtection(target.repo, target.base)
  if (p.state === 'protected') return
  if (p.state === 'unknown') {
    log.warn('base.protection_unknown', { repo: target.repo, base: target.base, reason: p.reason })
    return
  }
  if (args.allowUnprotectedBase) {
    log.warn('base.unprotected_override', { repo: target.repo, base: target.base })
    return
  }
  throw new Error(
    `${target.repo}: base branch '${target.base}' is not protected.\n` +
    '  A bad autonomous run against an unprotected base is unrecoverable rather than merely noisy.\n' +
    '  Protect it, or pass --allow-unprotected-base to proceed deliberately.',
  )
}

export async function main(argv) {
  const args = parseArgs(argv)
  const command = args._[0]
  if (!command || args.help || command === 'help') { process.stdout.write(USAGE); return 0 }
  if (args.quiet) setQuiet(true)

  const cfg = cfgFrom(args)
  const labels = { ...LABELS, ...(cfg.labels || {}) }

  if (command === 'init') {
    const path = writeConfig({ ...DEFAULTS, repos: [{ repo: 'org/repo', path: '/absolute/path/to/clone', base: 'main' }] })
    log.info('config.written', { path })
    process.stdout.write(`Edit ${path}, then: ateam-runner watch\n`)
    return 0
  }

  if (command === 'run' && args.source === 'local') {
    const issuesFile = resolve(args.issues || '')
    if (!existsSync(issuesFile)) throw new Error(`issues file not found: ${issuesFile}`)
    const repoPath = resolve(args.path || process.cwd())
    const base = args.base || (await defaultBranchLocal(repoPath))
    const adapter = createLocalAdapter({ issuesFile, repoPath, base, testCommand: cfg.testCommand })
    const results = []
    for (const issue of await adapter.listCandidates()) {
      if (args.issue && issue.key !== args.issue) continue
      results.push(await runIssue({ adapter, issue, cfg, dryRun: !!args.dryRun }))
    }
    const failed = results.filter((r) => r.outcome === OUTCOME.failed)
    if (args.json) process.stdout.write(`${JSON.stringify({ results, report: adapter.report }, null, 2)}\n`)
    else for (const r of results) process.stdout.write(`  ${r.outcome.padEnd(18)} ${r.issue}${r.reason ? ` — ${r.reason}` : ''}\n`)
    return failed.length ? 1 : 0
  }

  if (command === 'run') {
    const repo = args.repos[0]
    if (!repo || !args.issue) throw new Error('run needs --repo O/R and --issue N (or --source local)')
    const target = await resolveTarget(repo, args, cfg)
    if (!args.dryRun) await assertBaseSafe(target, args)
    const adapter = createGithubAdapter({ ...target, labels })
    await adapter.ensureLabels().catch(() => {})
    const issue = normaliseIssue(await gh.viewIssue(repo, Number(args.issue)))
    const result = await runIssue({ adapter, issue, cfg, dryRun: !!args.dryRun })
    if (args.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return result.outcome === OUTCOME.failed ? 1 : 0
  }

  if (command === 'review') {
    const repo = args.repos[0]
    if (!repo || !args.pr) throw new Error('review needs --repo O/R and --pr N')
    const target = await resolveTarget(repo, args, cfg)
    const pr = await gh.viewPR(repo, Number(args.pr))
    const result = await reviewPullRequest({
      repo, repoPath: target.repoPath, pr, cfg: { ...cfg, testCommand: target.testCommand }, labels, force: !!args.force,
    })
    if (args.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    else if (result.skipped) process.stdout.write(`skipped: ${result.reason}\n`)
    return 0
  }

  if (command === 'watch') {
    const repos = args.repos.length ? args.repos : (cfg.repos || []).map((r) => r.repo)
    if (!repos.length) throw new Error('no repos: pass --repo O/R or run `ateam-runner init` and edit the config')
    const targets = []
    for (const repo of repos) {
      const t = await resolveTarget(repo, args, cfg)
      await assertBaseSafe(t, args)
      targets.push(t)
    }
    await watch({ targets, cfg, labels, once: !!args.once })
    return 0
  }

  if (command === 'status') {
    const repos = args.repos.length ? args.repos : (cfg.repos || []).map((r) => r.repo)
    if (!repos.length) throw new Error('no repos: pass --repo O/R or configure some')
    const all = []
    for (const repo of repos) all.push(await repoStatus(repo, cfg, labels))
    if (args.json) process.stdout.write(`${JSON.stringify(all, null, 2)}\n`)
    else for (const s of all) process.stdout.write(`${renderStatus(s)}\n`)
    return 0
  }

  process.stderr.write(`unknown command: ${command}\n\n${USAGE}`)
  return 1
}
