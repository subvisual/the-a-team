import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fixtureRepo, git, config } from './approval-fixtures.mjs'
import { withVerificationServer } from '../src/verification-server.mjs'
import { sandboxProfile } from '../src/sandbox.mjs'
const native = process.platform === 'darwin' && process.env.ATEAM_NATIVE_SANDBOX_TEST === '1'
test('ordinary reviewer and executor cannot request a verification listener', () => {
  for (const role of ['reviewer', 'executor'])
    assert.throws(
      () =>
        sandboxProfile({
          cwd: process.cwd(),
          scratchDir: tmpdir() + '/server-fixture',
          policy: { readPaths: ['.'], sandbox: {} },
          role,
          command: process.execPath,
          serverPort: 55111,
        }),
      /verification server/,
    )
})
test(
  'actual protected endpoint and failed-save retry run through the scoped native server',
  { skip: !native },
  async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'ateam-native-server-'))
    t.after(() => rmSync(dir, { recursive: true, force: true }))
    const root = fixtureRepo(dir),
      scratch = join(dir, 'scratch')
    mkdirSync(scratch)
    for (const path of ['server.mjs', 'index.html'])
      copyFileSync(resolve(import.meta.dirname, 'fixtures/connected-app', path), join(root, path))
    git(root, ['add', '.'])
    git(root, ['commit', '-m', 'app'])
    const policy = config(root).policy
    policy.sandbox.backend = 'macos-seatbelt'
    const r = await withVerificationServer(
      { command: 'node server.mjs', worktree: root, scratchDir: scratch, policy },
      async ({ baseURL }) => {
        const post = (path, data, session = true) =>
          fetch(baseURL + path, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              ...(session ? { 'x-session': 'synthetic-local-session' } : {}),
            },
            body: JSON.stringify(data),
          })
        assert.equal((await post('/api/save', { title: 'Draft' }, false)).status, 401)
        assert.equal((await post('/api/submit', { title: 'Draft' })).status, 409)
        assert.equal((await post('/api/save', { title: 'Draft' })).status, 503)
        assert.equal((await post('/api/save', { title: 'Draft' })).status, 200)
        assert.equal((await post('/api/submit', { title: 'Draft' })).status, 200)
        return 'actual endpoint passed'
      },
    )
    assert.equal(r.observation, 'actual endpoint passed')
    assert.equal(r.server.output.aborted, true)
    assert.equal(git(root, ['status', '--porcelain']), '')
  },
)

for (const mode of ['throws', 'pending'])
  test(
    `native server retains failure evidence and bounds ${mode} observer`,
    { skip: !native },
    async (t) => {
      const dir = mkdtempSync(join(tmpdir(), 'ateam-server-failure-'))
      t.after(() => rmSync(dir, { recursive: true, force: true }))
      const root = fixtureRepo(dir),
        scratch = join(dir, 'scratch')
      mkdirSync(scratch)
      for (const path of ['server.mjs', 'index.html'])
        copyFileSync(resolve(import.meta.dirname, 'fixtures/connected-app', path), join(root, path))
      git(root, ['add', '.'])
      git(root, ['commit', '-m', 'app'])
      const policy = config(root).policy
      policy.sandbox.backend = 'macos-seatbelt'
      let signaled = false
      const before = Date.now()
      await assert.rejects(
        withVerificationServer(
          {
            command: 'node server.mjs',
            worktree: root,
            scratchDir: scratch,
            policy,
            timeoutMs: 2000,
          },
          ({ signal }) => {
            signal.addEventListener(
              'abort',
              () => {
                signaled = true
              },
              { once: true },
            )
            if (mode === 'throws') throw Error('observer failed')
            return new Promise(() => {})
          },
        ),
        (error) => {
          assert.match(error.server.output.stdout, /port/)
          if (mode === 'throws') assert.match(error.message, /observer failed/)
          else {
            assert.equal(error.server.output.timedOut, true)
            assert.match(error.message, /timed out/)
          }
          return true
        },
      )
      assert.equal(signaled, true)
      assert.ok(Date.now() - before < 5000)
    },
  )
