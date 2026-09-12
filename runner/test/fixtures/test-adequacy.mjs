const copy = (value) => structuredClone(value)

function workflow(transport, defective) {
  let draft = { title: '', details: { priority: 'normal' } }
  let persisted = null
  let version = 0
  let savedVersion = 0
  let inFlight = null
  let error = null
  const requests = []

  const save = () => {
    if (inFlight) return inFlight
    const payload = copy(draft)
    const submittedVersion = version
    requests.push(copy(payload))
    inFlight = Promise.resolve()
      .then(() => transport(copy(payload)))
      .then(
        () => {
          persisted = copy(payload)
          savedVersion = defective ? version : submittedVersion
          error = null
          return true
        },
        (failure) => {
          error = failure.message
          if (defective) {
            draft = persisted ? copy(persisted) : { title: '', details: { priority: 'normal' } }
            savedVersion = version
          }
          return false
        },
      )
      .finally(() => {
        inFlight = null
      })
    return inFlight
  }

  return {
    edit(payload) {
      draft = copy(payload)
      version += 1
    },
    save,
    retry: save,
    submitDependent() {
      if (!defective && (version !== savedVersion || inFlight)) return { status: 'blocked' }
      return { status: 'submitted', payload: copy(persisted) }
    },
    navigate() {
      return !defective && (version !== savedVersion || inFlight) ? 'confirm-unsaved' : 'allow'
    },
    snapshot() {
      return {
        draft: copy(draft),
        persisted: copy(persisted),
        dirty: version !== savedVersion,
        saving: inFlight !== null,
        error,
        requests: copy(requests),
      }
    },
  }
}

export const correctSaveWorkflow = (transport) => workflow(transport, false)
export const defectiveSaveWorkflow = (transport) => workflow(transport, true)

export const acceptedFailureStatus = () => ({
  text: 'Save failed. Your changes are retained.',
  glyph: '!',
  colorToken: 'danger',
})

export const defectiveFailureStatus = () => ({
  text: '',
  glyph: '',
  colorToken: 'danger',
})
