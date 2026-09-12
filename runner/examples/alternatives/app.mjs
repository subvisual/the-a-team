import { createFlow } from './flow-runtime.mjs'
const option = new URL(location.href).searchParams.get('option') || 'guided'
if (!['guided', 'workspace'].includes(option)) throw Error('Unknown comparison option')
const contract = await (await fetch(`${option}.json`)).json(),
  flow = createFlow(contract)
const app = document.querySelector('#app')
document.querySelector('#title').textContent =
  option === 'guided' ? 'Guided steps' : 'Direct workspace'
let pending
const element = (tag, text) => {
  const node = document.createElement(tag)
  if (text) node.textContent = text
  return node
}
function render(focus = false) {
  clearTimeout(pending)
  const state = flow.snapshot(),
    current = contract.states.find((s) => s.nodeId === state.nodeId)
  app.replaceChildren()
  app.dataset.node = state.nodeId
  const heading = element('h2', contract.graph.nodes.find((n) => n.id === state.nodeId).text)
  heading.tabIndex = -1
  app.append(heading)
  if (current.invalid) {
    const error = element('p', 'Complete the required fields to continue.')
    error.setAttribute('role', 'alert')
    app.append(error)
  }
  for (const field of current.fields || []) {
    const label = element('label', `${field.label} (required)`),
      input = element('input')
    input.id = field.key
    label.htmlFor = input.id
    input.value = state.draft[field.key]
    input.required = field.required
    input.addEventListener('input', () => flow.change(field.key, input.value))
    app.append(label, input)
  }
  if (['error', 'summary'].includes(current.kind)) {
    const values = element('dl')
    for (const [key, value] of Object.entries(
      current.kind === 'summary' ? state.persisted : state.draft,
    ))
      values.append(
        element('dt', key === 'name' ? 'Request name' : 'Request owner'),
        element('dd', value),
      )
    app.append(values)
  }
  const actions = element('div')
  actions.className = 'actions'
  const triggers = new Map(
    contract.graph.edges
      .filter((e) => e.from === state.nodeId && e.trigger !== 'settle')
      .map((e) => [e.trigger, e]),
  )
  for (const [trigger, edge] of triggers) {
    const button = element('button', edge.label)
    button.dataset.trigger = trigger
    if (['back', 'edit'].includes(trigger)) button.className = 'secondary'
    button.addEventListener('click', () => {
      flow.send(trigger)
      render(true)
    })
    actions.append(button)
  }
  app.append(actions)
  if (focus) heading.focus()
  if (current.kind === 'loading') {
    app.setAttribute('aria-busy', 'true')
    pending = setTimeout(() => {
      flow.settle()
      render(true)
    }, current.delayMs)
  } else app.removeAttribute('aria-busy')
}
document.querySelector('#reset').addEventListener('click', () => {
  flow.reset()
  render(true)
})
window.comparisonEvidence = () => ({ receipt: flow.receipt(), snapshot: flow.snapshot(), option })
render()
