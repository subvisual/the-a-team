import { existsSync, statSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadConfig, writeConfig, repoEntry, DEFAULTS, LABELS } from './config.mjs'
import { clonePath } from './paths.mjs'
import { resolvePolicy, readInvocationAuthorization } from './policy.mjs'
import * as gh from './gh.mjs'
import { log, setQuiet } from './log.mjs'
import { runIssue } from './core/loop.mjs'
import { createGithubAdapter, normaliseIssue } from './adapters/github.mjs'
import {
  createLocalAdapter,
  parseIssuesFile,
  validateIssues,
  migrateIssuesFile,
  resolveLocalBase,
} from './adapters/local.mjs'
import { reviewPullRequest } from './review-pr.mjs'
import { watch } from './watch.mjs'
import { repoStatus, renderStatus } from './status.mjs'
import { planCommand, renderPlan } from './planning.mjs'

const USAGE = `ateam-runner — issue to PR to independent verdict

  init                                     write a starter config
  run    --repo O/R --issue N              take one GitHub issue end to end
  run    --source local --issues PATH      take issues.md end to end (no remote Git/GitHub)
  migrate-issues --issues PATH             persist stable IDs in a legacy issues.md
  review --repo O/R --pr N                 review one open PR in a fresh session
  watch  [--repo O/R ...]                  poll for ready issues and unreviewed PRs
  status [--repo O/R]                      re-derive run state from GitHub

Common flags
  --path DIR              existing target clone (otherwise configured/cache path)
  --base BRANCH_OR_SHA    exact local base (default: the repo's default branch)
  --model NAME            executor model (default: ${DEFAULTS.executorModel})
  --reviewer-model NAME   reviewer model (default: ${DEFAULTS.reviewerModel})
  --max-cycles N          implement/review cycles before giving up (default: ${DEFAULTS.maxCycles})
  --budget USD            per-executor-session cap (default: ${DEFAULTS.executorBudgetUsd})
  --reviewer-budget USD   per-reviewer-session cap (default: ${DEFAULTS.reviewerBudgetUsd})
  --run-budget USD        aggregate repository allowance across attempts (default: 45)
  --run-timeout-ms N      wall time for the retained allowance window (default: 7200000)
  --session-timeout-ms N  wall time for one process tree (default: 1200000)
  --test-cmd CMD          test command, if the repo's is not discoverable
  --branch-prefix P       branch name prefix (default: ${DEFAULTS.branchPrefix})
  --poll SECONDS          watch interval (default: ${DEFAULTS.pollSeconds})
  --once                  one watch tick, then exit
  --force                 review a sha that already has a verdict
  --dry-run               list what would run, change nothing
  --allow-unprotected-base  proceed against an unprotected base branch
  --json                  one versioned result envelope (watch requires --once)
  --quiet                 warnings and errors only
  --scope-path PATH       declare a requested source path (repeatable)
  --authorization-file PATH  explicit invocation exceptions, recorded with evidence
`

const BOOLEAN_FLAGS = new Set([
  'once',
  'force',
  'dry-run',
  'json',
  'quiet',
  'help',
  'allow-unprotected-base',
])
const VALUE_FLAGS = new Set([
  'repo',
  'path',
  'base',
  'model',
  'reviewer-model',
  'max-cycles',
  'budget',
  'reviewer-budget',
  'run-budget',
  'run-timeout-ms',
  'session-timeout-ms',
  'test-cmd',
  'branch-prefix',
  'poll',
  'source',
  'issues',
  'issue',
  'pr',
  'authorization-file',
  'scope-path',
])
const COMMANDS = new Set(['init', 'run', 'review', 'watch', 'status', 'migrate-issues', 'help'])

function usageError(message, code = 'invalid-arguments') {
  return Object.assign(new Error(message), { code, exitCode: 2 })
}

