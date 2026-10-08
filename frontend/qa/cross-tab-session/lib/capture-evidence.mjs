// What a reduced capture may be used for, decided from the records alone.
//
// Three questions, kept apart on purpose:
//
//   loadCapture    what the capture says, as it stands: the requests it
//                  reassembled, what it could not read, and how it ended
//   captureUsable  whether it may be judged at all for a time range
//   correlate      whether the browser, the ingress log and the capture agree,
//                  one identifier at a time
//
// Nothing here reads a clock or a file: the reducer's records are the input, and
// a capture that cannot answer a question produces a "no" with a reason rather
// than a value that looks like an answer.

/** @typedef {{ kind: 'request', qaId: string|null, method: string, uri: string,
 *   tokenFingerprint: string|null, stream: number, frames: number[], frameCount: number,
 *   arrivedFirstMs: number, arrivedLastMs: number, status: number|null,
 *   answeredFrames: number[]|null, answeredFrameCount: number|null,
 *   answeredFirstMs: number|null, answeredLastMs: number|null, retransmitted: boolean }} CaptureRecord */

/**
 * The reduced capture, by request id.
 *
 * A second record with an id already seen is kept as a problem rather than
 * merged: two requests cannot be one, and which of them a caller meant is not
 * something this module may guess.
 */
export function loadCapture(lines) {
  const requests = new Map()
  const invalid = []
  const duplicates = []
  let health = null
  for (const line of lines) {
    if (!line) continue
    let record
    try {
      record = JSON.parse(line)
    } catch {
      invalid.push({ reason: 'unreadable-line', stream: null, fromMs: null, toMs: null, detail: 'a line of the capture is not JSON' })
      continue
    }
    if (record.kind === 'health') {
      health = record
      continue
    }
    if (record.kind === 'invalid') {
      invalid.push(record)
      continue
    }
    if (record.kind !== 'request') continue
    if (requests.has(record.qaId)) {
      duplicates.push(record.qaId)
      invalid.push({
        reason: 'duplicate-qa-id',
        stream: record.stream,
        fromMs: record.arrivedFirstMs,
        toMs: record.arrivedLastMs,
        detail: `${record.method} ${record.uri}`,
      })
      continue
    }
    requests.set(record.qaId, record)
  }
  return { requests, invalid, duplicates, health }
}

/** Does an invalid record overlap the range? A record that cannot be placed counts as overlapping. */
function overlaps(record, fromMs, toMs) {
  if (record.fromMs === null || record.fromMs === undefined) return true
  if (record.toMs === null || record.toMs === undefined) return true
  return record.toMs >= fromMs && record.fromMs <= toMs
}

/**
 * Whether a finalised segment may be judged for [fromMs, toMs].
 *
 * Only a segment that ended can be judged at all: the capture tool reports what
 * it dropped when it stops, so a running capture has no health to read. False
 * names the reason.
 */
export function captureUsable(capture, fromMs, toMs) {
  const { health, invalid } = capture
  if (!health) return { usable: false, why: 'the segment has no health record: it is still open or it did not end cleanly' }
  if (typeof health.dropped === 'number' && health.dropped > 0) {
    return { usable: false, why: `the capture tool dropped ${health.dropped} packets` }
  }
  const inside = invalid.filter((record) => overlaps(record, fromMs, toMs))
  if (inside.length > 0) {
    const reasons = [...new Set(inside.map((r) => r.reason))].sort()
    return { usable: false, why: `${inside.length} unreadable record(s) inside the range: ${reasons.join(', ')}` }
  }
  return { usable: true, why: null }
}

/**
 * One identifier, three sources. Every id the browser knows must appear in the
 * ingress log and in the capture exactly once, and nothing may appear in those
 * two that the browser did not send.
 *
 * @param browserEntries iterable of { qaId }
 * @param ingressEntries  iterable of LogEntry (nginx/access-log.mjs)
 * @param capture         from loadCapture
 */
export function correlate(browserEntries, ingressEntries, capture) {
  const browser = new Map()
  for (const entry of browserEntries) {
    if (!entry || !entry.qaId) continue
    if (browser.has(entry.qaId)) {
      return {
        matched: [],
        problems: [{ qaId: entry.qaId, missingFrom: [], duplicateIn: ['browser'] }],
      }
    }
    browser.set(entry.qaId, entry)
  }

  const ingress = new Map()
  const ingressDuplicates = new Set()
  for (const entry of ingressEntries) {
    if (!entry || !entry.qaId) continue
    if (ingress.has(entry.qaId)) ingressDuplicates.add(entry.qaId)
    else ingress.set(entry.qaId, entry)
  }

  const captureDuplicates = new Set(capture.duplicates ?? [])
  const matched = []
  const problems = []

  for (const [qaId, browserEntry] of browser) {
    const missingFrom = []
    if (!ingress.has(qaId)) missingFrom.push('ingress')
    if (!capture.requests.has(qaId)) missingFrom.push('capture')
    const duplicateIn = []
    if (ingressDuplicates.has(qaId)) duplicateIn.push('ingress')
    if (captureDuplicates.has(qaId)) duplicateIn.push('capture')
    if (missingFrom.length > 0 || duplicateIn.length > 0) {
      problems.push({ qaId, missingFrom, duplicateIn })
      continue
    }
    const ingressEntry = ingress.get(qaId)
    const captureRecord = capture.requests.get(qaId)
    matched.push({
      qaId,
      browser: browserEntry,
      ingress: ingressEntry,
      capture: captureRecord,
      statusAgree: ingressEntry.status === captureRecord.status,
      tokenAgree:
        browserEntry.tokenFingerprint === undefined ||
        browserEntry.tokenFingerprint === null ||
        browserEntry.tokenFingerprint === captureRecord.tokenFingerprint,
    })
  }

  // Anything the other two saw that the browser did not send is a problem too:
  // an identifier that does not mean what it says. One problem per identifier,
  // naming every source it was missing from.
  for (const qaId of new Set([...ingress.keys(), ...capture.requests.keys()])) {
    if (browser.has(qaId)) continue
    const missingFrom = []
    if (!ingress.has(qaId)) missingFrom.push('ingress')
    if (!capture.requests.has(qaId)) missingFrom.push('capture')
    problems.push({ qaId, missingFrom, duplicateIn: [] })
  }

  return { matched, problems }
}
