// Synthetic established-product behavior used by refinement regression examples.
// The transport is the only fake boundary; no client project is imported.
export function savingFixture(transport) {
  let value = '',
    persisted = '',
    version = 0,
    savedVersion = 0,
    inFlight = null,
    error = null
  return {
    edit(next) {
      value = next
      version++
    },
    state() {
      return {
        value,
        persisted,
        dirty: version !== savedVersion,
        saving: inFlight !== null,
        error,
        canSubmit: version === savedVersion && inFlight === null,
      }
    },
    navigate() {
      return version === savedVersion ? 'allow' : 'confirm-unsaved'
    },
    save() {
      if (inFlight) return inFlight
      const submitted = value,
        submittedVersion = version
      inFlight = Promise.resolve()
        .then(() => transport(submitted))
        .then(
          () => {
            persisted = submitted
            savedVersion = submittedVersion
            error = null
            return true
          },
          (failure) => {
            error = failure.message
            return false
          },
        )
        .finally(() => {
          inFlight = null
        })
      return inFlight
    },
    submitDependent() {
      if (version !== savedVersion || inFlight !== null) return { status: 'blocked' }
      return { status: 'submitted', value: persisted }
    },
  }
}
