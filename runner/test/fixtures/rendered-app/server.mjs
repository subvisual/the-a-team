import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
createServer((req, res) => {
  res.setHeader('content-type', 'text/html')
  res.end(readFileSync(new URL('./index.html', import.meta.url)))
}).listen(Number(process.env.ATEAM_VERIFICATION_PORT), '127.0.0.1')
