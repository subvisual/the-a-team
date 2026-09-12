import { test } from 'node:test'
import assert from 'node:assert/strict'
import { savingFixture } from './helpers/refinement-save-fixture.mjs'

test('refinement persistence regression: failed first save then successful retry', async () => {
  let requests = 0
  const form = savingFixture(async () => {
    if (++requests === 1) throw new Error('Offline')
  })
  form.edit('draft')
  assert.equal(await form.save(), false)
  assert.deepEqual(form.state(), {
    value: 'draft',
    persisted: '',
    dirty: true,
    saving: false,
    error: 'Offline',
    canSubmit: false,
  })
  assert.equal(await form.save(), true)
  assert.deepEqual(form.state(), {
    value: 'draft',
    persisted: 'draft',
    dirty: false,
    saving: false,
    error: null,
    canSubmit: true,
  })
})

test('refinement persistence regression: edits in flight remain unsaved after earlier response', async () => {
  let respond
  const form = savingFixture(
    () =>
      new Promise((resolve) => {
        respond = resolve
      }),
  )
  form.edit('first')
  const request = form.save()
  await Promise.resolve()
  form.edit('second')
  respond()
  await request
  assert.deepEqual(form.state(), {
    value: 'second',
    persisted: 'first',
    dirty: true,
    saving: false,
    error: null,
    canSubmit: false,
  })
  const retry = form.save()
  await Promise.resolve()
  respond()
  await retry
  assert.equal(form.state().persisted, 'second')
  assert.equal(form.state().dirty, false)
})

test('refinement persistence regression: dependent submission is blocked until current edits persist', async () => {
  let respond
  const form = savingFixture(
    () =>
      new Promise((resolve) => {
        respond = resolve
      }),
  )
  form.edit('unsaved')
  assert.deepEqual(form.submitDependent(), { status: 'blocked' })
  const pending = form.save()
  await Promise.resolve()
  assert.deepEqual(form.submitDependent(), { status: 'blocked' })
  respond()
  await pending
  assert.deepEqual(form.submitDependent(), { status: 'submitted', value: 'unsaved' })
})

test('refinement persistence regression: navigation protects failed or unsaved edits', async () => {
  let offline = true
  const form = savingFixture(async () => {
    if (offline) throw new Error('Offline')
  })
  assert.equal(form.navigate(), 'allow')
  form.edit('draft')
  assert.equal(form.navigate(), 'confirm-unsaved')
  await form.save()
  assert.equal(form.navigate(), 'confirm-unsaved')
  offline = false
  await form.save()
  assert.equal(form.navigate(), 'allow')
})
