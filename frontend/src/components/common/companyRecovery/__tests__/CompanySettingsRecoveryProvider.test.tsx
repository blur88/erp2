import { act, fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import api from '@/services/api'
import { registerSessionRuntime } from '@/session/registry'
import { createHarness } from '@/session/__tests__/twoTabs'
import { createAuthHttp } from '@/session/authHttp'
import { createSessionRuntime } from '@/session/runtime'
import { createMemorySessionStore, createSharedMemory } from '@/session/store/memorySessionStore'
import { StorageTimeoutError } from '@/session/types'
import { settingsApiSlice } from '@/store/api/settingsApi'
import authReducer, { sessionEnded, sessionEstablished, storageWaiting as storageWaitingAction, tokensUpdated } from '@/store/slices/authSlice'
import { createTestStore } from '@/test/createTestStore'
import { CompanySettingsRecoveryProvider, useCompanySettingsRecovery } from '../CompanySettingsRecoveryProvider'

type Config = InternalAxiosRequestConfig

// The provider on the real endpoint, the real auth slice and the real session
// runtime; the axios adapter is the ingress and counts what went out. Reads and
// refreshes are counted apart: what recovery bounds is attempts, not requests.
describe('CompanySettingsRecoveryProvider', () => {
  let sent: Config[]
  let store: ReturnType<typeof createTestStore>
  let harness: ReturnType<typeof createHarness>
  let tab: ReturnType<ReturnType<typeof createHarness>['createTab']>

  const reads = () => sent.filter((c) => c.url === '/settings/company')
  const refreshes = () => sent.filter((c) => c.url === '/auth/refresh')

  const ok = (config: Config, name = 'Acme Trading') => ({
    data: { data: { id: 'c1', name } },
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  })

  const status = (config: Config, code: number) =>
    Promise.reject(
      new AxiosError(`status ${code}`, AxiosError.ERR_BAD_RESPONSE, config, null, {
        data: '',
        status: code,
        statusText: '',
        headers: {},
        config,
      }),
    )

  const netError = (config: Config) =>
    Promise.reject(new AxiosError('Network Error', AxiosError.ERR_NETWORK, config, null, undefined))

  const timeout = (config: Config) =>
    Promise.reject(new AxiosError('timeout of 30000ms exceeded', AxiosError.ECONNABORTED, config, null, undefined))

  /** Answers each read with `answer(readNumber, config)`. */
  const serveReads = (answer: (n: number, config: Config) => unknown) => {
    api.defaults.adapter = (async (config: Config) => {
      sent.push(config)
      return answer(reads().length, config)
    }) as never
  }

  const alwaysFail = (fail: (config: Config) => unknown) => serveReads((_n, config) => fail(config))

  const seedAuth = (sessionId = 'sess-1') => {
    store.dispatch(
      sessionEstablished({
        sessionId,
        generation: 1,
        accessToken: 'at-1',
        accessTokenExpiresAt: Date.now() + 3_600_000,
        refreshToken: 'rt-1',
        user: { id: 'u', username: 'u', role: 'sales_staff' } as never,
        rememberMe: true,
      }),
    )
  }

  const signIn = (sessionId: string) => {
    store.dispatch(
      sessionEstablished({
        sessionId,
        generation: 1,
        accessToken: 'at-1',
        accessTokenExpiresAt: Date.now() + 3_600_000,
        refreshToken: 'rt-1',
        user: { id: 'u', username: 'u', role: 'sales_staff' } as never,
        rememberMe: true,
      }),
    )
  }

  const renew = (accessToken = 'at-2') =>
    act(() => {
      store.dispatch(
        tokensUpdated({
          generation: 2,
          accessToken,
          accessTokenExpiresAt: Date.now() + 3_600_000,
          refreshToken: 'rt-2',
        }),
      )
    })

  const Probe = () => {
    const { company, unavailable, retrying, canRetry, retry } = useCompanySettingsRecovery()
    return (
      <div>
        <span data-testid="name">{company?.name ?? ''}</span>
        <span data-testid="unavailable">{String(unavailable)}</span>
        <span data-testid="retrying">{String(retrying)}</span>
        <span data-testid="can-retry">{String(canRetry)}</span>
        <button type="button" disabled={!canRetry} onClick={retry}>
          Retry
        </button>
      </div>
    )
  }

  const mount = () =>
    render(
      <Provider store={store}>
        <CompanySettingsRecoveryProvider>
          <Probe />
        </CompanySettingsRecoveryProvider>
      </Provider>,
    )

  const name = () => screen.getByTestId('name').textContent
  const unavailable = () => screen.getByTestId('unavailable').textContent
  const retrying = () => screen.getByTestId('retrying').textContent
  const canRetry = () => screen.getByTestId('can-retry').textContent
  const retryButton = () => screen.getByRole('button', { name: 'Retry' })
  // A real click, without userEvent's own timers: this file drives the clock.
  const clickRetry = async () => {
    await act(async () => {
      fireEvent.click(retryButton())
      await vi.advanceTimersByTimeAsync(0)
    })
    await settled()
  }

  const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))
  const settled = () => act(async () => { await vi.advanceTimersByTimeAsync(0) })

  const setVisibility = (value: 'visible' | 'hidden') => {
    Object.defineProperty(document, 'visibilityState', { value, configurable: true, writable: true })
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
  }

  beforeEach(async () => {
    vi.useFakeTimers()
    sent = []
    store = createTestStore({ apis: [settingsApiSlice], reducer: { auth: authReducer } })
    harness = createHarness()
    tab = harness.createTab('A')
    await tab.runtime.start()
    await tab.runtime.signIn({ usernameOrEmail: 'u', password: 'p' })
    registerSessionRuntime(tab.runtime)
    // The runtime's events are what the application wires to Redux; a renewal is
    // a real one, dispatched as the application dispatches it.
    tab.events.tokensUpdated.mockImplementation((tokens: never) => {
      store.dispatch(tokensUpdated(tokens))
    })
    tab.events.sessionEnded.mockImplementation(() => {
      store.dispatch(sessionEnded())
      store.dispatch(settingsApiSlice.util.resetApiState())
    })
    vi.spyOn(Math, 'random').mockReturnValue(0)
    seedAuth()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('scenario 1: a transient failure recovers without a reload', () => {
    it('1: the first read fails, the second is answered', async () => {
      serveReads((n, config) => (n === 1 ? netError(config) : ok(config)))

      mount()
      await settled()

      // No company and no warning either: recovery is running.
      expect(name()).toBe('')
      expect(unavailable()).toBe('false')
      expect(reads()).toHaveLength(1)

      await advance(2000)
      await settled()

      expect(name()).toBe('Acme Trading')
      expect(unavailable()).toBe('false')
      expect(reads()).toHaveLength(2)
      expect(refreshes()).toHaveLength(0)
    })

    it('2: the first two fail, the third is answered', async () => {
      serveReads((n, config) => (n < 3 ? timeout(config) : ok(config)))

      mount()
      await settled()
      expect(reads()).toHaveLength(1)

      await advance(2000)
      await settled()
      expect(reads()).toHaveLength(2)
      expect(unavailable()).toBe('false')

      await advance(6000)
      await settled()

      expect(name()).toBe('Acme Trading')
      expect(unavailable()).toBe('false')
      expect(reads()).toHaveLength(3)
      expect(refreshes()).toHaveLength(0)
    })
  })

  describe('scenario 3: transient failures persist', () => {
    it.each([
      ['a network error', (config: Config) => netError(config)],
      ['a timeout', (config: Config) => timeout(config)],
      ['a 503', (config: Config) => status(config, 503)],
    ])('3: %s ends after exactly two automatic attempts', async (_label, answer) => {
      alwaysFail(answer)

      mount()
      await settled()
      await advance(2000)
      await settled()
      await advance(6000)
      await settled()

      expect(reads()).toHaveLength(3)
      expect(unavailable()).toBe('true')

      // Hiding and showing the tab sends nothing once the budget is spent.
      await advance(60_000)
      setVisibility('hidden')
      await advance(60_000)
      setVisibility('visible')
      await advance(60_000)
      setVisibility('hidden')
      setVisibility('visible')
      await settled()

      expect(reads()).toHaveLength(3)
    })
  })

  it('4: a read that fails after an earlier success keeps the branding shown', async () => {
    serveReads((n, config) => (n === 1 ? ok(config) : netError(config)))

    mount()
    await settled()
    expect(name()).toBe('Acme Trading')

    // An administrator's edit invalidates the read, and the refetch fails.
    act(() => {
      store.dispatch(settingsApiSlice.util.invalidateTags(['CompanySettings']))
    })
    await settled()
    expect(name()).toBe('Acme Trading')

    await advance(2000)
    await settled()
    await advance(6000)
    await settled()

    expect(unavailable()).toBe('true')
    // The strip shows over the branding that is still there.
    expect(name()).toBe('Acme Trading')
    // The first read, the invalidated one, and the cycle's two attempts.
    expect(reads()).toHaveLength(4)
  })

  describe('scenario 4: a read behind a failed refresh', () => {
    it.each([
      ['429', 429],
      ['503', 503],
    ])('5: the refresh failing with %s stops recovery at once', async (_label, code) => {
      serveReads((_n, config) => status(config, 401))
      await installRuntimeFailingRefresh(code)

      mount()
      await settled()

      expect(unavailable()).toBe('true')
      expect(reads()).toHaveLength(1)
      expect(refreshes()).toHaveLength(1)

      await advance(60_000)
      expect(reads()).toHaveLength(1)
      expect(refreshes()).toHaveLength(1)
    })

    it.each([
      ['a network error', () => new AxiosError('Network Error', AxiosError.ERR_NETWORK)],
      ['a timeout', () => new AxiosError('timeout', AxiosError.ECONNABORTED)],
    ])('5: the refresh failing with %s stops recovery at once', async (_label, makeError) => {
      serveReads((_n, config) => status(config, 401))
      await installRuntimeFailingRefresh(makeError())

      mount()
      await settled()

      expect(unavailable()).toBe('true')
      expect(reads()).toHaveLength(1)
      expect(refreshes()).toHaveLength(1)

      await advance(60_000)
      expect(reads()).toHaveLength(1)
      expect(refreshes()).toHaveLength(1)
    })
  })

  it('6: the 429 retries are exhausted, so recovery adds no attempts, and Retry and renewal still work', async () => {
    alwaysFail((config) => status(config, 429))

    mount()
    // The endpoint's own 429 retries: the first send plus three.
    await advance(5000)
    await settled()
    expect(unavailable()).toBe('true')
    expect(reads()).toHaveLength(4)
    expect(refreshes()).toHaveLength(0)

    await advance(60_000)
    expect(reads()).toHaveLength(4)

    serveReads((_n, config) => ok(config))
    await clickRetry()
    expect(name()).toBe('Acme Trading')
    expect(unavailable()).toBe('false')
    expect(reads()).toHaveLength(5)
  })

  describe('scenario 5: a token renewal', () => {
    it('7: stopped, three renewals in one tick make one read, and success clears', async () => {
      alwaysFail((config) => status(config, 503))
      mount()
      await settled()
      await advance(2000)
      await settled()
      await advance(6000)
      await settled()
      expect(unavailable()).toBe('true')
      const spent = reads().length

      serveReads((_n, config) => ok(config))
      renew('at-2')
      renew('at-3')
      renew('at-4')
      await settled()

      expect(reads()).toHaveLength(spent + 1)
      expect(name()).toBe('Acme Trading')
      expect(unavailable()).toBe('false')
    })

    it('8: hidden, a renewal waits for visibility and is then the one read', async () => {
      alwaysFail((config) => status(config, 503))
      mount()
      await settled()
      await advance(2000)
      await settled()
      await advance(6000)
      await settled()
      expect(unavailable()).toBe('true')
      const spent = reads().length

      serveReads((_n, config) => ok(config))
      setVisibility('hidden')
      renew('at-2')
      await settled()
      expect(reads()).toHaveLength(spent)

      setVisibility('visible')
      await settled()
      expect(reads()).toHaveLength(spent + 1)

      // Shown again and hidden again, nothing more is owed.
      setVisibility('hidden')
      setVisibility('visible')
      await settled()
      expect(reads()).toHaveLength(spent + 1)
    })
  })

  it('9: a quiet re-read whose own 401 renews and which then fails must not start another read', async () => {
    // Stopped on a 503 first.
    alwaysFail((config) => status(config, 503))
    mount()
    await settled()
    await advance(2000)
    await settled()
    await advance(6000)
    await settled()
    expect(unavailable()).toBe('true')

    // The quiet re-read (read 4) is answered 401; the runtime behind it
    // refreshes and the refresh is answered 200, which is a renewal this very
    // read caused; the re-sent read (read 5) then fails 503.
    serveReads((n, config) => (n === 4 ? status(config, 401) : status(config, 503)))
    await installRuntimeRefreshingThrough()
    renew('at-2')
    await settled()
    await advance(1000)
    await settled()

    // The first read and its two automatic attempts, the quiet re-read, and the
    // re-sent read behind the refresh it caused: five, and one refresh.
    expect(reads()).toHaveLength(5)
    expect(refreshes()).toHaveLength(1)
    expect(unavailable()).toBe('true')
    const readCount = reads().length
    const refreshCount = refreshes().length

    await advance(60_000)
    expect(reads()).toHaveLength(readCount)
    expect(refreshes()).toHaveLength(refreshCount)

    // A later, separate renewal permits exactly one more.
    serveReads((_n, config) => ok(config))
    renew('at-9')
    await settled()
    expect(reads()).toHaveLength(readCount + 1)
  })

  describe('scenario 7: the tab becomes ineligible', () => {
    it('10: hidden mid-delay, the remaining delay resumes on becoming visible', async () => {
      let answered = false
      serveReads((n, config) => {
        answered = true
        return n <= 3 ? netError(config) : ok(config)
      })

      mount()
      await settled()
      expect(reads()).toHaveLength(1)

      await advance(500)
      setVisibility('hidden')
      await advance(30_000)
      expect(reads()).toHaveLength(1)

      // 1500 ms of the 2000 ms were left when the tab was hidden.
      setVisibility('visible')
      await advance(1499)
      expect(reads()).toHaveLength(1)
      await advance(2)
      await settled()
      expect(reads()).toHaveLength(2)

      // The budget was not reset: two attempts are still all this cycle has.
      await advance(6000)
      await settled()
      expect(reads()).toHaveLength(3)
      await advance(60_000)
      expect(reads()).toHaveLength(3)
      expect(unavailable()).toBe('true')
      expect(answered).toBe(true)
    })

    it('11: hidden before the first failure, no retry is sent until visible', async () => {
      alwaysFail((config) => netError(config))

      mount()
      setVisibility('hidden')
      await settled()
      await advance(30_000)
      expect(reads()).toHaveLength(1)

      setVisibility('visible')
      await advance(1999)
      expect(reads()).toHaveLength(1)
      await advance(2)
      await settled()
      expect(reads()).toHaveLength(2)
    })

    it('12: storage waiting pauses the delay and resuming sends the retry', async () => {
      alwaysFail((config) => netError(config))

      mount()
      await settled()
      await advance(500)
      act(() => {
        store.dispatch(storageWaitingAction(true))
      })
      await advance(30_000)
      expect(reads()).toHaveLength(1)

      act(() => {
        store.dispatch(storageWaitingAction(false))
      })
      await advance(1499)
      expect(reads()).toHaveLength(1)
      await advance(2)
      await settled()
      expect(reads()).toHaveLength(2)
    })

    it('12: a read rejected with a storage timeout is retried as transient', async () => {
      serveReads((n, config) => (n === 1 ? Promise.reject(new StorageTimeoutError('transaction timed out')) : ok(config)))

      mount()
      await settled()
      expect(unavailable()).toBe('false')

      await advance(2000)
      await settled()
      expect(reads()).toHaveLength(2)
      expect(name()).toBe('Acme Trading')
    })
  })

  describe('scenario 8: manual Retry', () => {
    const stopOn503 = async () => {
      alwaysFail((config) => status(config, 503))
      mount()
      await settled()
      await advance(2000)
      await settled()
      await advance(6000)
      await settled()
      expect(unavailable()).toBe('true')
      expect(canRetry()).toBe('true')
      return reads().length
    }

    it('13: it reads once, is disabled while pending, and clears on success', async () => {
      const spent = await stopOn503()

      serveReads((_n, config) => ok(config))
      let release = () => undefined
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      serveReads((_n, config) => held.then(() => ok(config)))

      await act(async () => {
        fireEvent.click(retryButton())
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(retrying()).toBe('true')
      expect(canRetry()).toBe('false')
      expect(retryButton()).toBeDisabled()

      // A second click while pending sends nothing.
      await act(async () => {
        fireEvent.click(retryButton())
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(reads()).toHaveLength(spent + 1)

      await act(async () => {
        release()
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(name()).toBe('Acme Trading')
      expect(unavailable()).toBe('false')
    })

    it('13: a transient failure starts a fresh cycle of two', async () => {
      const spent = await stopOn503()

      alwaysFail((config) => netError(config))
      await clickRetry()
      expect(reads()).toHaveLength(spent + 1)
      expect(unavailable()).toBe('false')

      await advance(2000)
      await settled()
      expect(reads()).toHaveLength(spent + 2)
      await advance(6000)
      await settled()
      expect(reads()).toHaveLength(spent + 3)
      expect(unavailable()).toBe('true')

      await advance(60_000)
      expect(reads()).toHaveLength(spent + 3)
    })

    it('13: a refresh-blocked failure stops again at once', async () => {
      const spent = await stopOn503()

      serveReads((_n, config) => status(config, 401))
      await installRuntimeFailingRefresh(429)
      await clickRetry()

      expect(unavailable()).toBe('true')
      expect(reads()).toHaveLength(spent + 1)
      expect(refreshes()).toHaveLength(1)

      await advance(60_000)
      expect(reads()).toHaveLength(spent + 1)
    })

    it.each([
      ['storage waiting', () => act(() => { store.dispatch(storageWaitingAction(true)) })],
      ['hidden', () => setVisibility('hidden')],
    ])('14: while %s, Retry is disabled and the handler sends nothing', async (_label, makeIneligible) => {
      const spent = await stopOn503()

      makeIneligible()
      await settled()
      expect(canRetry()).toBe('false')

      serveReads((_n, config) => ok(config))
      // The handler is guarded as well as the button: click it whatever the
      // disabled attribute says.
      await act(async () => {
        retryButton().removeAttribute('disabled')
        fireEvent.click(retryButton())
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(reads()).toHaveLength(spent)

      // Becoming eligible again sends nothing either: the refused call queued none.
      act(() => {
        store.dispatch(storageWaitingAction(false))
      })
      setVisibility('visible')
      await advance(60_000)
      expect(reads()).toHaveLength(spent)

      // And a Retry that is allowed works.
      await clickRetry()
      expect(reads()).toHaveLength(spent + 1)
      expect(name()).toBe('Acme Trading')
    })

    it('14: while storage is unavailable, Retry is disabled and the handler sends nothing', async () => {
      const spent = await stopOn503()

      // Storage found unusable ends the session in the slice, so there is no
      // later state here to retry from: what is asserted is that nothing is sent.
      act(() => {
        store.dispatch({ type: 'auth/storageUnavailable' })
      })
      await settled()
      expect(canRetry()).toBe('false')

      serveReads((_n, config) => ok(config))
      await act(async () => {
        retryButton().removeAttribute('disabled')
        fireEvent.click(retryButton())
        await vi.advanceTimersByTimeAsync(0)
      })
      setVisibility('hidden')
      setVisibility('visible')
      await advance(60_000)
      expect(reads()).toHaveLength(spent)
    })
  })

  describe('scenario 9: the session ends or changes', () => {
    const stopOn503 = async () => {
      alwaysFail((config) => status(config, 503))
      mount()
      await settled()
      await advance(2000)
      await settled()
      await advance(6000)
      await settled()
      expect(unavailable()).toBe('true')
    }

    it('15a: a session end during a delay clears everything and sends nothing more', async () => {
      alwaysFail((config) => netError(config))
      mount()
      await settled()
      expect(reads()).toHaveLength(1)

      await advance(500)
      act(() => {
        tab.events.sessionEnded('explicit')
      })
      await advance(60_000)

      expect(reads()).toHaveLength(1)
      expect(name()).toBe('')
      expect(unavailable()).toBe('false')
    })

    it('15a: a read in flight when the session ends cannot supply branding', async () => {
      let release = () => undefined
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      serveReads((n, config) => (n === 1 ? netError(config) : held.then(() => ok(config, 'Late Co'))))

      mount()
      await settled()
      await advance(2000)
      expect(reads()).toHaveLength(2)
      expect(retrying()).toBe('true')

      act(() => {
        tab.events.sessionEnded('explicit')
      })
      await act(async () => {
        release()
        await vi.advanceTimersByTimeAsync(0)
      })
      await advance(60_000)

      expect(name()).toBe('')
      expect(unavailable()).toBe('false')
    })

    it('15b: a direct session-id change hides the old branding and reads for the new session', async () => {
      serveReads((_n, config) => ok(config, 'Old Co'))
      mount()
      await settled()
      expect(name()).toBe('Old Co')

      // A direct change of session id, with no session end and no cache reset.
      serveReads((_n, config) => ok(config, 'New Co'))
      act(() => {
        signIn('sess-2')
      })

      // Not shown from the first render after the change, before the new
      // session's read has answered.
      expect(name()).not.toBe('Old Co')

      await settled()
      expect(reads()).toHaveLength(2)
      expect(name()).toBe('New Co')
    })

    it('15b: the new session\'s own read failing transiently shows no old branding', async () => {
      serveReads((_n, config) => ok(config, 'Old Co'))
      mount()
      await settled()
      expect(name()).toBe('Old Co')

      alwaysFail((config) => netError(config))
      signIn('sess-2')
      await settled()
      expect(name()).toBe('')

      await advance(2000)
      await settled()
      await advance(6000)
      await settled()
      expect(name()).toBe('')
      expect(unavailable()).toBe('true')
    })

    it('15c: a read in flight under the previous session cannot brand the new one', async () => {
      let release = () => undefined
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      // The first session's read is held; the new session's read is held too, so
      // the old answer is on its own in the cache when it lands.
      let releaseNew = () => undefined
      const heldNew = new Promise<void>((resolve) => {
        releaseNew = resolve
      })
      serveReads((n, config) => (n === 1 ? held.then(() => ok(config, 'Old Co')) : heldNew.then(() => ok(config, 'New Co'))))

      mount()
      expect(retrying()).toBe('true')

      signIn('sess-2')
      await settled()

      // The old request answers after the change, while the new session's own
      // read is still out.
      await act(async () => {
        release()
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(reads()).toHaveLength(2)

      // The old request's answer is in the cache now, and is not this session's.
      expect(name()).not.toBe('Old Co')

      await act(async () => {
        releaseNew()
        await vi.advanceTimersByTimeAsync(0)
      })
      await settled()
      // Only the new session's own answer is shown.
      expect(name()).toBe('New Co')
    })

    it('15d: a direct change while stopped clears the strip at once', async () => {
      alwaysFail((config) => netError(config))
      mount()
      await settled()
      await advance(2000)
      await settled()
      await advance(6000)
      await settled()
      expect(unavailable()).toBe('true')
      const spent = reads().length

      // The new session's own read is answered, so what is left to check is
      // that nothing the old session owed fires.
      serveReads((_n, config) => ok(config, 'New Co'))
      signIn('sess-2')
      await settled()

      expect(unavailable()).toBe('false')
      await advance(60_000)
      expect(reads()).toHaveLength(spent + 1)
      expect(name()).toBe('New Co')
    })

    it('15d: a direct change while waiting never lets the pending delay fire', async () => {
      alwaysFail((config) => netError(config))
      mount()
      await settled()
      await advance(500)
      expect(reads()).toHaveLength(1)

      serveReads((_n, config) => ok(config, 'New Co'))
      signIn('sess-2')
      await settled()
      expect(name()).toBe('New Co')

      // 1500 ms of the old delay were left; it never fires for this session.
      await advance(60_000)
      expect(reads()).toHaveLength(2)
    })
  })

  describe('scenario 13, Review Focus 4: another reader of the same query', () => {
    it('16: its read is sent, and a failure while stopped starts no cycle of its own', async () => {
      await stopReadingOn503()

      let release = () => undefined
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      alwaysFail((config) => held.then(() => netError(config)))

      const other = store.dispatch(settingsApiSlice.endpoints.getCompanySettings.initiate())
      await settled()
      const spent = reads().length
      expect(spent).toBeGreaterThan(3)

      await act(async () => {
        release()
        await other
        await vi.advanceTimersByTimeAsync(0)
      })
      await advance(60_000)

      expect(reads()).toHaveLength(spent)
      expect(unavailable()).toBe('true')
    })

    it('16: while a delay runs, its fetch does not add a duplicate read', async () => {
      alwaysFail((config) => netError(config))
      mount()
      await settled()
      await advance(500)

      let release = () => undefined
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      serveReads((n, config) => (n === 1 ? netError(config) : held.then(() => ok(config))))

      const other = store.dispatch(settingsApiSlice.endpoints.getCompanySettings.initiate())
      await settled()
      expect(reads()).toHaveLength(2)

      await act(async () => {
        release()
        await other
        await vi.advanceTimersByTimeAsync(0)
      })
      await settled()

      // The pending delay was dropped, so no third read lands at its old time.
      await advance(30_000)
      expect(reads()).toHaveLength(2)
    })

    it('16: another reader succeeding clears the strip', async () => {
      await stopReadingOn503()

      serveReads((_n, config) => ok(config))
      await act(async () => {
        await store.dispatch(settingsApiSlice.endpoints.getCompanySettings.initiate())
        await vi.advanceTimersByTimeAsync(0)
      })
      await settled()

      expect(name()).toBe('Acme Trading')
      expect(unavailable()).toBe('false')
    })
  })

  describe('scenario 15: a sidebar read answered 401', () => {
    it('17: a refresh that succeeds recovers, and one refresh is counted for that retry', async () => {
      alwaysFail((config) => netError(config))
      mount()
      await settled()
      await advance(2000)
      await settled()
      expect(reads()).toHaveLength(2)

      // The automatic retry is answered 401; the runtime refreshes and the
      // re-sent read is answered.
      serveReads((_n, config) => (sent.length > 2 && refreshes().length > 0 ? ok(config) : status(config, 401)))
      await installRuntimeRefreshingThrough()
      await advance(6000)
      await settled()

      // Refreshes are counted and reported as observed, not as a bound.
      expect(refreshes()).toHaveLength(1)
      expect(name()).toBe('Acme Trading')
    })

    it('17: a refresh that fails stops recovery at once', async () => {
      alwaysFail((config) => netError(config))
      mount()
      await settled()
      await advance(2000)
      await settled()
      expect(reads()).toHaveLength(2)

      alwaysFail((config) => status(config, 401))
      await installRuntimeFailingRefresh(429)
      await advance(6000)
      await settled()

      expect(unavailable()).toBe('true')
      expect(refreshes()).toHaveLength(1)
      await advance(60_000)
      expect(reads()).toHaveLength(3)
    })
  })

  /**
   * A runtime whose refresh leaves through the ingress, so it is counted there
   * and answered 200 with tokens: the renewal a 401 behind a read causes.
   */
  const installRuntimeRefreshingThrough = () => {
    const authClient = axios.create()
    let refreshes = 0
    authClient.defaults.adapter = (async (config: Config) => {
      sent.push(config)
      if (config.url === '/auth/login') return signedIn(config, 1)
      refreshes += 1
      return {
        data: {
          sessionId: 'sess-1',
          generation: 1 + refreshes,
          accessToken: `at-refreshed-${refreshes}`,
          accessTokenExpiresAt: Date.now() + 3_600_000,
          refreshToken: `rt-refreshed-${refreshes}`,
          user: { id: 'u', username: 'u' },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      }
    }) as never
    return registerRuntime(createAuthHttp(authClient))
  }

  const installRuntimeFailingRefresh = (code: number | AxiosError) => {
    const authClient = axios.create()
    authClient.defaults.adapter = (async (config: Config) => {
      sent.push(config)
      if (config.url === '/auth/login') return signedIn(config)
      return Promise.reject(
        code instanceof AxiosError
          ? Object.assign(code, { config, response: undefined })
          : new AxiosError(`status ${code}`, AxiosError.ERR_BAD_RESPONSE, config, null, {
              data: '',
              status: code,
              statusText: '',
              headers: {},
              config,
            }),
      )
    }) as never
    return registerRuntime(createAuthHttp(authClient))
  }

  const signedIn = (config: Config, generation = 1) => ({
    data: {
      sessionId: 'sess-1',
      generation,
      accessToken: `at-${generation}`,
      accessTokenExpiresAt: Date.now() + 3_600_000,
      refreshToken: `rt-${generation}`,
      user: { id: 'u', username: 'u' },
      requiresPasswordChange: false,
    },
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  })

  const registerRuntime = async (http: ReturnType<typeof createAuthHttp>) => {
    const runtime = createSessionRuntime({
      store: createMemorySessionStore(createSharedMemory()),
      http,
      events: {
        sessionEstablished: vi.fn(),
        tokensUpdated: vi.fn((tokens) => store.dispatch(tokensUpdated(tokens))),
        sessionEnded: vi.fn(),
        storageWaiting: vi.fn(),
        slicesRecovered: vi.fn(),
      },
      channel: null,
      tabId: 'A',
      now: () => Date.now(),
    })
    await runtime.start()
    await runtime.signIn({ usernameOrEmail: 'u', password: 'p' })
    registerSessionRuntime(runtime)
  }

  const stopReadingOn503 = async () => {
    alwaysFail((config) => status(config, 503))
    mount()
    await settled()
    await advance(2000)
    await settled()
    await advance(6000)
    await settled()
    expect(unavailable()).toBe('true')
  }
})
