// When each tab of a loading round first held its expected data.
//
// The deadline a round is judged against is measured from the common
// tab-opening trigger, so the clock here starts there and nothing else: the
// authentication, the retries and the rendering a tab does on its own are all
// inside the interval, which is the point of the measurement.
//
// A tab counts as complete at the first poll where it has its data *and* has no
// business request still without an answer. Both halves matter: a tab can hold
// its data while a request it made is still outstanding, and that request's
// answer is part of what the tab has.
//
// Polling is what a browser gives: there is no event for "this tab now has its
// data". The poll interval is recorded with the result so a figure read here is
// never finer than the measurement that produced it.
import { dashboardState } from './usable.mjs'

/**
 * The completion times from a list of samples, as { tab, atMs, complete,
 * pending }. Pure, and what watchCompletion's own result is made of.
 */
export function completionOf(samples, pollMs) {
  const first = new Map()
  for (const s of samples) {
    if (!s.complete || (s.pending ?? 0) > 0) continue
    if (!first.has(s.tab)) first.set(s.tab, s.atMs)
  }
  const tabs = [...new Set(samples.map((s) => s.tab))]
  const perTab = tabs.map((tab) => ({ tab, completedAfterMs: first.has(tab) ? first.get(tab) : null }))
  // null, not the largest of what did complete: the round is judged on its last
  // tab, and a tab that never completed means the round never completed.
  const lastCompletedAfterMs = perTab.length > 0 && perTab.every((t) => t.completedAfterMs !== null)
    ? Math.max(...perTab.map((t) => t.completedAfterMs))
    : null
  return { perTab, lastCompletedAfterMs, pollMs }
}

/**
 * Watch the round's tabs until each has its data or the round is given up.
 *
 * `started` is the instant the tabs were triggered open, on the same clock as
 * `atMs` comes from, and the result is measured from it. `giveUpMs` is the
 * size's deadline plus a margin, so that a tab which misses it is measured and
 * not cut off at the deadline: a round that is given up early cannot say how
 * late its last tab was.
 */
export async function watchCompletion(profile, mark, pages, reference, { started, giveUpMs, pollMs = 250 }) {
  const samples = []
  const giveUpAt = started + giveUpMs
  while (Date.now() < giveUpAt) {
    for (const page of pages) {
      const state = await dashboardState(profile, mark, page, reference)
      samples.push({
        tab: profile.label(page),
        atMs: Date.now() - started,
        complete: state.complete === true,
        // The tab's own business requests without an answer.
        pending: profile
          .since(mark, page)
          .filter((e) => e.zone === 'business' && e.status === null && !e.failed).length,
      })
    }
    await new Promise((r) => setTimeout(r, pollMs))
  }
  return completionOf(samples, pollMs)
}
