import React from 'react'
import { describe, it, expect, vi, afterEach, beforeAll, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '@/mocks/server'
import { loadApp, storedSession, type LoadAppOptions } from '@/session/__tests__/appHarness'

// The top bar's health indicator polls the server and expects its reply's shape.
vi.mock('@/components/common/SystemStatus', () => ({ default: () => null }))

// The application's own router, store and session runtime (appHarness replaces
// only IndexedDB and the network), started on a URL the way a tab is opened on
// it. The route is the protected branch's catch-all: the real `authLoader` and
// the real shell around a page that asks the server for nothing.
const PROTECTED_PATH = '/no-such-page'

let dispose: (() => void) | null = null

async function openTab(path: string, options: LoadAppOptions = {}) {
  window.history.replaceState(null, '', path)
  const app = await loadApp(options)
  await Promise.all([app.rehydrated(), app.sessionReady()])
  const { router } = await import('@/router')
  const { NotificationProvider } = await import('@/hooks/useNotification')
  dispose = () => router.dispose()
  // The first render waits for the loaders, as it does behind main.tsx's PersistGate.
  await vi.waitFor(() => expect(router.state.initialized).toBe(true))

  // Every location the router settles on, the first included.
  const visited: string[] = [router.state.location.pathname]
  let lastKey = router.state.location.key
  router.subscribe((state) => {
    if (state.navigation.state === 'idle' && state.location.key !== lastKey) {
      lastKey = state.location.key
      visited.push(state.location.pathname)
    }
  })

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <Provider store={app.store}>
      <QueryClientProvider client={queryClient}>
        <NotificationProvider>
          <RouterProvider router={router} />
        </NotificationProvider>
      </QueryClientProvider>
    </Provider>,
  )
  return { app, router, visited }
}

const signedIn = (): LoadAppOptions => ({ stored: { record: { revision: 1, session: storedSession() } } })

async function openSignedInTab(path = PROTECTED_PATH) {
  const tab = await openTab(path, signedIn())
  await screen.findByRole('heading', { name: /page not found/i })
  expect(document.querySelector('.app-shell-root')).not.toBeNull()
  expect(tab.app.store.getState().auth.isAuthenticated).toBe(true)
  return tab
}

// The login page asks one public question when it mounts (whether to show the
// default credentials), through bare axios: no session gate, no token. It is the
// only request that reaches the network here; everything sent through the
// application's clients is in `app.requests`.
let publicRequests: Request[] = []

type EnvWindow = { __ENV__?: { VITE_API_BASE_URL?: string } }

beforeEach(() => {
  publicRequests = []
  // Same-origin API, as behind NGINX.
  ;(window as unknown as EnvWindow).__ENV__ = { VITE_API_BASE_URL: '/api' }
  server.use(
    http.get('*/auth/show-default-credentials', ({ request }) => {
      publicRequests.push(request)
      return HttpResponse.json({ showDefaultCredentials: false })
    }),
  )
})

// The login page, mounted once: its form is up and its one request was made.
const loginForm = async () => {
  const submit = await screen.findByRole('button', { name: /sign in/i })
  await waitFor(() => expect(publicRequests).toHaveLength(1))
  expect(publicRequests[0].headers.get('authorization')).toBeNull()
  return submit
}
const pathname = () => window.location.pathname

// The first import of the route tree is transformed here, under its own time
// limit, rather than inside whichever test happens to run first.
beforeAll(async () => {
  const app = await loadApp()
  await Promise.all([app.rehydrated(), app.sessionReady()])
  const { router } = await import('@/router')
  router.dispose()
  vi.doUnmock('@/session/store/indexedDbSessionStore')
}, 120_000)

afterEach(() => {
  dispose?.()
  dispose = null
  vi.doUnmock('@/session/store/indexedDbSessionStore')
  sessionStorage.clear()
  delete (window as unknown as EnvWindow).__ENV__
  window.history.replaceState(null, '', '/')
})

