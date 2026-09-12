import http from 'node:http'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const source = fileURLToPath(new URL('./index.html', import.meta.url))
const session = 'synthetic-local-session'
let attempts = 0,
  persisted = null,
  submissions = 0
const server = http.createServer(async (req, res) => {
  const send = (code, value) => {
    res.writeHead(code, { 'content-type': 'application/json' })
    res.end(JSON.stringify(value))
  }
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(readFileSync(source))
    return
  }
  if (req.url?.startsWith('/api/')) {
    // Tests must call this actual application route, never the test-only guard.
    if (req.headers['x-session'] !== session && !process.env.ATEAM_FIXTURE_UNGUARDED) {
      send(401, { error: 'Session required' })
      return
    }
    if (req.method === 'GET' && req.url === '/api/state') {
      send(200, { attempts, persisted, submissions })
      return
    }
    if (req.method !== 'POST') {
      send(405, { error: 'POST required' })
      return
    }
    let raw = ''
    for await (const chunk of req) raw += chunk
    let data
    try {
      data = JSON.parse(raw)
    } catch {
      send(400, { error: 'Invalid JSON' })
      return
    }
    if (req.url === '/api/save') {
      attempts++
      await new Promise((resolve) => setTimeout(resolve, 100))
      if (attempts === 1) {
        send(503, { error: 'Temporary save failure' })
        return
      }
      if (typeof data.title !== 'string' || !data.title.trim()) {
        send(422, { error: 'Title required' })
        return
      }
      persisted = structuredClone(data)
      send(200, { saved: persisted })
      return
    }
    if (req.url === '/api/submit') {
      if (!persisted || JSON.stringify(data) !== JSON.stringify(persisted)) {
        send(409, { error: 'Save the current changes first' })
        return
      }
      if (process.env.ATEAM_FIXTURE_COMBINED_DEFECT) {
        send(500, { error: 'Connected submission defect' })
        return
      }
      submissions++
      send(200, { submitted: true })
      return
    }
  }
  send(404, { error: 'Not found' })
})
server.listen(
  Number(process.env.ATEAM_VERIFICATION_PORT || process.env.PORT || 0),
  '127.0.0.1',
  () => console.log(JSON.stringify({ port: server.address().port })),
)
process.on('SIGTERM', () => server.close(() => process.exit(0)))
