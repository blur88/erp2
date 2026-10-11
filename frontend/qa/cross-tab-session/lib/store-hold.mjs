// The store hold of the stall runs (#1370), and who counts as a peer when it
// begins.
//
// The hold is made from outside the application: a spare tab of the same
// profile is paused inside a read-write transaction on erp-session/kv
// (pauseMidTransaction), so every other transaction on the store queues behind
// it until the tab is resumed. It writes nothing and uses no processor while it
// holds. Whether pausing that one tab leaves the other tabs' timers running is
// not assumed here: calibration measures it.
import { readFileSync } from 'node:fs'
import { USER_MENU, pauseMidTransaction, readStored, withTimeout } from './harness.mjs'

export const PROBE_MAX_AGE_MS = 1000
export const PROBE_TIMEOUT_MS = 500
// The heading StorageWaitingScreen renders; store-hold.test.mjs pins it to the
// component's source.
export const STORAGE_WAITING_HEADING = 'Waiting for session storage'
const SIGNED_OUT_ROUTES = ['/login', '/change-password-required']

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Pauses `blockerPage` inside a read-write transaction for `requestedMs`.
 * Resolves once the tab is stopped there: from `activeAt` on, the store is held.
 * `whenDue` resolves when the requested time has passed; `release()` lets the
 * transaction go and says how long it was really held. `release()` is safe to
 * call early and more than once.
 */
export async function startHold(blockerPage, requestedMs) {
  const handle = await pauseMidTransaction(blockerPage)
  const activeAt = handle.pausedAt
  let released = null
  return {
    activeAt,
    requestedMs,
    whenDue: sleep(Math.max(0, activeAt + requestedMs - Date.now())),
    release() {
      if (!released) {
        released = (async () => {
          const { ticksWhilePaused } = await handle.resume()
          const releasedAt = Date.now()
          const outcome = await withTimeout(
            blockerPage.waitForFunction(() => window.__qaBlockerOutcome).then((h) => h.jsonValue()),
            5000,
            'the blocker transaction did not end',
          ).catch((err) => `unknown: ${String(err.message).slice(0, 80)}`)
          return { releasedAt, observedMs: releasedAt - activeAt, ticksWhilePaused, transaction: outcome }
        })()
      }
      return released
    },
  }
}

/** A plain read of the store, raced against `limitMs`: is anything holding it? */
export async function storeIsFree(page, limitMs = 1000) {
  const started = Date.now()
  try {
    await withTimeout(readStored(page), limitMs, 'the store did not answer')
    return { free: true, readMs: Date.now() - started }
  } catch {
    return { free: false, readMs: Date.now() - started }
  }
}

/**
 * What a tab is, read from its own document now. A tab too busy to answer
 * within PROBE_TIMEOUT_MS is reported as not alive: it is not a peer.
 */
export async function probePeer(page, tab) {
  const probedAt = Date.now()
  try {
    const seen = await withTimeout(
      page.evaluate(
        ({ userMenu, heading }) => {
          const events = Array.isArray(window.__erpSessionTrace) ? window.__erpSessionTrace : []
          return {
            path: location.pathname,
            userMenu: document.querySelector(userMenu) !== null,
            storageWaiting: [...document.querySelectorAll('h5')].some((h) => h.textContent === heading),
            traceEvents: events.length,
            traceGenerations: events
              .filter((e) => e.type === 'settled-read' && typeof e.memoryGeneration === 'number')
              .map((e) => e.memoryGeneration),
          }
        },
        { userMenu: USER_MENU, heading: STORAGE_WAITING_HEADING },
      ),
      PROBE_TIMEOUT_MS,
      'the tab did not answer its probe',
    )
    return {
      tab,
      probedAt,
      alive: true,
      initialized: seen.traceEvents > 0 || seen.userMenu,
      storageWaiting: seen.storageWaiting,
      onSignedInRoute: !SIGNED_OUT_ROUTES.some((route) => seen.path.startsWith(route)),
      traceGenerations: seen.traceGenerations,
    }
  } catch {
    return { tab, probedAt, alive: false, initialized: false, storageWaiting: false, onSignedInRoute: false, traceGenerations: [] }
  }
}

// What the spare reader saw of the stored record up to the trigger. A read that
// failed says nothing either way; a sample after the trigger is not evidence
// about the moment before it.
function storedBefore(storedChanges, at) {
  return (Array.isArray(storedChanges) ? storedChanges : []).filter((s) => s && s.error === undefined && typeof s.t === 'number' && s.t <= at)
}

/**
 * The tabs that, at `at`, are in a position to present the pre-refresh
 * generation: live, initialized, on a signed-in route, not waiting for storage,
 * holding `before.generation` by their own trace, and with a stored record that
 * has shown nothing but that generation since the round began. A request sent
 * earlier with the old access token is not part of the rule.
 */
export function eligiblePeers(probes, storedChanges, { refresherTab, before, at }) {
  const samples = storedBefore(storedChanges, at)
  const unchanged = samples.length > 0 && samples.every((s) => s.generation === before.generation)
  if (!unchanged) return []
  const storedSamples = { count: samples.length, lastAt: samples.at(-1).t, generation: before.generation }
  return (Array.isArray(probes) ? probes : [])
    .filter(
      (p) =>
        p &&
        p.tab !== refresherTab &&
        at - p.probedAt <= PROBE_MAX_AGE_MS &&
        p.alive &&
        p.initialized &&
        p.onSignedInRoute &&
        !p.storageWaiting &&
        p.traceGenerations.length > 0 &&
        p.traceGenerations.at(-1) === before.generation,
    )
    .map((p) => ({ tab: p.tab, evidence: { probe: p, storedSamples } }))
}

/** Where every tab of the round stood when the hold began. */
export function readiness(probes, storedChanges, tabs, opts) {
  const byTab = new Map((Array.isArray(probes) ? probes : []).filter(Boolean).map((p) => [p.tab, p]))
  let pastStartup = 0
  let starting = 0
  let storageWaiting = 0
  for (const tab of tabs) {
    const p = byTab.get(tab)
    if (p?.storageWaiting) storageWaiting += 1
    else if (tab === opts.refresherTab || (p?.alive && p.initialized)) pastStartup += 1
    else starting += 1
  }
  return { pastStartup, eligiblePeers: eligiblePeers(probes, storedChanges, opts).length, starting, storageWaiting }
}

/** The heading the application's storage-waiting screen renders, from its source. */
export function storageWaitingHeadingInSource(sourcePath) {
  const m = /<Typography variant="h5">([^<]+)<\/Typography>/.exec(readFileSync(sourcePath, 'utf8'))
  return m ? m[1] : null
}
