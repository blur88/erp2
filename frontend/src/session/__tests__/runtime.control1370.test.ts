import { describe, it, expect, vi } from 'vitest'
import { advance, createHarness, holdRefreshResponses } from './twoTabs'
import { StorageTimeoutError } from '../types'

// Control build of the replay stall runs (#1370). This branch reverts the
// pending token commit of #1358 and nothing else, and is never merged. The test
// states the behaviour the revert must restore, which is the defect that fix
// removed: a refresh answered 200 whose commit times out is dropped, the tab
// gives up the lease (the release itself cannot reach a store that is still
// held, so the lease is left to expire), and the next tab presents the
// superseded token. The same test fails on the evidence branch, where the
// response is kept.
describe('control build — a refresh response whose commit times out is dropped', () => {
  it('leaves the superseded generation in storage, gives up the lease, and the next tab presents it past the grace', async () => {
    const h = createHarness({ trace: true, graceMs: 5000 })
    const a = h.createTab('A')
    await a.runtime.start()
    await a.runtime.signIn({ usernameOrEmail: 'u', password: 'p' })
    const b = h.createTab('B')
    await b.runtime.start()
    const refA = (await a.runtime.beginRequest()).ref
    const refB = (await b.runtime.beginRequest()).ref

    // The response is gated so the lease is taken before the store is held: the
    // transaction that stalls is the commit, not the acquisition.
    const gate = holdRefreshResponses(h.server)
    const attempt = a.runtime.handleUnauthorized(refA)
    await vi.waitFor(() => expect(gate.waiting()).toBe(1))
    const hold = a.store.holdNextTransaction()
    gate.release()
    await expect(attempt).rejects.toBeInstanceOf(StorageTimeoutError)
    hold.release()

    // One attempt, then nothing: the response is gone and nothing holds it.
    // The release was tried behind the same held store and failed, so the
    // lease stays in storage until it expires.
    expect(a.trace.filter((e) => e.type === 'token-commit').map((e) => (e as { outcome: string }).outcome)).toEqual(['timeout'])
    expect(a.trace.filter((e) => e.type === 'lease-release').map((e) => (e as { outcome: string }).outcome)).toEqual(['failed'])
    expect(a.trace.some((e) => e.type === 'pending-dropped')).toBe(false)
    const stored = await b.store.read()
    expect(stored.record.session?.generation).toBe(1)
    expect(stored.refreshLease).toMatchObject({ owner: 'A' })
    const session = [...h.server.sessions.values()][0]
    expect(session.generation).toBe(2)

    // Past the lease's expiry, which is past the grace, the next tab reads
    // generation 1 and presents it: replay.
    advance(20001)
    await b.runtime.handleUnauthorized(refB)
    expect(b.trace.find((e) => e.type === 'refresh-sent')).toMatchObject({ presentedGeneration: 1 })
    expect(b.trace.find((e) => e.type === 'refresh-answered')).toMatchObject({ status: 'rejected' })
    expect(session.revoked).toBe(true)
  }, 20000)
})
