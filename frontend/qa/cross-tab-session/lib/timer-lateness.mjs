// How late a tab's timers fire (#1370). The original slowness at twenty tabs was
// the processor: pages too busy to run, so their timers fired late. A high tab
// count does not show that this happened; only a measurement does.
//
// `latenessProbe` is installed in a tab as an init script. It is harness code in
// the page, not application code, and it is itself a little load: a round that
// carries it says so.
export const PROBE_INTERVAL_MS = 100
export const LATENESS_CAP = 20000

/**
 * Schedules a timer every `intervalMs` and records, for each firing, the time
 * (epoch ms) and how many ms after it was due it ran. Self-contained: it is
 * serialised into the page.
 */
export function latenessProbe({ intervalMs, cap }) {
  window.__qaTimerLateness = []
  window.__qaTimerLatenessCapped = false
  const schedule = () => {
    const due = performance.now() + intervalMs
    setTimeout(() => {
      const now = performance.now()
      if (window.__qaTimerLateness.length < cap) {
        window.__qaTimerLateness.push({ at: Math.round(performance.timeOrigin + now), late: Math.max(0, Math.round(now - due)) })
      } else {
        window.__qaTimerLatenessCapped = true
      }
      schedule()
    }, intervalMs)
  }
  schedule()
}

/** What the probe recorded in a tab, read from its document; null if it cannot be read. */
export const readLateness = (page, tab) =>
  page
    .evaluate(() => ({
      samples: Array.isArray(window.__qaTimerLateness) ? window.__qaTimerLateness.slice() : null,
      capped: window.__qaTimerLatenessCapped === true,
    }))
    .then((read) => (read.samples === null ? null : { tab, samples: read.samples, capped: read.capped }))
    .catch(() => null)

/** The figures a round reports. `window` ({ from, to }, epoch ms) keeps only the samples inside it. */
export function summariseLateness(tabs, window = null) {
  const kept = (Array.isArray(tabs) ? tabs : []).filter(Boolean)
  const late = []
  for (const tab of kept) {
    for (const sample of tab.samples) {
      if (window && (sample.at < window.from || sample.at > window.to)) continue
      late.push(sample.late)
    }
  }
  return {
    tabs: kept.length,
    samples: late.length,
    maxMs: late.reduce((m, v) => Math.max(m, v), 0),
    over1s: late.filter((v) => v > 1000).length,
    over5s: late.filter((v) => v > 5000).length,
    capped: kept.some((tab) => tab.capped === true),
  }
}
