// How long a round of the stall runs is watched, and the order a round is run
// in (#1370). Pure: the driver supplies what it has seen and what to do.
//
// The protocol's three phases (docs/modules/auth/REPLAY_STALL_PROTOCOL.md, "How
// long a round is watched"): through grace expiry; 65 s passively; one nudge.
// A refresh that has been sent is followed until its operation is complete, and
// the only cut-off is the overall cap.
export const PASSIVE_MS = 65000
export const AFTER_NUDGE_MS = 20000
export const CAP_MS = 300000
export const NO_SUPERSESSION_MS = 60000

const SETTLED_COMMITS = new Set(['written-both', 'written-access', 'discarded', 'session-mismatch'])

/**
 * Every refresh the traces show, and when its operation was complete: for a
 * 200, the commit has an outcome, no pending entry is left holding it, and the
 * lease has been released; for a refusal or an error, the lease has been
 * released. `completeAt` is null until then.
 */
export function refreshOperations(traces) {
  const out = []
  for (const trace of Array.isArray(traces) ? traces : []) {
    const events = Array.isArray(trace?.events) ? trace.events : []
    for (const sent of events.filter((e) => e.type === 'refresh-sent')) {
      const own = events.filter((e) => e.refreshId === sent.refreshId)
      const answered = own.find((e) => e.type === 'refresh-answered') ?? null
      const released = own.filter((e) => e.type === 'lease-release' && e.outcome !== 'skipped-pending').at(-1) ?? null
      let completeAt = null
      if (answered && released) {
        if (answered.status === 'ok') {
          const commits = own.filter((e) => e.type === 'token-commit')
          const dropped = own.find((e) => e.type === 'pending-dropped')
          const heldPending = own.some((e) => e.type === 'lease-release' && e.outcome === 'skipped-pending')
          const settled = commits.some((c) => SETTLED_COMMITS.has(c.outcome)) || dropped !== undefined || (commits.length > 0 && !heldPending)
          if (settled) completeAt = Math.max(released.at, dropped?.at ?? 0, commits.at(-1)?.at ?? 0)
        } else {
          completeAt = released.at
        }
      }
      out.push({ tab: trace.tab, refreshId: sent.refreshId, sentAt: sent.at, answeredAt: answered?.at ?? null, status: answered?.status ?? null, completeAt })
    }
  }
  return out.sort((a, b) => a.sentAt - b.sentAt)
}

/**
 * What the driver does next. `state` is what it has seen so far:
 *   openedAt, holdExpected, holdReleasedAt, firstSupersededAt, graceMs,
 *   sessionEnded, refreshOps ([{ sentAt, completeAt }]), and what it has
 *   itself recorded: phase2StartedAt, noSupersession, nudgeAt.
 * Actions: `wait`; `enter-passive` (set phase2StartedAt and noSupersession);
 * `nudge` (nudge once and set nudgeAt); `end` (with the round's flags).
 */
export function nextStep(state, now) {
  const phase = state.nudgeAt !== null ? 3 : state.phase2StartedAt !== null ? 2 : 1
  const inFlight = state.refreshOps.some((op) => op.completeAt === null)
  const sentIn = (from, to) => state.refreshOps.filter((op) => op.sentAt >= from && op.sentAt < to)
  const passiveOps = state.phase2StartedAt === null ? [] : sentIn(state.phase2StartedAt, state.nudgeAt ?? Infinity)
  const nudgeOps = state.nudgeAt === null ? [] : sentIn(state.nudgeAt, Infinity)
  const end = (extra = {}) => ({
    phase,
    action: 'end',
    flags: { passiveRefreshSeen: passiveOps.length > 0, noRefreshAfterNudge: false, unfinishedAtCap: false, ...extra },
  })

  if (state.sessionEnded) return end()
  if (now - state.openedAt >= CAP_MS) return end({ unfinishedAtCap: true })

  if (phase === 1) {
    if (state.holdExpected && state.holdReleasedAt === null) return { phase, action: 'wait', flags: {} }
    const superseded = state.firstSupersededAt !== null
    const until = Math.max(state.holdReleasedAt ?? 0, superseded ? state.firstSupersededAt + state.graceMs : state.openedAt + NO_SUPERSESSION_MS)
    if (now < until) return { phase, action: 'wait', flags: {} }
    return { phase, action: 'enter-passive', flags: { noSupersession: !superseded } }
  }

  if (phase === 2) {
    if (passiveOps.length > 0) return inFlight ? { phase, action: 'wait', flags: {} } : end()
    if (now - state.phase2StartedAt < PASSIVE_MS || inFlight) return { phase, action: 'wait', flags: {} }
    return { phase, action: 'nudge', flags: {} }
  }

  if (nudgeOps.length > 0) return inFlight ? { phase, action: 'wait', flags: {} } : end()
  if (now - state.nudgeAt < AFTER_NUDGE_MS || inFlight) return { phase, action: 'wait', flags: {} }
  return end({ noRefreshAfterNudge: true })
}

/**
 * One round, in the order that matters, with what it started undone however it
 * ends. The spare reader's sampling starts and the refresh holds are armed
 * before any tab navigates, so the round's first refresh cannot leave unseen;
 * the store hold, the sampler, the CPU workers and the tabs are let go in a
 * `finally`, each on its own, so a round that dies holding the store does not
 * leave it held for the next one.
 */
export async function runRound(deps) {
  const result = { resetChecks: null, error: null, cleanupErrors: [] }
  try {
    result.resetChecks = await deps.resetChecks()
    if (result.resetChecks?.ok === false) return result
    await deps.openProfile()
    await deps.startCpuLoad()
    await deps.startSampler()
    await deps.createPages()
    await deps.armHolds()
    await deps.navigate()
    await deps.observe()
    await deps.collect()
  } catch (err) {
    result.error = err && err.stack ? err.stack : String(err)
  } finally {
    for (const name of ['releaseHold', 'stopSampler', 'stopCpuLoad', 'closeTabs']) {
      try {
        await deps[name]()
      } catch (err) {
        result.cleanupErrors.push(`${name}: ${String(err?.message ?? err).slice(0, 200)}`)
      }
    }
  }
  return result
}
