import { describe, expect, it } from 'vitest'

// #1364. Guards the teardown of appHarness itself: the hook it registers at
// import, which runs after this file's last test like after any other file's.
// The store it loads batches per animation frame, as in production, and each
// batch starts a 100 ms fallback timer that fails the run if it fires after
// jsdom is gone. The hook has to outlast every one of them.
//
// Here no frame is ever delivered, so only the hook's wait can get rid of a
// fallback. Time is fake from the moment the last test arms it, and it moves
// only when the wait asks: each delay the wait requests is advanced by exactly
// that much. Nothing is drained afterwards. The check below then runs after the
// harness's hook and fails if a Redux Toolkit timer is still pending, which is
// what happens when the wait is removed, does nothing, or is shorter than RTK
// Query's 500 ms subscription sync followed by the 100 ms fallback.
//
// Hooks of one suite run in the reverse of the order they were registered. The
// check is registered in `vi.hoisted`, before appHarness is imported, so it runs
// after the harness's hook; `registered before the harness` below fails if that
// order is ever lost.
const probe = await vi.hoisted(async () => {
  const { afterAll, expect: check, vi: clock } = await import('vitest')

  interface Tracked {
    delay: number
    state: 'pending' | 'fired' | 'cleared'
  }
  const state = {
    armed: false,
    frames: 0,
    /** Delays the teardown wait asked for, in order. */
    waits: [] as number[],
    toolkitTimers: [] as Tracked[],
    checkRan: false,
    arm() {
      clock.useFakeTimers()
      const fakeSet = globalThis.setTimeout
      const fakeClear = globalThis.clearTimeout
      const byId = new Map<unknown, Tracked>()
      globalThis.setTimeout = ((fn: (...args: unknown[]) => void, delay = 0, ...args: unknown[]) => {
        const stack = new Error().stack ?? ''
        if (stack.includes('storeBatching')) {
          state.waits.push(delay)
          // The only thing that moves time: the wait's own request, by its own length.
          void Promise.resolve().then(() => clock.advanceTimersByTimeAsync(delay))
          return fakeSet(fn, delay, ...args)
        }
        if (!stack.includes('@reduxjs/toolkit')) return fakeSet(fn, delay, ...args)
        const tracked: Tracked = { delay, state: 'pending' }
        state.toolkitTimers.push(tracked)
        const id = fakeSet(
          (...a: unknown[]) => {
            tracked.state = 'fired'
            fn(...a)
          },
          delay,
          ...args,
        )
        byId.set(id, tracked)
        return id
      }) as typeof setTimeout
      globalThis.clearTimeout = ((id: unknown) => {
        const tracked = byId.get(id)
        if (tracked?.state === 'pending') tracked.state = 'cleared'
        fakeClear(id as never)
      }) as typeof clearTimeout
      state.armed = true
    },
  }

  // Read when a store is created, so it is in place before any is: no frame is delivered.
  window.requestAnimationFrame = () => {
    state.frames += 1
    return 0
  }

  afterAll(() => {
    state.checkRan = true
    try {
      check(state.armed, 'the last test armed the probe').toBe(true)
      // The scenario is live: production batching asked for frames, and both
      // kinds of timer the wait exists for were started.
      check(state.frames).toBeGreaterThan(0)
      check(state.toolkitTimers.map((t) => t.delay)).toEqual(check.arrayContaining([100, 500]))
      check(
        state.toolkitTimers.filter((t) => t.state === 'pending').map((t) => t.delay),
        'Redux Toolkit timers still pending after the harness teardown (ms)',
      ).toEqual([])
    } finally {
      clock.useRealTimers()
    }
  })

  return state
})

import { vi } from 'vitest'
import { loadApp, storedSession } from './appHarness'

describe('appHarness teardown', () => {
  it('registered before the harness, so its check runs after the harness teardown', () => {
    expect(probe.checkRan).toBe(false)
  })

  // Keep this the last test: what it leaves pending is what the teardown is given.
  it('leaves frame-batched work pending on the loaded store, for the teardown to settle', async () => {
    const app = await loadApp({ stored: { record: { revision: 1, session: storedSession() } } })
    await Promise.all([app.rehydrated(), app.sessionReady()])
    const { settingsApiSlice } = await import('@/store/api/settingsApi')
    const sent = app.requests.length

    probe.arm()
    const framesBefore = probe.frames

    // A cached entry, then a subscriber to it and its departure: batched
    // actions, a subscription change (the 500 ms sync) and an unused entry (the
    // 60 s removal), with no request sent.
    await app.store.dispatch(
      settingsApiSlice.util.upsertQueryData('getCompanySettings', undefined, { id: 'c1', name: 'Acme' } as never),
    )
    const subscription = app.store.dispatch(settingsApiSlice.endpoints.getCompanySettings.initiate())
    await subscription
    subscription.unsubscribe()

    expect(app.requests.length).toBe(sent)
    expect(probe.frames).toBeGreaterThan(framesBefore)
    const pending = probe.toolkitTimers.filter((t) => t.state === 'pending').map((t) => t.delay)
    expect(pending).toEqual(expect.arrayContaining([100, 500, 60_000]))
    // Nothing has moved time, and nothing will until the teardown's wait asks.
    expect(probe.waits).toEqual([])
  })
})
