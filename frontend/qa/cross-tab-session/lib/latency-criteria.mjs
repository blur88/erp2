// The latency acceptance criteria, and the judgement made from them.
//
// Revised 2026-10-06 by the repository owner, after the recorded run on
// 582096992. M1 and M2 block. M3 and M4 are diagnostic: they are measured and
// recorded exactly as before and have no pass or fail. The 10 / 20 ms targets
// M3 and M4 were first given were provisional. They were REPLACED, NOT MET:
// the run that measured them failed, and its figures are kept below so that
// no later green line can be read as "the gate is fast".
//
// Pure: no browser, no file system. measure.mjs builds the figures and
// finalize.mjs prints them; both take the wording from here.
import { median, summary } from './stats.mjs'

export const BLOCKING_REPETITIONS = 3

const round3 = (v) => (v === null || v === undefined ? null : Math.round(v * 1000) / 1000)

export const CRITERIA = {
  revisedOn: '2026-10-06',
  decidedBy: 'the repository owner, after the recorded run on 582096992',
  blocking: {
    M1: { p95Ms: 5, what: 'one raw read, one tab idle' },
    M2: { p95Ms: 15, what: 'one raw read in four tabs at once while a fifth writes' },
    rule: `median p95 of ${BLOCKING_REPETITIONS} repetitions`,
  },
  diagnostic: {
    measurements: ['M3', 'M4', 'M5'],
    statement:
      'M3 and M4 are diagnostic: measured and recorded with their environment, with no threshold and no pass or fail. M5 is diagnostic as before.',
  },
  preserved:
    'The hard gate and its transaction-completion semantics are unchanged. None of the simulated optimizations was implemented, and no read is resolved before its transaction completes.',
  formerProvisionalTargets: {
    status: 'replaced, not met',
    statement:
      'The earlier M3 and M4 targets (p95 at most 10 ms in one tab, 20 ms in four) were provisional. They were replaced by the criteria above; they were NOT met, and a run that passes today has not met them either.',
    p95Ms: { M3: { oneTab: 10, fourTabs: 20 }, M4: { oneTab: 10, fourTabs: 20 } },
    runInWhichTheyFailed: {
      commit: '582096992',
      exitStatus: 1,
      medianP95Ms: {
        M1: 2.1,
        M2: 5.1,
        M3: { oneTab: 99, fourTabs: 330.1 },
        M4: { oneTab: 205.3, fourTabs: 603.3 },
      },
      outcome:
        'M1 and M2 passed. M3 (99 / 330.1 ms) and M4 (205.3 / 603.3 ms), one tab / four tabs, failed the 10 / 20 ms targets, and the run exited with status 1.',
    },
  },
}

function figure(repetitions) {
  const used = repetitions.slice(0, BLOCKING_REPETITIONS)
  const stats = used.map(summary)
  const p95s = stats.map((s) => s.p95).filter((v) => v !== null)
  const complete = p95s.length === used.length && used.length === BLOCKING_REPETITIONS
  return {
    repetitions: stats,
    medianP95Ms: complete ? round3(median(p95s)) : null,
    maxMs: round3(Math.max(0, ...stats.map((s) => s.max ?? 0))),
    p99Ms: stats.map((s) => s.p99),
  }
}

/**
 * A blocking figure (M1, M2): the median of the per-repetition p95s.
 * Pass condition: every repetition has samples and the median p95 is at most
 * `limit`.
 */
export function blockingFigure(repetitions, limit) {
  const f = figure(repetitions)
  return {
    repetitions: f.repetitions,
    medianP95Ms: f.medianP95Ms,
    thresholdMs: limit,
    pass: f.medianP95Ms !== null && f.medianP95Ms <= limit,
    reason: f.medianP95Ms === null ? 'no samples in at least one repetition' : undefined,
    maxMs: f.maxMs,
    p99Ms: f.p99Ms,
  }
}

/**
 * A diagnostic figure (M3, M4): the same arithmetic, and deliberately no
 * `pass` and no `thresholdMs`. The former provisional target is carried only
 * so the figure can be shown against it, labelled as replaced.
 */
export function diagnosticFigure(repetitions, formerTargetMs) {
  const f = figure(repetitions)
  let against = 'not recorded: no samples in at least one repetition'
  if (f.medianP95Ms !== null) {
    against =
      f.medianP95Ms > formerTargetMs
        ? 'not met'
        : 'at or under it in this run; it is not a criterion, and the run in which it was judged did not meet it'
  }
  return {
    diagnostic: true,
    judged: 'not judged: diagnostic since 2026-10-06',
    repetitions: f.repetitions,
    medianP95Ms: f.medianP95Ms,
    recorded: f.medianP95Ms !== null,
    maxMs: f.maxMs,
    p99Ms: f.p99Ms,
    formerProvisionalTargetMs: formerTargetMs,
    againstFormerProvisionalTarget: against,
  }
}

