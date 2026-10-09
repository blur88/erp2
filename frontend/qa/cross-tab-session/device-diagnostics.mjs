#!/usr/bin/env node
// What the ingress recorded for the rounds of a device acceptance run.
//
//   docker logs --since 2h erp_nginx 2>/dev/null | node frontend/qa/cross-tab-session/device-diagnostics.mjs
//
// Reads access-log lines on stdin and prints one JSON document. Diagnostic
// only: it never says whether a round passed.
import { parseLine } from '../../../nginx/access-log.mjs'
import { deviceRounds } from './lib/device-rounds.mjs'

let text = ''
for await (const chunk of process.stdin) text += chunk
const entries = text.split('\n').map(parseLine).filter(Boolean)
const rounds = deviceRounds(entries)
console.log(JSON.stringify({ lines: entries.length, rounds }, null, 2))
if (rounds.length === 0) {
  console.error('no device round marker in these lines: was the run made through port 80, and is --since wide enough?')
  process.exit(2)
}
