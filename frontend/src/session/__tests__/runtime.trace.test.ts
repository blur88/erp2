import { describe, it, expect, vi } from 'vitest'
import { createHarness, holdRefreshResponses } from './twoTabs'
import { StorageTimeoutError } from '../types'

async function signedInTab(h: ReturnType<typeof createHarness>, id = 'A') {
  const tab = h.createTab(id)
  await tab.runtime.start()
  await tab.runtime.signIn({ usernameOrEmail: 'u', password: 'p' })
  return tab
}

describe('session runtime — trace of the refresh path', () => {
  it('a refresh emits its events in order under one refreshId, and none holds a token', async () => {
    const h = createHarness({ trace: true })
    const a = await signedInTab(h)
    const ref = (await a.runtime.beginRequest()).ref
    await a.runtime.handleUnauthorized(ref)

    expect(a.trace.map((e) => e.type)).toEqual([
      'settled-read',
      'lease-acquire',
      'settled-read',
      'refresh-sent',
      'refresh-answered',
      'token-commit',
      'lease-release',
    ])
    expect(new Set(a.trace.map((e) => e.refreshId)).size).toBe(1)
    expect(a.trace.find((e) => e.type === 'refresh-sent')).toMatchObject({ presentedGeneration: 1 })
    expect(a.trace.find((e) => e.type === 'refresh-answered')).toMatchObject({ status: 'ok', returnedGeneration: 2 })
    expect(a.trace.find((e) => e.type === 'token-commit')).toMatchObject({
      outcome: 'written-both',
      trigger: 'inline',
      attempt: 1,
      triggeredBy: null,
    })
    // The fake server's token prefixes: nothing in a trace is a token.
    expect(JSON.stringify(a.trace)).not.toMatch(/rt-|at-/)
  })

  it('a commit that times out is traced as timeout', async () => {
    const h = createHarness({ trace: true })
    const a = await signedInTab(h)
    const ref = (await a.runtime.beginRequest()).ref

    // The response is gated so the lease is taken before the store is held: the
    // transaction that stalls is the commit, not the acquisition.
    const gate = holdRefreshResponses(h.server)
    const attempt = a.runtime.handleUnauthorized(ref)
    await vi.waitFor(() => expect(gate.waiting()).toBe(1))
    const hold = a.store.holdNextTransaction()
    gate.release()

    await vi.waitFor(() => expect(a.trace.some((e) => e.type === 'token-commit' && e.outcome === 'timeout')).toBe(true), {
      timeout: 9000,
    })
    hold.release()

    await expect(attempt).rejects.toBeInstanceOf(StorageTimeoutError)
    expect(a.trace.filter((e) => e.type === 'token-commit')).toHaveLength(1)
  }, 20000)

  it('nothing is emitted and nothing throws when onTrace is not supplied', async () => {
    const h = createHarness()
    const a = await signedInTab(h)
    const ref = (await a.runtime.beginRequest()).ref

    expect(await a.runtime.handleUnauthorized(ref)).toBe('retry')
    expect(a.trace).toEqual([])
    expect(h.shared.state.record.session?.generation).toBe(2)
  })

  it('a second refresh has a different refreshId', async () => {
    const h = createHarness({ trace: true })
    const a = await signedInTab(h)

    await a.runtime.handleUnauthorized((await a.runtime.beginRequest()).ref)
    await a.runtime.handleUnauthorized((await a.runtime.beginRequest()).ref)

    const answers = a.trace.filter((e) => e.type === 'refresh-answered')
    expect(answers).toHaveLength(2)
    expect(answers[0]?.refreshId).not.toBe(answers[1]?.refreshId)
    expect(answers[1]).toMatchObject({ returnedGeneration: 3 })
  })
})
