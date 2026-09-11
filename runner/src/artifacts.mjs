import { readFileSync, readdirSync, existsSync, realpathSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'
import { contextPath, readContextIndex, contentRevision } from './context.mjs'
import { validateIssuesPhase } from './obligations-cli.mjs'

const text = (value) => typeof value === 'string' && value.trim().length > 0
const array = (value) => (Array.isArray(value) ? value : [])
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const STATES = ['empty', 'loading', 'error', 'populated']
const TYPES = new Set([
  'start',
  'outcome',
  'screen',
  'external_site',
  'external_product',
  'system',
  'agent',
  'decision',
  'stop',
])
function result(path) {
  const diagnostics = []
  const add = (id, field, message, reference = null) =>
    diagnostics.push({
      code: 'artifact-invalid',
      severity: 'error',
      path,
      id: id || null,
      field,
      reference,
      message,
    })
  return {
    add,
    finish: (ids) => ({
      schemaVersion: 1,
      ok: diagnostics.length === 0,
      eligible: diagnostics.length === 0,
      diagnostics,
      ids,
    }),
  }
}
function ids(items, kind, add) {
  const seen = new Set()
  for (const item of array(items)) {
    if (!text(item?.id) || seen.has(item.id))
      add(item?.id, 'id', `${kind} requires a unique stable ID`)
    else seen.add(item.id)
  }
  return seen
}
function ref(value, known, id, field, add) {
  if (!text(value) || !known.has(value))
    add(id, field, `Unknown ${field} reference: ${value}`, value)
}
function knownRefs(record, sets, id, add) {
  for (const [field, known] of Object.entries(sets))
    if (known) {
      if (!Array.isArray(record?.[field]) || !record[field].length)
        add(id, field, `Nonempty ${field} required`)
      for (const value of array(record?.[field])) ref(value, new Set(known), id, field, add)
    }
}
export function validateWireflow(board, { path = 'board.json', jobIds, pageIds } = {}) {
  const { add, finish } = result(path),
    nodeIds = [],
    edgeIds = []
  if (!object(board) || !Array.isArray(board.journeys) || !board.journeys.length) {
    add(null, 'journeys', 'Nonempty journeys array required')
    return finish({ nodes: [], edges: [], journeys: [] })
  }
  const journeys = ids(board.journeys, 'Journey', add)
  if (
    board.lanes !== undefined &&
    (!Array.isArray(board.lanes) || board.lanes.some((lane) => !text(lane)))
  )
    add(null, 'lanes', 'Board lanes must be an array of nonempty lane names')
  if (board.layout !== undefined && !['horizontal', 'matrix'].includes(board.layout))
    add(null, 'layout', 'Layout must be horizontal or matrix')
  const jobs = new Set(
    jobIds || (Array.isArray(board.jtbds) ? board.jtbds : Object.keys(board.jtbds || {})),
  )
  for (const job of Array.isArray(board.jtbds) ? board.jtbds : Object.keys(board.jtbds || {}))
    ref(job, jobs, job, 'job', add)
  for (const j of board.journeys) {
    if (!object(j)) continue
    const declaredLanes =
      board.layout === 'matrix' && array(board.lanes).length
        ? board.lanes
        : (j.lanes ?? board.lanes)
    if (declaredLanes !== undefined && !Array.isArray(declaredLanes))
      add(j.id, 'lanes', 'Lanes must be an array')
    if (!Array.isArray(j.edges))
      add(
        j.id,
        'edges',
        'Edges must be an array, including an empty array for a single-node journey',
      )
    const nodes = ids(j.nodes, 'Node', add),
      lanes = new Set(
        declaredLanes === undefined ? array(j.nodes).map((n) => n?.lane) : array(declaredLanes),
      )
    if (!nodes.size) add(j.id, 'nodes', 'Journey must declare nodes')
    const refs = array(j.jtbds).length ? j.jtbds : [j.jtbd]
    for (const job of refs) ref(job, jobs, j.id, 'job', add)
    for (const n of array(j.nodes)) {
      if (!object(n)) continue
      nodeIds.push(n.id)
      if (!text(n.text)) add(n.id, 'text', 'Node requires a nonempty display label')
      if (!TYPES.has(n.type)) add(n.id, 'type', `Unknown node type: ${n.type}`, n.type)
      ref(n.lane, lanes, n.id, 'lane', add)
      if (!Number.isInteger(n.col) || n.col < 0)
        add(n.id, 'col', 'Node col must be a nonnegative integer')
      if (n.type === 'screen' && pageIds) ref(n.pageId, new Set(pageIds), n.id, 'page', add)
    }
    const seenEdges = new Set()
    for (const [i, e] of array(j.edges).entries()) {
      if (!object(e)) {
        add(j.id, 'edges', 'Edge must be an object')
        continue
      }
      const id = e.id || `${j.id}:${e.from}->${e.to}:${i}`
      edgeIds.push(id)
      if (seenEdges.has(id)) add(id, 'id', 'Edge ID must be unique')
      seenEdges.add(id)
      ref(e.from, nodes, id, 'from', add)
      ref(e.to, nodes, id, 'to', add)
    }
  }
  return finish({ journeys: [...journeys], nodes: nodeIds, edges: edgeIds })
}
export function validatePageBrief(
  board,
  { path = 'board.json', jobIds, pageIds, journeyIds, journeys, requirements, obligations } = {},
) {
  const { add, finish } = result(path)
  if (!object(board) || !Array.isArray(board.pages) || !board.pages.length) {
    add(null, 'pages', 'Nonempty pages array required')
    return finish({ pages: [] })
  }
  const pages = ids(board.pages, 'Page', add),
    declaredJobs = new Set(Object.keys(board.jtbds || {})),
    jobs = new Set(jobIds || declaredJobs),
    knownJourneys = journeyIds || journeys?.filter(object).map((j) => j.id)
  for (const id of declaredJobs) ref(id, jobs, id, 'job', add)
  for (const page of board.pages) {
    if (!object(page)) continue
    if (pageIds) ref(page.id, new Set(pageIds), page.id, 'page', add)
    if (!text(page.name)) add(page.id, 'name', 'Page name required')
    if (!Array.isArray(page.checklist) || !page.checklist.length)
      add(page.id, 'checklist', 'Nonempty job-tagged checklist required')
    for (const field of ['connects', 'appears_in'])
      if (page[field] !== undefined && !Array.isArray(page[field]))
        add(page.id, field, `${field} must be an array`)
    for (const layer of ['factual', 'qualitative'])
      if (
        !Array.isArray(page.acceptance?.[layer]) ||
        !page.acceptance[layer].length ||
        page.acceptance[layer].some((value) => !text(value))
      )
        add(
          page.id,
          `acceptance.${layer}`,
          `Page requires the ${layer} acceptance layer; criteria are not completion evidence`,
        )
    for (const item of array(page.checklist)) {
      if (!array(item?.jobs).length)
        add(page.id, 'jobs', 'Checklist task requires an accepted job reference')
      for (const job of array(item?.jobs)) {
        ref(job, declaredJobs, page.id, 'job', add)
        ref(job, jobs, page.id, 'job', add)
      }
    }
    for (const connection of array(page.connects)) {
      const known = {
        page: new Set(pageIds || pages),
        job: jobs,
        journey: knownJourneys ? new Set(knownJourneys) : null,
      }
      if (!['page', 'job', 'journey', 'external'].includes(connection?.kind))
        add(page.id, 'connects.kind', 'Connection kind must be explicit')
      if (connection?.kind !== 'external' && known[connection?.kind]) {
        const target = connection.targetId || connection.target
        ref(target, known[connection.kind], page.id, connection.kind, add)
      }
      if (connection?.job) ref(connection.job, jobs, page.id, 'job', add)
    }
    if (knownJourneys)
      for (const entry of array(page.appears_in)) {
        ref(entry?.journey, new Set(knownJourneys), page.id, 'journey', add)
        if (journeys) {
          const journey = journeys.find((j) => j?.id === entry?.journey),
            node = array(journey?.nodes).find((n) => n?.id === entry?.step)
          if (!node || node.type !== 'screen' || node.pageId !== page.id)
            add(
              page.id,
              'appears_in.step',
              'Occurrence must reference a screen node for this page',
              entry?.step,
            )
        }
      }
    if (
      journeys &&
      !journeys.some((j) =>
        array(j?.nodes).some((n) => n?.type === 'screen' && n.pageId === page.id),
      )
    )
      add(page.id, 'appears_in', 'Page has no screen node in the wireflow', page.id)
    knownRefs(page, { requirementIds: requirements, obligationIds: obligations }, page.id, add)
  }
  return finish({ pages: [...pages], jobs: [...declaredJobs] })
}
export function validateComponents(
  document,
  { path = 'spec.md', pageIds, requirements, obligations } = {},
) {
  const { add, finish } = result(path)
  if (
    document?.schemaVersion !== 1 ||
    !Array.isArray(document.components) ||
    !document.components.length
  ) {
    add(null, 'component-states', 'Versioned component-states must declare components')
    return finish({ components: [] })
  }
  const components = ids(document.components, 'Component', add),
    covered = new Set()
  for (const component of document.components) {
    if (!object(component)) continue
    if (pageIds) ref(component.pageId, new Set(pageIds), component.id, 'page', add)
    covered.add(component.pageId)
    knownRefs(
      component,
      { requirementIds: requirements, obligationIds: obligations },
      component.id,
      add,
    )
    for (const state of STATES) {
      const entry = component.states?.[state]
      if (
        !object(entry) ||
        !(
          (entry.status === 'applicable' && text(entry.behavior)) ||
          (entry.status === 'not-applicable' && text(entry.reason))
        )
      )
        add(
          component.id,
          `states.${state}`,
          `${state} requires observable behavior or a reasoned not-applicable disposition`,
        )
    }
  }
  for (const page of pageIds || [])
    if (!covered.has(page)) add(page, 'components', 'Page has no declared component states')
  return finish({ components: [...components] })
}

// Ignore examples nested inside wider Markdown fences; one top-level contract
// carries the machine-checkable declarations beside the human-readable artifact.
export function artifactBlock(source, name, { optional = false } = {}) {
  let fence = null,
    capture = false,
    lines = [],
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
        if (capture) blocks.push(JSON.parse(lines.join('\n')))
        fence = null
        capture = false
        lines = []
      } else if (capture) lines.push(line)
    } else if (marker) {
      fence = marker[1]
      capture = marker[2].trim() === name
    }
  }
  if (capture || blocks.length > 1 || (!optional && blocks.length !== 1))
    throw new Error(`Exactly one complete ${name} JSON fence required`)
  return blocks[0] ?? null
}

