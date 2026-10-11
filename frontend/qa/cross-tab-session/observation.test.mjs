// How long a round of the stall runs is watched (lib/observation.mjs, #1370):
// through grace expiry, then passively, then one nudge, with a refresh that has
// started followed until its operation is complete. Pure.
//
//   node --test frontend/qa/cross-tab-session/observation.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AFTER_NUDGE_MS, CAP_MS, NO_SUPERSESSION_MS, PASSIVE_MS, nextStep, refreshOperations, runRound } from './lib/observation.mjs'

const T0 = 1_000_000
const state = (overrides = {}) => ({
  openedAt: T0, holdExpected: true, holdReleasedAt: T0 + 31_000, firstSupersededAt: T0 + 10_000, graceMs: 5000,
  sessionEnded: false, refreshOps: [{ sentAt: T0 + 9_900, completeAt: T0 + 22_000 }], phase2StartedAt: null, noSupersession: false, nudgeAt: null,
  ...overrides,
})

test('the figures are the protocol\'s', () => {
  assert.deepEqual([PASSIVE_MS, AFTER_NUDGE_MS, CAP_MS, NO_SUPERSESSION_MS], [65000, 20000, 300000, 60000])
})

test('phase 1 lasts until the hold is released and the grace has expired, whichever is later', () => {
  assert.equal(nextStep(state(), T0 + 30_999).action, 'wait')
  assert.deepEqual(nextStep(state(), T0 + 31_000), { phase: 1, action: 'enter-passive', flags: { noSupersession: false } })
  // A 60 s grace outlasts a 21 s hold.
  const long = state({ graceMs: 60_000 })
  assert.equal(nextStep(long, T0 + 69_999).action, 'wait')
  assert.equal(nextStep(long, T0 + 70_000).action, 'enter-passive')
})

test('a hold that has not been released keeps phase 1 open', () => {
  assert.equal(nextStep(state({ holdReleasedAt: null }), T0 + 100_000).action, 'wait')
})

test('with no supersession by 60 s the round moves on and says so', () => {
  const none = state({ holdExpected: false, holdReleasedAt: null, firstSupersededAt: null, refreshOps: [] })
  assert.equal(nextStep(none, T0 + 59_999).action, 'wait')
  assert.deepEqual(nextStep(none, T0 + 60_000), { phase: 1, action: 'enter-passive', flags: { noSupersession: true } })
})

test('with no supersession and a hold released later than 60 s, it moves on at the release', () => {
  const none = state({ firstSupersededAt: null, holdReleasedAt: T0 + 75_000 })
  assert.equal(nextStep(none, T0 + 74_999).action, 'wait')
  assert.equal(nextStep(none, T0 + 75_000).flags.noSupersession, true)
})

const passive = (overrides = {}) => state({ phase2StartedAt: T0 + 31_000, ...overrides })

test('a passive phase with no refresh asks for the nudge at 65 s, once', () => {
  assert.equal(nextStep(passive(), T0 + 31_000 + PASSIVE_MS - 1).action, 'wait')
  assert.deepEqual(nextStep(passive(), T0 + 31_000 + PASSIVE_MS), { phase: 2, action: 'nudge', flags: {} })
})

test('a refresh sent late in the passive phase is followed past 65 s until it is complete', () => {
  const sentAt = T0 + 31_000 + 64_000
  const open = passive({ refreshOps: [{ sentAt, completeAt: null }] })
  assert.equal(nextStep(open, T0 + 31_000 + 80_000).action, 'wait')
  const done = passive({ refreshOps: [{ sentAt, completeAt: T0 + 31_000 + 81_000 }] })
  assert.deepEqual(nextStep(done, T0 + 31_000 + 81_000), {
    phase: 2, action: 'end', flags: { passiveRefreshSeen: true, noRefreshAfterNudge: false, unfinishedAtCap: false },
  })
})

const nudged = (overrides = {}) => passive({ nudgeAt: T0 + 96_000, ...overrides })

test('no refresh within 20 s of the nudge ends the round and says so', () => {
  assert.equal(nextStep(nudged(), T0 + 96_000 + AFTER_NUDGE_MS - 1).action, 'wait')
  assert.deepEqual(nextStep(nudged(), T0 + 96_000 + AFTER_NUDGE_MS), {
    phase: 3, action: 'end', flags: { passiveRefreshSeen: false, noRefreshAfterNudge: true, unfinishedAtCap: false },
  })
})

test('a refresh sent 19 s after the nudge is followed past 20 s until it is complete', () => {
  const sentAt = T0 + 96_000 + 19_000
  assert.equal(nextStep(nudged({ refreshOps: [{ sentAt, completeAt: null }] }), T0 + 96_000 + 40_000).action, 'wait')
  const ended = nextStep(nudged({ refreshOps: [{ sentAt, completeAt: T0 + 96_000 + 41_000 }] }), T0 + 96_000 + 41_000)
  assert.equal(ended.action, 'end')
  assert.equal(ended.flags.noRefreshAfterNudge, false)
})

test('an operation still in flight at the cap ends the round as unfinished', () => {
  const open = nudged({ refreshOps: [{ sentAt: T0 + 100_000, completeAt: null }] })
  assert.equal(nextStep(open, T0 + CAP_MS - 1).action, 'wait')
  const capped = nextStep(open, T0 + CAP_MS)
  assert.equal(capped.action, 'end')
  assert.equal(capped.flags.unfinishedAtCap, true)
})

