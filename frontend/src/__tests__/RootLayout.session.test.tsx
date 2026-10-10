import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { loadApp, storedSession, type LoadAppOptions } from '@/session/__tests__/appHarness'
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

  // A reload behind a tab paused mid-transaction: the start-up read times out,
  // so storage has not said whether the session this tab had is still stored.
  describe('when storage did not answer at start', () => {
    const waitingText = /still waiting for this browser\u2019s session storage/i

    async function renderWaiting(stored: LoadAppOptions['stored']) {
      const key = storeDraft('u1')
      const app = await loadApp({ storage: 'busy', stored })
      await Promise.all([app.rehydrated(), app.sessionReady()])
      expect(app.sessionRuntime.status()).toBe('storage-waiting')

      const { default: RootLayout } = await import('@/RootLayout')
      render(
        <Provider store={app.store}>
          <MemoryRouter>
            <RootLayout />
          </MemoryRouter>
        </Provider>
      )
      await screen.findByText(waitingText)
      return { app, key }
    }

    const tryAgain = () => fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    const withSession = { record: { revision: 1, session: storedSession() } }

    it('a tab that starts waiting keeps its drafts', async () => {
      const { app, key } = await renderWaiting(withSession)

      // Effects have run and the waiting screen is still what is shown.
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20))
      })
      expect(screen.getByText(waitingText)).toBeInTheDocument()
      expect(app.store.getState().auth.isAuthenticated).toBe(false)
      expect(app.store.getState().auth.storageWaiting).toBe(true)
      expect(sessionStorage.getItem(key)).not.toBeNull()
    })

    it('retry finds the session: the draft is still there and the tab is signed in', async () => {
      const { app, key } = await renderWaiting(withSession)

      tryAgain()

      await waitFor(() => expect(app.store.getState().auth.isAuthenticated).toBe(true))
      await waitFor(() => expect(screen.queryByText(waitingText)).not.toBeInTheDocument())
      expect(app.sessionRuntime.status()).toBe('signed-in')
      expect(app.sessionRuntime.claim()).toBe('sess-stored')
      expect(sessionStorage.getItem(key)).not.toBeNull()
    })

    it('retry finds no session: the tab is signed-out and the draft is cleared', async () => {
      const { app, key } = await renderWaiting({ record: { revision: 4, session: null } })
      expect(sessionStorage.getItem(key)).not.toBeNull()

      tryAgain()

      await waitFor(() => expect(sessionStorage.getItem(key)).toBeNull())
      expect(app.sessionRuntime.status()).toBe('signed-out')
      expect(app.store.getState().auth.isAuthenticated).toBe(false)
      expect(app.store.getState().auth.storageWaiting).toBe(false)
    })

    it('a retry that times out again still keeps the draft', async () => {
      const { app, key } = await renderWaiting(withSession)

      app.stillBusy()
      tryAgain()
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20))
      })

      expect(app.sessionRuntime.status()).toBe('storage-waiting')
      expect(screen.getByText(waitingText)).toBeInTheDocument()
      expect(sessionStorage.getItem(key)).not.toBeNull()
    })

    // The same as a tab that finds storage unusable at start: it holds no
    // session and cannot learn of one, so it is not kept as signed-in work.
    it('retry finds storage unusable: the draft is cleared, as at a start without storage', async () => {
      const { app, key } = await renderWaiting(withSession)

      const { StorageUnavailableError } = await import('@/session/types')
      app.failNextRead(new StorageUnavailableError('read failed'))
      tryAgain()

      await waitFor(() => expect(sessionStorage.getItem(key)).toBeNull())
      expect(app.sessionRuntime.status()).toBe('storage-unavailable')
    })

    // An error that is neither a timeout nor the storage-unavailable class
    // still did not say "no session". The tab fails closed, and failing closed
    // costs the drafts: this is the deliberate loss, not an oversight.
    it('a retry that fails with an unclassified error: storage-unavailable, no sign-in form, and the draft is lost', async () => {
      const { app, key } = await renderWaiting(withSession)
      expect(sessionStorage.getItem(key)).not.toBeNull()

      app.failNextRead(new Error('something else'))
      tryAgain()

      await waitFor(() => expect(sessionStorage.getItem(key)).toBeNull())
      expect(app.sessionRuntime.status()).toBe('storage-unavailable')
      expect(app.store.getState().auth.storageUnavailable).toBe(true)
      expect(app.store.getState().auth.storageWaiting).toBe(false)
      expect(await screen.findByText(/cannot store your session/i)).toBeInTheDocument()
      expect(document.querySelector('form')).toBeNull()
    })

    it('a start whose read fails with an unclassified error: the same, and the draft is lost', async () => {
      const key = storeDraft('u1')
      const app = await loadApp({ storage: 'failing', stored: withSession })
      await Promise.all([app.rehydrated(), app.sessionReady()])
      const { default: RootLayout } = await import('@/RootLayout')
      render(
        <Provider store={app.store}>
          <MemoryRouter>
            <RootLayout />
          </MemoryRouter>
        </Provider>
      )
      await waitFor(() => expect(sessionStorage.getItem(key)).toBeNull())
      expect(app.sessionRuntime.status()).toBe('storage-unavailable')
      expect(app.store.getState().auth.storageUnavailable).toBe(true)
      expect(await screen.findByText(/cannot store your session/i)).toBeInTheDocument()
      expect(document.querySelector('form')).toBeNull()
    })

    it('a tab that finds storage unusable at start clears its drafts', async () => {
      const key = storeDraft('u1')
      const app = await loadApp({ storage: 'unavailable' })
      await Promise.all([app.rehydrated(), app.sessionReady()])
      const { default: RootLayout } = await import('@/RootLayout')
      render(
        <Provider store={app.store}>
          <MemoryRouter>
            <RootLayout />
          </MemoryRouter>
        </Provider>
      )
      await waitFor(() => expect(sessionStorage.getItem(key)).toBeNull())
      expect(app.sessionRuntime.status()).toBe('storage-unavailable')
    })
  })
})
