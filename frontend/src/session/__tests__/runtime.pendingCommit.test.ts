// A refresh response whose storage commit times out is kept and committed later,
// and while it is pending the tab sends no further refresh (#1358).
//
// Every test names the gate it uses. The three are different things:
//   abort   — this tab's next transactions abort without running their decision;
//             reads and other tabs are free.
//   stall   — storage answers nobody: every later operation of every tab queues
//             behind the held one and times out on its own timer.
//   late    — the transaction commits at once and only its result is late.
// `delayNextTransaction` (in twoTabs) is a fourth: the decision is evaluated
// after whatever changed while it waited.
import { describe, it, expect, vi, type Mock } from 'vitest'
import {
  createHarness,
  advance,
  holdRefreshResponses,
  abortTransactions,
  delayNextTransaction,
  deliverNextTransactionLate,
  type Tab,
} from './twoTabs'
import { StorageTimeoutError, StorageUnavailableError, type SessionRef } from '../types'

const flush = () => new Promise((r) => setTimeout(r, 0))

const lastTokens = (tab: Tab) =>
  (tab.events.tokensUpdated as Mock).mock.calls.at(-1)?.[0] as
    | { generation: number; accessToken: string; accessTokenExpiresAt: number; refreshToken: string }
    | undefined

const storedGeneration = (h: ReturnType<typeof createHarness>) => h.shared.state.record.session?.generation ?? null

async function signedInTab(h: ReturnType<typeof createHarness>, id = 'A') {
  const tab = h.createTab(id)
  await tab.runtime.start()
  await tab.runtime.signIn({ usernameOrEmail: `u-${id}`, password: 'p' })
  return tab
}

// Both gates hold the refresh response first, so the lease is taken and the
// reads before the request are done: it is the commit that meets the gate, not
// the acquisition.
//
// `count` is how many of this tab's transactions abort. Two are the two inline
// attempts, which is all a 200 spends on its own; three leaves the gate armed
// for the caller's next attempt, which `disarm()` then ends.
async function pendingByAbort(
  h: ReturnType<typeof createHarness>,
  id = 'A',
  count = 2,
): Promise<{ tab: Tab; ref: SessionRef; rejected: unknown; disarm: () => void }> {
  const tab = await signedInTab(h, id)
  const ref = (await tab.runtime.beginRequest()).ref
  const gate = holdRefreshResponses(h.server)
  const attempt = tab.runtime.handleUnauthorized(ref)
  await vi.waitFor(() => expect(gate.waiting()).toBe(1))
  const armed = abortTransactions(tab.store, count)
  gate.release()
  const rejected = await attempt.then(
    () => null,
    (err: unknown) => err,
  )
  let armed_ = true
  return {
    tab,
    ref,
    rejected,
    disarm: () => {
      if (armed_) armed_ = false
      armed.restore()
    },
  }
}

async function pendingByStall(
  h: ReturnType<typeof createHarness>,
  id = 'A',
): Promise<{ tab: Tab; ref: SessionRef; hold: { release(): void }; rejected: unknown }> {
  const tab = await signedInTab(h, id)
  const ref = (await tab.runtime.beginRequest()).ref
  const gate = holdRefreshResponses(h.server)
  const attempt = tab.runtime.handleUnauthorized(ref)
  await vi.waitFor(() => expect(gate.waiting()).toBe(1))
  const hold = tab.store.holdNextTransaction()
  gate.release()
  const rejected = await attempt.then(
    () => null,
    (err: unknown) => err,
  )
  return { tab, ref, hold, rejected }
}

