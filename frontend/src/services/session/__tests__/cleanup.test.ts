import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query'
import { afterEach, expect, it, vi } from 'vitest'
import { createTestStore } from '@/test/createTestStore'
import authReducer, { setCredentials } from '@/store/slices/authSlice'
import notificationReducer, { addNotification } from '@/store/slices/notificationSlice'
import { draftKey } from '@/pages/accounting/bank-reconciliations/reconciliationDraftStorage'
import { createSessionCleanup } from '../cleanup'
import type { Session } from '../storage'

const firstApi = createApi({
  reducerPath: 'firstApi', baseQuery: fakeBaseQuery(),
  endpoints: builder => ({ privateData: builder.query<string, void>({ queryFn: () => ({ data: 'first private result' }) }) }),
})
const secondApi = createApi({
  reducerPath: 'secondApi', baseQuery: fakeBaseQuery(),
  endpoints: builder => ({ privateData: builder.query<string, void>({ queryFn: () => ({ data: 'second private result' }) }) }),
})
const session: Session = {
  id: 'replacement', accessToken: 'access', refreshToken: 'refresh', rememberMe: false, lastActivity: 10,
  user: { id: 'alice', username: 'alice', email: 'alice@example.com', firstName: 'Alice', lastName: 'User',
    role: 'admin', status: 'active', isActive: true, failedLoginAttempts: 0, createdAt: '2026-10-31', updatedAt: '2026-10-31' },
}

afterEach(() => vi.unstubAllGlobals())

it.each([null, session])('clears all old Session data and navigates only for sign-out: %s', async next => {
  const apis = [firstApi, secondApi]
  const store = createTestStore({ apis, reducer: { auth: authReducer, notifications: notificationReducer } })
  store.dispatch(setCredentials({ ...session, expiresIn: 900 }))
  store.dispatch(addNotification({ type: 'info', title: 'Private notice', message: 'Old user data' }))
  await store.dispatch(firstApi.endpoints.privateData.initiate(undefined, { subscribe: false }))
  await store.dispatch(secondApi.endpoints.privateData.initiate(undefined, { subscribe: false }))
  expect(firstApi.endpoints.privateData.select()(store.getState()).data).toBe('first private result')
  expect(secondApi.endpoints.privateData.select()(store.getState()).data).toBe('second private result')
  const drafts = new Map([
    [draftKey('alice', { reconciliationId: 'one' }), 'private draft'],
    [draftKey('bob', { createToken: 'two' }), 'another draft'],
    ['unrelated', 'keep'],
  ])
  vi.stubGlobal('sessionStorage', {
    get length() { return drafts.size },
    key: (index: number) => [...drafts.keys()][index] ?? null,
    removeItem: (key: string) => drafts.delete(key),
  })
  const expectCleared = () => {
    expect(store.getState().auth).toMatchObject({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false })
    expect(store.getState().notifications).toEqual({ notifications: [], unreadCount: 0 })
    expect([...drafts]).toEqual([['unrelated', 'keep']])
    expect(firstApi.endpoints.privateData.select()(store.getState()).isUninitialized).toBe(true)
    expect(secondApi.endpoints.privateData.select()(store.getState()).isUninitialized).toBe(true)
  }
  const assign = vi.fn(() => expectCleared())
  vi.stubGlobal('window', { location: { assign } })

  createSessionCleanup(store, apis)(next)

  expectCleared()
  if (next === null) expect(assign).toHaveBeenCalledExactlyOnceWith('/login')
  else expect(assign).not.toHaveBeenCalled()
})
