import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { loadApp, storedSession } from '@/session/__tests__/appHarness'
import { draftKey } from '@/pages/accounting/bank-reconciliations/reconciliationDraftStorage'

const idleHandlers: { onTimeout?: () => void } = {}
vi.mock('@/hooks/useIdleTimer', () => ({
  useIdleTimer: (opts: { onTimeout: () => void }) => {
    idleHandlers.onTimeout = opts.onTimeout
    return { remainingTime: 0, reset: vi.fn() }
  },
}))

vi.mock('@/hooks/useRegionalSettings', () => ({ useRegionalSettings: vi.fn() }))

// RootLayout on the application's own store and session runtime, signed in from
// the stored record. Only IndexedDB and the network are replaced (appHarness).
async function renderSignedIn() {
  const session = storedSession()
  const app = await loadApp({ stored: { record: { revision: 1, session } } })
  await Promise.all([app.rehydrated(), app.sessionReady()])
  expect(app.store.getState().auth.isAuthenticated).toBe(true)

  const { default: RootLayout } = await import('@/RootLayout')
  render(
    <Provider store={app.store}>
      <MemoryRouter>
        <RootLayout />
      </MemoryRouter>
    </Provider>
  )
  return { app, session }
}

afterEach(() => {
  vi.doUnmock('@/session/store/indexedDbSessionStore')
  sessionStorage.clear()
  idleHandlers.onTimeout = undefined
})

describe('RootLayout idle timeout', () => {
  it('calls sessionRuntime.signOut on idle timeout', async () => {
    const { app } = await renderSignedIn()
    const signOut = vi.spyOn(app.sessionRuntime, 'signOut')
    await waitFor(() => expect(idleHandlers.onTimeout).toBeDefined())
    await act(async () => {
      idleHandlers.onTimeout?.()
    })
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(app.store.getState().auth.isAuthenticated).toBe(false))
  })

  it('renders its outlet content container', async () => {
    await renderSignedIn()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })
})

describe('RootLayout reconciliation drafts', () => {
  const storeDraft = (userId: string) => {
    const key = draftKey(userId, { reconciliationId: 'rec-1' })
    sessionStorage.setItem(key, JSON.stringify({ v: 1, lockVersion: 1, form: {}, picker: {}, savedAt: 'now' }))
    return key
  }

  it('drafts are cleared when a tab ends locally', async () => {
    const { app, session } = await renderSignedIn()
    const key = storeDraft(session.user.id)
    // A signed-in tab keeps its drafts.
    await act(async () => {
      await app.sessionRuntime.reconcileNow()
    })
    expect(sessionStorage.getItem(key)).not.toBeNull()

    // The session ends in another tab; this one finds out when it reconciles.
    const other = await app.otherTab()
    await other.runtime.signOut()
    expect(app.shared.state.record.session).toBeNull()
    expect(app.store.getState().auth.isAuthenticated).toBe(true)

    await act(async () => {
      await app.sessionRuntime.reconcileNow()
    })

    expect(app.sessionRuntime.claim()).toBeNull()
    expect(app.store.getState().auth.isAuthenticated).toBe(false)
    expect(sessionStorage.getItem(key)).toBeNull()
  })

  it('a tab that learns on resume clears its drafts', async () => {
    const { app, session } = await renderSignedIn()
    const key = storeDraft(session.user.id)
    const other = await app.otherTab()
    await other.runtime.signOut()
    expect(sessionStorage.getItem(key)).not.toBeNull()

    expect(document.visibilityState).toBe('visible')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => expect(sessionStorage.getItem(key)).toBeNull())
    expect(app.store.getState().auth.isAuthenticated).toBe(false)
    // Ending locally writes nothing and calls no server: the only request was
    // the other tab's own logout.
    expect(app.requests).toHaveLength(0)
    expect(other.calls).toEqual(['logout'])
  })
})
