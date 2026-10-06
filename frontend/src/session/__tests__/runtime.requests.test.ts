import { describe, it, expect, vi, type Mock } from 'vitest'
import { createHarness, advance, now, holdRefreshResponses, type Tab } from './twoTabs'
import { SessionEndedError, StorageTimeoutError, StorageUnavailableError } from '../types'
import { RefreshRejectedError } from '../authHttp'

const flush = () => new Promise((r) => setTimeout(r, 0))
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

// The tokens the tab last took into memory through a refresh or an adoption.
const lastTokens = (tab: Tab) =>
  (tab.events.tokensUpdated as Mock).mock.calls.at(-1)?.[0] as
    | { generation: number; accessToken: string; accessTokenExpiresAt: number; refreshToken: string }
    | undefined

async function signedInTab(h: ReturnType<typeof createHarness>, id = 'A') {
  const tab = h.createTab(id)
  await tab.runtime.start()
  await tab.runtime.signIn({ usernameOrEmail: 'u', password: 'p' })
  return tab
}

describe('session runtime — requests and refresh', () => {
  it('beginRequest reconciles first and rejects with SessionEndedError when the tab has no claim', async () => {
    const h = createHarness()
    const a = h.createTab('A')
    await a.runtime.start()
    await expect(a.runtime.beginRequest()).rejects.toBeInstanceOf(SessionEndedError)
  })

  it('beginRequest is not sent on a failed read', async () => {
    const h = createHarness()
    const a = await signedInTab(h)
    a.store.failNextRead(new StorageUnavailableError('gone'))
    await expect(a.runtime.beginRequest()).rejects.toBeInstanceOf(StorageUnavailableError)
    expect(a.runtime.status()).toBe('storage-unavailable')
    expect(a.events.ended).toContain('storage')
  })

  it('a result is delivered only for the same session', async () => {
    const h = createHarness()
    const a = await signedInTab(h)
    const { ref } = await a.runtime.beginRequest()
    await a.runtime.signOut()
    await a.runtime.signIn({ usernameOrEmail: 'y', password: 'p' })
    expect(await a.runtime.canDeliver(ref)).toBe(false)
  })

  it('an in-flight result is discarded across sign-out and sign-in as another user in the same tab', async () => {
    const h = createHarness()
    const a = await signedInTab(h)
    const { ref, signal } = await a.runtime.beginRequest()
    await a.runtime.signOut()
    expect(signal.aborted).toBe(true)
    await a.runtime.signIn({ usernameOrEmail: 'y', password: 'p' })
    expect(await a.runtime.canDeliver(ref)).toBe(false)
  })

  it('two tabs get 401 together and exactly one refresh is sent', async () => {
    const h = createHarness()
    const a = await signedInTab(h, 'A')
    const b = h.createTab('B')
    await b.runtime.start()
    const refA = (await a.runtime.beginRequest()).ref
    const refB = (await b.runtime.beginRequest()).ref

    const gate = holdRefreshResponses(h.server)
    const pa = a.runtime.handleUnauthorized(refA)
    const pb = b.runtime.handleUnauthorized(refB)
    await vi.waitFor(() => expect(gate.waiting()).toBe(1))

    // A's refresh is in flight and A holds the lease. B polls every 250 ms and
    // must not send its own.
    await wait(600)
    expect(h.server.refreshCalls).toBe(1)
    expect(h.shared.state.refreshLease?.owner).toBe('A')

    gate.release()
    const [ra, rb] = await Promise.all([pa, pb])
    expect(ra).toBe('retry')
    expect(rb).toBe('retry')
    expect(h.server.refreshCalls).toBe(1)
    expect((await a.runtime.beginRequest()).ref.generation).toBe(2)
    expect((await b.runtime.beginRequest()).ref.generation).toBe(2)
    expect(h.shared.state.refreshLease).toBeNull()
  })

  // Both tabs send: A rotates at t0, then A's lease is expired on the shared clock
  // (still inside the server's 60 s grace) so B sees it free and its superseded
  // token is recovered. Both responses are held for the test to deliver in order.
  async function racedRefreshes(h: ReturnType<typeof createHarness>) {
    const a = await signedInTab(h, 'A')
    const b = h.createTab('B')
    await b.runtime.start()
    const refA = (await a.runtime.beginRequest()).ref
    const refB = (await b.runtime.beginRequest()).ref

    const gate = holdRefreshResponses(h.server)
    const pa = a.runtime.handleUnauthorized(refA)
    await vi.waitFor(() => expect(gate.waiting()).toBe(1))
    advance(30000)
    const pb = b.runtime.handleUnauthorized(refB)
    await vi.waitFor(() => expect(gate.waiting()).toBe(2))
    return { a, b, gate, pa, pb }
  }

  it('without the lease both would still be correct', async () => {
    const h = createHarness()
    const { a, b, gate, pa, pb } = await racedRefreshes(h)
    gate.release()
    expect(await pa).toBe('retry')
    expect(await pb).toBe('retry')

    expect(h.server.refreshCalls).toBe(2)
    expect(h.server.rotations).toBe(1)
    expect(h.server.recoveries).toBe(1)
    expect((await a.runtime.beginRequest()).ref.generation).toBe(2)
    expect((await b.runtime.beginRequest()).ref.generation).toBe(2)
    const stored = (await a.store.read()).record.session!
    expect(stored.generation).toBe(2)
    expect(lastTokens(a)?.refreshToken).toBe(stored.refreshToken)
    expect(lastTokens(b)?.refreshToken).toBe(stored.refreshToken)
    expect(h.shared.state.refreshLease).toBeNull()
  })

  it('the lease is released when the refresh fails with a network error', async () => {
    const h = createHarness()
    const a = await signedInTab(h)
    h.server.refreshFailure = () => Object.assign(new Error('network'), { code: 'ERR_NETWORK' })
    const ref = (await a.runtime.beginRequest()).ref
    await expect(a.runtime.handleUnauthorized(ref)).rejects.toThrow('network')
    expect(h.server.refreshCalls).toBe(1)
    expect(h.shared.state.refreshLease).toBeNull()
  })

  it('the lease is released when the refresh is rejected', async () => {
    const h = createHarness()
    const a = await signedInTab(h)
    h.server.sessions.get(a.runtime.claim()!)!.revoked = true
    const ref = (await a.runtime.beginRequest()).ref
    expect(await a.runtime.handleUnauthorized(ref)).toBe('ended')
    expect(h.server.refreshCalls).toBe(1)
    expect(h.shared.state.refreshLease).toBeNull()
  })

  it('equal generation with a later accessTokenExpiresAt replaces an expired stored access token', async () => {
    const h = createHarness({ accessLifetimeMs: 1000 })
    const { a, gate, pa, pb } = await racedRefreshes(h)

    gate.releaseOne() // A's rotation, issued 30 s ago
    expect(await pa).toBe('retry')
    const rotated = (await a.store.read()).record.session!
    expect(rotated.generation).toBe(2)
    expect(rotated.accessTokenExpiresAt).toBeLessThan(now())

    gate.releaseOne() // B's recovery: same generation, later expiry
    expect(await pb).toBe('retry')
    const stored = (await a.store.read()).record.session!
    expect(stored.generation).toBe(2)
    expect(stored.refreshToken).toBe(rotated.refreshToken)
    expect(stored.accessToken).not.toBe(rotated.accessToken)
    expect(stored.accessTokenExpiresAt).toBeGreaterThan(now())
  })

  it('equal generation with an earlier one is discarded', async () => {
    const h = createHarness({ accessLifetimeMs: 1000 })
    const { a, gate, pa, pb } = await racedRefreshes(h)

    gate.releaseOne(1) // B's recovery commits first
    expect(await pb).toBe('retry')
    const recovered = (await a.store.read()).record.session!
    expect(recovered.generation).toBe(2)

    gate.releaseOne() // A's rotation: same generation, earlier expiry
    expect(await pa).toBe('retry')
    expect((await a.store.read()).record.session).toEqual(recovered)
    // A adopted what is stored instead of its own response.
    expect(lastTokens(a)?.accessToken).toBe(recovered.accessToken)
    expect(h.server.refreshCalls).toBe(2)
  })

  it('a discard followed by an expired adopted token ends in one further refresh, not a loop', async () => {
    const h = createHarness({ accessLifetimeMs: 1000 })
    const { a, gate, pa, pb } = await racedRefreshes(h)
    gate.releaseOne(1)
    await pb
    gate.release()
    expect(await pa).toBe('retry') // discarded, adopted the stored tokens
    expect(h.server.refreshCalls).toBe(2)

    advance(2000) // the adopted access token has expired: the retry gets 401 again
    const ref = (await a.runtime.beginRequest()).ref
    expect(ref.generation).toBe(2)
    expect(await a.runtime.handleUnauthorized(ref)).toBe('retry')

    expect(h.server.refreshCalls).toBe(3)
    expect(h.server.rotations).toBe(2)
    const stored = (await a.store.read()).record.session!
    expect(stored.generation).toBe(3)
    expect(stored.accessTokenExpiresAt).toBeGreaterThan(now())
    expect(a.runtime.status()).toBe('signed-in')
  })

  it('a response with a lower generation is discarded and the stored tokens adopted', async () => {
    const h = createHarness()
    const a = await signedInTab(h)
    await a.runtime.handleUnauthorized((await a.runtime.beginRequest()).ref)
    // memory now generation 2
    const ref = (await a.runtime.beginRequest()).ref
    await a.runtime.handleUnauthorized(ref)
    const stored = await a.store.read()
    expect(stored.record.session?.generation).toBe(3)
  })

  it('network error, timeout, 429 and 5xx from refresh keep the session', async () => {
    for (const status of ['network', 429, 500]) {
      const h = createHarness()
      const a = await signedInTab(h)
      h.server.refreshFailure = () => {
        if (status === 'network') {
          const e: any = new Error('network')
          e.code = 'ERR_NETWORK'
          return e
        }
        const e: any = new Error('http')
        e.response = { status }
        return e
      }
      const ref = (await a.runtime.beginRequest()).ref
      await expect(a.runtime.handleUnauthorized(ref)).rejects.toBeTruthy()
      expect(a.runtime.status()).toBe('signed-in')
    }
  })

  it('401 from refresh at an unchanged generation ends the session in every tab', async () => {
    const h = createHarness()
    const a = await signedInTab(h, 'A')
    // Revoke the session server-side; refresh will be rejected, generation unchanged.
    const stored = await a.store.read()
    const sid = stored.record.session!.sessionId
    h.server.sessions.get(sid)!.revoked = true

    const result = await a.runtime.handleUnauthorized((await a.runtime.beginRequest()).ref)
    expect(result).toBe('ended')
    expect(a.runtime.claim()).toBeNull()
    const after = await a.store.read()
    expect(after.record.session).toBeNull()
  })

  it('401 from refresh after another tab advanced the generation ends nothing', async () => {
    const h = createHarness()
    const a = await signedInTab(h, 'A')
    const sid = a.runtime.claim()!
    const session = h.server.sessions.get(sid)!
    // Advance the stored generation behind A's back, without updating the server
    // refresh path: simulate another tab having rotated the session.
    h.server.refreshFailure = () => {
      const current = h.shared.state
      if (current.record.session) {
        h.shared.state = {
          ...current,
          record: { ...current.record, session: { ...current.record.session, generation: session.generation + 1 } },
        }
      }
      return new RefreshRejectedError('rejected')
    }
    const result = await a.runtime.handleUnauthorized((await a.runtime.beginRequest()).ref)
    expect(result).toBe('retry')
    expect(a.runtime.claim()).not.toBeNull()
  })

  it("a 401 for a request sent before the tab's tokens advanced retries without refreshing", async () => {
    const h = createHarness()
    const a = await signedInTab(h)
    const sentAtGeneration1 = (await a.runtime.beginRequest()).ref
    expect(await a.runtime.handleUnauthorized(sentAtGeneration1)).toBe('retry')
    expect(h.server.refreshCalls).toBe(1)

    // A second request sent with the old token gets its 401 after that refresh finished.
    expect(await a.runtime.handleUnauthorized(sentAtGeneration1)).toBe('retry')
    expect(h.server.refreshCalls).toBe(1)
    expect((await a.runtime.beginRequest()).ref.generation).toBe(2)
  })

  it('tokensUpdated carries the generation the tokens belong to', async () => {
    const h = createHarness()
    const a = await signedInTab(h, 'A')
    const b = await (async () => {
      const tab = h.createTab('B')
      await tab.runtime.start()
      return tab
    })()

    // A refresh in this tab, an adoption in the other.
    await a.runtime.handleUnauthorized((await a.runtime.beginRequest()).ref)
    expect(lastTokens(a)?.generation).toBe(2)
    await b.runtime.reconcileNow()
    expect(lastTokens(b)?.generation).toBe(2)

    // An equal-generation adoption of a later access token keeps the generation.
    const session = h.shared.state.record.session!
    h.shared.state = {
      ...h.shared.state,
      record: {
        ...h.shared.state.record,
        session: { ...session, accessToken: 'at-later', accessTokenExpiresAt: session.accessTokenExpiresAt + 1 },
      },
    }
    await b.runtime.reconcileNow()
    expect(lastTokens(b)).toMatchObject({ generation: 2, accessToken: 'at-later' })
  })

  it('a 401 for a request captured under another session is not refreshed and not retried', async () => {
    const h = createHarness()
    const a = await signedInTab(h)
    const sentUnderX = (await a.runtime.beginRequest()).ref
    await a.runtime.signOut()
    await a.runtime.signIn({ usernameOrEmail: 'y', password: 'p' })
    const y = { ...h.shared.state.record.session! }
    expect(y.sessionId).not.toBe(sentUnderX.sessionId)

    expect(await a.runtime.handleUnauthorized(sentUnderX)).toBe('ended')
    expect(h.server.refreshCalls).toBe(0)
    expect(a.runtime.claim()).toBe(y.sessionId)
    expect(a.runtime.status()).toBe('signed-in')
    expect(h.shared.state.record.session).toEqual(y)
    expect(a.events.ended).toEqual(['explicit'])
  })

  it('a 401 whose refresh was overtaken by a switch to another session is not retried', async () => {
    const h = createHarness()
    const a = await signedInTab(h)
    const sentUnderX = (await a.runtime.beginRequest()).ref
    const gate = holdRefreshResponses(h.server)
    const outcome = a.runtime.handleUnauthorized(sentUnderX)
    await vi.waitFor(() => expect(gate.waiting()).toBe(1))
    await a.runtime.signOut()
    await a.runtime.signIn({ usernameOrEmail: 'y', password: 'p' })
    const y = { ...h.shared.state.record.session! }
    gate.release()

    expect(await outcome).toBe('ended')
    expect(a.runtime.claim()).toBe(y.sessionId)
    expect(h.shared.state.record.session).toEqual(y)
  })

  // The refresh is rejected at an unchanged generation, and another tab changes
  // the record between this tab's reconcile read and its failure-driven commit.
  async function refusedFailureEnding(change: (h: ReturnType<typeof createHarness>) => void) {
    const h = createHarness()
    const a = await signedInTab(h)
    let rejected = false
    h.server.refreshFailure = () => {
      rejected = true
      return new RefreshRejectedError('rejected')
    }
    const transact = a.store.transact.bind(a.store)
    vi.spyOn(a.store, 'transact').mockImplementation((decide, opts) => {
      if (rejected) {
        rejected = false
        change(h)
      }
      return transact(decide, opts)
    })
    const result = await a.runtime.handleUnauthorized((await a.runtime.beginRequest()).ref)
    return { h, a, result }
  }

  it('a refused failure-driven ending reconciles instead of reporting ended', async () => {
    const { h, a, result } = await refusedFailureEnding((h) => {
      const session = h.shared.state.record.session!
      h.shared.state = {
        ...h.shared.state,
        record: {
          ...h.shared.state.record,
          session: { ...session, generation: 2, accessToken: 'at-other-tab', refreshToken: 'rt-other-tab' },
        },
      }
    })
    expect(result).toBe('retry')
    expect(a.runtime.status()).toBe('signed-in')
    expect(a.events.ended).toEqual([])
    expect(h.shared.state.record.session?.generation).toBe(2)
    // The tab took the other tab's tokens.
    const next = await a.runtime.beginRequest()
    expect(next.ref.generation).toBe(2)
    expect(next.accessToken).toBe('at-other-tab')
  })

  it('a refused failure-driven ending reports ended when the reconcile ends the tab', async () => {
    const { a, result } = await refusedFailureEnding((h) => {
      h.shared.state = { ...h.shared.state, record: { ...h.shared.state.record, session: null } }
    })
    expect(result).toBe('ended')
    expect(a.runtime.claim()).toBeNull()
    expect(a.events.ended).toEqual(['elsewhere'])
  })

  it('a missing BroadcastChannel does not block use', async () => {
    const h = createHarness({ channel: false })
    const a = await signedInTab(h, 'A')
    const b = h.createTab('B')
    await b.runtime.start()
    expect(b.runtime.status()).toBe('signed-in')
    await a.runtime.signOut()
    // No channel: B learns on its next beginRequest.
    await expect(b.runtime.beginRequest()).rejects.toBeInstanceOf(SessionEndedError)
  })

  it('persistSlices skips a payload queued under X after the tab signed in as Y', async () => {
    const h = createHarness()
    const a = await signedInTab(h)
    const old = a.runtime.claim()!
    await a.runtime.signIn({ usernameOrEmail: 'y', password: 'p' })
    await a.runtime.persistSlices(old, '{"x":1}')
    expect(await a.runtime.readSlices()).toBeNull()
  })

  it('readSlices returns null when the tag is not the stored session', async () => {
    const h = createHarness()
    const a = await signedInTab(h)
    const sid = a.runtime.claim()!
    await a.runtime.persistSlices(sid, '{"n":1}')
    expect(await a.runtime.readSlices()).toBe('{"n":1}')
  })

  it("readSlices returns null when the stored session is not the tab's claim", async () => {
    const h = createHarness()
    const a = await signedInTab(h, 'A')
    // Another tab replaced the session and stored its own slices; this tab has not reconciled yet.
    const b = await signedInTab(h, 'B')
    await b.runtime.persistSlices(b.runtime.claim(), '{"theirs":1}')
    expect(h.shared.state.slices).toEqual({ sessionId: b.runtime.claim(), json: '{"theirs":1}' })
    expect(a.runtime.claim()).not.toBe(b.runtime.claim())

    expect(await a.runtime.readSlices()).toBeNull()
    expect(await b.runtime.readSlices()).toBe('{"theirs":1}')
  })

  it('storage closed mid-session', async () => {
    const h = createHarness()
    const a = await signedInTab(h)
    const { signal } = await a.runtime.beginRequest()
    a.store.close()
    await expect(a.runtime.beginRequest()).rejects.toBeInstanceOf(StorageUnavailableError)
    expect(a.runtime.status()).toBe('storage-unavailable')
    expect(signal.aborted).toBe(true)
  })

  it('a token commit that completes after the tab cleared itself is not dispatched', async () => {
    const h = createHarness()
    const a = await signedInTab(h)
    const ref = (await a.runtime.beginRequest()).ref
    await a.runtime.handleUnauthorized(ref)
    await a.runtime.signOut()
    const before = a.events.updated
    a.deliverChannel()
    await flush()
    expect(a.events.updated).toBe(before)
    expect(a.runtime.claim()).toBeNull()
  })

  it('a blocked transaction whose caller timed out does not commit after release and posts nothing to the channel', async () => {
    const h = createHarness()
    const a = await signedInTab(h)
    const posts = a.channelPost.mock.calls.length
    const ref = (await a.runtime.beginRequest()).ref
    const before = h.shared.state
    const hold = a.store.holdNextTransaction()
    const attempt = a.runtime.handleUnauthorized(ref)
    await expect(attempt).rejects.toBeInstanceOf(StorageTimeoutError)
    hold.release()
    await flush()
    expect(a.channelPost.mock.calls.length).toBe(posts)
    // Nothing was applied after the release: the stored state is the same object.
    expect(h.shared.state).toBe(before)
    expect(h.shared.state.refreshLease).toBeNull()
    expect(h.server.refreshCalls).toBe(0)
  }, 15000)

  it('dispatch and channel post happen only after completion', async () => {
    const h = createHarness()
    const a = await signedInTab(h)
    const postsBefore = a.channelPost.mock.calls.length
    const establishedBefore = a.events.established
    const hold = a.store.holdNextTransaction()
    const signInPromise = a.runtime.signIn({ usernameOrEmail: 'z', password: 'p' })
    await flush()
    await flush()
    expect(a.channelPost.mock.calls.length).toBe(postsBefore)
    expect(a.events.established).toBe(establishedBefore)
    hold.release()
    await signInPromise
    expect(a.channelPost.mock.calls.length).toBe(postsBefore + 1)
    expect(a.events.established).toBe(establishedBefore + 1)
  })

  it('Review Focus 1: a tab started while another is mid-refresh starts from the stored record and both keep working', async () => {
    const h = createHarness()
    const a = await signedInTab(h, 'A')
    const ref = (await a.runtime.beginRequest()).ref
    const hold = a.store.holdNextTransaction()
    const refresh = a.runtime.handleUnauthorized(ref)
    const b = h.createTab('B')
    await b.runtime.start()
    hold.release()
    await refresh
    expect(b.runtime.status()).toBe('signed-in')
    expect(a.runtime.status()).toBe('signed-in')
    const refA = (await a.runtime.beginRequest()).ref
    const refB = (await b.runtime.beginRequest()).ref
    expect(await a.runtime.canDeliver(refA)).toBe(true)
    expect(await b.runtime.canDeliver(refB)).toBe(true)
  })

  it('a resumed tab ends locally without sending a request', async () => {
    const h = createHarness({ channel: false })
    const a = await signedInTab(h, 'A')
    const b = h.createTab('B')
    await b.runtime.start()
    await a.runtime.signOut()
    await b.runtime.reconcileNow()
    expect(b.runtime.claim()).toBeNull()
    expect(b.events.ended).toContain('elsewhere')
    expect(h.server.refreshCalls).toBe(0)
  })

  it('a resumed tab adopts tokens another tab refreshed while it was hidden', async () => {
    const h = createHarness({ channel: false })
    const a = await signedInTab(h, 'A')
    const b = h.createTab('B')
    await b.runtime.start()
    await a.runtime.handleUnauthorized((await a.runtime.beginRequest()).ref)
    await b.runtime.reconcileNow()
    expect(b.events.updated).toBe(1)
    const stored = await b.store.read()
    expect(stored.record.session?.generation).toBe(2)
  })

  it('reconcileNow before start settled reads nothing', async () => {
    const h = createHarness()
    const a = h.createTab('A')
    const readSpy = vi.spyOn(a.store, 'read')
    await a.runtime.reconcileNow()
    expect(readSpy).not.toHaveBeenCalled()
    expect(a.events.ended).toHaveLength(0)
  })
})