describe('session runtime — a pending token commit', () => {
  it('[1] (abort) a 200 whose commit aborts is kept, and reconcileNow lands it', async () => {
    const h = createHarness()
    const { tab, rejected } = await pendingByAbort(h)

    expect(rejected).toBeInstanceOf(StorageTimeoutError)
    expect(h.server.refreshCalls).toBe(1)
    // The aborted transactions wrote nothing.
    expect(storedGeneration(h)).toBe(1)
    expect(lastTokens(tab)?.generation).not.toBe(2)

    await tab.runtime.reconcileNow()
    expect(storedGeneration(h)).toBe(2)
    expect(lastTokens(tab)?.generation).toBe(2)
    expect(h.server.refreshCalls).toBe(1)
  })

  it('[1] (abort) the next refresh does not present the superseded token', async () => {
    const h = createHarness()
    const { tab, ref } = await pendingByAbort(h)
    const session = h.server.sessions.get(h.shared.state.record.session!.sessionId)!

    // The commit is recovered at the start of this refresh, so nothing is sent.
    expect(await tab.runtime.handleUnauthorized(ref)).toBe('retry')
    expect(h.server.refreshCalls).toBe(1)
    expect(session.revoked).toBe(false)
    expect(storedGeneration(h)).toBe(2)
  })

  it('[1] (stall) the same under a stalled store, where the timers do the aborting', async () => {
    const h = createHarness({ storageTimeoutMs: 40 })
    const { tab, hold, rejected } = await pendingByStall(h)

    expect(rejected).toBeInstanceOf(StorageTimeoutError)
    expect(storedGeneration(h)).toBe(1)
    expect(lastTokens(tab)?.generation).not.toBe(2)

    // Released, the transaction that timed out writes nothing (B3).
    hold.release()
    await flush()
    expect(storedGeneration(h)).toBe(1)

    await tab.runtime.reconcileNow()
    expect(storedGeneration(h)).toBe(2)
    expect(h.server.refreshCalls).toBe(1)
  })

  it('[2] (stall) while the entry is pending a second 401 sends no refresh and rejects with the timeout', async () => {
    const h = createHarness({ storageTimeoutMs: 40 })
    const { tab, ref, hold } = await pendingByStall(h)

    await expect(tab.runtime.handleUnauthorized(ref)).rejects.toBeInstanceOf(StorageTimeoutError)
    expect(h.server.refreshCalls).toBe(1)
    expect(storedGeneration(h)).toBe(1)
    hold.release()
  })

  it('[4] (abort) a commit recovered at the start of doRefresh returns retry with no HTTP refresh', async () => {
    const h = createHarness()
    const { tab, ref } = await pendingByAbort(h)

    expect(await tab.runtime.handleUnauthorized(ref)).toBe('retry')
    expect(h.server.refreshCalls).toBe(1)
    expect(storedGeneration(h)).toBe(2)
  })

  it('[6a] (abort, 3 transactions) reconcileNow keeps the entry when its attempt aborts, and still reads and applies', async () => {
    const h = createHarness()
    // Two inline attempts, then the reconcile's own.
    const { tab, disarm } = await pendingByAbort(h, 'A', 3)

    await tab.runtime.reconcileNow()
    expect(storedGeneration(h)).toBe(1)
    expect(tab.runtime.status()).toBe('signed-in')
    disarm()

    // The entry was kept, so a later reconcile lands it.
    await tab.runtime.reconcileNow()
    expect(storedGeneration(h)).toBe(2)
  })

  it('[6b] (abort, 3) reconcileNow still applies what the read shows', async () => {
    const h = createHarness()
    const { tab, disarm } = await pendingByAbort(h, 'A', 3)

    // Tab B is free under this gate and ends the session.
    const b = await signedInTab(h, 'B')
    await b.runtime.signOut()
    disarm()

    await tab.runtime.reconcileNow()
    expect(tab.runtime.status()).toBe('signed-out')
    expect(tab.events.ended).toContain('elsewhere')
    expect(storedGeneration(h)).not.toBe(2)
  })

  it('[6c] (abort, 3) a failure of the reconcile read propagates', async () => {
    const h = createHarness()
    const { tab } = await pendingByAbort(h, 'A', 3)

    tab.store.failNextRead(new StorageUnavailableError('gone'))
    await expect(tab.runtime.reconcileNow()).rejects.toBeInstanceOf(StorageUnavailableError)
    expect(tab.runtime.status()).toBe('storage-unavailable')
  })

  it('[12] (abort) storage becoming unavailable drops the entry and fails closed', async () => {
    const h = createHarness()
    const { tab } = await pendingByAbort(h)

    tab.store.close()
    await expect(tab.runtime.reconcileNow()).rejects.toBeInstanceOf(StorageUnavailableError)
    expect(tab.runtime.status()).toBe('storage-unavailable')
    expect(tab.events.ended).toContain('storage')
    expect(storedGeneration(h)).toBe(1)
  })

  it('[focus 4] (stall) two 401s while pending share one attempt', async () => {
    const h = createHarness({ storageTimeoutMs: 40, trace: true })
    const { tab, ref, hold } = await pendingByStall(h)

    const before = tab.trace.length
    const settled = Promise.allSettled([tab.runtime.handleUnauthorized(ref), tab.runtime.handleUnauthorized(ref)])
    await settled
    hold.release()

    for (const outcome of await settled) expect(outcome.status).toBe('rejected')
    const attempts = tab.trace
      .slice(before)
      .filter((e) => e.type === 'token-commit' && e.trigger === 'refresh')
    expect(attempts).toHaveLength(1)
    expect(h.server.refreshCalls).toBe(1)
  })

  it('[15] (stall) a final 401 while the entry is pending keeps the session', async () => {
    const h = createHarness({ storageTimeoutMs: 40 })
    const { tab, ref, hold } = await pendingByStall(h)

    // The stored session and the request's are both the superseded generation,
    // so the comparison must not end this session.
    expect(await tab.runtime.endAfterFinalUnauthorized(ref)).toBe('kept')
    expect(tab.runtime.status()).toBe('signed-in')
    expect(h.shared.state.record.session?.generation).toBe(1)

    hold.release()
    await flush()
    expect(h.shared.state.record.session?.generation).toBe(1)
  })

  it('[14] (abort, 3) a commit attempt made by a reconcile carries the refreshId of the refresh that got the 200', async () => {
    const h = createHarness({ trace: true })
    const { tab } = await pendingByAbort(h, 'A', 3)

    const answered = tab.trace.find((e) => e.type === 'refresh-answered' && e.status === 'ok')
    expect(answered).toBeDefined()
    await tab.runtime.reconcileNow()

    const attempt = tab.trace.find((e) => e.type === 'token-commit' && e.trigger === 'reconcile')
    expect(attempt).toMatchObject({ refreshId: answered!.refreshId, triggeredBy: null, attempt: 3 })
  })

  // ---- lease ownership -----------------------------------------------------

  it('[3] (abort, 3) the lease stays while the entry is pending and is released once it lands', async () => {
    const h = createHarness()
    const { tab, disarm } = await pendingByAbort(h, 'A', 3)

    expect(h.shared.state.refreshLease?.owner).toBe('A')

    // An attempt that aborts keeps the entry, and the entry keeps the lease.
    await tab.runtime.reconcileNow()
    expect(storedGeneration(h)).toBe(1)
    expect(h.shared.state.refreshLease?.owner).toBe('A')

    disarm()
    await tab.runtime.reconcileNow()
    expect(storedGeneration(h)).toBe(2)
    await vi.waitFor(() => expect(h.shared.state.refreshLease).toBeNull())
  })

  it('[3] (abort) the lease is left to expire when the entry does not land in time', async () => {
    const h = createHarness()
    const { tab } = await pendingByAbort(h)

    // A's entry never committed, so the stored record is still the session it
    // was sent for: another tab started now adopts it.
    const b = h.createTab('B')
    await b.runtime.start()

    // A's lease runs out while its entry is still pending.
    advance(20001)
    const refB = (await b.runtime.beginRequest()).ref
    const gate = holdRefreshResponses(h.server)
    const sentByB = b.runtime.handleUnauthorized(refB)
    await vi.waitFor(() => expect(gate.waiting()).toBe(1))
    expect(h.shared.state.refreshLease?.owner).toBe('B')

    // A's entry lands or is discarded; either way its old release must not
    // release the lease B took.
    await tab.runtime.reconcileNow()
    await vi.waitFor(() => expect(storedGeneration(h)).not.toBe(1))
    expect(h.shared.state.refreshLease?.owner).toBe('B')

    gate.release()
    await sentByB
  })

  // ---- late retry ----------------------------------------------------------

  it('[5] (abort, then delay) a retry in flight across sign-out writes nothing', async () => {
    const h = createHarness({ trace: true })
    const { tab } = await pendingByAbort(h)

    const delay = delayNextTransaction(tab.store)
    const retry = tab.runtime.reconcileNow()
    await vi.waitFor(() => expect(delay.reached()).toBe(true))

    await tab.runtime.signOut()
    delay.release()
    await retry.catch(() => undefined)

    expect(h.shared.state.record.session).toBeNull()
    expect(lastTokens(tab)?.generation).not.toBe(2)
    // The retry's decision ran after the claim was gone, so it refused.
    expect(tab.trace.some((e) => e.type === 'token-commit' && e.outcome === 'session-mismatch')).toBe(true)
  })

  it('[5] (abort, then delay) a retry in flight across a sign-in to another session leaves it alone', async () => {
    const h = createHarness()
    const { tab } = await pendingByAbort(h)

    const delay = delayNextTransaction(tab.store)
    const retry = tab.runtime.reconcileNow()
    await vi.waitFor(() => expect(delay.reached()).toBe(true))

    await tab.runtime.signOut()
    await tab.runtime.signIn({ usernameOrEmail: 'other', password: 'p' })
    const replacement = h.shared.state.record.session
    delay.release()
    await retry.catch(() => undefined)

    expect(replacement).not.toBeNull()
    expect(replacement?.generation).toBe(1)
    expect(h.shared.state.record.session?.sessionId).toBe(replacement?.sessionId)
    expect(tab.runtime.claim()).toBe(replacement?.sessionId)
  })

  it('[15] (abort) sign-out while pending sends the logout with the pending refresh token', async () => {
    const h = createHarness()
    const { tab } = await pendingByAbort(h)
    const sessionId = h.shared.state.record.session!.sessionId

    // The tab's memory holds the superseded token; the entry holds the current
    // one, and the logout must carry the one the server still considers current.
    await tab.runtime.signOut()

    expect(h.server.logoutCalls).toContain(`rt-${sessionId}-2`)
    expect(h.server.sessions.get(sessionId)!.revoked).toBe(true)
    expect(h.shared.state.record.session).toBeNull()
  })

  // ---- late completion -----------------------------------------------------

  it('[7] (late delivery) a commit that completes after sign-out is not applied or dispatched', async () => {
    const h = createHarness({ trace: true })
    const tab = await signedInTab(h)
    const ref = (await tab.runtime.beginRequest()).ref
    const posts = tab.channelPost.mock.calls.length

    // The lease is taken first; only the commit is answered late.
    const gate = holdRefreshResponses(h.server)
    const attempt = tab.runtime.handleUnauthorized(ref)
    await vi.waitFor(() => expect(gate.waiting()).toBe(1))
    const late = deliverNextTransactionLate(tab.store)
    gate.release()

    // The transaction committed: storage holds generation 2. Only the answer is
    // outstanding, and no timeout fires anywhere.
    await vi.waitFor(() => expect(late.committed()).toBe(true))
    expect(h.shared.state.record.session?.generation).toBe(2)

    await tab.runtime.signOut()
    late.release()
    await attempt.catch(() => undefined)
    await flush()

    expect(tab.runtime.claim()).toBeNull()
    expect(lastTokens(tab)?.generation).not.toBe(2)
    // One post, for the sign-out. None for the tokens that were never applied.
    expect(tab.channelPost.mock.calls.length).toBe(posts + 1)
    expect(h.shared.state.record.session).toBeNull()
  })

  it('[8] (late delivery) a commit that completes after a sign-in to another session leaves that session untouched', async () => {
    const h = createHarness()
    const tab = await signedInTab(h)
    const ref = (await tab.runtime.beginRequest()).ref
    const firstSessionId = h.shared.state.record.session!.sessionId

    const gate = holdRefreshResponses(h.server)
    const attempt = tab.runtime.handleUnauthorized(ref)
    await vi.waitFor(() => expect(gate.waiting()).toBe(1))
    const late = deliverNextTransactionLate(tab.store)
    gate.release()
    await vi.waitFor(() => expect(late.committed()).toBe(true))

    await tab.runtime.signOut()
    await tab.runtime.signIn({ usernameOrEmail: 'other', password: 'p' })
    const replacement = h.shared.state.record.session
    late.release()
    await attempt.catch(() => undefined)
    await flush()

    expect(replacement).not.toBeNull()
    expect(tab.runtime.claim()).toBe(replacement?.sessionId)
    expect(h.shared.state.record.session?.sessionId).toBe(replacement?.sessionId)
    expect(h.shared.state.record.session?.generation).toBe(1)
    // The tokens session 1 answered with were never taken into memory, so the
    // tab's last tokens are not that session's rotated refresh token.
    expect(lastTokens(tab)?.refreshToken).not.toBe(`rt-${firstSessionId}-2`)
  })

  // ---- late HTTP response --------------------------------------------------

  it('[9] (response gate only) a 200 that arrives after sign-out installs no entry and attempts no commit', async () => {
    const h = createHarness({ trace: true })
    const tab = await signedInTab(h)
    const ref = (await tab.runtime.beginRequest()).ref

    const gate = holdRefreshResponses(h.server)
    const attempt = tab.runtime.handleUnauthorized(ref)
    await vi.waitFor(() => expect(gate.waiting()).toBe(1))
    await tab.runtime.signOut()

    const before = tab.trace.length
    gate.release()
    expect(await attempt).toBe('ended')

    const after = tab.trace.slice(before)
    expect(after.filter((e) => e.type === 'token-commit')).toHaveLength(0)
    expect(after.filter((e) => e.type === 'pending-dropped')).toHaveLength(0)
    expect(h.shared.state.record.session).toBeNull()
  })

  it('[9] (response gate, then abort) a 200 for a replaced session leaves the replacement\'s entry and lease untouched', async () => {
    const h = createHarness({ trace: true })
    const tab = await signedInTab(h)
    const ref = (await tab.runtime.beginRequest()).ref

    const gate = holdRefreshResponses(h.server)
    const first = tab.runtime.handleUnauthorized(ref)
    await vi.waitFor(() => expect(gate.waiting()).toBe(1))
    const firstRefreshId = tab.trace.find((e) => e.type === 'refresh-sent')!.refreshId

    await tab.runtime.signOut()
    await tab.runtime.signIn({ usernameOrEmail: 'other', password: 'p' })
    const replacementId = h.shared.state.record.session!.sessionId
    // Session 1's refresh still holds its lease, and a live lease is refused
    // even to the tab that took it: let it run out.
    advance(20001)

    // Session 2 gets its own pending entry, and its own lease.
    const second = tab.runtime.handleUnauthorized((await tab.runtime.beginRequest()).ref)
    await vi.waitFor(() => expect(gate.waiting()).toBe(2))
    await vi.waitFor(() =>
      expect(tab.trace.filter((e) => e.type === 'lease-acquire' && e.acquired)).toHaveLength(2),
    )
    const secondLease = h.shared.state.refreshLease
    const armed = abortTransactions(tab.store, 2)
    gate.releaseOne(1)
    await expect(second).rejects.toBeInstanceOf(StorageTimeoutError)

    // Now the 200 for session 1 arrives, with session 2's entry waiting.
    const before = tab.trace.length
    gate.releaseOne(0)
    await first

    expect(tab.trace.slice(before).some((e) => e.type === 'token-commit' && e.refreshId === firstRefreshId)).toBe(false)
    expect(tab.runtime.claim()).toBe(replacementId)
    expect(h.shared.state.refreshLease).toEqual(secondLease)

    armed.restore()
    await tab.runtime.reconcileNow()
    expect(h.shared.state.record.session?.generation).toBe(2)
  })

  // ---- scoping and ordering ------------------------------------------------

  it('[10] (late delivery) an old attempt neither clears a replacement entry nor releases a newer lease of the same tab', async () => {
    const h = createHarness()
    const tab = await signedInTab(h)
    const ref = (await tab.runtime.beginRequest()).ref

    const gate = holdRefreshResponses(h.server)
    const first = tab.runtime.handleUnauthorized(ref)
    await vi.waitFor(() => expect(gate.waiting()).toBe(1))
    const late = deliverNextTransactionLate(tab.store)
    gate.release()
    await vi.waitFor(() => expect(late.committed()).toBe(true))

    await tab.runtime.signOut()
    await tab.runtime.signIn({ usernameOrEmail: 'other', password: 'p' })
    // Session 1's refresh still holds its lease: let it run out.
    advance(20001)

    // Session 2 reaches its own pending entry, holding its own lease. The gate
    // was released for session 1, so a fresh one holds this response.
    const secondGate = holdRefreshResponses(h.server)
    const second = tab.runtime.handleUnauthorized((await tab.runtime.beginRequest()).ref)
    await vi.waitFor(() => expect(secondGate.waiting()).toBe(1))
    const armed = abortTransactions(tab.store, 2)
    secondGate.release()
    await expect(second).rejects.toBeInstanceOf(StorageTimeoutError)
    const secondLease = h.shared.state.refreshLease

    late.release()
    await first.catch(() => undefined)
    await flush()

    // The old attempt wrote nothing here and cleared nothing: session 2's entry
    // is still waiting, and the newer lease of the same tab is untouched.
    armed.restore()
    expect(h.shared.state.refreshLease).toEqual(secondLease)
    await tab.runtime.reconcileNow()
    expect(h.shared.state.record.session?.generation).toBe(2)
  })

  it('[11] (abort) after discarded, the reconcile completes before any send and no refresh is sent when tokens moved on', async () => {
    const h = createHarness()
    const { tab, ref } = await pendingByAbort(h)

    // A's entry never committed, so the stored record is still the session it
    // was sent for: another tab started now adopts it.
    const b = h.createTab('B')
    await b.runtime.start()

    // A's lease runs out, and another tab moves two generations on.
    advance(20001)
    await b!.runtime.handleUnauthorized((await b!.runtime.beginRequest()).ref)
    await b!.runtime.handleUnauthorized((await b!.runtime.beginRequest()).ref)
    const stored = h.shared.state.record.session
    expect(stored!.generation).toBeGreaterThanOrEqual(3)
    const before = h.server.refreshCalls

    // The pending commit is discarded, and the tab adopts what is stored.
    expect(await tab.runtime.handleUnauthorized(ref)).toBe('retry')
    expect(h.server.refreshCalls).toBe(before)
    expect(lastTokens(tab)?.generation).toBe(stored!.generation)
  })

  it('[11] (abort) after session-mismatch, the tab ends and sends nothing', async () => {
    const h = createHarness()
    const { tab, ref } = await pendingByAbort(h)

    // Another session is stored under A's back.
    const b = h.createTab('B')
    await b.runtime.start()
    await b.runtime.signOut()
    await b.runtime.signIn({ usernameOrEmail: 'other', password: 'p' })
    const before = h.server.refreshCalls

    expect(await tab.runtime.handleUnauthorized(ref)).toBe('ended')
    expect(h.server.refreshCalls).toBe(before)
    expect(tab.runtime.status()).toBe('signed-out')
  })

  it('[11] (abort) after discarded, a failed reconcile read sends nothing and rejects', async () => {
    const h = createHarness()
    const { tab, ref } = await pendingByAbort(h)

    const b = h.createTab('B')
    await b.runtime.start()
    advance(20001)
    await b.runtime.handleUnauthorized((await b.runtime.beginRequest()).ref)
    await b.runtime.handleUnauthorized((await b.runtime.beginRequest()).ref)
    const before = h.server.refreshCalls

    tab.store.failNextRead(new StorageUnavailableError('gone'))
    await expect(tab.runtime.handleUnauthorized(ref)).rejects.toBeInstanceOf(StorageUnavailableError)
    expect(h.server.refreshCalls).toBe(before)
  })

  it('[13] each acquisition is released at most once', async () => {
    const countReleases = (tab: Tab) => ({
      acquired: tab.trace.filter((e) => e.type === 'lease-acquire' && e.acquired).length,
      released: tab.trace.filter((e) => e.type === 'lease-release' && e.outcome === 'released').length,
      skipped: tab.trace.filter((e) => e.type === 'lease-release' && e.outcome === 'skipped-pending').length,
    })

    // A plain refresh: the entry takes the lease over, so the refresh skips it
    // and the entry releases it once.
    const plain = createHarness({ trace: true })
    const p = await signedInTab(plain)
    await p.runtime.handleUnauthorized((await p.runtime.beginRequest()).ref)
    await vi.waitFor(() => expect(countReleases(p).released).toBe(1))
    expect(countReleases(p)).toMatchObject({ acquired: 1, released: 1, skipped: 1 })

    // A pending entry that lands later: same, once the entry is removed.
    const later = createHarness({ trace: true })
    const l = await signedInTab(later)
    const laterGate = holdRefreshResponses(later.server)
    const laterAttempt = l.runtime.handleUnauthorized((await l.runtime.beginRequest()).ref)
    await vi.waitFor(() => expect(laterGate.waiting()).toBe(1))
    // Armed once the lease is taken: only the commits meet the gate.
    const laterArmed = abortTransactions(l.store, 2)
    laterGate.release()
    await expect(laterAttempt).rejects.toBeInstanceOf(StorageTimeoutError)
    expect(countReleases(l)).toMatchObject({ acquired: 1, released: 0 })
    laterArmed.restore()
    await l.runtime.reconcileNow()
    await vi.waitFor(() => expect(countReleases(l).released).toBe(1))
    expect(countReleases(l)).toMatchObject({ acquired: 1, released: 1, skipped: 1 })

    // An inline success on the second attempt: the entry is installed either
    // way, so the lease still changes hands exactly once.
    const second = createHarness({ trace: true })
    const s = await signedInTab(second)
    const onceGate = holdRefreshResponses(second.server)
    const onceAttempt = s.runtime.handleUnauthorized((await s.runtime.beginRequest()).ref)
    await vi.waitFor(() => expect(onceGate.waiting()).toBe(1))
    const onceArmed = abortTransactions(s.store, 1)
    onceGate.release()
    await onceAttempt
    onceArmed.restore()
    await vi.waitFor(() => expect(countReleases(s).released).toBe(1))
    expect(countReleases(s)).toMatchObject({ acquired: 1, released: 1, skipped: 1 })
  })
})
