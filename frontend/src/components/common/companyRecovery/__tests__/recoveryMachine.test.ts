import { describe, expect, it } from 'vitest'

import {
  initialRecoveryState,
  recoveryReducer,
  RETRY_DELAYS_MS,
  selectUnavailable,
  type RecoveryEvent,
  type RecoveryState,
} from '../recoveryMachine'

// Each row of the design's rule table, driven as an event sequence. The state
// asserted is the whole public state; `refetchSeq` is how much the sequence
// moved it, which is how many reads the sequence commanded.
const run = (events: RecoveryEvent[], from: RecoveryState = initialRecoveryState): RecoveryState =>
  events.reduce(recoveryReducer, from)

const at = (events: RecoveryEvent[], index: number): RecoveryState =>
  events.slice(0, index + 1).reduce(recoveryReducer, initialRecoveryState)

const commanded = (events: RecoveryEvent[]): number =>
  run(events).refetchSeq - initialRecoveryState.refetchSeq

// (a) The first failure of a cycle: wait the first delay with the full budget.
const failedOnce: RecoveryEvent[] = [
  { type: 'fetch-started' },
  { type: 'fetch-failed', cause: 'transient' },
]

describe('recoveryReducer', () => {
  describe('a transient failure', () => {
    it('a: waits the first delay with the full budget and commands nothing', () => {
      const state = run(failedOnce)
      expect(state.phase).toBe('waiting')
      expect(state.remainingMs).toBe(RETRY_DELAYS_MS[0])
      expect(state.retriesLeft).toBe(2)
      expect(commanded(failedOnce)).toBe(0)
    })

    it('b: the delay elapsing commands one read and spends one attempt', () => {
      const events = [...failedOnce, { type: 'delay-elapsed' }]
      expect(commanded(events)).toBe(1)
      const state = run(events)
      expect(state.retriesLeft).toBe(1)
      expect(state.fetchMode).toBe('cycle')
    })

    it('c: two further transient failures stop recovery, after exactly two attempts', () => {
      const events: RecoveryEvent[] = [
        ...failedOnce,
        { type: 'delay-elapsed' },
        { type: 'fetch-started' },
        { type: 'fetch-failed', cause: 'transient' },
      ]
      expect(run(events).remainingMs).toBe(RETRY_DELAYS_MS[1])

      const exhausted = [...events, { type: 'delay-elapsed' }, { type: 'fetch-started' }, { type: 'fetch-failed', cause: 'transient' }]
      const state = run(exhausted)
      expect(state.phase).toBe('stopped')
      expect(commanded(exhausted)).toBe(2)
    })

    it('e: a refresh-blocked failure mid-cycle stops at once, budget or not', () => {
      const state = run([
        ...failedOnce,
        { type: 'delay-elapsed' },
        { type: 'fetch-started' },
        { type: 'fetch-failed', cause: 'refresh-blocked' },
      ])
      expect(state.phase).toBe('stopped')
      expect(state.retriesLeft).toBe(1)
    })

    it('f: a success from any failure state clears everything', () => {
      const state = run([...failedOnce, { type: 'fetch-started' }, { type: 'fetch-succeeded' }])
      expect(state.phase).toBe('active')
      expect(state.retriesLeft).toBe(2)
      expect(state.remainingMs).toBeNull()
      expect(state.quietPending).toBe(false)
    })
  })

  describe('a failure that is not transient', () => {
    it.each(['refresh-blocked', 'refused', 'other'] as const)('d: %s stops at once', (cause) => {
      const events: RecoveryEvent[] = [{ type: 'fetch-started' }, { type: 'fetch-failed', cause }]
      expect(run(events).phase).toBe('stopped')
      expect(commanded(events)).toBe(0)
    })
  })

  describe('the delay', () => {
    it('g: pausing keeps the remaining time and does not run on', () => {
      const events = [...failedOnce, { type: 'delay-paused', elapsedMs: 500 }]
      expect(run(events).phase).toBe('waiting')
      expect(run(events).remainingMs).toBe(RETRY_DELAYS_MS[0] - 500)

      const again = [...events, { type: 'delay-paused', elapsedMs: 0 }]
      expect(run(again).remainingMs).toBe(RETRY_DELAYS_MS[0] - 500)
    })
  })

  describe('a quiet re-read after a renewal', () => {
    it('h: one renewal while stopped and idle commands one read with no retries of its own', () => {
      const events: RecoveryEvent[] = [{ type: 'fetch-started' }, { type: 'fetch-failed', cause: 'other' }, { type: 'renewal', eligible: true }]
      const state = run(events)
      expect(commanded(events)).toBe(1)
      expect(state.fetchMode).toBe('single')
    })

    it('i: that read failing transiently leaves recovery stopped and commands nothing', () => {
      const events: RecoveryEvent[] = [
        { type: 'fetch-started' },
        { type: 'fetch-failed', cause: 'other' },
        { type: 'renewal', eligible: true },
        { type: 'fetch-started' },
        { type: 'fetch-failed', cause: 'transient' },
      ]
      expect(run(events).phase).toBe('stopped')
      expect(commanded(events)).toBe(1)
    })

    it('j: several renewals before the read starts are coalesced into one', () => {
      const events: RecoveryEvent[] = [
        { type: 'fetch-started' },
        { type: 'fetch-failed', cause: 'other' },
        { type: 'renewal', eligible: true },
        { type: 'renewal', eligible: true },
        { type: 'renewal', eligible: true },
      ]
      expect(commanded(events)).toBe(1)
    })

    it('k: a renewal seen while that read is in flight is consumed and queues nothing', () => {
      const events: RecoveryEvent[] = [
        { type: 'fetch-started' },
        { type: 'fetch-failed', cause: 'other' },
        { type: 'manual-retry', eligible: true },
        { type: 'fetch-started' },
        { type: 'renewal', eligible: true },
        { type: 'fetch-failed', cause: 'transient' },
      ]
      const state = run(events)
      expect(state.quietPending).toBe(false)
      expect(state.phase).toBe('waiting')
      expect(commanded(events)).toBe(1)
    })

    it('l: the loop is closed: the renewal its own 401 caused commands no successor', () => {
      const stopped: RecoveryEvent[] = [
        { type: 'fetch-started' },
        { type: 'fetch-failed', cause: 'other' },
        { type: 'renewal', eligible: true },
        { type: 'fetch-started' },
        { type: 'renewal', eligible: true },
        { type: 'fetch-failed', cause: 'refresh-blocked' },
      ]
      const state = run(stopped)
      expect(state.phase).toBe('stopped')
      expect(state.quietPending).toBe(false)
      expect(commanded(stopped)).toBe(1)

      // A later, separate renewal is honoured.
      const later = [...stopped, { type: 'renewal', eligible: true }]
      expect(commanded(later)).toBe(2)
      expect(run(later).fetchMode).toBe('single')
    })

    it('m: an ineligible renewal waits for eligibility, and then reads once', () => {
      const events: RecoveryEvent[] = [
        { type: 'fetch-started' },
        { type: 'fetch-failed', cause: 'other' },
        { type: 'renewal', eligible: false },
      ]
      expect(run(events).quietPending).toBe(true)
      expect(commanded(events)).toBe(0)

      const eligible = [...events, { type: 'became-eligible' }]
      expect(commanded(eligible)).toBe(1)
      expect(run(eligible).quietPending).toBe(false)
      expect(run(eligible).fetchMode).toBe('single')
    })

    it('o: a renewal while a cycle is waiting changes nothing', () => {
      const state = run([...failedOnce, { type: 'renewal', eligible: true }])
      expect(state.phase).toBe('waiting')
      expect(state.remainingMs).toBe(RETRY_DELAYS_MS[0])
      expect(state.retriesLeft).toBe(2)
    })

    it('p: a renewal while active and not failing changes nothing', () => {
      expect(run([{ type: 'renewal', eligible: true }])).toEqual(initialRecoveryState)
    })
  })

  it('n: eligibility never resets a budget, so a stopped tab stays stopped', () => {
    const spent: RecoveryEvent[] = [
      ...failedOnce,
      { type: 'delay-elapsed' },
      { type: 'fetch-started' },
      { type: 'fetch-failed', cause: 'transient' },
      { type: 'delay-elapsed' },
      { type: 'fetch-started' },
      { type: 'fetch-failed', cause: 'transient' },
    ]
    const before = run(spent)
    expect(before.retriesLeft).toBe(0)

    const after = run([...spent, { type: 'became-eligible' }])
    expect(after.refetchSeq).toBe(before.refetchSeq)
    expect(after).toEqual(before)
  })

  describe('manual Retry', () => {
    it('q: starts a fresh cycle with the full budget, and a transient failure runs it', () => {
      const events: RecoveryEvent[] = [
        { type: 'fetch-started' },
        { type: 'fetch-failed', cause: 'other' },
        { type: 'manual-retry', eligible: true },
      ]
      const state = run(events)
      expect(commanded(events)).toBe(1)
      expect(state.fetchMode).toBe('cycle')
      expect(state.retriesLeft).toBe(2)
      expect(state.quietPending).toBe(false)

      const failing = [...events, { type: 'fetch-started' }, { type: 'fetch-failed', cause: 'transient' }]
      expect(run(failing).phase).toBe('waiting')
      expect(run(failing).remainingMs).toBe(RETRY_DELAYS_MS[0])
      expect(run(failing).retriesLeft).toBe(2)
    })

    it('r: two clicks before the read starts command one read', () => {
      const events: RecoveryEvent[] = [
        { type: 'fetch-started' },
        { type: 'fetch-failed', cause: 'other' },
        { type: 'manual-retry', eligible: true },
        { type: 'manual-retry', eligible: true },
      ]
      expect(commanded(events)).toBe(1)
    })

    it('r: a click while a request is pending commands nothing', () => {
      const events: RecoveryEvent[] = [
        { type: 'fetch-started' },
        { type: 'fetch-failed', cause: 'other' },
        { type: 'manual-retry', eligible: true },
        { type: 'fetch-started' },
        { type: 'manual-retry', eligible: true },
      ]
      expect(commanded(events)).toBe(1)
      expect(run(events).fetching).toBe(true)
    })

    it('s: an ineligible click does nothing', () => {
      const events: RecoveryEvent[] = [
        { type: 'fetch-started' },
        { type: 'fetch-failed', cause: 'other' },
        { type: 'manual-retry', eligible: false },
      ]
      expect(run(events)).toEqual(run([...events.slice(0, 2)]))
    })

    it.each([
      ['active', [{ type: 'manual-retry', eligible: true }] as RecoveryEvent[]],
      [
        'waiting',
        [...failedOnce, { type: 'manual-retry', eligible: true }] as RecoveryEvent[],
      ],
    ])('t: a click while %s does nothing', (_name, events) => {
      const before = at(events, events.length - 2)
      expect(run(events)).toEqual(before)
    })
  })

  describe('a read another reader started', () => {
    it('u: failing transiently while stopped does not restart a cycle', () => {
      const events: RecoveryEvent[] = [
        { type: 'fetch-started' },
        { type: 'fetch-failed', cause: 'other' },
        { type: 'fetch-started' },
        { type: 'fetch-failed', cause: 'transient' },
      ]
      const state = run(events)
      expect(state.phase).toBe('stopped')
      expect(commanded(events)).toBe(0)
    })

    it('u: succeeding while stopped clears the state', () => {
      const events: RecoveryEvent[] = [
        { type: 'fetch-started' },
        { type: 'fetch-failed', cause: 'other' },
        { type: 'fetch-started' },
        { type: 'fetch-succeeded' },
      ]
      expect(run(events).phase).toBe('active')
      expect(commanded(events)).toBe(0)
    })

    it('v: while a cycle is waiting it leaves the delay and the budget alone', () => {
      const events: RecoveryEvent[] = [
        ...failedOnce,
        { type: 'fetch-started' },
        { type: 'fetch-failed', cause: 'transient' },
      ]
      const state = run(events)
      expect(state.phase).toBe('waiting')
      expect(state.remainingMs).toBe(RETRY_DELAYS_MS[0])
      expect(state.retriesLeft).toBe(2)
    })

    it('v: the delay is not counted down while that read runs', () => {
      const events: RecoveryEvent[] = [...failedOnce, { type: 'fetch-started' }]
      expect(run(events).remainingMs).toBeNull()
      // Pausing after it settles resumes the delay that was running before it.
      const resumed = [...events, { type: 'fetch-failed', cause: 'transient' }, { type: 'delay-paused', elapsedMs: 400 }]
      expect(run(resumed).remainingMs).toBe(RETRY_DELAYS_MS[0] - 400)
    })

    it('w: invalidating a good read runs a normal cycle', () => {
      const state = run([{ type: 'fetch-started' }, { type: 'fetch-succeeded' }, { type: 'fetch-started' }, { type: 'fetch-failed', cause: 'transient' }])
      expect(state.phase).toBe('waiting')
      expect(state.remainingMs).toBe(RETRY_DELAYS_MS[0])
      expect(state.retriesLeft).toBe(2)
    })
  })

  it('x: a read cancelled or ended by the session clears the in-flight mark only', () => {
    const events: RecoveryEvent[] = [
      ...failedOnce,
      { type: 'delay-elapsed' },
      { type: 'fetch-started' },
      { type: 'fetch-failed', cause: null },
    ]
    const before = at(events, events.length - 2)
    const after = run(events)
    expect(after.fetching).toBe(false)
    expect({ ...after, fetching: before.fetching }).toEqual(before)
  })
})

describe('selectUnavailable', () => {
  it('is true only when recovery has stopped', () => {
    expect(selectUnavailable(initialRecoveryState)).toBe(false)
    expect(selectUnavailable(run(failedOnce))).toBe(false)
    expect(selectUnavailable(run([{ type: 'fetch-started' }, { type: 'fetch-failed', cause: 'refused' }]))).toBe(true)
  })
})