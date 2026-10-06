import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
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

const loginForm = () => screen.findByRole('button', { name: /sign in/i })
const pathname = () => window.location.pathname

afterEach(() => {
  dispose?.()
  dispose = null
  vi.doUnmock('@/session/store/indexedDbSessionStore')
  sessionStorage.clear()
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
