import React, { createContext, useCallback, useContext, useEffect, useReducer, useRef, useState } from 'react'
import type { JSX } from 'react'
import { useStore } from 'react-redux'

import { useAppSelector } from '@/hooks/useRedux'
import { settingsApiSlice, useGetCompanySettingsQuery, type CompanySettings } from '@/store/api/settingsApi'
import type { CompanySettingsFailureCause } from '@/store/api/companySettingsFailure'
import {
  selectAccessToken,
  selectIsAuthenticated,
  selectStorageUnavailable,
  selectStorageWaiting,
} from '@/store/slices/authSlice'
import {
  initialRecoveryState,
  recoveryReducer,
  selectUnavailable,
} from './recoveryMachine'

export interface CompanySettingsRecovery {
  /** RTK Query's own data, kept across a failed refetch. Never another session's. */
  company: CompanySettings | undefined
  /** Recovery has stopped: the read failed and nothing is coming on its own. */
  unavailable: boolean
  /** A request for this read is in flight, whoever started it. */
  retrying: boolean
  /** Unavailable, nothing pending, and the tab may send: the same check the handler makes. */
  canRetry: boolean
  /** Asks for the read again. Checks eligibility itself and does nothing when it does not hold. */
  retry: () => void
}

const CompanyRecoveryContext = createContext<CompanySettingsRecovery | null>(null)

const selectCompanyEntry = settingsApiSlice.endpoints.getCompanySettings.select()

type CompanyEntry = ReturnType<typeof selectCompanyEntry>

/**
 * Owns the one subscription to the company-settings read, and with it the
 * recovery of that read. Mounted once at the layout and shared by both
 * sidebars: a second subscriber would make RTK Query re-send a failed read
 * whenever the mobile drawer opened, which is what this exists to prevent.
 *
 * What is bounded is recovery *attempts* (see recoveryMachine), not requests:
 * one attempt can be several requests underneath, and the runtime may refresh
 * behind any of them.
 */
