#!/usr/bin/env node
// One verdict per recorded round, from the three records a round leaves behind:
// the diagnosis the diagnostic wrote, and the server rows read afterwards.
//
//   node judge-replay.mjs <replay-diagnosis.json> [server-rows.json]
//
// Prints one line per round and writes replay-verdicts.json beside the first
// file. A second argument that is absent, unreadable or not JSON is passed on as
// null, which the evidence module reads as "no rows were read" — undetermined,
// never no-replay.
//
// Judges only. It reads nothing and writes nothing but that one file.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { judgeRound } from './lib/replay-evidence.mjs'

const [, , diagnosisPath, rowsPath] = process.argv

if (!diagnosisPath) {
  console.error('usage: judge-replay.mjs <replay-diagnosis.json> [server-rows.json]')
  process.exit(2)
}

const diagnosis = JSON.parse(readFileSync(diagnosisPath, 'utf8'))

function readServerRows(path) {
  if (!path) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

const serverRows = readServerRows(rowsPath)

const rounds = (Array.isArray(diagnosis.attempts) ? diagnosis.attempts : []).map((attempt, index) => ({
  attempt: attempt.attempt ?? index + 1,
  sessionId: attempt.sessionId ?? null,
  openedAt: attempt.openedAt ?? null,
  endedAt: attempt.endedAt ?? null,
  ...judgeRound(attempt, serverRows),
}))

for (const round of rounds) {
  const detail = []
  if (round.missing.length) detail.push(`missing ${round.missing.join(', ')}`)
  if (round.supports.length) detail.push(`supports ${round.supports.join(', ')}`)
  console.log(
    `attempt ${round.attempt}: ${round.verdict}${detail.length ? ` (${detail.join('; ')})` : ''}`,
  )
}

const counts = rounds.reduce((acc, round) => {
  acc[round.verdict] = (acc[round.verdict] ?? 0) + 1
  return acc
}, {})

const out = {
  what: 'verdicts for the recorded replay rounds, one per round',
  commit: diagnosis.commit ?? null,
  servedBuild: diagnosis.servedBuild ?? null,
  diagnosis: diagnosisPath,
  serverRows: rowsPath ?? null,
  serverRowsRead: serverRows !== null,
  counts,
  rounds,
}
const beside = join(dirname(diagnosisPath), 'replay-verdicts.json')
writeFileSync(beside, JSON.stringify(out, null, 2))
console.log(`wrote ${beside}`)
