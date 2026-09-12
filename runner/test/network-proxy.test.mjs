import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import net from 'node:net'

test('CONNECT proxy refuses undeclared authorities and tunnels only the exact allowed endpoint', async (t) => {
  const { startNetworkProxy } = await import('../src/network-proxy.mjs')
  const endpoint = net.createServer((socket) => socket.on('data', (data) => socket.end(data)))
  await new Promise((r) => endpoint.listen(0, '127.0.0.1', r))
  t.after(() => endpoint.close())
  const allowed = `127.0.0.1:${endpoint.address().port}`
  const proxy = await startNetworkProxy([allowed])
  t.after(() => proxy.close())
  const connect = (path) =>
    new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port: proxy.port, method: 'CONNECT', path })
      req.on('connect', (response, socket) => resolve({ response, socket }))
      req.on('error', reject)
      req.end()
    })
  const denied = await connect('api.github.com:443')
  assert.equal(denied.response.statusCode, 403)
  denied.socket.destroy()
  const spoof = await connect(`${allowed}@api.github.com:443`)
  assert.equal(spoof.response.statusCode, 403)
  spoof.socket.destroy()
  const accepted = await connect(allowed)
  assert.equal(accepted.response.statusCode, 200)
  accepted.socket.write('synthetic')
  assert.equal(
    await new Promise((r) => accepted.socket.once('data', (d) => r(String(d)))),
    'synthetic',
  )
  accepted.socket.destroy()
})
