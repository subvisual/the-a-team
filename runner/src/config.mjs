import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { configPath, ensureDir } from './paths.mjs'

export const LABELS = {
  ready: 'agent:ready',
  running: 'agent:running',
  needsDetail: 'agent:needs-detail',
  changesRequested: 'agent:changes-requested',
  approved: 'agent:approved',
  failed: 'agent:failed',
}

export const DEFAULTS = {
  repos: [],
  pollSeconds: 30,
  maxCycles: 3,
  concurrency: 1,
  branchPrefix: 'agent/issue-',
  executorModel: 'opus',
  reviewerModel: 'opus',
  executorBudgetUsd: 10,
  reviewerBudgetUsd: 5,
  labels: LABELS,
}

export function loadConfig() {
  const p = configPath()
  if (!existsSync(p)) return { ...DEFAULTS }
  const raw = JSON.parse(readFileSync(p, 'utf8'))
  return { ...DEFAULTS, ...raw, labels: { ...LABELS, ...(raw.labels || {}) } }
}

export function writeConfig(cfg) {
  const p = configPath()
  ensureDir(dirname(p))
  writeFileSync(p, `${JSON.stringify(cfg, null, 2)}\n`)
  return p
}

// A repo entry may be configured, or synthesised from flags.
export function repoEntry(cfg, repo) {
  const found = (cfg.repos || []).find((r) => r.repo === repo)
  return found ? { ...found } : { repo }
}