const FOUR = [
  ['M3 one tab', 'M3', 'oneTab'],
  ['M3 four tabs', 'M3', 'fourTabs'],
  ['M4 one tab', 'M4', 'oneTab'],
  ['M4 four tabs', 'M4', 'fourTabs'],
]

/**
 * The judgement of one measurement.
 *
 * Pass condition of the run: M1 and M2 are each within their threshold, and
 * M3 and M4 were recorded. The SIZE of an M3 or M4 figure never fails the
 * run. A run in which one of them has no samples is incomplete and fails:
 * the decision asks for them to be recorded, and an empty record must not
 * pass for a recorded one.
 */
export function judge(latency) {
  const blocking = [
    ['M1', latency.M1],
    ['M2', latency.M2],
  ]
  const diagnostic = FOUR.map(([name, m, variant]) => [name, latency[m][variant]])
  const blockingFailures = blocking
    .filter(([, f]) => !f.pass)
    .map(([name, f]) => `${name}: ${f.reason ?? `median p95 ${f.medianP95Ms} ms over the ${f.thresholdMs} ms threshold`}`)
  const notRecorded = diagnostic
    .filter(([, f]) => !f.recorded)
    .map(([name]) => `${name}: no samples in at least one repetition, so the diagnostic was not recorded`)
  return {
    blockingFailures,
    diagnosticsNotRecorded: notRecorded,
    pass: blockingFailures.length === 0 && notRecorded.length === 0,
    maximaAbove100Ms: [...blocking, ...diagnostic].filter(([, f]) => f.maxMs > 100).map(([name, f]) => `${name}: max ${f.maxMs} ms`),
  }
}

/** The lines every summary prints. Nothing here says "ok" about M3 or M4. */
export function summaryLines(latency) {
  const lines = []
  for (const name of ['M1', 'M2']) {
    const f = latency[name]
    lines.push(`${f.pass ? 'ok  ' : 'FAIL'} ${name} (blocking): median p95 ${f.medianP95Ms} ms, threshold ${f.thresholdMs} ms, max ${f.maxMs} ms`)
  }
  for (const [name, m, variant] of FOUR) {
    const f = latency[m][variant]
    lines.push(
      `diag ${name} (diagnostic, not judged): median p95 ${f.medianP95Ms} ms, max ${f.maxMs} ms; ` +
        `former provisional target ${f.formerProvisionalTargetMs} ms, ${f.againstFormerProvisionalTarget}`,
    )
  }
  const failed = CRITERIA.formerProvisionalTargets.runInWhichTheyFailed
  lines.push(
    `The 10 / 20 ms targets for M3 and M4 were provisional and were replaced on ${CRITERIA.revisedOn}, not met. ` +
      `Run ${failed.commit} failed them: M3 ${failed.medianP95Ms.M3.oneTab} / ${failed.medianP95Ms.M3.fourTabs} ms, ` +
      `M4 ${failed.medianP95Ms.M4.oneTab} / ${failed.medianP95Ms.M4.fourTabs} ms (one tab / four tabs), exit status ${failed.exitStatus}.`,
  )
  return lines
}

/**
 * `docker ps --format '{{.Names}}\t{{.Status}}'` as run.sh captured it on the
 * host before the measurement: what else was running there. A container
 * whose status says `Restarting` is flagged, because a restart loop is load
 * the figures were measured under.
 */
export function competingWorkload(text) {
  if (typeof text !== 'string') {
    return { captured: false, note: 'The container list was not captured, so the competing workload during the measurement is unknown.' }
  }
  const containers = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, ...rest] = line.split('\t')
      const status = rest.join(' ').trim()
      return { name, status, restarting: /restarting/i.test(status) }
    })
  const restarting = containers.filter((c) => c.restarting).map((c) => c.name)
  return {
    captured: true,
    capturedBy: "run.sh, on the host, just before measure.mjs: docker ps --format '{{.Names}}\\t{{.Status}}'",
    containers,
    restarting,
    note:
      restarting.length > 0
        ? `${restarting.length} container(s) were restarting on the host while the latency was measured: ${restarting.join(', ')}. The figures include that load.`
        : 'No container was restarting on the host when the list was taken.',
  }
}
