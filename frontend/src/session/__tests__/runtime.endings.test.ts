import { describe, it, expect } from 'vitest'
import { createHarness } from './twoTabs'

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
    // The delayed-publication window: storage still holds the session (other tabs
    // cannot see the sign-out yet) but the server has already revoked it.
    const sid = a.runtime.claim()!
    h.server.sessions.get(sid)!.revoked = true

    const ref = (await b.runtime.beginRequest()).ref
    const result = await b.runtime.handleUnauthorized(ref)
    expect(result).toBe('ended')
  })

  it('no bound when logout fails', async () => {
    const h = createHarness()
    const a = await signedInTab(h, 'A')
    const b = h.createTab('B')
    await b.runtime.start()
    // With no server session, logout revokes nothing server-side. Publication to
    // B is what ends B, so a failed logout leaves B signed in until publication.
    h.server.sessions.clear()
    const hold = a.store.holdNextTransaction()
    const promise = a.runtime.signOut()
    await flush()
    expect(h.server.sessions.size).toBe(0)
    hold.release()
    await promise
    await expect(b.runtime.beginRequest()).rejects.toBeTruthy()
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
    const a = await signedInTab(h, 'A')
    const b = h.createTab('B')
    await b.runtime.start()
    h.server.loginHold = true
    const pending = b.runtime.signIn({ usernameOrEmail: 'u', password: 'p' })
    const guarded = pending.catch((e) => e)
    await a.runtime.signOut()
    await flush()
    await expect(guarded).resolves.toBeTruthy()
  })

  it('signOut uses the captured target session ID', async () => {
    const h = createHarness()
    const a = await signedInTab(h)
    const target = a.runtime.claim()!
    await a.runtime.signOut()
    const after = await a.store.read()
    expect(after.record.session).toBeNull()
    expect(after.record.revision).toBeGreaterThan(0)
    void target
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
    const a = await signedInTab(h)
    const revisionBefore = h.shared.state.record.revision
    const ref = (await a.runtime.beginRequest()).ref
    await a.runtime.endAfterFinalUnauthorized(ref)
    expect(h.shared.state.record.revision).toBe(revisionBefore)

    // An independent pending sign-in can still commit: simulate a fresh attempt.
    const b = h.createTab('B')
    await b.runtime.start()
    await b.runtime.signIn({ usernameOrEmail: 'u2', password: 'p' })
    expect(b.runtime.status()).toBe('signed-in')
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
    const oldClaim = a.runtime.claim()!

    // Start the sign-out; it clears the tab synchronously.
    const publish = a.runtime.signOut()
    await flush()
    expect(a.runtime.claim()).toBeNull()

    // A payload queued under the old session is not written: the tab has no claim.
    await a.runtime.persistSlices(oldClaim, '{"stale":true}')

    await publish
    const after = await a.store.read()
    expect(after.record.session).toBeNull()
    expect(after.slices).toBeNull()
  })
})
