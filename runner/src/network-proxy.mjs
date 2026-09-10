import http from 'node:http'
import net from 'node:net'

// The supervisor owns this proxy. Agents can reach this port, not arbitrary
// network endpoints. No publishing credential is injected into requests.
export async function startNetworkProxy(authorities = ['api.anthropic.com:443']) {
  if (
    !Array.isArray(authorities) ||
    authorities.some(
      (a) =>
        typeof a !== 'string' ||
        !/^[a-z0-9.-]+:[0-9]+$/i.test(a) ||
        Number(a.split(':')[1]) < 1 ||
        Number(a.split(':')[1]) > 65535,
    )
  )
    throw new Error('network authorities must be exact host:port pairs')
  const allowed = new Set(authorities.map((a) => a.toLowerCase()))
  const sockets = new Set()
  const track = (s) => {
    sockets.add(s)
    s.once('close', () => sockets.delete(s))
    s.on('error', () => s.destroy())
    return s
  }
  const server = http.createServer((req, res) => {
    res.writeHead(403)
    res.end('CONNECT to a declared authority is required')
  })
  server.on('connection', track)
  server.on('connect', (req, client, head) => {
    const authority = req.url?.toLowerCase()
    if (!allowed.has(authority)) {
      client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      return
    }
    const [host, port] = authority.split(':')
    const upstream = track(net.connect({ host, port: Number(port) }))
    upstream.setTimeout(30_000, () => {
      upstream.destroy()
      client.destroy()
    })
    client.once('close', () => upstream.destroy())
    upstream.once('error', () => client.destroy())
    upstream.once('connect', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head.length) upstream.write(head)
      upstream.pipe(client)
      client.pipe(upstream)
    })
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  return {
    port: server.address().port,
    close: async () => {
      for (const socket of sockets) socket.destroy()
      await new Promise((resolve) => server.close(resolve))
    },
  }
}
