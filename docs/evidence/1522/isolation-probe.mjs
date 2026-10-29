import { setupServer } from '../../../frontend/node_modules/msw/lib/node/index.js'
import { createServer } from 'node:http'
import assert from 'node:assert/strict'
let received = 0
const target = createServer((req, res) => { received++; res.end('unexpected') })
await new Promise(resolve => target.listen(0, '127.0.0.1', resolve))
const server = setupServer()
server.listen({ onUnhandledFrame: 'error' })
try {
  await assert.rejects(fetch(`http://127.0.0.1:${target.address().port}/1522-probe`), error => String(error.cause).includes('Cannot bypass'))
  await assert.rejects(fetch('http://localhost:3001/1522-probe'), error => String(error.cause).includes('Cannot bypass'))
  assert.equal(received, 0)
  console.log('PASS: unhandled fetches rejected by MSW; real HTTP listener received 0 requests')
} finally { server.close(); target.close() }
