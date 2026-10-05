import { describe, it, expect } from 'vitest'
import { store, RESET_FOR_SESSION_END } from '../index'
import { sessionEstablished, sessionEnded, storageUnavailable } from '../slices/authSlice'
import { addNotification } from '../slices/notificationSlice'

const apiReducerKeys = () =>
  Object.keys(store.getState()).filter((k) => k.endsWith('Api'))

const activeSession = {
  sessionId: 's2',
  generation: 2,
  accessToken: 'a2',
  accessTokenExpiresAt: 0,
  refreshToken: 'r2',
  user: { id: 'u2' } as never,
  rememberMe: false,
}

describe('session reset', () => {
  it('the reset keeps auth and clears the other plain slices', () => {
    store.dispatch(addNotification({ type: 'success', title: 'keep?', message: 'no' }))
    store.dispatch(sessionEstablished(activeSession))
    expect(store.getState().notifications.notifications).toHaveLength(1)

    store.dispatch({ type: RESET_FOR_SESSION_END })
    const state = store.getState()
    expect(state.auth.sessionId).toBe('s2')
    expect(state.notifications.notifications).toHaveLength(0)
  })

  it('storageUnavailable is reflected in state', () => {
    store.dispatch(storageUnavailable())
    expect(store.getState().auth.storageUnavailable).toBe(true)
    store.dispatch(sessionEnded())
  })

  it('exposes every API slice by reducer key', () => {
    expect(apiReducerKeys().length).toBeGreaterThanOrEqual(13)
  })
})
