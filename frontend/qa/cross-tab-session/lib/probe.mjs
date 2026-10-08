// Client side of host-probe.sh: the questions the browser container cannot
// answer for itself. See that script for what they are and why.
//
//   sessionCount(config, username)      rows in auth_sessions for a user
//   captureSegment(config, name, fn)    one upstream capture segment, started
//                                       before `fn` and finalised after it
//
// A capture is judged only after it has ended: the capture tool reports what it
// dropped when it stops, so a running capture has no health to read. A segment
// that could not be finalised comes back with no health record, which
// captureUsable refuses, rather than with an error a caller could ignore.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { sleep } from './config.mjs'
import { loadCapture } from './capture-evidence.mjs'

let counter = 0

/** One request to host-probe.sh, answered `ok`, a number or `error: ...`. */
async function ask(config, request) {
  const dir = join(config.scratch, 'probe')
  mkdirSync(dir, { recursive: true })
  const id = `${process.pid}-${Date.now()}-${(counter += 1)}`
  const req = join(dir, `${id}.req`)
  const res = join(dir, `${id}.res`)
  writeFileSync(req, `${request}\n`)
  const deadline = Date.now() + 60000
  while (!existsSync(res)) {
    if (Date.now() > deadline) {
      rmSync(req, { force: true })
      throw new Error(`host-probe.sh did not answer within 60 s; is it running against ${config.scratch}?`)
    }
    await sleep(150)
  }
  const answer = readFileSync(res, 'utf8').trim()
  rmSync(res, { force: true })
  if (answer.startsWith('error:')) throw new Error(answer)
  return answer
}

export async function sessionCount(config, username) {
  const answer = await ask(config, `session-count ${username}`)
  if (!/^\d+$/.test(answer)) throw new Error(`host probe answered "${answer}"`)
  return Number(answer)
}

/**
 * One capture segment around `fn`.
 *
 * `requireQaId` asks the reducer to treat a request it cannot tie to an
 * identifier as unreadable, which is what a case whose evidence rests on those
 * identifiers needs. The returned capture is finalised or it is unusable; the
 * caller does not have to check which, `captureUsable` does.
 */
export async function captureSegment(config, name, fn, { requireQaId = true } = {}) {
  const path = join(config.scratch, `upstream-arrivals.${name}.jsonl`)
  await ask(config, `capture-start ${name}${requireQaId ? ' require' : ''}`)
  let failure = null
  try {
    await fn()
  } catch (err) {
    failure = err
  }
  let stopError = null
  try {
    await ask(config, `capture-stop ${name}`)
  } catch (err) {
    stopError = err
  }
  const lines = existsSync(path) ? readFileSync(path, 'utf8').split('\n') : []
  const capture = loadCapture(lines)
  return {
    ...capture,
    name,
    path,
    // Which of the two went wrong, if either: a case records it and the
    // judgement calls the attempt inconclusive.
    failure,
    stopError: stopError ? stopError.message : null,
  }
}
