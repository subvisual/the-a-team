import { createHash, randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, lstatSync } from 'node:fs'
import { resolve, join, isAbsolute, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { isDeepStrictEqual } from 'node:util'
import { canonicalPath, within, digest } from './policy.mjs'
import { assertExactCheckout, git } from './git.mjs'
import { withVerificationServer } from './verification-server.mjs'

const hash = (value) => createHash('sha256').update(value).digest('hex')
const text = (value) => typeof value === 'string' && value.trim() && value.length <= 16000
const bounded = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max
const safeId = (value) =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value)
const keys = (value, allowed) => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('rendered plan object required')
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) throw Error(`unsupported rendered plan field: ${key}`)
}
const routePath = (value) =>
  typeof value === 'string' &&
  value.startsWith('/') &&
  !value.startsWith('//') &&
  !/[\\\x00-\x20]/.test(value) &&
  value.length < 2048
const viewportValid = (value) =>
  value &&
  Object.keys(value).length === 2 &&
  bounded(value.width, 240, 3840) &&
  bounded(value.height, 240, 2160)
const tuple = (value) =>
  JSON.stringify([value.obligation, value.state, value.viewport?.width, value.viewport?.height])
const STEPS = {
  click: ['selector'],
  fill: ['selector', 'value'],
  press: ['selector', 'key'],
  wait: ['selector', 'state', 'text'],
  scroll: ['selector', 'x', 'y'],
  dialog: ['disposition'],
}
const CHECKS = {
  text: ['selector', 'equals', 'includes'],
  value: ['selector', 'equals'],
  visible: ['selector', 'equals'],
  disabled: ['selector', 'equals'],
  focus: ['selector'],
  contained: ['selector'],
  css: ['selector', 'property', 'equals'],
  scroll: ['selector', 'axis', 'min'],
  sticky: ['selector', 'edge', 'tolerance'],
  accessibility: [],
  api: ['path', 'status', 'method', 'headers', 'data', 'jsonEquals'],
}
export function validateRenderedPlan(plan) {
  keys(plan, ['schemaVersion', 'serverCommand', 'requirements', 'cases'])
  if (plan.schemaVersion !== 1 || !text(plan.serverCommand))
    throw Error('rendered plan requires version 1 and serverCommand')
  if (!Array.isArray(plan.requirements) || !bounded(plan.requirements.length, 1, 160))
    throw Error('rendered requirements must contain 1..160 entries')
  const required = new Set()
  for (const requirement of plan.requirements) {
    keys(requirement, ['obligation', 'state', 'viewport'])
    if (
      !text(requirement.obligation) ||
      !text(requirement.state) ||
      !viewportValid(requirement.viewport) ||
      required.has(tuple(requirement))
    )
      throw Error('invalid or duplicate rendered requirement')
    required.add(tuple(requirement))
  }
  if (!Array.isArray(plan.cases) || plan.cases.length > 40)
    throw Error('rendered cases exceed 40-case bound')
  const ids = new Set()
  for (const entry of plan.cases) {
    keys(entry, [
      'id',
      'obligation',
      'state',
      'fixture',
      'route',
      'viewport',
      'actions',
      'assertions',
    ])
    if (
      !safeId(entry.id) ||
      ids.has(entry.id) ||
      !text(entry.fixture) ||
      !routePath(entry.route) ||
      !required.has(tuple(entry))
    )
      throw Error('invalid rendered case identity, route, or requirement')
    ids.add(entry.id)
    if (
      !Array.isArray(entry.actions) ||
      entry.actions.length > 50 ||
      !Array.isArray(entry.assertions) ||
      !bounded(entry.assertions.length, 1, 50)
    )
      throw Error('rendered case requires bounded actions and nonempty assertions')
    for (const [steps, schema] of [
      [entry.actions, STEPS],
      [entry.assertions, CHECKS],
    ])
      for (const step of steps) {
        if (!schema[step?.type]) throw Error('unsupported rendered action or assertion')
        keys(step, ['type', ...schema[step.type]])
        if (schema[step.type].includes('selector') && !text(step.selector))
          throw Error('rendered selector required')
        if (step.type === 'api') {
          if (
            !routePath(step.path) ||
            !bounded(step.status, 100, 599) ||
            !['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].includes(step.method || 'GET')
          )
            throw Error('invalid local API assertion')
          if (
            step.headers &&
            (typeof step.headers !== 'object' ||
              Array.isArray(step.headers) ||
              Object.keys(step.headers).length > 20 ||
              Object.entries(step.headers).some(
                ([k, v]) =>
                  !/^[a-zA-Z0-9-]+$/.test(k) ||
                  !text(v) ||
                  /[\r\n]/.test(v) ||
                  /^(host|connection|proxy-authorization)$/i.test(k),
              ))
          )
            throw Error('invalid API headers')
          if (JSON.stringify(step).length > 32000) throw Error('API assertion exceeds data bound')
        }
        if (step.type === 'dialog' && !['accept', 'dismiss'].includes(step.disposition))
          throw Error('invalid dialog disposition')
        if (step.type === 'fill' && typeof step.value !== 'string')
          throw Error('fill value required')
        if (step.type === 'press' && !text(step.key)) throw Error('press key required')
        if (
          step.type === 'wait' &&
          ((step.state && !['visible', 'hidden', 'attached', 'detached'].includes(step.state)) ||
            (step.text !== undefined && !text(step.text)))
        )
          throw Error('invalid wait condition')
        if (
          step.type === 'css' &&
          (!text(step.property) ||
            !/^(--)?[a-z][a-z0-9-]*$/.test(step.property) ||
            typeof step.equals !== 'string')
        )
          throw Error('invalid computed style assertion')
        if (
          step.type === 'scroll' &&
          schema === STEPS &&
          ![step.x ?? 0, step.y ?? 0].every((v) => Number.isFinite(v) && Math.abs(v) <= 100000)
        )
          throw Error('invalid scroll distance')
        if (
          step.type === 'scroll' &&
          schema === CHECKS &&
          (!['x', 'y'].includes(step.axis) || !Number.isFinite(step.min) || step.min < 1)
        )
          throw Error('invalid scrolling assertion')
        if (
          step.type === 'sticky' &&
          (!['top', 'bottom'].includes(step.edge || 'top') ||
            (step.tolerance !== undefined &&
              (!Number.isFinite(step.tolerance) || step.tolerance < 0 || step.tolerance > 100)))
        )
          throw Error('invalid sticky assertion')
        if (['disabled', 'visible'].includes(step.type) && typeof step.equals !== 'boolean')
          throw Error('boolean assertion expectation required')
        if (
          ['text', 'value'].includes(step.type) &&
          typeof step.equals !== 'string' &&
          !(step.type === 'text' && typeof step.includes === 'string')
        )
          throw Error('text assertion expectation required')
      }
  }
  return plan
}
export function summarizeRenderedCoverage(plan, cases) {
  const coverage = plan.requirements.map((requirement) => {
    const matching = cases.filter((entry) => tuple(entry) === tuple(requirement))
    return {
      ...requirement,
      status: matching.some((c) => c.status === 'failed')
        ? 'failed'
        : matching.length && matching.every((c) => c.status === 'passed')
          ? 'passed'
          : 'pending',
      caseIds: matching.map((c) => c.id),
    }
  })
  return {
    status: cases.some((c) => c.status === 'failed')
      ? 'failed'
      : coverage.some((c) => c.status !== 'passed')
        ? 'pending'
        : 'passed',
    coverage,
  }
}
function relativePlan(path) {
  if (
    !text(path) ||
    isAbsolute(path) ||
    path.split(/[\\/]/).some((p) => ['..', '.git', ''].includes(p))
  )
    throw Error('rendered plan path must be target-relative')
  return path
}
export async function readCommittedRenderedPlan(sourceRoot, head, planPath) {
  if (!/^[a-f0-9]{40,64}$/.test(head || '')) throw Error('rendered revision must be an exact SHA')
  relativePlan(planPath)
  const mode = (await git(sourceRoot, ['ls-tree', head, '--', planPath])).stdout
  if (!/^100644 blob |^100755 blob /.test(mode))
    throw Error('rendered plan must be a committed regular file')
  const source = (await git(sourceRoot, ['show', `${head}:${planPath}`])).stdout
  if (source.length > 256000) throw Error('rendered plan exceeds size bound')
  return { plan: validateRenderedPlan(JSON.parse(source)), digest: hash(source) }
}
const limitations = [
  'Bounded automated name, language, image alternative, geometry, computed-style and interaction checks only; full WCAG conformance is unverified.',
  'Agent semantic critique is separate from deterministic observations; human usability has not been studied or accepted.',
  'Only the explicitly listed synthetic routes, fixtures, states, viewports and interactions are covered.',
]
// Fixed supervisor code. Plans supply selector/property data, never executable JS.
async function observeElement(locator) {
  return locator.evaluate((element) => {
    const r = element.getBoundingClientRect(),
      style = getComputedStyle(element)
    let clip = { left: 0, top: 0, right: innerWidth, bottom: innerHeight }
    const geometrySupport = { status: 'supported', issues: [] }
    const inspectedEffects = new WeakSet()
    let painted = style.visibility === 'visible'
    const inspectEffects = (node, computed) => {
      if (inspectedEffects.has(node)) return
      inspectedEffects.add(node)
      if (Number(computed.opacity) === 0 || computed.display === 'none') painted = false
      for (const property of [
        'clip-path',
        'mask-image',
        '-webkit-mask-image',
        'mask-border-source',
        '-webkit-mask-box-image-source',
        'clip',
        'filter',
        'transform',
      ]) {
        const value = computed.getPropertyValue(property)
        if (value && value !== 'none' && value !== 'auto') {
          geometrySupport.status = 'unverified'
          if (geometrySupport.issues.length < 20)
            geometrySupport.issues.push({
              element: { tag: node.tagName, id: node.id },
              property,
              value,
              reason: 'paint or clipping geometry is outside the rectangular observer',
            })
        }
      }
      if (/(^|\s)(paint|strict|content)(\s|$)/.test(computed.contain)) {
        geometrySupport.status = 'unverified'
        if (geometrySupport.issues.length < 20)
          geometrySupport.issues.push({
            element: { tag: node.tagName, id: node.id },
            property: 'contain',
            value: computed.contain,
            reason: 'paint containment requires a separate geometry check',
          })
      }
    }
    inspectEffects(element, style)
    let scrollport = {
      kind: 'viewport',
      top: 0,
      left: 0,
      right: innerWidth,
      bottom: innerHeight,
      width: innerWidth,
      height: innerHeight,
      scrollTop: document.scrollingElement?.scrollTop || 0,
      scrollLeft: document.scrollingElement?.scrollLeft || 0,
    }
    let ancestorCount = 0
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (++ancestorCount > 256) {
        geometrySupport.status = 'unverified'
        geometrySupport.issues.push({ reason: 'ancestor inspection exceeded 256 elements' })
        break
      }
      const s = getComputedStyle(parent),
        p = parent.getBoundingClientRect()
      inspectEffects(parent, s)
      if (
        scrollport.kind === 'viewport' &&
        parent !== document.documentElement &&
        /(auto|scroll|hidden|overlay)/.test(s.overflowY)
      ) {
        const top = p.top + parent.clientTop,
          left = p.left + parent.clientLeft
        scrollport = {
          kind: 'element',
          element: { tag: parent.tagName, id: parent.id },
          top,
          left,
          right: left + parent.clientWidth,
          bottom: top + parent.clientHeight,
          width: parent.clientWidth,
          height: parent.clientHeight,
          scrollTop: parent.scrollTop,
          scrollLeft: parent.scrollLeft,
        }
      }
      if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) {
        clip.left = Math.max(clip.left, p.left)
        clip.right = Math.min(clip.right, p.right)
      }
      if (/(auto|scroll|hidden|clip)/.test(s.overflowY)) {
        clip.top = Math.max(clip.top, p.top)
        clip.bottom = Math.min(clip.bottom, p.bottom)
      }
    }
    const labelInspection = { inspected: 0, truncated: false, clipped: [] }
    if (element.matches('button,[role=button],a')) {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      let node
      while ((node = walker.nextNode())) {
        if (!node.textContent.trim()) continue
        if (++labelInspection.inspected > 500) {
          labelInspection.truncated = true
          break
        }
        let textClip = {
          left: Math.max(clip.left, r.left),
          right: Math.min(clip.right, r.right),
          top: Math.max(clip.top, r.top),
          bottom: Math.min(clip.bottom, r.bottom),
        }
        let intentionallyHidden = false
        for (let parent = node.parentElement; parent; parent = parent.parentElement) {
          const s = getComputedStyle(parent),
            p = parent.getBoundingClientRect()
          // Non-rendered content and conventional visually hidden accessible
          // labels have no painted label to contain. A partially clipped label
          // remains visible and must be checked against every clipping ancestor.
          if (
            s.display === 'none' ||
            s.visibility !== 'visible' ||
            (p.width <= 1 &&
              p.height <= 1 &&
              (s.clip === 'rect(0px, 0px, 0px, 0px)' || s.clipPath === 'inset(50%)'))
          ) {
            intentionallyHidden = true
            break
          }
          inspectEffects(parent, s)
          if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) {
            textClip.left = Math.max(textClip.left, p.left + parent.clientLeft)
            textClip.right = Math.min(
              textClip.right,
              p.left + parent.clientLeft + parent.clientWidth,
            )
          }
          if (/(auto|scroll|hidden|clip)/.test(s.overflowY)) {
            textClip.top = Math.max(textClip.top, p.top + parent.clientTop)
            textClip.bottom = Math.min(
              textClip.bottom,
              p.top + parent.clientTop + parent.clientHeight,
            )
          }
          if (parent === element) break
        }
        if (intentionallyHidden) continue
        const range = document.createRange()
        range.selectNodeContents(node)
        for (const rect of range.getClientRects()) {
          if (!rect.width || !rect.height) continue
          if (
            rect.left < textClip.left - 1 ||
            rect.right > textClip.right + 1 ||
            rect.top < textClip.top - 1 ||
            rect.bottom > textClip.bottom + 1
          ) {
            labelInspection.clipped.push({
              text: node.textContent.slice(0, 200),
              rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
              clip: textClip,
            })
            break
          }
        }
        if (labelInspection.clipped.length >= 20) break
      }
    }
    return {
      rect: {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        top: r.top,
        bottom: r.bottom,
        left: r.left,
        right: r.right,
      },
      clip,
      painted,
      geometrySupport,
      scrollport,
      viewport: { width: innerWidth, height: innerHeight },
      focused: document.activeElement === element,
      labelInspection,
      contentFits:
        !element.matches('button,[role=button],a') ||
        (element.scrollWidth <= element.clientWidth + 1 &&
          element.scrollHeight <= element.clientHeight + 1 &&
          !labelInspection.truncated &&
          !labelInspection.clipped.length),
      scroll: {
        x: element.scrollLeft,
        y: element.scrollTop,
        width: element.scrollWidth,
        height: element.scrollHeight,
        clientWidth: element.clientWidth,
        clientHeight: element.clientHeight,
      },
      computed: {
        color: style.color,
        backgroundColor: style.backgroundColor,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        position: style.position,
        top: style.top,
        bottom: style.bottom,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
      },
    }
  })
}
async function assertion(page, expected, baseURL) {
  if (expected.type === 'api') {
    const url = new URL(expected.path, baseURL)
    if (url.origin !== baseURL) throw Error('API origin escape')
    const response = await page.request.fetch(url.href, {
      method: expected.method || 'GET',
      headers: expected.headers,
      data: expected.data,
      maxRedirects: 0,
      timeout: 3000,
    })
    const bytes = await response.body()
    if (bytes.length > 1024 * 1024) throw Error('API observation exceeds 1MB bound')
    const actual = { status: response.status(), body: bytes.toString('utf8') }
    if (expected.jsonEquals !== undefined) {
      try {
        actual.json = JSON.parse(actual.body)
      } catch {}
    }
    return {
      expected,
      actual,
      passed:
        actual.status === expected.status &&
        (expected.jsonEquals === undefined || isDeepStrictEqual(actual.json, expected.jsonEquals)),
    }
  }
  if (expected.type === 'accessibility') {
    const actual = await page.evaluate(() => {
      const problems = []
      if (!document.documentElement.lang) problems.push('document language is missing')
      if (!document.title.trim()) problems.push('document title is missing')
      const nodes = [
        ...document.querySelectorAll('input:not([type=hidden]),button,select,textarea,a[href],img'),
      ].slice(0, 500)
      for (const element of nodes) {
        if (!element.getClientRects().length) continue
        const labelled = (element.getAttribute('aria-labelledby') || '')
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent || '')
          .join(' ')
          .trim()
        const name =
          element.getAttribute('aria-label') ||
          labelled ||
          [...(element.labels || [])]
            .map((l) => l.textContent)
            .join(' ')
            .trim() ||
          (['BUTTON', 'A'].includes(element.tagName) ? element.textContent.trim() : '') ||
          element.getAttribute('alt') ||
          element.getAttribute('title')
        if (element.tagName === 'IMG' ? !element.hasAttribute('alt') : !name)
          problems.push(`${element.tagName}#${element.id}: accessible name/alternative missing`)
      }
      return {
        problems,
        inspected: nodes.length,
        truncated:
          document.querySelectorAll('input,button,select,textarea,a[href],img').length > 500,
      }
    })
    return { expected, actual, passed: !actual.problems.length && !actual.truncated }
  }
  const locator = page.locator(expected.selector)
  if ((await locator.count()) !== 1)
    return { expected, actual: { count: await locator.count() }, passed: false }
  const geometry = await observeElement(locator)
  let actual, passed
  switch (expected.type) {
    case 'text':
      actual = await locator.innerText()
      passed =
        expected.equals !== undefined
          ? actual === expected.equals
          : actual.includes(expected.includes)
      break
    case 'value':
      actual = await locator.inputValue()
      passed = actual === expected.equals
      break
    case 'visible':
      actual = await locator.isVisible()
      passed = actual === expected.equals
      break
    case 'disabled':
      actual = await locator.isDisabled()
      passed = actual === expected.equals
      break
    case 'focus':
      actual = geometry.focused
      passed = actual
      break
    case 'css':
      actual = await locator.evaluate(
        (element, property) => getComputedStyle(element).getPropertyValue(property),
        expected.property,
      )
      passed = actual === expected.equals
      break
    case 'contained': {
      const { rect: r, clip: c } = geometry
      actual = geometry
      passed =
        geometry.painted &&
        geometry.geometrySupport.status === 'supported' &&
        geometry.contentFits &&
        r.width > 0 &&
        r.height > 0 &&
        r.left >= c.left - 1 &&
        r.right <= c.right + 1 &&
        r.top >= c.top - 1 &&
        r.bottom <= c.bottom + 1
      break
    }
    case 'scroll':
      actual = geometry.scroll
      passed = actual[expected.axis] >= expected.min
      break
    case 'sticky': {
      const edge = expected.edge || 'top',
        inset = geometry.computed[edge],
        supportedInset = /^-?(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)px$/.test(inset),
        offset = supportedInset ? parseFloat(inset) : null,
        target = supportedInset
          ? geometry.scrollport[edge] + (edge === 'top' ? offset : -offset)
          : null
      actual = {
        ...geometry,
        stickyEdge: {
          edge,
          inset,
          expectedCoordinate: target,
          observedCoordinate: geometry.rect[edge],
          status: supportedInset ? 'supported' : 'unverified',
          reason: supportedInset ? null : 'sticky assertion needs a resolved pixel inset',
        },
      }
      passed =
        geometry.painted &&
        geometry.geometrySupport.status === 'supported' &&
        supportedInset &&
        geometry.computed.position === 'sticky' &&
        Math.abs(geometry.rect[edge] - target) <= (expected.tolerance ?? 2)
      break
    }
  }
  return { expected, actual, geometry, passed: passed === true }
}
async function action(page, step) {
  const locator = step.selector ? page.locator(step.selector) : null
  switch (step.type) {
    case 'click':
      await locator.click()
      break
    case 'fill':
      await locator.fill(step.value)
      break
    case 'press':
      await locator.press(step.key)
      break
    case 'wait':
      if (step.text !== undefined)
        await locator.filter({ hasText: step.text }).waitFor({ state: 'visible' })
      else await locator.waitFor({ state: step.state || 'visible' })
      break
    case 'scroll':
      await locator.evaluate((element, value) => element.scrollTo(value.x || 0, value.y || 0), step)
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      )
      break
    case 'dialog':
      page.once('dialog', (dialog) => dialog[step.disposition]())
      break
  }
}
function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o444 })
  return { path, hash: hash(readFileSync(path)) }
}
export async function evaluateRenderedReview({
  worktree,
  head,
  policy,
  planPath,
  scratchDir,
  evidenceDir,
  timeoutMs = 30000,
  authority = null,
}) {
  if (!bounded(timeoutMs, 1, 300000))
    throw Error('rendered timeout must be bounded to at most 300000ms')
  const source = canonicalPath(worktree),
    scratch = canonicalPath(scratchDir),
    evidence = canonicalPath(evidenceDir)
  if (
    within(source, evidence) ||
    within(scratch, evidence) ||
    within(evidence, source) ||
    within(evidence, scratch)
  )
    throw Error('rendered evidence must be separate from app source and writable scratch')
  mkdirSync(evidence, { recursive: true })
  await assertExactCheckout(worktree, head)
  const accepted = await readCommittedRenderedPlan(worktree, head, planPath)
  if (authority?.planDigest && accepted.digest !== authority.planDigest)
    throw Error(
      'rendered plan changed from accepted base authority; reaccept the plan before implementation',
    )
  const plan = accepted.plan,
    results = [],
    runId = randomUUID()
  let server = null,
    failure = null,
    browser = null
  const runtime = policy?.sandbox?.playwrightModule || process.env.ATEAM_PLAYWRIGHT_MODULE
  const record = {
    schemaVersion: 1,
    kind: 'rendered-review',
    headSha: head,
    policyDigest: policy?.digest,
    planPath,
    planDigest: accepted.digest,
    authorityDigest: authority?.digest || null,
    accessibilityTarget: policy?.bindings?.accessibilityTarget || 'WCAG 2.2 AA',
    limitations,
    humanUsability: 'unverified',
    fullAccessibilityConformance: 'unverified',
    runId,
    cases: results,
    createdAt: new Date().toISOString(),
  }
  try {
    if (!runtime || !isAbsolute(runtime))
      throw Error('trusted operator Playwright module is not configured')
    const modulePath = canonicalPath(runtime)
    if (
      within(source, modulePath) ||
      within(scratch, modulePath) ||
      (policy?.target?.root && within(canonicalPath(policy.target.root), modulePath))
    )
      throw Error('target-controlled browser runtime is forbidden')
    const { chromium } = await import(pathToFileURL(modulePath).href)
    browser = await chromium.launch({
      timeout: Math.min(timeoutMs, 15000),
      headless: true,
      channel: policy?.sandbox?.browserChannel || process.env.ATEAM_BROWSER_CHANNEL || 'chrome',
      env: { PATH: process.env.PATH, HOME: evidence, TMPDIR: tmpdir() },
    })
    record.browser = {
      name: 'chromium',
      version: browser.version(),
      channel: policy?.sandbox?.browserChannel || process.env.ATEAM_BROWSER_CHANNEL || 'chrome',
      runtime: modulePath,
    }
    const observed = await withVerificationServer(
      { command: plan.serverCommand, worktree, scratchDir, policy, timeoutMs },
      async ({ baseURL, signal }) => {
        for (const entry of plan.cases) {
          if (signal.aborted) throw Error('rendered observation aborted')
          const context = await browser.newContext({
            viewport: entry.viewport,
            serviceWorkers: 'block',
            acceptDownloads: false,
          })
          const abort = () => void context.close().catch(() => {})
          signal.addEventListener('abort', abort, { once: true })
          const result = {
            id: entry.id,
            obligation: entry.obligation,
            state: entry.state,
            fixture: entry.fixture,
            route: entry.route,
            viewport: entry.viewport,
            headSha: head,
            observations: [],
            status: 'passed',
            networkViolations: [],
          }
          let page
          try {
            await context.route('**/*', (route) => {
              if (new URL(route.request().url()).origin === baseURL) return route.continue()
              result.networkViolations.push(route.request().url())
              return route.abort()
            })
            if (typeof context.routeWebSocket !== 'function')
              throw Error('trusted Playwright runtime must support WebSocket routing')
            await context.routeWebSocket('**/*', (socket) => {
              result.networkViolations.push(socket.url())
              socket.close()
            })
            page = await context.newPage()
            page.setDefaultTimeout(3000)
            page.setDefaultNavigationTimeout(5000)
            context.on('page', (popup) => {
              if (popup !== page) {
                result.networkViolations.push('unexpected popup')
                void popup.close()
              }
            })
            await page.goto(new URL(entry.route, baseURL).href, { waitUntil: 'domcontentloaded' })
            for (const step of entry.actions) await action(page, step)
            result.automaticAccessibility = await assertion(
              page,
              { type: 'accessibility' },
              baseURL,
            )
            if (!result.automaticAccessibility.passed) result.status = 'failed'
            for (const expected of entry.assertions) {
              const observation = await assertion(page, expected, baseURL)
              result.observations.push(observation)
              if (!observation.passed) result.status = 'failed'
            }
          } catch (error) {
            result.status = 'failed'
            result.error = error.message
          } finally {
            try {
              if (page && !page.isClosed()) {
                const path = join(evidence, `${runId}-${entry.id}.png`)
                await page.screenshot({ path, timeout: 3000 })
                result.screenshot = { path, hash: hash(readFileSync(path)) }
              } else {
                result.status = 'failed'
                result.screenshotError = 'page closed before mandatory screenshot evidence'
              }
            } catch (error) {
              result.status = 'failed'
              result.screenshotError = error.message
            }
            if (result.networkViolations.length) result.status = 'failed'
            result.machineEvidence = writeJson(
              join(evidence, `${runId}-${entry.id}-observations.json`),
              { ...result },
            )
            results.push(result)
            signal.removeEventListener('abort', abort)
            await context.close()
          }
        }
        return { cases: results.length }
      },
    )
    server = observed.server
  } catch (error) {
    failure = error.message
    server = error.server || server
  } finally {
    await browser?.close()
  }
  await assertExactCheckout(worktree, head)
  Object.assign(record, summarizeRenderedCoverage(plan, results), { server, failure })
  if (failure) record.status = results.length ? 'failed' : 'pending'
  if (authority?.obligations?.some((id) => !plan.requirements.some((r) => r.obligation === id))) {
    record.status = 'pending'
    record.failure = 'accepted rendered obligation missing from plan coverage'
  }
  const recordPath = join(evidence, `${runId}-rendered-review.json`)
  writeJson(recordPath, record)
  return { status: record.status, recordPath, record }
}
export async function validateRenderedReviewRecord({
  recordPath,
  head,
  policy,
  sourceRoot,
  planPath,
  authority = null,
}) {
  try {
    const record = JSON.parse(readFileSync(recordPath, 'utf8'))
    if (
      record.schemaVersion !== 1 ||
      record.kind !== 'rendered-review' ||
      record.status !== 'passed' ||
      record.headSha !== head ||
      record.policyDigest !== policy.digest ||
      record.planPath !== planPath ||
      record.failure ||
      record.humanUsability !== 'unverified' ||
      record.fullAccessibilityConformance !== 'unverified'
    )
      throw Error('rendered revision, policy, status or limits changed')
    const accepted = await readCommittedRenderedPlan(sourceRoot, head, planPath)
    if (
      record.planDigest !== accepted.digest ||
      (authority &&
        (record.authorityDigest !== authority.digest || accepted.digest !== authority.planDigest))
    )
      throw Error('rendered plan authority changed')
    if (
      !Array.isArray(record.cases) ||
      record.cases.length !== accepted.plan.cases.length ||
      !isDeepStrictEqual(
        record.coverage,
        summarizeRenderedCoverage(accepted.plan, record.cases).coverage,
      ) ||
      summarizeRenderedCoverage(accepted.plan, record.cases).status !== 'passed'
    )
      throw Error('rendered coverage is incomplete')
    const evidenceRoot = canonicalPath(dirname(recordPath))
    for (let i = 0; i < record.cases.length; i++) {
      const entry = record.cases[i],
        expected = accepted.plan.cases[i]
      if (
        entry.id !== expected.id ||
        tuple(entry) !== tuple(expected) ||
        entry.route !== expected.route ||
        entry.fixture !== expected.fixture ||
        entry.headSha !== head ||
        entry.status !== 'passed' ||
        entry.error ||
        entry.networkViolations?.length ||
        entry.automaticAccessibility?.passed !== true ||
        entry.observations?.length !== expected.assertions.length
      )
        throw Error('rendered case identity or observations changed')
      for (let j = 0; j < expected.assertions.length; j++)
        if (
          entry.observations[j].passed !== true ||
          !isDeepStrictEqual(entry.observations[j].expected, expected.assertions[j])
        )
          throw Error('rendered assertion changed')
      for (const artifact of [entry.screenshot, entry.machineEvidence])
        if (
          !artifact ||
          !within(evidenceRoot, canonicalPath(artifact.path)) ||
          !lstatSync(artifact.path).isFile() ||
          lstatSync(artifact.path).isSymbolicLink() ||
          hash(readFileSync(artifact.path)) !== artifact.hash
        )
          throw Error('rendered screenshot or machine observation changed')
      const machine = JSON.parse(readFileSync(entry.machineEvidence.path, 'utf8')),
        { machineEvidence, ...without } = entry
      if (!isDeepStrictEqual(machine, without))
        throw Error('rendered machine observations do not match record')
    }
    return { valid: true, reason: null }
  } catch (error) {
    return { valid: false, reason: error.message }
  }
}

export function summarizeRenderedCandidates(candidates, currentHead, maxIterations) {
  if (!bounded(maxIterations, 1, 100) || candidates.length > maxIterations)
    throw Error('rendered iteration bound exceeded')
  const entries = candidates.map(({ recordPath, record }) => ({
    recordPath,
    recordDigest: digest(record),
    headSha: record.headSha,
    status: record.status,
    passedCases: (record.cases || []).filter((c) => c.status === 'passed').length,
    failedCases: (record.cases || []).filter((c) => c.status === 'failed').length,
  }))
  const best =
    [...entries].sort(
      (a, b) =>
        Number(b.status === 'passed') - Number(a.status === 'passed') ||
        b.passedCases - a.passedCases ||
        a.failedCases - b.failedCases,
    )[0] || null
  const current = entries.filter((e) => e.headSha === currentHead).at(-1) || null
  return {
    maxIterations,
    iterations: entries.length,
    history: entries,
    best,
    current,
    currentSatisfied: current?.status === 'passed',
  }
}
