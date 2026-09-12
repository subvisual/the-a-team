// Local ticket identity and batch validation are pure: never read execution
// history or infer approval while parsing or migrating an authored document.
import { createHash } from 'node:crypto'
import { acceptanceCriteria } from './issue.mjs'

const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const ID = /^ISS-[A-Z0-9]+(?:-[A-Z0-9]+)*$/
const AC = /^###\s*acceptance\s+criteria\s*:?\s*$/im
const fieldPattern = (name) => new RegExp(`^\\*\\*${name}:\\*\\*[ \\t]*(.*)$`, 'gim')
const fields = (body, name) =>
  [...metadataLines(body).join('\n').matchAll(fieldPattern(name))].map((m) => m[1].trim())
const refs = (value = '') =>
  value
    .split(',')
    .map((s) => s.replace(/^\[|\]$/g, '').trim())
    .filter((s) => s && !/^none$/i.test(s))

// Fence contents are authored examples, not ticket metadata. Keep their line
// positions so migration can update a real field without rewriting its sample.
// The original body remains untouched for prompts and content versioning.
function metadataLines(body) {
  let fence = null
  return String(body)
    .split(/\r?\n/)
    .map((line) => {
      const marker = line.match(/^\s*(`{3,}|~{3,})(.*)$/)
      if (fence) {
        if (
          marker &&
          marker[1][0] === fence[0] &&
          marker[1].length >= fence.length &&
          !marker[2].trim()
        )
          fence = null
        return ''
      }
      if (marker) {
        fence = marker[1]
        return ''
      }
      return line
    })
}

export function slugify(title) {
  return String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function sections(text) {
  const lines = String(text).split(/\r?\n/)
  const out = []
  let current = null
  let fence = null
  for (const [index, line] of lines.entries()) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/)
    if (marker) {
      if (!fence) fence = marker[1]
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null
    }
    const heading = !fence && line.match(/^(#{1,2})\s+(?!#)(.+?)\s*$/)
    if (heading) {
      if (current) {
        current.end = index
        out.push(current)
      }
      current =
        heading[1] === '##'
          ? { title: heading[2].replace(/^\[|\]$/g, '').trim(), start: index, lines: [] }
          : null
    } else if (current) current.lines.push(line)
  }
  if (current) {
    current.end = lines.length
    out.push(current)
  }
  return out.filter((s) => AC.test(s.lines.join('\n')) || fields(s.lines.join('\n'), 'ID').length)
}

export function parseIssuesFile(text) {
  return sections(text).map((section) => {
    const body = section.lines.join('\n').trim()
    const ids = fields(body, 'ID')
    const id = ids[0] || null
    const criteria = acceptanceCriteria(body)
    const dependsOn = refs(fields(body, 'Depends on')[0])
    const requirements = refs(fields(body, 'Requirements')[0])
    return {
      id,
      key: id || slugify(section.title),
      title: section.title,
      body,
      acceptanceCriteria: criteria,
      dependsOn,
      requirements,
      blockedBy: [],
      criteriaVersion: hash(criteria),
      contentVersion: hash({ title: section.title, body }),
    }
  })
}

function invalid(diagnostics) {
  return Object.assign(
    new Error(`Invalid local issues:\n${diagnostics.map((d) => `- ${d.message}`).join('\n')}`),
    {
      code: 'invalid-local-issues',
      exitCode: 2,
      diagnostics,
    },
  )
}

// Validate the entire input, including unselected siblings, before returning a
// stable topological order. Callers may select one ticket only AFTER this gate.
export function validateIssues(issues) {
  const diagnostics = []
  const add = (code, issue, message) =>
    diagnostics.push({ code, issue: issue?.key ?? null, message })
  const byId = new Map()
  if (!issues.length) add('no-issues', null, 'no local issues found')
  for (const issue of issues) {
    if (!issue.id)
      add(
        'missing-id',
        issue,
        `${issue.title}: stable ID required; run migrate-issues --issues PATH`,
      )
    else if (!ID.test(issue.id))
      add(
        'invalid-id',
        issue,
        `${issue.title}: invalid local ID ${issue.id}; expected ISS- followed by uppercase letters, numbers or hyphen-separated groups`,
      )
    else if (byId.has(issue.id))
      add(
        'duplicate-id',
        issue,
        `duplicate local ID ${issue.id}: ${byId.get(issue.id).title} and ${issue.title}`,
      )
    else byId.set(issue.id, issue)
    for (const name of ['ID', 'Depends on', 'Requirements'])
      if (fields(issue.body, name).length > 1)
        add('duplicate-field', issue, `${issue.key}: duplicate ${name} metadata`)
    if (!issue.acceptanceCriteria.length)
      add('empty-criteria', issue, `${issue.key}: no checkable acceptance criteria`)
    for (const requirement of issue.requirements)
      if (!/^R-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(requirement))
        add(
          'invalid-requirement',
          issue,
          `${issue.key}: invalid requirement reference ${requirement}`,
        )
  }
  for (const issue of issues)
    for (const dep of issue.dependsOn)
      if (!byId.has(dep))
        add(
          'unknown-dependency',
          issue,
          `${issue.key}: unknown dependency ${dep}; dependencies must name local IDs`,
        )
  const ordered = [],
    visiting = [],
    visited = new Set()
  const visit = (issue) => {
    if (visiting.includes(issue.key)) {
      add(
        'dependency-cycle',
        issue,
        `dependency cycle: ${[...visiting.slice(visiting.indexOf(issue.key)), issue.key].join(' -> ')}`,
      )
      return
    }
    if (visited.has(issue.key)) return
    visiting.push(issue.key)
    for (const dep of issue.dependsOn) if (byId.has(dep)) visit(byId.get(dep))
    visiting.pop()
    visited.add(issue.key)
    ordered.push(issue)
  }
  for (const issue of issues) visit(issue)
  if (diagnostics.length) throw invalid(diagnostics)
  return ordered
}

// IDs are generated deterministically for a reviewable dry run, then written
// once by the explicit CLI command. Later parses always trust the persisted ID.
export function migrateIssuesText(text) {
  const source = String(text)
  const issues = parseIssuesFile(source)
  const diagnostics = []
  const collisions = new Map()
  for (const issue of issues) {
    const slug = slugify(issue.title)
    const previous = collisions.get(slug)
    if (previous && (!previous.id || !issue.id))
      diagnostics.push({
        code: 'legacy-collision',
        issue: issue.key,
        message: `legacy identity collision / ambiguous titles: ${previous.title} and ${issue.title}; assign distinct explicit IDs and dependencies before migration`,
      })
    collisions.set(slug, issue)
  }
  if (diagnostics.length) throw invalid(diagnostics)
  const assigned = issues.map((issue) => ({
    ...issue,
    id:
      issue.id ||
      `ISS-${hash({ title: issue.title, body: issue.body }).slice(0, 16).toUpperCase()}`,
  }))
  for (const issue of assigned) {
    issue.dependsOn = issue.dependsOn.map((dep) => {
      const matches = assigned.filter(
        (candidate) => candidate.id === dep || candidate.title === dep,
      )
      if (matches.length !== 1) {
        diagnostics.push({
          code: matches.length ? 'ambiguous-dependency' : 'unknown-dependency',
          issue: issue.id,
          message: `${issue.id}: ${matches.length ? 'ambiguous' : 'unknown'} dependency ${dep}; name one explicit ID`,
        })
        return dep
      }
      return matches[0].id
    })
  }
  if (diagnostics.length) throw invalid(diagnostics)
  const lines = source.split(/\r?\n/)
  const blocks = sections(source)
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index],
      issue = assigned[index]
    const body = [...block.lines]
    const depIndex = metadataLines(body.join('\n')).findIndex((line) =>
      /^\*\*Depends on:\*\*/i.test(line),
    )
    if (depIndex >= 0 && issue.dependsOn.join(', ') !== issues[index].dependsOn.join(', '))
      body[depIndex] = `**Depends on:** ${issue.dependsOn.join(', ') || 'none'}`
    if (!issues[index].id) body.unshift(`**ID:** ${issue.id}`)
    lines.splice(block.start + 1, block.end - block.start - 1, ...body)
  }
  const migrated = lines.join(source.includes('\r\n') ? '\r\n' : '\n')
  const validated = validateIssues(parseIssuesFile(migrated))
  return {
    text: migrated,
    changed: migrated !== source,
    issues: validated.map(({ id, title, dependsOn }) => ({ id, title, dependsOn })),
  }
}
