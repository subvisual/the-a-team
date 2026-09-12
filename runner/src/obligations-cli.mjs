#!/usr/bin/env node
// Read-only issues-phase gate over the real feature artifacts. No execution or
// feature manifest mutation occurs here; the harness consumes the returned report.
import { readFile, readdir, realpath } from 'node:fs/promises'
import { resolve, relative, isAbsolute, sep } from 'node:path'
import { isMain } from './entrypoint.mjs'
import { ACCEPTANCE_STAGES, evaluateAcceptance } from './obligations.mjs'
import { parseIssuesFile, validateIssues } from './local-issues.mjs'

const array = (value) => (Array.isArray(value) ? value : [])
const rank = (stage) =>
  ACCEPTANCE_STAGES.indexOf({ dev: 'implementation', pr: 'integration' }[stage] || stage)
const artifactStage = {
  prd: 'definition',
  spec: 'spec',
  'page-brief': 'definition',
  issues: 'issues',
}
const inside = (root, path) => {
  const rel = relative(root, path)
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

// Recognize only a top-level authored fence, never a sample embedded in a wider
// Markdown fence. Exactly one block per Markdown artifact keeps coverage unambiguous.
function parseSnapshots(source, path) {
  if (path.endsWith('.json')) {
    const document = JSON.parse(source)
    if (!Array.isArray(document?.acceptanceObligations))
      throw new Error(`${path}: acceptanceObligations array required`)
    return document.acceptanceObligations
  }
  let fence = null,
    capture = false,
    content = [],
    blocks = []
  for (const line of source.split(/\r?\n/)) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/)
    if (fence) {
      if (
        marker &&
        marker[1][0] === fence[0] &&
        marker[1].length >= fence.length &&
        !marker[2].trim()
      ) {
        if (capture) blocks.push(JSON.parse(content.join('\n')))
        fence = null
        capture = false
        content = []
      } else if (capture) content.push(line)
    } else if (marker) {
      fence = marker[1]
      capture = marker[2].trim() === 'acceptance-obligations'
    }
  }
  if (capture) throw new Error(`${path}: unterminated acceptance-obligations fence`)
  if (blocks.length !== 1 || !Array.isArray(blocks[0]))
    throw new Error(`${path}: exactly one acceptance-obligations JSON array fence required`)
  return blocks[0]
}