export async function validateFeatureArtifacts({ featureDir, root, stage = 'definition' } = {}) {
  const dir = realpathSync(featureDir),
    target = realpathSync(root || JSON.parse(readFileSync(join(dir, 'feature.json'), 'utf8')).repo)
  const diagnostics = [],
    reports = []
  const read = (path) =>
    readFileSync(contextPath(target, relative(target, join(dir, path))), 'utf8')
  const add = (path, field, message) =>
    diagnostics.push({
      code: 'artifact-invalid',
      severity: 'error',
      path,
      id: null,
      field,
      reference: null,
      message,
    })
  if (stage === 'discovery')
    return { schemaVersion: 1, ok: true, eligible: true, diagnostics, reports }
  let scope, wireflow, pages, ledger
  try {
    scope = artifactBlock(read('prd.md'), 'artifact-scope', { optional: true })
  } catch (error) {
    add('prd.md', 'artifact-scope', error.message)
  }
  let noInterface = false
  try {
    ledger = JSON.parse(read('acceptance.json'))
  } catch (error) {
    add('acceptance.json', 'required', error.message)
  }
  const requirementIds = array(ledger?.requirements)
      .filter(object)
      .map((r) => r.id),
    obligationIds = array(ledger?.requirements)
      .filter(object)
      .flatMap((r) =>
        array(r.obligations)
          .filter(object)
          .map((o) => o.id),
      )
  if (scope) {
    try {
      const { index } = readContextIndex({ root: target })
      const source = index?.sources.find((s) => s.id === scope.source?.id)
      if (
        scope.interface !== 'none' ||
        !text(scope.reason) ||
        !requirementIds.includes(scope.requirementId) ||
        source?.kind !== 'requirement' ||
        source.revision !== scope.source?.revision ||
        contentRevision(readFileSync(contextPath(target, source.path), 'utf8')) !== source.revision
      )
        throw new Error(
          'Interface exemption requires none, a reason, a canonical requirementId, and a current requirement source {id, revision} from the context index',
        )
      noInterface = true
    } catch (error) {
      add('prd.md', 'artifact-scope', error.message)
    }
  }
  const jobs = []
  const jobDir = join(target, 'docs/product/jtbd')
  if (existsSync(jobDir))
    for (const name of readdirSync(jobDir).filter((name) => name.endsWith('.md'))) {
      try {
        const source = readFileSync(contextPath(target, `docs/product/jtbd/${name}`), 'utf8')
        const front = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1]
        const id = front?.match(/^id:\s*["']?([^\n"']+)/m)?.[1]?.trim() || name.split('-')[0]
        jobs.push(id)
      } catch (error) {
        add(`docs/product/jtbd/${name}`, 'job', error.message)
      }
    }
  if (!noInterface) {
    for (const [kind, path] of [
      ['wireflow', 'briefs/wireflow/board.json'],
      ['pages', 'briefs/pages/board.json'],
    ])
      try {
        const value = JSON.parse(read(path))
        if (kind === 'wireflow') wireflow = value
        else pages = value
      } catch (error) {
        add(path, 'required', error.message)
      }
    if (wireflow)
      reports.push(
        validateWireflow(wireflow, {
          path: 'briefs/wireflow/board.json',
          jobIds: jobs,
          pageIds: array(pages?.pages)
            .filter(object)
            .map((page) => page.id),
        }),
      )
    if (pages)
      reports.push(
        validatePageBrief(pages, {
          path: 'briefs/pages/board.json',
          jobIds: jobs,
          journeys: array(wireflow?.journeys),
          requirements: requirementIds,
          obligations: obligationIds,
        }),
      )
    if (!['definition', 'design'].includes(stage))
      try {
        reports.push(
          validateComponents(artifactBlock(read('spec.md'), 'component-states'), {
            path: 'spec.md',
            pageIds: array(pages?.pages)
              .filter(object)
              .map((page) => page.id),
            requirements: requirementIds,
            obligations: obligationIds,
          }),
        )
      } catch (error) {
        add('spec.md', 'component-states', error.message)
      }
    if (stage !== 'definition') {
      const { validateFeatureFlow } = await import('./prototype.mjs')
      reports.push(validateFeatureFlow({ featureDir: dir, root: target, stage }))
      const { validateFeatureAlternatives } = await import('./alternatives.mjs')
      reports.push(await validateFeatureAlternatives({ featureDir: dir, root: target }))
    }
  }
  const acceptance = await validateIssuesPhase({ featureDir: dir, stage })
  diagnostics.push(
    ...reports.flatMap((report) => report.diagnostics),
    ...acceptance.diagnostics
      .filter((d) => d.severity === 'error')
      .map((d) => ({ ...d, path: d.artifact || 'acceptance.json' })),
  )
  return {
    schemaVersion: 1,
    ok: diagnostics.length === 0,
    eligible: diagnostics.length === 0,
    diagnostics,
    reports,
    interface: noInterface ? 'none' : 'web',
    acceptance,
  }
}