describe('a tab whose session ends', () => {
  it('a tab on a protected route is taken to /login when its session ends elsewhere', async () => {
    const { app, visited } = await openSignedInTab()
    const sent = app.requests.length
    const entries = window.history.length

    const other = await app.otherTab()
    await other.runtime.signOut()
    await act(async () => {
      await app.sessionRuntime.reconcileNow()
    })

    await loginForm()
    expect(pathname()).toBe('/login')
    expect(document.querySelector('.app-shell-root')).toBeNull()
    expect(visited).toEqual([PROTECTED_PATH, '/login'])
    // Replaced, not pushed: Back does not return to the page the tab was on.
    expect(window.history.length).toBe(entries)
    expect(app.requests).toHaveLength(sent)
  })

  it('the same when the ending is failure-driven', async () => {
    const { app, visited } = await openSignedInTab()
    const sent = app.requests.length

    // The final retry's 401: the session ends at the generation it captured.
    const { ref } = await app.sessionRuntime.beginRequest()
    await act(async () => {
      expect(await app.sessionRuntime.endAfterFinalUnauthorized(ref)).toBe('ended')
    })

    await loginForm()
    expect(pathname()).toBe('/login')
    expect(visited).toEqual([PROTECTED_PATH, '/login'])
    expect(app.requests).toHaveLength(sent)
  })

  it('the same when it is learned on resume (visibilitychange)', async () => {
    const { app, visited } = await openSignedInTab()
    const sent = app.requests.length

    const other = await app.otherTab()
    await other.runtime.signOut()
    expect(document.visibilityState).toBe('visible')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await loginForm()
    expect(pathname()).toBe('/login')
    expect(visited).toEqual([PROTECTED_PATH, '/login'])
    expect(app.requests).toHaveLength(sent)
  })

  it('a signed-out tab on /login is not redirected again', async () => {
    const { app, visited } = await openSignedInTab()
    const other = await app.otherTab()
    await other.runtime.signOut()
    await act(async () => {
      await app.sessionRuntime.reconcileNow()
    })
    await loginForm()

    // Everything that reconciles a tab, again, now that it is signed out.
    await act(async () => {
      await app.sessionRuntime.reconcileNow()
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('pageshow'))
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(visited).toEqual([PROTECTED_PATH, '/login'])
    expect(pathname()).toBe('/login')
    // Still the one login page: it was not mounted a second time.
    expect(await loginForm()).toBeInTheDocument()
  })

  it('a tab opened signed-out on /login stays there', async () => {
    const { visited } = await openTab('/login')
    await loginForm()
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(visited).toEqual(['/login'])
  })

  it('explicit sign-out still ends on /login exactly once', async () => {
    const { app, visited } = await openSignedInTab()
    const entries = window.history.length
    const user = userEvent.setup()

    await user.click(screen.getAllByRole('button', { name: /user menu/i })[0])
    await user.click(await screen.findByRole('menuitem', { name: /logout/i }))

    await loginForm()
    await waitFor(() => expect(app.shared.state.record.session).toBeNull())
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(pathname()).toBe('/login')
    expect(screen.getAllByRole('button', { name: /sign in/i })).toHaveLength(1)
    // The session ending and the button both navigate; the router settles on
    // the login page once, and Back holds no second copy of it.
    expect(visited).toEqual([PROTECTED_PATH, '/login'])
    expect(window.history.length).toBeLessThanOrEqual(entries + 1)
    expect(app.requests.filter((r) => r.url === '/auth/logout')).toHaveLength(1)
  })
})

describe('the mandatory password-change page', () => {
  const PAGE = '/change-password-required'
  const pageHeading = () => screen.findByRole('heading', { name: /password change required/i })

  async function openPage() {
    const tab = await openTab(PAGE, signedIn())
    await pageHeading()
    return tab
  }

  it('is left for /login when its session ends elsewhere', async () => {
    const { app, visited } = await openPage()
    const sent = app.requests.length
    const entries = window.history.length

    const other = await app.otherTab()
    await other.runtime.signOut()
    await act(async () => {
      await app.sessionRuntime.reconcileNow()
    })

    await loginForm()
    expect(pathname()).toBe('/login')
    expect(screen.queryByRole('button', { name: /change password/i })).not.toBeInTheDocument()
    expect(visited).toEqual([PAGE, '/login'])
    expect(window.history.length).toBe(entries)
    expect(app.requests).toHaveLength(sent)
  })

  it('the same when it is learned on resume (visibilitychange)', async () => {
    const { app, visited } = await openPage()
    const sent = app.requests.length

    const other = await app.otherTab()
    await other.runtime.signOut()
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await loginForm()
    expect(pathname()).toBe('/login')
    expect(visited).toEqual([PAGE, '/login'])
    expect(app.requests).toHaveLength(sent)
  })

  it('opened signed-out, it redirects to /login', async () => {
    const { app, visited } = await openTab(PAGE)

    await loginForm()
    expect(pathname()).toBe('/login')
    expect(visited).toEqual(['/login'])
    expect(screen.queryByRole('heading', { name: /password change required/i })).not.toBeInTheDocument()
    expect(app.requests).toHaveLength(0)
  })

  it('its Logout button ends on /login exactly once', async () => {
    const { app, visited } = await openPage()

    fireEvent.click(screen.getByRole('button', { name: /^logout$/i }))

    await loginForm()
    await waitFor(() => expect(app.shared.state.record.session).toBeNull())
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(visited).toEqual([PAGE, '/login'])
    expect(app.requests.filter((r) => r.url === '/auth/logout')).toHaveLength(1)
  })

  it('a successful change shows its confirmation, then ends on /login exactly once', async () => {
    const { app, visited } = await openPage()
    const sent = app.requests.length

    fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'OldPass@123' } })
    fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'NewPass@123' } })
    fireEvent.change(screen.getByLabelText(/confirm/i), { target: { value: 'NewPass@123' } })
    fireEvent.click(screen.getByRole('button', { name: /change password/i }))

    // The change revokes every session, this tab's included. The page keeps its
    // confirmation on screen; the ended session does not take it away early.
    expect(await screen.findByText(/password changed successfully/i)).toBeInTheDocument()
    expect(app.store.getState().auth.isAuthenticated).toBe(false)
    expect(app.shared.state.record.session).toBeNull()
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300))
    })
    expect(screen.getByText(/password changed successfully/i)).toBeInTheDocument()
    expect(pathname()).toBe(PAGE)
    expect(visited).toEqual([PAGE])

    await waitFor(() => expect(pathname()).toBe('/login'), { timeout: 4000 })
    await loginForm()
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })
    expect(visited).toEqual([PAGE, '/login'])
    expect(screen.getAllByRole('button', { name: /sign in/i })).toHaveLength(1)
    expect(app.requests.slice(sent).map((r) => r.url)).toEqual(['/auth/change-password'])
  })

  it('a change refused because the session ended elsewhere goes to /login', async () => {
    const { app, visited } = await openPage()
    const sent = app.requests.length
    // The page logs the failure it is about to act on.
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const other = await app.otherTab()
    await other.runtime.signOut()

    fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'OldPass@123' } })
    fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'NewPass@123' } })
    fireEvent.change(screen.getByLabelText(/confirm/i), { target: { value: 'NewPass@123' } })
    fireEvent.click(screen.getByRole('button', { name: /change password/i }))

    // Validation, the refused request and the navigation each take a turn.
    await waitFor(() => expect(pathname()).toBe('/login'), { timeout: 5000 })
    await loginForm()
    expect(visited).toEqual([PAGE, '/login'])
    // The request was refused at the gate: nothing was sent.
    expect(app.requests).toHaveLength(sent)
    expect(logged).toHaveBeenCalledTimes(1)
    logged.mockRestore()
  })
})