export async function validateIssuesPhase({ featureDir, stage = 'issues' } = {}) {
  const diagnostics = []
  const add = (field, message, artifact = null) =>
    diagnostics.push({
      code: 'acceptance-artifact',
      severity: 'error',
      requirementId: null,
      obligationId: null,
      field,
      artifact,
      message,
    })
  let root
  try {
    root = await realpath(resolve(featureDir || '.'))
  } catch (error) {
    add('featureDir', error.message)
    return failed(diagnostics, stage)
  }
  const read = async (path) => {
    const absolute = resolve(root, path)
    if (!inside(root, absolute)) throw new Error(`${path}: path outside feature directory`)
    const physical = await realpath(absolute)
    if (!inside(root, physical)) throw new Error(`${path}: symlink outside feature directory`)
    return readFile(physical, 'utf8')
  }
  let ledger
  try {
    ledger = JSON.parse(await read('acceptance.json'))
  } catch (error) {
    add('acceptance.json', error.message)
    return failed(diagnostics, stage)
  }
  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) {
    add('acceptance.json', 'canonical ledger must be an object')
    return failed(diagnostics, stage)
  }

  // All previous revisions are discovered, never supplied as an optional flag.
  // Revision n requires contiguous immutable snapshots 1..n-1. Validate every
  // transition so a weakened intermediate revision cannot sanitize the current one.
  let historyNames = []
  try {
    const historyPath = await realpath(resolve(root, 'acceptance-history'))
    if (!inside(root, historyPath))
      throw new Error('acceptance-history: path outside feature directory')
    historyNames = (await readdir(historyPath)).sort()
  } catch (error) {
    if (error.code !== 'ENOENT') add('history', error.message)
  }
  const history = new Map()
  for (const name of historyNames) {
    if (!/^[1-9][0-9]*\.json$/.test(name)) {
      add('history', `unexpected history file ${name}`)
      continue
    }
    try {
      const record = JSON.parse(await read(`acceptance-history/${name}`))
      const number = Number(name.slice(0, -5))
      if (record?.revision !== number) add('history', `${name}: revision does not match filename`)
      if (number >= ledger.revision)
        add('history', `${name}: history must precede current ledger revision`)
      history.set(number, record)
    } catch (error) {
      add('history', error.message)
    }
  }
  if (Number.isSafeInteger(ledger.revision) && ledger.revision > 1) {
    // Bound iteration to authored entries, even for a malformed giant revision.
    if (history.size !== ledger.revision - 1)
      add(
        'history',
        'revised ledger requires every prior revision in acceptance-history/<revision>.json',
      )
    const ordered = [...history.keys()].sort((a, b) => a - b)
    for (const [index, number] of ordered.entries()) {
      if (number !== index + 1) add('history', `missing acceptance-history/${index + 1}.json`)
      const result = evaluateAcceptance(history.get(number), {
        historical: true,
        previousLedger: history.get(number - 1),
        history: ordered
          .filter((revision) => revision < number)
          .map((revision) => history.get(revision)),
      })
      diagnostics.push(
        ...result.diagnostics
          .filter((item) => item.severity === 'error')
          .map((item) => ({ ...item, artifact: `acceptance-history/${number}.json` })),
      )
    }
  }

  const declarations = array(ledger.artifacts)
  for (const [kind, path] of [
    ['prd', 'prd.md'],
    ['spec', 'spec.md'],
    ['issues', 'issues.md'],
  ]) {
    if (!declarations.some((item) => item?.kind === kind && item.path === path))
      add('artifacts', `actual ${path} must be declared as ${kind}`, path)
  }
  const pagePaths = []
  const scanPages = async (path) => {
    let entries
    try {
      const physical = await realpath(resolve(root, path))
      if (!inside(root, physical)) throw new Error(`${path}: path outside feature directory`)
      entries = await readdir(physical, { withFileTypes: true })
    } catch (error) {
      if (error.code !== 'ENOENT') add('artifacts', error.message, path)
      return
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const child = `${path}/${entry.name}`
      if (entry.isDirectory()) await scanPages(child)
      else if (/\.md$/.test(entry.name) || entry.name === 'board.json') pagePaths.push(child)
    }
  }
  await scanPages('briefs/pages')
  for (const path of pagePaths)
    if (!declarations.some((item) => item?.kind === 'page-brief' && item.path === path))
      add('artifacts', `actual page brief ${path} is missing from coverage declarations`, path)
  const artifacts = {},
    sources = {}
  for (const artifact of declarations) {
    if (typeof artifact?.path !== 'string' || rank(stage) < rank(artifactStage[artifact.kind]))
      continue
    try {
      sources[artifact.path] = await read(artifact.path)
      artifacts[artifact.path] = parseSnapshots(sources[artifact.path], artifact.path)
    } catch (error) {
      add('artifact.snapshot', error.message, artifact.path)
    }
  }
  let issues = []
  if (rank(stage) >= rank('issues')) {
    try {
      issues = validateIssues(parseIssuesFile(sources['issues.md'] || ''))
    } catch (error) {
      for (const item of error.diagnostics || [{ message: error.message }])
        add('issues', item.message, 'issues.md')
    }
    const requirementIds = new Set(array(ledger.requirements).map((item) => item?.id))
    for (const issue of issues)
      for (const requirement of issue.requirements)
        if (!requirementIds.has(requirement))
          add('requirements', `${issue.id}: unknown requirement ${requirement}`, 'issues.md')
  }
  const result = evaluateAcceptance(ledger, {
    stage,
    artifacts,
    issues: rank(stage) >= rank('issues') ? issues : undefined,
    previousLedger: history.get(ledger.revision - 1),
    history: [...history.values()],
  })
  result.diagnostics.unshift(...diagnostics)
  result.ok = !result.diagnostics.some((item) => item.severity === 'error')
  if (!result.ok && diagnostics.some((item) => item.severity === 'error'))
    result.requirements = result.requirements.map((item) => ({ ...item, accepted: false }))
  return result
}

function failed(diagnostics, stage) {
  return {
    ok: false,
    stage,
    diagnostics,
    requirements: [],
    obligations: [],
    pending: [],
    blocked: [],
    deferred: [],
    unresolvedOwners: [],
  }
}

if (isMain(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2)
  const options = {}
  let invalid = command !== 'issues'
  for (let index = 0; index < args.length; index += 2) {
    const key = { '--feature': 'featureDir', '--stage': 'stage' }[args[index]]
    if (!key || !args[index + 1] || args[index + 1].startsWith('--') || options[key]) {
      invalid = true
      break
    }
    options[key] = args[index + 1]
  }
  let result
  if (invalid || !options.featureDir)
    result = failed(
      [
        {
          severity: 'error',
          field: 'usage',
          message:
            'Usage: node runner/src/obligations-cli.mjs issues --feature PATH [--stage STAGE]',
        },
      ],
      options.stage || 'issues',
    )
  else {
    try {
      result = await validateIssuesPhase(options)
    } catch (error) {
      result = failed(
        [{ severity: 'error', field: 'validation', message: error.message }],
        options.stage || 'issues',
      )
    }
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  process.exitCode = result.ok ? 0 : 2
}