function Recovery({ children }: { children: React.ReactNode }): JSX.Element {
  const isAuthenticated = useAppSelector(selectIsAuthenticated)
  const store = useStore()
  // Signed out, there is nothing to read and no session it could belong to:
  // subscribing would make RTK Query fetch on mount after a session ends.
  const { data, isFetching, refetch } = useGetCompanySettingsQuery(undefined, { skip: !isAuthenticated })
  const [state, dispatch] = useReducer(recoveryReducer, initialRecoveryState)

  const storageWaiting = useAppSelector(selectStorageWaiting)
  const storageUnavailable = useAppSelector(selectStorageUnavailable)
  const accessToken = useAppSelector(selectAccessToken)

  const [visible, setVisible] = useState(() => document.visibilityState === 'visible')

  // Eligibility, read fresh whenever it is needed: `retry()` decides at call time.
  const auth = useRef({ isAuthenticated, storageWaiting, storageUnavailable })
  auth.current = { isAuthenticated, storageWaiting, storageUnavailable }
  const eligibleNow = useCallback(
    () =>
      Boolean(
        auth.current.isAuthenticated &&
          !auth.current.storageWaiting &&
          !auth.current.storageUnavailable &&
          document.visibilityState === 'visible',
      ),
    [],
  )
  const eligible = eligibleNow()

  /**
   * Branding belongs to the session that read it. Remounting on a session change
   * clears this, so nothing read under the previous session is shown, and a
   * request already in flight when this mounted never supplies it, whatever it
   * returns.
   */
  const ownsData = useRef(false)

  // The cache entry as it stood at this component's first render, before RTK
  // Query's mount effect could start a read: a read already pending there was
  // sent under the session this one replaces, and its answer may not brand this
  // one. One RTK Query starts itself here belongs to this session.
  const mountedWith = useRef<CompanyEntry | null>(null)
  if (mountedWith.current === null) mountedWith.current = selectCompanyEntry(store.getState() as never)
  const atMount = mountedWith.current

  useEffect(() => {
    const foreignPending = atMount.status === 'pending'
    let ownFetch = !foreignPending
    // RTK Query fetches on mount only for an entry it has never fulfilled; a
    // cached read is not re-fetched, so the new session needs one of its own.
    let issuedFirstRead =
      atMount.isUninitialized || (atMount.status === 'rejected' && !atMount.fulfilledTimeStamp)
    const issueFirstRead = () => {
      if (issuedFirstRead) return
      issuedFirstRead = true
      refetch()
    }
    if (!foreignPending) issueFirstRead()

    let previous: CompanyEntry = atMount
    return store.subscribe(() => {
      const current = selectCompanyEntry(store.getState() as never)
      if (current === previous) return
      const before = previous
      previous = current

      const fetching = current.status === 'pending'
      const wasFetching = before.status === 'pending'
      if (fetching && !wasFetching) {
        ownFetch = true
        issuedFirstRead = true
        dispatch({ type: 'fetch-started' })
        return
      }

      if (fetching || (!current.isSuccess && !current.error)) return

      if (!ownFetch) {
        ownFetch = true
        issueFirstRead()
        return
      }
      if (!issuedFirstRead) {
        issuedFirstRead = true
        dispatch({ type: 'fetch-started' })
      }
      if (current.isSuccess) {
        ownsData.current = true
        dispatch({ type: 'fetch-succeeded' })
      } else {
        dispatch({
          type: 'fetch-failed',
          cause: (current.error as { cause?: CompanySettingsFailureCause } | undefined)?.cause ?? null,
        })
      }
    })
    // `atMount` is this mount's first render only; the effect below runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, refetch])

  // One commanded read per move of `refetchSeq`.
  const commandedSeq = useRef(state.refetchSeq)
  useEffect(() => {
    if (commandedSeq.current === state.refetchSeq) return
    commandedSeq.current = state.refetchSeq
    refetch()
  }, [state.refetchSeq, refetch])

  // The delay, counted down only while the tab may send.
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    if (state.phase !== 'waiting' || state.remainingMs === null || !eligible) return
    const startedAt = Date.now()
    const timer = setTimeout(() => {
      if (mounted.current) dispatch({ type: 'delay-elapsed' })
    }, state.remainingMs)
    return () => {
      clearTimeout(timer)
      if (mounted.current) dispatch({ type: 'delay-paused', elapsedMs: Date.now() - startedAt })
    }
  }, [state.phase, state.remainingMs, eligible])

  // Visibility, and the false-to-true transition that honours a renewal seen
  // while the tab could not send.
  useEffect(() => {
    const onVisibilityChange = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])
  const wasEligible = useRef(eligible)
  useEffect(() => {
    if (wasEligible.current === eligible) return
    wasEligible.current = eligible
    if (eligible) dispatch({ type: 'became-eligible' })
  }, [eligible])

  // A token renewal in this tab, read from the Redux mirror: this tab's own
  // refresh and tokens adopted from another tab both arrive here.
  const lastToken = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    const previous = lastToken.current
    lastToken.current = accessToken
    if (previous === undefined || previous === null || accessToken === null || previous === accessToken) return
    dispatch({ type: 'renewal', eligible: eligibleNow() })
  }, [accessToken, eligibleNow])

  const retry = useCallback(() => {
    dispatch({ type: 'manual-retry', eligible: eligibleNow() })
  }, [eligibleNow])

  const unavailable = selectUnavailable(state)
  const value: CompanySettingsRecovery = {
    company: ownsData.current ? data : undefined,
    unavailable,
    retrying: isFetching,
    canRetry: unavailable && !isFetching && eligible,
    retry,
  }

  return <CompanyRecoveryContext.Provider value={value}>{children}</CompanyRecoveryContext.Provider>
}

export function CompanySettingsRecoveryProvider({ children }: { children: React.ReactNode }): JSX.Element {
  // A session end or change remounts the inner component: its cleanups clear
  // the timers and the reducer starts over. RTK Query's cache is not cleared by
  // that, which is what `ownsData` is for.
  const sessionId = useAppSelector((state) => state.auth.sessionId)
  return <Recovery key={sessionId ?? 'none'}>{children}</Recovery>
}

export function useCompanySettingsRecovery(): CompanySettingsRecovery {
  const recovery = useContext(CompanyRecoveryContext)
  if (!recovery) throw new Error('useCompanySettingsRecovery must be read inside a CompanySettingsRecoveryProvider')
  return recovery
}