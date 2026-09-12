// Deliberately isolated example: this guard is NOT mounted by server.mjs.
// A green test here cannot establish authorization on the application endpoint.
export const testOnlyGuard = (session) => session === 'synthetic-local-session'
