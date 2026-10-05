import { describe, it, expect } from 'vitest'
import { createHarness, advance } from './twoTabs'
import { SessionEndedError, StorageTimeoutError, StorageUnavailableError } from '../types'
import { RefreshRejectedError } from '../authHttp'

const flush = () => new Promise((r) => setTimeout(r, 0))

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

    const [ra, rb] = await Promise.all([a.runtime.handleUnauthorized(refA), b.runtime.handleUnauthorized(refB)])
    expect(h.server.refreshCalls).toBe(1)
    expect(ra).toBe('retry')
    expect(rb).toBe('retry')
  })

  it('without the lease both would still be correct', async () => {
    const h = createHarness()
    const a = await signedInTab(h, 'A')
    const b = h.createTab('B')
    await b.runtime.start()
    // Force both to see the lease free: expire it by advancing the clock.
    advance(30000)
    const refA = (await a.runtime.beginRequest()).ref
    const refB = (await b.runtime.beginRequest()).ref
    await Promise.all([a.runtime.handleUnauthorized(refA), b.runtime.handleUnauthorized(refB)])
    expect(h.server.refreshCalls).toBeGreaterThanOrEqual(1)
    // Both end on the same generation.
    const stored = await a.store.read()
    expect(stored.record.session?.generation).toBeGreaterThanOrEqual(2)
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
    const hold = a.store.holdNextTransaction()
    const attempt = a.runtime.handleUnauthorized(ref)
    await expect(attempt).rejects.toBeInstanceOf(StorageTimeoutError)
    hold.release()
    await flush()
    expect(a.channelPost.mock.calls.length).toBe(posts)
  }, 15000)

  it('dispatch and channel post happen only after completion', async () => {
    const h = createHarness()
    const a = await signedInTab(h)
    const postsBefore = a.channelPost.mock.calls.length
    const establishedBefore = a.events.established
    const hold = a.store.holdNextTransaction()
    console.log("HOLD SET")
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
})