describe('storage did not answer at start', () => {
  const waitingText = /still waiting for this browser\u2019s session storage\. another tab may be busy\./i
  const unavailableText = /this browser cannot store your session safely/i
  const busy = (stored: LoadAppOptions['stored'] = signedIn().stored): LoadAppOptions => ({ storage: 'busy', stored })
  const tryAgain = () => screen.getByRole('button', { name: /try again/i })

  it.each([PROTECTED_PATH, '/login', '/change-password-required'])(
    'the waiting screen takes the place of %s and no request is sent',
    async (path) => {
      const { app, visited } = await openTab(path, busy())

      expect(await screen.findByText(waitingText)).toBeInTheDocument()
      expect(tryAgain()).toBeEnabled()
      // Not the sign-in form: storage has not said that nobody is signed in.
      expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /change password/i })).not.toBeInTheDocument()
      expect(document.querySelector('form')).toBeNull()
      // Not the storage-unavailable message either: nothing was found broken.
      expect(screen.queryByText(unavailableText)).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /reload/i })).not.toBeInTheDocument()
      expect(document.querySelector('.app-shell-root')).toBeNull()
      expect(screen.queryByRole('heading', { name: /page not found/i })).not.toBeInTheDocument()

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50))
      })
      expect(app.store.getState().auth.storageWaiting).toBe(true)
      expect(app.store.getState().auth.storageUnavailable).toBe(false)
      expect(app.requests).toHaveLength(0)
      expect(publicRequests).toHaveLength(0)
      expect(visited).toEqual([path])
      expect(pathname()).toBe(path)
      // The stored session is untouched.
      expect(app.shared.state.record.session?.sessionId).toBe('sess-stored')
    },
  )

  it('Try again recovers the stored session where the tab was opened', async () => {
    const { app } = await openTab(PROTECTED_PATH, busy())
    await screen.findByText(waitingText)

    fireEvent.click(tryAgain())

    await screen.findByRole('heading', { name: /page not found/i })
    expect(document.querySelector('.app-shell-root')).not.toBeNull()
    expect(screen.queryByText(waitingText)).not.toBeInTheDocument()
    expect(app.store.getState().auth.isAuthenticated).toBe(true)
    expect(app.store.getState().auth.storageWaiting).toBe(false)
    expect(app.sessionRuntime.claim()).toBe('sess-stored')
    expect(pathname()).toBe(PROTECTED_PATH)
  })

  it('Try again with no session stored shows the sign-in form', async () => {
    const { app, visited } = await openTab(PROTECTED_PATH, busy({ record: { revision: 4, session: null } }))
    await screen.findByText(waitingText)

    fireEvent.click(tryAgain())

    await loginForm()
    expect(pathname()).toBe('/login')
    expect(visited).toEqual([PROTECTED_PATH, '/login'])
    expect(app.sessionRuntime.status()).toBe('signed-out')
    expect(app.requests).toHaveLength(0)
  })

  it('Try again while storage is still busy stays on the waiting screen', async () => {
    const { app, visited } = await openTab('/login', busy())
    await screen.findByText(waitingText)

    app.stillBusy()
    fireEvent.click(tryAgain())
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(screen.getByText(waitingText)).toBeInTheDocument()
    expect(tryAgain()).toBeEnabled()
    expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument()
    expect(app.sessionRuntime.status()).toBe('storage-waiting')
    expect(app.requests).toHaveLength(0)
    expect(publicRequests).toHaveLength(0)
    expect(visited).toEqual(['/login'])
  })

  it('Try again that finds storage broken shows the storage-unavailable screen', async () => {
    const { app } = await openTab(PROTECTED_PATH, busy())
    await screen.findByText(waitingText)

    const { StorageUnavailableError } = await import('@/session/types')
    app.failNextRead(new StorageUnavailableError('read failed'))
    fireEvent.click(tryAgain())

    expect(await screen.findByText(unavailableText)).toBeInTheDocument()
    expect(screen.queryByText(waitingText)).not.toBeInTheDocument()
    expect(app.sessionRuntime.status()).toBe('storage-unavailable')
    expect(app.requests).toHaveLength(0)
  })

  it('a resume retries by itself', async () => {
    const { app } = await openTab(PROTECTED_PATH, busy())
    await screen.findByText(waitingText)

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await screen.findByRole('heading', { name: /page not found/i })
    expect(app.store.getState().auth.isAuthenticated).toBe(true)
  })

  it('a recovered session that must change its password is taken to that page, as at a normal start', async () => {
    const session = storedSession({ user: { id: 'u1', username: 'stored', requiresPasswordChange: true } as never })
    await openTab(PROTECTED_PATH, busy({ record: { revision: 1, session } }))
    await screen.findByText(waitingText)

    fireEvent.click(tryAgain())

    await screen.findByRole('heading', { name: /password change required/i })
    expect(pathname()).toBe('/change-password-required')
    expect(document.querySelector('.app-shell-root')).toBeNull()
  })
})