export function parseArgs(argv) {
  const out = { _: [], repos: [], requestedPaths: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (!a.startsWith('--')) {
      out._.push(a)
      continue
    }
    const key = a.slice(2)
    if (!BOOLEAN_FLAGS.has(key) && !VALUE_FLAGS.has(key)) throw usageError(`unknown option: ${a}`)
    const takesValue = VALUE_FLAGS.has(key)
    if (takesValue && (argv[i + 1] === undefined || argv[i + 1].startsWith('--')))
      throw usageError(`${a} needs a value`)
    const value = takesValue ? argv[++i] : true
    if (key === 'repo') out.repos.push(value)
    else if (key === 'scope-path') out.requestedPaths.push(value)
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
  if (args.runBudget !== undefined) cfg.runBudgetUsd = Number(args.runBudget)
  if (args.runTimeoutMs !== undefined) cfg.runTimeoutMs = Number(args.runTimeoutMs)
  if (args.sessionTimeoutMs !== undefined) cfg.sessionTimeoutMs = Number(args.sessionTimeoutMs)
  if (args.testCmd) cfg.testCommand = args.testCmd
  if (args.branchPrefix) cfg.branchPrefix = args.branchPrefix
  cfg.requestedPaths = args.requestedPaths
  cfg.authorization = readInvocationAuthorization(args.authorizationFile)
  const command = args._[0]
  cfg.invocationActions =
    command === 'run' && args.source === 'local'
      ? ['record-local-approval']
      : command === 'review'
        ? ['post-verdict', 'update-labels']
        : ['run', 'watch'].includes(command)
          ? ['push-branch', 'open-pr', 'post-verdict', 'update-labels', 'comment']
          : []
  return cfg
}

export async function resolveTarget(repo, args, cfg) {
  const entry = repoEntry(cfg, repo)
  const path = resolve(args.path || entry.path || clonePath(repo))
  if (!existsSync(path))
    throw new Error(
      `target clone is unavailable: ${path}; prepare the clone explicitly, then pass --path`,
    )
  const fallbackBase = entry.base || (await gh.defaultBranch(repo))
  const policy = await resolvePolicy({
    repoPath: path,
    repo,
    base: args.base,
    cfg: { ...cfg, ...entry, base: fallbackBase },
    authorization: cfg.authorization,
  })
  return {
    repo,
    repoPath: policy.target.root,
    base: policy.target.base,
    testCommand: policy.verification.commands.join(' && '),
    policy,
  }
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

function validateCommand(command, args) {
  if (!COMMANDS.has(command)) throw usageError(`unknown command: ${command}`)
  if (args._.length > 1) throw usageError(`unexpected argument: ${args._[1]}`)
  if (command === 'watch' && !args.once && (args.json || args.dryRun)) {
    throw usageError(
      'watch --json and watch --dry-run require --once; streaming output is not supported',
      'unsupported-combination',
    )
  }
  if (args.dryRun && !['init', 'run', 'review', 'watch', 'migrate-issues'].includes(command))
    throw usageError(`--dry-run is not supported for ${command}`, 'unsupported-combination')
  if (args.once && command !== 'watch')
    throw usageError('--once is only supported for watch', 'unsupported-combination')
  if ((args.pr || args.force) && command !== 'review')
    throw usageError('--pr and --force are only supported for review', 'unsupported-combination')
  if (args.issue && command !== 'run')
    throw usageError('--issue is only supported for run', 'unsupported-combination')
  if (args.issues && command !== 'migrate-issues' && (command !== 'run' || args.source !== 'local'))
    throw usageError(
      '--issues is only supported for local run or migrate-issues',
      'unsupported-combination',
    )
  if (command === 'migrate-issues') {
    if (!args.issues) throw usageError('migrate-issues needs --issues PATH')
    if (args.repos.length)
      throw usageError('migrate-issues does not accept --repo', 'unsupported-combination')
  }
  if (args.source && (command !== 'run' || !['local', 'github'].includes(args.source)))
    throw usageError(
      '--source must be local or github and is only supported for run',
      'unsupported-combination',
    )
  if (command === 'run' && args.source === 'local') {
    if (!args.issues) throw usageError('local run needs --issues PATH')
    if (args.repos.length)
      throw usageError('local run does not accept --repo', 'unsupported-combination')
  } else if (command === 'run' && (!args.repos.length || !args.issue)) {
    throw usageError('run needs --repo O/R and --issue N (or --source local)')
  }
  if (command === 'review' && (!args.repos.length || !args.pr))
    throw usageError('review needs --repo O/R and --pr N')
  if (['run', 'review'].includes(command) && args.repos.length > 1)
    throw usageError(`${command} accepts one --repo`)
  for (const repo of args.repos)
    if (!/^[^/\s]+\/[^/\s]+$/.test(repo))
      throw usageError(`invalid repository: ${repo}; expected O/R`)
  for (const key of ['issue', 'pr']) {
    if (args[key] && !(key === 'issue' && args.source === 'local') && !/^[1-9]\d*$/.test(args[key]))
      throw usageError(`--${key} must be a positive integer`)
  }
  for (const [key, flag] of [
    ['maxCycles', 'max-cycles'],
    ['poll', 'poll'],
    ['budget', 'budget'],
    ['reviewerBudget', 'reviewer-budget'],
    ['runBudget', 'run-budget'],
    ['runTimeoutMs', 'run-timeout-ms'],
    ['sessionTimeoutMs', 'session-timeout-ms'],
  ]) {
    if (
      args[key] !== undefined &&
      (!Number.isFinite(Number(args[key])) ||
        Number(args[key]) <= 0 ||
        (['maxCycles', 'poll', 'runTimeoutMs', 'sessionTimeoutMs'].includes(key) &&
          !Number.isInteger(Number(args[key]))))
    ) {
      throw usageError(
        `--${flag} must be a positive ${['maxCycles', 'poll', 'runTimeoutMs', 'sessionTimeoutMs'].includes(key) ? 'integer' : 'number'}`,
      )
    }
  }
}

function statusFor(result) {
  if (result?.migration) return result.changed ? 'success' : 'skipped'
  if (result?.dryRun) {
    if (
      result.prerequisites.length ||
      result.candidates.some((c) => ['blocked', 'malformed'].includes(c.disposition))
    )
      return 'blocked'
    if (
      !result.actions.length &&
      (!result.candidates.length || result.candidates.every((c) => c.disposition === 'skipped'))
    )
      return 'skipped'
    return 'success'
  }
  const entries = result?.results || [result]
  if (entries.some((r) => r?.outcome === 'failed' || r?.error)) return 'error'
  if (
    entries.some(
      (r) =>
        ['needs-detail', 'changes-requested'].includes(r?.outcome) ||
        ['blocked', 'request-changes'].includes(r?.verdict) ||
        /^blocked by\b/.test(r?.reason || ''),
    )
  )
    return 'blocked'
  if (!entries.length || entries.every((r) => r?.skipped || r?.outcome === 'skipped'))
    return 'skipped'
  return 'success'
}

async function executeCommand(command, args, cfg, labels) {
  if (command === 'migrate-issues') {
    const path = resolve(args.issues)
    const migration = migrateIssuesFile(path, { dryRun: !!args.dryRun })
    return {
      result: { migration: true, dryRun: !!args.dryRun, path, ...migration },
      human: args.dryRun
        ? `Migration preview for ${path}:\n${migration.text}`
        : `${migration.changed ? 'Migrated' : 'Already migrated'} ${path} (${migration.issues.length} issues)\n`,
    }
  }
  if (args.dryRun) {
    const result = await planCommand(command, args, cfg, labels)
    return { result, human: renderPlan(result) }
  }
  if (command === 'init') {
    const path = writeConfig({
      ...DEFAULTS,
      repos: [{ repo: 'org/repo', path: '/absolute/path/to/clone', base: 'main' }],
    })
    log.info('config.written', { path })
    return { result: { path }, human: `Edit ${path}, then: ateam-runner watch\n` }
  }

  if (command === 'run' && args.source === 'local') {
    const issuesFile = resolve(args.issues)
    if (!existsSync(issuesFile) || !statSync(issuesFile).isFile())
      throw new Error(`issues file not found: ${issuesFile}`)
    validateIssues(parseIssuesFile(readFileSync(issuesFile, 'utf8')))
    const repoPath = resolve(args.path || process.cwd())
    let policy = await resolveLocalBase({
      repoPath,
      base: args.base,
      cfg,
      authorization: cfg.authorization,
    })
    const adapter = createLocalAdapter({
      issuesFile,
      repoPath: policy.target.root,
      base: policy.target.base,
      testCommand: policy.verification.commands.join(' && '),
      cfg: { ...cfg, policy },
    })
    if (args.issue && !adapter.issues.some((issue) => issue.key === args.issue))
      throw usageError(`issue not found in ${issuesFile}: ${args.issue}`)
    const results = []
    for (const issue of await adapter.listCandidates()) {
      if (args.issue && issue.key !== args.issue) continue
      // Resume can select approved work before the first new issue. Resolve
      // every selected immutable base while preserving the project bindings.
      policy = await resolveLocalBase({
        repoPath,
        base: adapter.base,
        cfg,
        authorization: cfg.authorization,
        continuationBase: adapter.base,
      })
      results.push(await runIssue({ adapter, issue, cfg: { ...cfg, policy } }))
    }
    return {
      result: { results, report: adapter.report },
      human: results
        .map((r) => `  ${r.outcome.padEnd(18)} ${r.issue}${r.reason ? ` — ${r.reason}` : ''}\n`)
        .join(''),
    }
  }

  if (command === 'run') {
    const repo = args.repos[0]
    const target = await resolveTarget(repo, args, cfg)
    await assertBaseSafe(target, args)
    const adapter = createGithubAdapter({ ...target, labels })
    await adapter.ensureLabels().catch(() => {})
    const issue = normaliseIssue(await gh.viewIssue(repo, Number(args.issue)))
    const result = await runIssue({ adapter, issue, cfg: { ...cfg, policy: target.policy } })
    return { result }
  }

  if (command === 'review') {
    const repo = args.repos[0]
    const target = await resolveTarget(repo, args, cfg)
    const pr = await gh.viewPR(repo, Number(args.pr))
    const result = await reviewPullRequest({
      repo,
      repoPath: target.repoPath,
      pr,
      cfg: { ...cfg, policy: target.policy },
      labels,
      force: !!args.force,
    })
    return { result, human: result.skipped ? `skipped: ${result.reason}\n` : '' }
  }

  if (command === 'watch') {
    const repos = args.repos.length ? args.repos : (cfg.repos || []).map((r) => r.repo)
    const targets = []
    for (const repo of repos) {
      const t = await resolveTarget(repo, args, cfg)
      await assertBaseSafe(t, args)
      targets.push(t)
    }
    return { result: { results: await watch({ targets, cfg, labels, once: !!args.once }) } }
  }

  if (command === 'status') {
    const repos = args.repos.length ? args.repos : (cfg.repos || []).map((r) => r.repo)
    const all = []
    for (const repo of repos)
      all.push(await repoStatus(repo, { ...cfg, statusPath: args.path }, labels))
    return { result: all, human: all.map((s) => `${renderStatus(s)}\n`).join('') }
  }
}

/** The sole stdout boundary: every finite JSON invocation emits one envelope. */
export async function main(argv) {
  const json = argv.includes('--json')
  let command = argv.find((a) => COMMANDS.has(a)) || argv.find((a) => !a.startsWith('--')) || 'help'
  try {
    const args = parseArgs(argv)
    command = args._[0] || 'help'
    setQuiet(args.quiet)
    if (args.help || command === 'help') {
      if (json)
        process.stdout.write(
          `${JSON.stringify({ schemaVersion: 1, command, status: 'success', result: { usage: USAGE }, error: null })}\n`,
        )
      else process.stdout.write(USAGE)
      return 0
    }
    validateCommand(command, args)
    const cfg = cfgFrom(args)
    const labels = { ...LABELS, ...(cfg.labels || {}) }
    if (['watch', 'status'].includes(command) && !args.repos.length && !(cfg.repos || []).length) {
      throw usageError('no repos: pass --repo O/R or run `ateam-runner init` and edit the config')
    }
    const { result, human = '' } = await executeCommand(command, args, cfg, labels)
    const status = statusFor(result)
    const failure = (result?.results || [result]).find((r) => r?.outcome === 'failed' || r?.error)
    const error =
      status === 'error'
        ? {
            code: 'execution-failed',
            message: failure?.reason || failure?.error?.message || 'command failed',
          }
        : null
    if (json)
      process.stdout.write(
        `${JSON.stringify({ schemaVersion: 1, command, status, result, error }, null, 2)}\n`,
      )
    else if (human) process.stdout.write(human)
    return status === 'error' ? 1 : status === 'blocked' ? 2 : 0
  } catch (err) {
    const error = {
      code: typeof err.code === 'string' ? err.code : 'command-failed',
      message: err?.message ?? String(err),
    }
    if (json)
      process.stdout.write(
        `${JSON.stringify({ schemaVersion: 1, command, status: 'error', result: null, error }, null, 2)}\n`,
      )
    process.stderr.write(`ateam-runner: ${error.message}\n`)
    if (process.env.ATEAM_RUNNER_DEBUG) process.stderr.write(`${err?.stack ?? ''}\n`)
    return err.exitCode || 1
  }
}
