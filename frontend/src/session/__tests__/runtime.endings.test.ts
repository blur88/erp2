import { describe, it, expect, vi } from 'vitest'
import { createHarness, delayNextTransaction, holdLoginResponses, holdRefreshResponses } from './twoTabs'
import { SessionChangedElsewhereError } from '../runtime'
import { explicitEndCommit } from '../decisions'
import { SessionEndedError, type StoredState } from '../types'

const flush = () => new Promise((r) => setTimeout(r, 0))

async function signedInTab(h: ReturnType<typeof createHarness>, id = 'A') {
  const tab = h.createTab(id)
  await tab.runtime.start()
  await tab.runtime.signIn({ usernameOrEmail: 'u', password: 'p' })
  return tab
}

describe('session runtime — endings', () => {
  it('signOut clears the tab at once', async () => {
    const h = createHarness()
    const a = await signedInTab(h)
    const hold = a.store.holdNextTransaction()
    const { signal } = await a.runtime.beginRequest()
    const promise = a.runtime.signOut()
    await flush()
    expect(a.runtime.claim()).toBeNull()
    expect(a.events.ended).toContain('explicit')
    expect(signal.aborted).toBe(true)
    hold.release()
    await promise
  })

  it('signOut sends logout before publication completes and with the captured refresh token', async () => {
    const h = createHarness()
    const a = await signedInTab(h)
    const captured = h.shared.state.record.session!.refreshToken
    const hold = a.store.holdNextTransaction()
    const promise = a.runtime.signOut()
    await flush()
    expect(h.server.logoutCalls).toContain(captured)
    hold.release()
    await promise
  })

  it('publication reaches the other tab only after the transaction completes', async () => {
    const h = createHarness()
    const a = await signedInTab(h, 'A')
    const b = h.createTab('B')
    await b.runtime.start()
    const hold = a.store.holdNextTransaction()
    const promise = a.runtime.signOut()
    await flush()
    a.deliverChannel()
    b.deliverChannel()
    await flush()
    expect(b.runtime.status()).toBe('signed-in')
    hold.release()
    await promise
    a.deliverChannel()
    b.deliverChannel()
    await flush()
    expect(b.runtime.status()).toBe('signed-out')
  })

  it('the other tab is protected by the server while publication is delayed', async () => {
    const h = createHarness()
    const a = await signedInTab(h, 'A')
    const b = h.createTab('B')
    await b.runtime.start()
    const sid = a.runtime.claim()!

    // A signs out: its logout reaches the server, its publication does not complete.
    const publication = delayNextTransaction(a.store)
    const signingOut = a.runtime.signOut()
    await flush()
    expect(publication.reached()).toBe(true)
    expect(h.server.sessions.get(sid)!.revoked).toBe(true)
    expect(h.shared.state.record.session?.sessionId).toBe(sid)

    // Storage still shows B the session, so its request goes out; the server
    // answers 401, its refresh is rejected, and B ends through the failure path.
    const { ref } = await b.runtime.beginRequest()
    expect(ref.sessionId).toBe(sid)
    expect(await b.runtime.handleUnauthorized(ref)).toBe('ended')
    expect(h.server.refreshCalls).toBe(1)
    expect(b.events.ended).toEqual(['failure'])
    expect(b.runtime.claim()).toBeNull()
    expect(publication.completed()).toBe(false)

    publication.release()
    await signingOut
    expect(h.shared.state.record.session).toBeNull()
  })

  // The known limit: the bound above exists only because the logout reached the
  // server. When it did not, publication alone ends the other tabs.
  it('no bound when logout fails', async () => {
    const h = createHarness()
    const a = await signedInTab(h, 'A')
    const b = h.createTab('B')
    await b.runtime.start()
    const sid = a.runtime.claim()!

    h.server.logoutFailure = new Error('network')
    const publication = delayNextTransaction(a.store)
    const signingOut = a.runtime.signOut()
    await flush()
    expect(publication.reached()).toBe(true)
    expect(a.runtime.claim()).toBeNull()
    expect(h.server.logoutCalls).toHaveLength(1)
    expect(h.server.sessions.get(sid)!.revoked).toBe(false)

    // While both hold, B keeps working: its requests are sent and delivered, and
    // even a refresh is accepted.
    for (let round = 0; round < 2; round += 1) {
      const { ref } = await b.runtime.beginRequest()
      expect(await b.runtime.canDeliver(ref)).toBe(true)
      expect(await b.runtime.handleUnauthorized(ref)).toBe('retry')
      b.deliverChannel()
      await flush()
    }
    expect(h.server.rotations).toBe(2)
    expect(b.runtime.status()).toBe('signed-in')
    expect(b.runtime.claim()).toBe(sid)
    expect(b.events.ended).toEqual([])
    expect(publication.completed()).toBe(false)

    // It ends only when the publication completes.
    publication.release()
    await signingOut
    b.deliverChannel()
    await flush()
    expect(b.events.ended).toEqual(['elsewhere'])
    expect(b.runtime.status()).toBe('signed-out')
    await expect(b.runtime.beginRequest()).rejects.toBeInstanceOf(SessionEndedError)
  })

  it('signOut against a different stored session skips clearing it, still increments revision and still sends logout', async () => {
    const h = createHarness()
    const a = await signedInTab(h, 'A')
    const before = h.shared.state.record.revision
    // Another tab signs in as a different session in shared storage.
    const b = h.createTab('B')
    await b.runtime.start()
    await b.runtime.signOut()
    await b.runtime.signIn({ usernameOrEmail: 'other', password: 'p' })
    const other = h.shared.state.record.session!.sessionId

    await a.runtime.signOut()
    const after = await a.store.read()
    expect(after.record.revision).toBeGreaterThan(before)
    expect(after.record.session?.sessionId).toBe(other)
    expect(h.server.logoutCalls.length).toBeGreaterThan(0)
  })

  it('signOut against an already signed-out record invalidates a pending sign-in in another tab', async () => {
    const h = createHarness()
    const a = h.createTab('A')
    const b = h.createTab('B')
    await a.runtime.start()
    await b.runtime.start()
    expect(h.shared.state.record).toEqual({ revision: 0, session: null })

    // B's sign-in is pending: the server has answered, the response is held.
    const login = holdLoginResponses(h.server)
    const pending = b.runtime.signIn({ usernameOrEmail: 'u', password: 'p' }).catch((e) => e)
    await vi.waitFor(() => expect(login.waiting()).toBe(1))
    const created = [...h.server.sessions.values()][0]

    // A has no session and neither has the record; its sign-out still counts.
    expect(a.runtime.status()).toBe('signed-out')
    await a.runtime.signOut()
    expect(h.shared.state.record).toEqual({ revision: 1, session: null })
    const published = h.shared.state

    login.release()
    expect(await pending).toBeInstanceOf(SessionChangedElsewhereError)

    // B wrote nothing and holds nothing; the session it created was logged out.
    expect(h.shared.state).toBe(published)
    expect(b.runtime.claim()).toBeNull()
    expect(b.runtime.status()).toBe('signed-out')
    expect(b.events.sessionEstablished).not.toHaveBeenCalled()
    expect(b.channelPost).not.toHaveBeenCalled()
    expect(h.server.logoutCalls).toEqual([created.refreshToken])
  })

  it('signOut uses the captured target session ID', async () => {
    const h = createHarness()
    const a = await signedInTab(h)
    const target = a.runtime.claim()!
    const holding = h.shared.state
    const transact = vi.spyOn(a.store, 'transact')

    await a.runtime.signOut()

    // The claim was dropped before the transaction was queued; the decision it
    // was given still compares storage with the session captured before that.
    expect(transact).toHaveBeenCalledTimes(1)
    const decide = transact.mock.calls[0][0] as (s: StoredState) => ReturnType<typeof explicitEndCommit>
    expect(a.runtime.claim()).toBeNull()
    expect(decide(holding)).toEqual(explicitEndCommit(holding, { targetSessionId: target }))
    expect(decide(holding).result).toEqual({ cleared: true })

    const after = await a.store.read()
    expect(after.record).toEqual({ revision: holding.record.revision + 1, session: null })
  })

  it('logout is sent from the storage-unavailable state', async () => {
    const h = createHarness()
    const a = await signedInTab(h)
    a.store.close()
    await expect(a.runtime.signOut()).resolves.toBeUndefined()
    expect(h.server.logoutCalls.length).toBeGreaterThan(0)
  })

  it('passwordChanged sends no logout and publishes signed-out', async () => {
    const h = createHarness()
    const a = await signedInTab(h)
    const before = h.server.logoutCalls.length
    await a.runtime.passwordChanged()
    expect(h.server.logoutCalls.length).toBe(before)
    const after = await a.store.read()
    expect(after.record.session).toBeNull()
  })

  it('endAfterFinalUnauthorized ends only at the same session and generation', async () => {
    const h = createHarness()
    const a = await signedInTab(h)
    const ref = (await a.runtime.beginRequest()).ref
    expect(await a.runtime.endAfterFinalUnauthorized(ref)).toBe('ended')
    expect(a.runtime.claim()).toBeNull()
  })

  it('endAfterFinalUnauthorized is kept when another tab advanced the session', async () => {
    const h = createHarness()
    const a = await signedInTab(h)
    const ref = (await a.runtime.beginRequest()).ref
    // Advance the stored generation behind the ref.
    h.shared.state = {
      ...h.shared.state,
      record: {
        ...h.shared.state.record,
        session: h.shared.state.record.session
          ? { ...h.shared.state.record.session, generation: ref.generation + 1 }
          : null,
      },
    }
    expect(await a.runtime.endAfterFinalUnauthorized(ref)).toBe('kept')
    expect(a.runtime.claim()).not.toBeNull()
  })

  it('a failure-driven ending leaves revision unchanged, and an independent pending sign-in then commits', async () => {
    const h = createHarness()
    // B is open and signed-out; it never adopts the session A then signs in to.
    const b = h.createTab('B')
    await b.runtime.start()
    const a = await signedInTab(h)
    expect(b.runtime.status()).toBe('signed-out')
    const revisionBefore = h.shared.state.record.revision

    // B's sign-in is pending across A's ending: it captured the revision before it.
    const login = holdLoginResponses(h.server)
    const pending = b.runtime.signIn({ usernameOrEmail: 'u2', password: 'p' })
    await vi.waitFor(() => expect(login.waiting()).toBe(1))

    const ref = (await a.runtime.beginRequest()).ref
    expect(await a.runtime.endAfterFinalUnauthorized(ref)).toBe('ended')
    expect(h.shared.state.record).toEqual({ revision: revisionBefore, session: null })

    // Intended: nothing told the pending sign-in that anything changed.
    login.release()
    await expect(pending).resolves.toEqual({ requiresPasswordChange: false })
    expect(b.runtime.status()).toBe('signed-in')
    expect(h.shared.state.record.revision).toBe(revisionBefore + 1)
    expect(h.shared.state.record.session?.sessionId).toBe(b.runtime.claim())
    expect(b.runtime.claim()).not.toBe(ref.sessionId)
  })

  it('the idle timer fires in two tabs at once', async () => {
    const h = createHarness()
    const a = await signedInTab(h, 'A')
    const b = h.createTab('B')
    await b.runtime.start()
    const revisionBefore = h.shared.state.record.revision

    await Promise.all([a.runtime.signOut(), b.runtime.signOut()])
    const after = await a.store.read()
    expect(after.record.session).toBeNull()
    expect(after.record.revision).toBe(revisionBefore + 2)
    expect(h.server.logoutCalls.length).toBeLessThanOrEqual(2)
    expect(new Set(h.server.logoutCalls).size).toBe(1)
  })

  it('a token response that arrives while explicit sign-out is unpublished is not written', async () => {
    const h = createHarness()
    const a = await signedInTab(h)
    const sid = a.runtime.claim()!

    // A refresh is on the wire: the server has rotated, its response is held.
    const refresh = holdRefreshResponses(h.server)
    const ref = (await a.runtime.beginRequest()).ref
    const refreshing = a.runtime.handleUnauthorized(ref)
    await vi.waitFor(() => expect(refresh.waiting()).toBe(1))
    expect(h.server.sessions.get(sid)!.generation).toBe(2)

    // The tab signs out; its publication does not complete.
    const publication = delayNextTransaction(a.store)
    const signingOut = a.runtime.signOut()
    await flush()
    expect(publication.reached()).toBe(true)
    expect(a.runtime.claim()).toBeNull()
    const unpublished = h.shared.state.record
    expect(unpublished.session).toMatchObject({ sessionId: sid, generation: 1 })

    // The token response arrives first. Storage still holds the session it is
    // for, but the tab that asked no longer claims it.
    refresh.release()
    await expect(refreshing).resolves.toBe('ended')
    expect(publication.completed()).toBe(false)
    expect(h.shared.state.record).toBe(unpublished)
    expect(h.shared.state.record.session).toMatchObject({ generation: 1, refreshToken: `rt-${sid}-1` })
    expect(a.events.tokensUpdated).not.toHaveBeenCalled()

    publication.release()
    await signingOut
    expect(h.shared.state.record.session).toBeNull()
  })
})