test('a session that ended ends the round in whatever phase it is', () => {
  for (const s of [state(), passive(), nudged()]) {
    const step = nextStep({ ...s, sessionEnded: true }, T0 + 12_000)
    assert.equal(step.action, 'end')
    assert.equal(step.flags.unfinishedAtCap, false)
  }
})

// --- when a refresh operation is complete -----------------------------------------

const ev = (type, at, refreshId, rest = {}) => ({ type, at, refreshId, ...rest })
const ops = (events) => refreshOperations([{ tab: 'X', events }])

test('a 200 is complete when its commit has settled and the lease is released', () => {
  const events = [
    ev('refresh-sent', 100, 1, { presentedGeneration: 7 }),
    ev('refresh-answered', 500, 1, { status: 'ok', returnedGeneration: 8 }),
  ]
  assert.equal(ops(events)[0].completeAt, null)
  events.push(ev('token-commit', 600, 1, { attempt: 1, outcome: 'written-both' }))
  assert.equal(ops(events)[0].completeAt, null)
  events.push(ev('lease-release', 650, 1, { outcome: 'released' }))
  assert.deepEqual(ops(events), [{ tab: 'X', refreshId: 1, sentAt: 100, answeredAt: 500, status: 'ok', completeAt: 650 }])
})

test('a 200 whose commit timed out and is held pending is not complete until the entry is dropped', () => {
  const events = [
    ev('refresh-sent', 100, 1, { presentedGeneration: 7 }),
    ev('refresh-answered', 500, 1, { status: 'ok', returnedGeneration: 8 }),
    ev('token-commit', 5500, 1, { attempt: 1, outcome: 'timeout' }),
    ev('token-commit', 10_500, 1, { attempt: 2, outcome: 'timeout' }),
    ev('lease-release', 10_510, 1, { outcome: 'skipped-pending' }),
  ]
  assert.equal(ops(events)[0].completeAt, null)
  events.push(ev('token-commit', 20_000, 1, { attempt: 3, outcome: 'written-both' }), ev('pending-dropped', 20_001, 1, { reason: 'written' }), ev('lease-release', 20_050, 1, { outcome: 'released' }))
  assert.equal(ops(events)[0].completeAt, 20_050)
})

test('on a build without the pending entry, a timed-out commit and a released lease is complete', () => {
  const events = [
    ev('refresh-sent', 100, 1, { presentedGeneration: 7 }),
    ev('refresh-answered', 500, 1, { status: 'ok', returnedGeneration: 8 }),
    ev('token-commit', 5500, 1, { attempt: 1, outcome: 'timeout' }),
    ev('lease-release', 5510, 1, { outcome: 'released' }),
  ]
  assert.equal(ops(events)[0].completeAt, 5510)
})

test('a refusal is complete at its lease release; an unanswered refresh is not complete', () => {
  const events = [ev('refresh-sent', 100, 1, { presentedGeneration: 7 })]
  assert.deepEqual(ops(events)[0], { tab: 'X', refreshId: 1, sentAt: 100, answeredAt: null, status: null, completeAt: null })
  events.push(ev('refresh-answered', 400, 1, { status: 'rejected', returnedGeneration: null }), ev('lease-release', 420, 1, { outcome: 'released' }))
  assert.equal(ops(events)[0].completeAt, 420)
})

// --- the order of a round, and what is undone however it ends ------------------------

function recorder(failAt = null) {
  const calls = []
  const names = ['resetChecks', 'openProfile', 'startCpuLoad', 'startSampler', 'createPages', 'armHolds', 'navigate', 'observe', 'collect', 'releaseHold', 'stopSampler', 'stopCpuLoad', 'closeTabs']
  const deps = Object.fromEntries(names.map((name) => [name, async () => {
    calls.push(name)
    if (name === failAt) throw new Error(`${name} failed`)
    return name === 'resetChecks' ? { ok: true, failed: [] } : undefined
  }]))
  return { calls, deps }
}

test('the sampler starts and the holds are armed before any tab navigates', async () => {
  const { calls, deps } = recorder()
  await runRound(deps)
  const order = ['startSampler', 'createPages', 'armHolds', 'navigate'].map((name) => calls.indexOf(name))
  assert.deepEqual(order, [...order].sort((a, b) => a - b))
  assert.ok(order.every((i) => i >= 0))
  assert.ok(calls.indexOf('navigate') < calls.indexOf('observe'))
})

test('a round that dies with the store held still releases it, stops the workers and closes its tabs', async () => {
  const { calls, deps } = recorder('observe')
  const result = await runRound(deps)
  for (const name of ['releaseHold', 'stopSampler', 'stopCpuLoad', 'closeTabs']) {
    assert.equal(calls.filter((c) => c === name).length, 1, `${name} called ${calls.filter((c) => c === name).length} times`)
  }
  assert.match(result.error, /observe failed/)
  assert.ok(!calls.includes('collect'))
})

test('a cleanup step that fails does not stop the others', async () => {
  const { calls, deps } = recorder('releaseHold')
  const result = await runRound(deps)
  assert.ok(calls.includes('stopCpuLoad') && calls.includes('closeTabs'))
  assert.match(result.cleanupErrors.join(';'), /releaseHold failed/)
})

test('a failed reset check is recorded and the round opens nothing', async () => {
  const { calls, deps } = recorder()
  deps.resetChecks = async () => { calls.push('resetChecks'); return { ok: false, failed: ['store-not-free'] } }
  const result = await runRound(deps)
  assert.deepEqual(result.resetChecks, { ok: false, failed: ['store-not-free'] })
  assert.ok(!calls.includes('navigate'))
  assert.ok(calls.includes('closeTabs'))
})