describe('storage unavailable', () => {
  const screenText = /this browser cannot store your session safely/i

  it('a protected route renders the storage-unavailable screen, not the shell, when IndexedDB cannot be opened', async () => {
    const { app } = await openTab(PROTECTED_PATH, { storage: 'unavailable' })

    expect(await screen.findByText(screenText)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument()
    expect(document.querySelector('.app-shell-root')).toBeNull()
    expect(screen.queryByRole('heading', { name: /page not found/i })).not.toBeInTheDocument()
    expect(app.store.getState().auth.storageUnavailable).toBe(true)
    expect(pathname()).toBe(PROTECTED_PATH)
  })

  it.each(['/login', '/change-password-required'])(
    '%s renders the storage-unavailable screen in place of its form',
    async (path) => {
      const { app } = await openTab(path, { storage: 'unavailable' })

      expect(await screen.findByText(screenText)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /change password/i })).not.toBeInTheDocument()
      // There is no form to submit, so no sign-in can reach the server.
      expect(document.querySelector('form')).toBeNull()
      expect(app.requests).toHaveLength(0)
      expect(pathname()).toBe(path)
    },
  )

  it('a sign-in form already on screen is replaced when storage becomes unavailable', async () => {
    const { app } = await openTab('/login')
    await loginForm()

    app.shared.closed = true
    await act(async () => {
      await expect(app.sessionRuntime.reconcileNow()).rejects.toThrow()
    })

    expect(await screen.findByText(screenText)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument()
    expect(document.querySelector('form')).toBeNull()
  })

  it('a tab that loses storage mid-session replaces the shell with the screen', async () => {
    const { app, visited } = await openSignedInTab()

    // The database closes under the tab; its next request finds out.
    app.shared.closed = true
    const { ApiService } = await import('@/services/api')
    await act(async () => {
      await expect(ApiService.get('/products')).rejects.toThrow()
    })

    expect(await screen.findByText(screenText)).toBeInTheDocument()
    expect(app.sessionRuntime.status()).toBe('storage-unavailable')
    expect(document.querySelector('.app-shell-root')).toBeNull()
    expect(screen.queryByRole('heading', { name: /page not found/i })).not.toBeInTheDocument()
    // The message replaces the page where the tab is; it is not sent to sign in.
    expect(visited).toEqual([PROTECTED_PATH])
    expect(pathname()).toBe(PROTECTED_PATH)
  })

  it('no authenticated request is sent in that state', async () => {
    const { app } = await openSignedInTab()
    const sent = app.requests.length

    app.shared.closed = true
    const { ApiService } = await import('@/services/api')
    await act(async () => {
      await expect(ApiService.get('/products')).rejects.toThrow()
    })
    await screen.findByText(screenText)
    await act(async () => {
      await expect(ApiService.get('/products')).rejects.toThrow()
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(app.requests).toHaveLength(sent)
  })
})
