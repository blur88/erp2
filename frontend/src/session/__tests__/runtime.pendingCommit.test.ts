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
  holdRefreshResponses,
  abortTransactions,
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
})
