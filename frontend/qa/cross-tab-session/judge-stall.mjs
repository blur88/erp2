#!/usr/bin/env node
// One outcome, validity reading and coverage label per recorded round of a
// stall cell (#1370), and the cell's counts, from the two records a cell leaves
// behind: the diagnosis the driver wrote and the server rows read afterwards.
//
//   node judge-stall.mjs <stall-diagnosis.json> [server-rows.json] [--out <file>]
//
// Prints a replay first if there is one, then one line per round and the cell's
// summary, and writes stall-verdicts.json beside the diagnosis. It never
// overwrites verdicts that are already there: filed evidence is re-judged into
// another file, named with --out. A rows file that
// is absent, unreadable or not JSON is passed on as null, which the evidence
// module reads as "no rows were read": undetermined, never clean.
//
// Judges only. It reads nothing else and writes nothing but that one file.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { COVERAGE_FLOOR, judgeStallRound, summariseCell } from './lib/stall-evidence.mjs'

const args = process.argv.slice(2)
const outFlag = args.indexOf('--out')
const outPath = outFlag === -1 ? null : args[outFlag + 1]
if (outFlag !== -1) args.splice(outFlag, 2)
const [diagnosisPath, rowsPath] = args
if (!diagnosisPath || (outFlag !== -1 && !outPath)) {
  console.error('usage: judge-stall.mjs <stall-diagnosis.json> [server-rows.json] [--out <file>]')
  process.exit(2)
}
const beside = outPath ?? join(dirname(diagnosisPath), 'stall-verdicts.json')
if (existsSync(beside)) {
  console.error(`${beside} already exists and is not overwritten; name another file with --out`)
  process.exit(2)
}

const diagnosis = JSON.parse(readFileSync(diagnosisPath, 'utf8'))
const cell = diagnosis.settings

function readServerRows(path) {
  if (!path) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}
const serverRows = readServerRows(rowsPath)

const rounds = (Array.isArray(diagnosis.rounds) ? diagnosis.rounds : []).map((round) => judgeStallRound(round, serverRows, cell))
const summary = summariseCell(rounds, cell)

const replays = rounds.filter((r) => r.outcome === 'replay-confirmed')
if (replays.length > 0) {
  const describe = (r) => {
    const c = r.facts.replayContext
    const where = c ? `${c.phase}${c.provoked ? ', PROVOKED by the nudge' : ''}; refreshed response ${c.refreshedResponse}` : 'context unknown'
    return `${r.attempt} (${r.subVerdict}, cause ${r.cause}${r.validity.valid ? '' : ', round not valid'}; ${where})`
  }
  console.log(`REPLAY CONFIRMED in round(s) ${replays.map(describe).join(', ')}`)
}
for (const round of rounds) {
  const parts = [round.outcome, round.validity.valid ? 'valid' : `not valid (${round.validity.reasons.join(', ')})`]
  if (round.coverage) parts.push(round.coverage)
  const { injection, commitAttempts, stalePresentations, laterRefresh, readiness } = round.facts
  if (injection.hold) parts.push(`hold ${injection.hold.observedMs ?? '?'} ms, ${injection.landed ? 'landed' : 'not landed'}`)
  if (commitAttempts.length) parts.push(`commit attempts ${commitAttempts.map((a) => `${a.attempt}:${a.outcome}`).join(' ')}`)
  if (readiness) parts.push(`eligible peers ${readiness.eligiblePeers}`)
  if (stalePresentations.length) parts.push(`stale ${stalePresentations.map((s) => `${s.tab}:${s.kind}${s.accepted ? '' : ':refused'}`).join(' ')}`)
  parts.push(`later refresh ${laterRefresh.passive}${laterRefresh.nudged ? `, nudge ${laterRefresh.afterNudge}` : ''}`)
  console.log(`round ${round.attempt}: ${parts.join('; ')}`)
}
const coverage = summary.replayCoverage === null
  ? `coverage ${summary.coverageComplete ? 'complete' : 'INCOMPLETE'} (${summary.valid} valid of ${COVERAGE_FLOOR} needed)`
  : `landed ${summary.landed}; replay coverage ${summary.replayCoverage} of ${COVERAGE_FLOOR} needed: ${summary.replayCoverageFloorMet ? 'met' : 'NOT met'}; timeout coverage ${summary.timeoutCoverage}`
console.log(`cell ${diagnosis.cell} (${diagnosis.kind}): ${summary.rounds} rounds; valid ${summary.valid}; ${coverage}; outcomes ${JSON.stringify(summary.outcomes)}`)

const out = {
  what: 'verdicts for one cell of the replay stall runs (#1370)',
  cell: diagnosis.cell,
  kind: diagnosis.kind,
  settings: cell,
  mechanism: diagnosis.mechanism ?? null,
  commit: diagnosis.commit ?? null,
  servedBuild: diagnosis.servedBuild ?? null,
  diagnosis: diagnosisPath,
  serverRows: rowsPath ?? null,
  serverRowsRead: serverRows !== null,
  summary,
  rounds,
}
writeFileSync(beside, JSON.stringify(out, null, 2))
console.log(`wrote ${beside}`)
