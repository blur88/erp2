// Pure arithmetic shared by workload W1 and the latency measurement.

/**
 * Peak accumulated demand of a burst against an NGINX limit_req bucket that
 * drains at `ratePerSecond`. `times` are send times in seconds, ascending.
 * Replay: e0 = 0, e_i = max(0, e_(i-1) - r * (t_i - t_(i-1))) + 1; the result
 * is the largest e_i. NGINX admits the whole burst exactly when it is at most
 * burst + 1. The busiest second is the wrong measure: requests spread over
 * several seconds can exhaust the bucket although no single second is extreme.
 */
export function peakDemand(times, ratePerSecond) {
  let e = 0
  let prev = null
  let peak = 0
  for (const t of times) {
    if (prev !== null) e = Math.max(0, e - ratePerSecond * (t - prev))
    e += 1
    prev = t
    peak = Math.max(peak, e)
  }
  return peak
}

/** The largest number of events inside any one-second interval [t, t + 1). */
export function busiestSecond(times) {
  const sorted = [...times].sort((a, b) => a - b)
  let best = 0
  let start = 0
  for (let end = 0; end < sorted.length; end += 1) {
    while (sorted[end] - sorted[start] >= 1) start += 1
    best = Math.max(best, end - start + 1)
  }
  return best
}

/** Nearest-rank percentile; null for an empty sample. */
export function percentile(values, p) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx]
}

export function median(values) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

const round3 = (v) => (v === null ? null : Math.round(v * 1000) / 1000)

export function summary(values) {
  return {
    n: values.length,
    p50: round3(percentile(values, 50)),
    p95: round3(percentile(values, 95)),
    p99: round3(percentile(values, 99)),
    max: round3(values.length ? Math.max(...values) : null),
  }
}

/** Candidate burst from a measured peak demand (plan, "Sizing the burst from W1"). */
export const candidateBurst = (peakE) => Math.ceil(1.25 * (peakE - 1))
