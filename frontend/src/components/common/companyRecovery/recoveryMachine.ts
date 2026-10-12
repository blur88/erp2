import type { CompanySettingsFailureCause } from '@/store/api/companySettingsFailure'

/**
 * What the recovery may do about the company-settings read, as a pure function
 * of what has been seen. It decides; the provider carries out (`refetch`, the
 * delay timer). Nothing here sends anything, and nothing here knows whether a
 * tab is eligible beyond what an event says about it.
 */

/** The waits between automatic attempts: after the first failure, then after the first retry. */
export const RETRY_DELAYS_MS = [2000, 6000] as const

export interface RecoveryState {
  /** `active`: no failure outstanding. `waiting`: a delay is owed. `stopped`: recovery has given up. */
  phase: 'active' | 'waiting' | 'stopped'
  /** A read for this query is in flight, whoever started it. */
  fetching: boolean
  /** How the fetch now in flight (or next commanded) is judged if it fails. */
  fetchMode: 'cycle' | 'single'
  /** Automatic attempts still owed by the cycle in progress. */
  retriesLeft: number
  /** The delay owed, set only while `waiting`. */
  remainingMs: number | null
  /** A renewal was seen while stopped and ineligible; one read is owed when it becomes eligible. */
  quietPending: boolean
  /** Incremented once per commanded read. The provider refetches when it moves. */
  refetchSeq: number
  /** A commanded read has not been seen starting yet. Private to this file. */
  commanded: boolean
  /** A delay owed but not running, because another reader's fetch took over. Private to this file. */
  heldMs: number | null
}

export const initialRecoveryState: RecoveryState = {
  phase: 'active',
  fetching: false,
  fetchMode: 'cycle',
  retriesLeft: RETRY_DELAYS_MS.length,
  remainingMs: null,
  quietPending: false,
  refetchSeq: 0,
  commanded: false,
  heldMs: null,
}

export type RecoveryEvent =
  | { type: 'fetch-started' }
  | { type: 'fetch-succeeded' }
  | { type: 'fetch-failed'; cause: CompanySettingsFailureCause | null }
  | { type: 'delay-paused'; elapsedMs: number }
  | { type: 'delay-elapsed' }
  | { type: 'renewal'; eligible: boolean }
  | { type: 'became-eligible' }
  | { type: 'manual-retry'; eligible: boolean }

export const selectUnavailable = (state: RecoveryState): boolean => state.phase === 'stopped'

/** Owes the caller one read, and says how it is judged if it fails. */
const command = (state: RecoveryState, fetchMode: RecoveryState['fetchMode']): RecoveryState => ({
  ...state,
  fetchMode,
  commanded: true,
  quietPending: false,
  refetchSeq: state.refetchSeq + 1,
})

const stopped = (state: RecoveryState): RecoveryState => ({
  ...state,
  phase: 'stopped',
  fetching: false,
  remainingMs: null,
  heldMs: null,
  commanded: false,
})

const idle = (state: RecoveryState): boolean => !state.fetching && !state.commanded

export function recoveryReducer(state: RecoveryState, event: RecoveryEvent): RecoveryState {
  switch (event.type) {
    case 'fetch-started': {
      // A read takes over the delay that was running: another reader's read does
      // not stop the cycle, it suspends it.
      return {
        ...state,
        fetching: true,
        heldMs: state.phase === 'waiting' ? state.remainingMs : null,
        remainingMs: null,
        commanded: false,
        // A read this recovery did not command is judged by where it started:
        // nothing is owed to it in the stopped state, so it cannot restart one.
        fetchMode: state.commanded ? state.fetchMode : state.phase === 'stopped' ? 'single' : 'cycle',
      }
    }

    case 'fetch-succeeded':
      return {
        ...state,
        phase: 'active',
        fetching: false,
        fetchMode: 'cycle',
        retriesLeft: RETRY_DELAYS_MS.length,
        remainingMs: null,
        heldMs: null,
        quietPending: false,
        commanded: false,
      }

    case 'fetch-failed': {
      // The session ended or the request was cancelled: not a failure of the
      // read, so nothing is judged and the delay owed resumes.
      if (event.cause === null) {
        return { ...state, fetching: false, commanded: false, remainingMs: state.heldMs, heldMs: null }
      }

      if (event.cause !== 'transient') return stopped(state)

      // A quiet re-read, or a read that started while stopped, has no attempts
      // of its own: it stops again and waits for the next renewal or a Retry.
      if (state.fetchMode === 'single' || state.retriesLeft <= 0) return stopped(state)

      return {
        ...state,
        phase: 'waiting',
        fetching: false,
        remainingMs: RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - state.retriesLeft],
        heldMs: null,
      }
    }

    case 'delay-paused':
      if (state.remainingMs === null) return state
      return { ...state, remainingMs: Math.max(0, state.remainingMs - event.elapsedMs) }

    case 'delay-elapsed': {
      if (state.remainingMs === null || state.retriesLeft <= 0) return state
      return command({ ...state, remainingMs: null, retriesLeft: state.retriesLeft - 1 }, 'cycle')
    }

    case 'renewal': {
      // While a read is in flight a renewal is consumed: it queues nothing, so a
      // quiet re-read answered 401 cannot renew, fail and re-read without end.
      // Several renewals before a commanded read starts are the same one read.
      if (state.phase !== 'stopped' || !idle(state)) return state
      return event.eligible ? command(state, 'single') : { ...state, quietPending: true }
    }

    case 'became-eligible':
      // Becoming eligible never resets a budget and never reads in the stopped
      // state on its own; it only honours a renewal that was seen while ineligible.
      return state.quietPending ? command(state, 'single') : state

    case 'manual-retry': {
      if (!event.eligible || state.phase !== 'stopped' || !idle(state)) return state
      return command({ ...state, retriesLeft: RETRY_DELAYS_MS.length }, 'cycle')
    }
  }
}