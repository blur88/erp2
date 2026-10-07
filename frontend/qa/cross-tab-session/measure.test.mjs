// node --test frontend/qa/cross-tab-session/measure.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { peakDemand } from './measure.mjs'
import { busiestSecond, candidateBurst, median, percentile } from './lib/stats.mjs'
import { durationSeconds, isLoopbackHost } from './lib/config.mjs'
import { CRITERIA, blockingFigure, competingWorkload, diagnosticFigure, judge, noContention, summaryLines } from './lib/latency-criteria.mjs'

// Eight requests at each of seconds 0, 1, 2 and 3, then two at second 4:
// no one-second interval holds more than 8, yet at 1 r/s the bucket never
// catches up: 8, 15, 22, 29, then 28 + 2 = 30.
const spreadOut = [0, 1, 2, 3].flatMap((s) => Array(8).fill(s)).concat([4, 4])

test('a spread-out burst: the busiest second is 8 and the peak demand E is 30', () => {
  assert.equal(busiestSecond(spreadOut), 8)
  assert.equal(peakDemand(spreadOut, 1), 30)
})

test('peak demand of one instantaneous burst is its size', () => {
  assert.equal(peakDemand(Array(21).fill(5), 1), 21)
})

test('peak demand drains between requests and never below zero', () => {
  assert.equal(peakDemand([0, 10, 20], 1), 1)
  assert.equal(peakDemand([0, 0.5, 1], 1), 2)
})

test('peak demand of no requests is zero', () => {
  assert.equal(peakDemand([], 1), 0)
})

test('the busiest second counts a half-open interval', () => {
  assert.equal(busiestSecond([0, 0.5, 0.999, 1]), 3)
  assert.equal(busiestSecond([]), 0)
})

test('candidate burst is 1.25 x (E - 1), rounded up', () => {
  assert.equal(candidateBurst(30), 37)
  assert.equal(candidateBurst(21), 25)
})

test('median and nearest-rank percentile', () => {
  assert.equal(median([3, 1, 2]), 2)
  assert.equal(median([4, 1, 2, 3]), 2.5)
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95), 10)
  assert.equal(percentile(Array.from({ length: 100 }, (_, i) => i + 1), 95), 95)
  assert.equal(percentile([], 95), null)
})

test('durations as the backend writes them', () => {
  assert.equal(durationSeconds('20s'), 20)
  assert.equal(durationSeconds('15m'), 900)
  assert.equal(durationSeconds('60'), 60)
  assert.throws(() => durationSeconds('soon'))
})

test('every loopback host is one, as a URL states it, and a LAN address is not', () => {
  for (const url of ['http://localhost', 'http://LOCALHOST', 'http://app.localhost', 'http://127.0.0.1', 'http://127.0.1.1', 'http://127.1', 'http://2130706433', 'http://[::1]']) {
    assert.equal(isLoopbackHost(new URL(url).hostname), true, url)
  }
  for (const url of ['http://10.1.1.34', 'http://192.168.1.20', 'http://10.127.0.1', 'http://erp.lan']) {
    assert.equal(isLoopbackHost(new URL(url).hostname), false, url)
  }
})

// --- the latency acceptance criteria (revised 2026-10-06) -------------------
// M1 and M2 block. M3 and M4 are diagnostic: over the former targets they must
// not fail the run, and nothing about them may read as a pass.

// A repetition whose p95 is `ms`.
const reps = (ms) => [Array(20).fill(ms), Array(20).fill(ms), Array(20).fill(ms)]

// The writer of M2 as both recorded runs had it: 11 to 13 commits a repetition.
const BUSY_WRITER = [{ commits: 12, failures: 0 }, { commits: 11, failures: 0 }, { commits: 13, failures: 0 }]

function latencyWith({ m1 = 2, m2 = 5, m3 = [99, 330.1], m4 = [205.3, 603.3], writer = BUSY_WRITER } = {}) {
  const { p95Ms: former } = CRITERIA.formerProvisionalTargets
  return {
    M1: blockingFigure(reps(m1), CRITERIA.blocking.M1.p95Ms),
    M2: { ...blockingFigure(reps(m2), CRITERIA.blocking.M2.p95Ms), writer },
    M3: {
      oneTab: m3 === null ? diagnosticFigure([[], [1], [1]], former.M3.oneTab) : diagnosticFigure(reps(m3[0]), former.M3.oneTab),
      fourTabs: diagnosticFigure(reps((m3 ?? [1, 1])[1]), former.M3.fourTabs),
    },
    M4: {
      oneTab: diagnosticFigure(reps(m4[0]), former.M4.oneTab),
      fourTabs: diagnosticFigure(reps(m4[1]), former.M4.fourTabs),
    },
  }
}

test('M3 and M4 far over the former targets do not fail the run', () => {
  // The figures of the run that failed on 582096992.
  const verdict = judge(latencyWith())
  assert.deepEqual(verdict.blockingFailures, [])
  assert.equal(verdict.pass, true)
})

test('M1 over its threshold fails the run', () => {
  const verdict = judge(latencyWith({ m1: 5.1 }))
  assert.equal(verdict.pass, false)
  assert.equal(verdict.blockingFailures.length, 1)
  assert.match(verdict.blockingFailures[0], /^M1: median p95 5\.1 ms over the 5 ms threshold$/)
})

test('M2 over its threshold fails the run', () => {
  const verdict = judge(latencyWith({ m2: 15.1 }))
  assert.equal(verdict.pass, false)
  assert.match(verdict.blockingFailures[0], /^M2: median p95 15\.1 ms over the 15 ms threshold$/)
})

test('M2 with a writer that committed nothing fails as "no contention produced", however fast it was', () => {
  const idle = judge(latencyWith({ m2: 1, writer: [{ commits: 12, failures: 0 }, { commits: 0, failures: 9 }, { commits: 13, failures: 0 }] }))
  assert.equal(idle.pass, false)
  assert.equal(idle.blockingFailures.length, 1)
  assert.match(idle.blockingFailures[0], /^M2: no contention produced \(the writer committed nothing in repetition 2: commits per repetition 12, 0, 13\)$/)
  // Commits that were never recorded are not a pass either.
  for (const writer of [undefined, [], [{ failures: 0 }, { commits: 12 }, { commits: 12 }]]) {
    const verdict = judge({ ...latencyWith(), M2: { ...latencyWith().M2, writer } })
    assert.equal(verdict.pass, false)
    assert.match(verdict.blockingFailures[0], /^M2: no contention produced/)
  }
  assert.equal(noContention(BUSY_WRITER), null)
})

test('M1 and M2 exactly at their thresholds pass', () => {
  assert.equal(judge(latencyWith({ m1: 5, m2: 15 })).pass, true)
})

test('a blocking measurement with an empty repetition fails', () => {
  const latency = latencyWith()
  latency.M1 = blockingFigure([[1], [], [1]], 5)
  assert.equal(judge(latency).pass, false)
})

test('a diagnostic figure carries no pass and no threshold, only the former target, labelled', () => {
  const f = diagnosticFigure(reps(99), 10)
  assert.equal('pass' in f, false)
  assert.equal('thresholdMs' in f, false)
  assert.equal(f.diagnostic, true)
  assert.equal(f.medianP95Ms, 99)
  assert.equal(f.formerProvisionalTargetMs, 10)
  assert.equal(f.againstFormerProvisionalTarget, 'not met')
  // Under the former target it still is not a pass, and says so.
  const under = diagnosticFigure(reps(4), 10)
  assert.equal('pass' in under, false)
  assert.match(under.againstFormerProvisionalTarget, /not a criterion/)
})

test('a diagnostic that could not be recorded fails the run as incomplete, not as too slow', () => {
  const verdict = judge(latencyWith({ m3: null }))
  assert.equal(verdict.pass, false)
  assert.deepEqual(verdict.blockingFailures, [])
  assert.equal(verdict.diagnosticsNotRecorded.length, 1)
  assert.match(verdict.diagnosticsNotRecorded[0], /^M3 one tab: no samples/)
})

test('the criteria block states the revision, the replaced targets and the run that failed them', () => {
  assert.equal(CRITERIA.revisedOn, '2026-10-06')
  assert.deepEqual([CRITERIA.blocking.M1.p95Ms, CRITERIA.blocking.M2.p95Ms], [5, 15])
  assert.deepEqual(CRITERIA.diagnostic.measurements, ['M3', 'M4', 'M5'])
  const former = CRITERIA.formerProvisionalTargets
  assert.equal(former.status, 'replaced, not met')
  assert.deepEqual(former.p95Ms, { M3: { oneTab: 10, fourTabs: 20 }, M4: { oneTab: 10, fourTabs: 20 } })
  assert.equal(former.runInWhichTheyFailed.commit, '582096992')
  assert.equal(former.runInWhichTheyFailed.exitStatus, 1)
  assert.deepEqual(former.runInWhichTheyFailed.medianP95Ms.M3, { oneTab: 99, fourTabs: 330.1 })
  assert.deepEqual(former.runInWhichTheyFailed.medianP95Ms.M4, { oneTab: 205.3, fourTabs: 603.3 })
})

test('the printed summary never says ok about M3 or M4 and repeats the failed figures', () => {
  const lines = summaryLines(latencyWith())
  const diagnostic = lines.filter((l) => /M3|M4/.test(l) && !/^The 10/.test(l))
  assert.equal(diagnostic.length, 4)
  for (const line of diagnostic) {
    assert.match(line, /^diag /)
    assert.match(line, /diagnostic, not judged/)
    assert.match(line, /former provisional target (10|20) ms, not met$/)
    assert.doesNotMatch(line, /\bok\b|pass/i)
  }
  const last = lines.at(-1)
  assert.match(last, /replaced on 2026-10-06, not met/)
  assert.match(last, /582096992 failed them: M3 99 \/ 330\.1 ms, M4 205\.3 \/ 603\.3 ms .* exit status 1/)
})

test('the competing workload flags restarting containers and never reads a missing list as none', () => {
  const w = competingWorkload('erp_backend\tUp 56 minutes (healthy)\nseo-backend-1\tRestarting (1) 23 seconds ago\n')
  assert.equal(w.captured, true)
  assert.equal(w.containers.length, 2)
  assert.deepEqual(w.restarting, ['seo-backend-1'])
  assert.match(w.note, /1 container\(s\) were restarting/)
  const missing = competingWorkload(null)
  assert.equal(missing.captured, false)
  assert.equal('containers' in missing, false)
  assert.match(missing.note, /unknown/)
})
