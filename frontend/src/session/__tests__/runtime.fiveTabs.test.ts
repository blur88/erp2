import { describe, it, expect, vi } from 'vitest'
import { createHarness, holdRefreshResponses, type Tab } from './twoTabs'
import type { SessionRef } from '../types'

const flush = () => new Promise((r) => setTimeout(r, 0))
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

const NAMES = ['A', 'B', 'C', 'D', 'E']

// Five tabs of one profile, all started from the one stored session. With
// `broadcast`, a tab's channel post reaches every other tab, as a real
// BroadcastChannel does (the harness alone only echoes it to the poster).
async function fiveTabs(opts: { broadcast: boolean }) {
  const h = createHarness()
  const tabs: Tab[] = NAMES.map((name) => h.createTab(name))
  await tabs[0].runtime.start()
  await tabs[0].runtime.signIn({ usernameOrEmail: 'u', password: 'p' })
  for (const tab of tabs.slice(1)) await tab.runtime.start()

  if (opts.broadcast) {
    tabs.forEach((tab) => {
      tab.channelPost.mockImplementation(() => {
        tabs.filter((other) => other !== tab).forEach((other) => other.deliverChannel())
      })
    })
  }

  // Every tab sent requests with the generation-1 token.
  const refs: SessionRef[] = []
  for (const tab of tabs) refs.push((await tab.runtime.beginRequest()).ref)
  return { h, tabs, refs }
}

const storedGeneration = (h: ReturnType<typeof createHarness>) => h.shared.state.record.session?.generation

describe('session runtime — five tabs holding one expired token', () => {
  it('five tabs get 401 before any refresh is sent and one refresh is sent', async () => {
    const { h, tabs, refs } = await fiveTabs({ broadcast: true })
    const gate = holdRefreshResponses(h.server)

    const outcomes = tabs.map((tab, i) => tab.runtime.handleUnauthorized(refs[i]))
    await vi.waitFor(() => expect(gate.waiting()).toBe(1))
    gate.release()

    expect(await Promise.all(outcomes)).toEqual(['retry', 'retry', 'retry', 'retry', 'retry'])
    expect(h.server.refreshCalls).toBe(1)
    expect(h.server.rotations).toBe(1)
    expect(storedGeneration(h)).toBe(2)
    for (const tab of tabs) expect((await tab.runtime.beginRequest()).ref.generation).toBe(2)
    expect(h.shared.state.refreshLease).toBeNull()
  })

  it('tabs whose 401 arrives while the refresh is in flight do not send their own', async () => {
    const { h, tabs, refs } = await fiveTabs({ broadcast: true })
    const gate = holdRefreshResponses(h.server)

    const first = tabs[0].runtime.handleUnauthorized(refs[0])
    await vi.waitFor(() => expect(gate.waiting()).toBe(1))
    const rest = tabs.slice(1).map((tab, i) => tab.runtime.handleUnauthorized(refs[i + 1]))
    await flush()
    gate.release()

    expect(await Promise.all([first, ...rest])).toEqual(['retry', 'retry', 'retry', 'retry', 'retry'])
    expect(h.server.refreshCalls).toBe(1)
    expect(h.server.rotations).toBe(1)
  })

  it('a waiting tab that takes the new tokens through another request does not refresh again', async () => {
    // No channel here: the waiting tab learns of generation 2 only through the
    // reconcile its own next request runs.
    const { h, tabs, refs } = await fiveTabs({ broadcast: false })
    const [a, b] = tabs
    const gate = holdRefreshResponses(h.server)

    const pa = a.runtime.handleUnauthorized(refs[0])
    await vi.waitFor(() => expect(gate.waiting()).toBe(1))
    const pb = b.runtime.handleUnauthorized(refs[1])
    await flush()
    gate.release()
    expect(await pa).toBe('retry')

    // B is between two polls of the lease when another of its requests starts.
    expect((await b.runtime.beginRequest()).ref.generation).toBe(2)

    expect(await pb).toBe('retry')
    expect(h.server.refreshCalls).toBe(1)
    expect(h.server.rotations).toBe(1)
  })

  it('several requests per tab, their 401s spread over the refresh, still make one refresh', async () => {
    const { h, tabs, refs } = await fiveTabs({ broadcast: true })
    const gate = holdRefreshResponses(h.server)

    const outcomes: Array<Promise<'retry' | 'ended'>> = []
    const unauthorized = (i: number) => outcomes.push(tabs[i].runtime.handleUnauthorized(refs[i]))

    // Before the refresh is sent.
    tabs.forEach((_, i) => unauthorized(i))
    await vi.waitFor(() => expect(gate.waiting()).toBe(1))
    // While it is in flight.
    tabs.forEach((_, i) => unauthorized(i))
    await wait(300)
    tabs.forEach((_, i) => unauthorized(i))
    gate.release()
    await vi.waitFor(() => expect(storedGeneration(h)).toBe(2))
    // After it committed, before each tab's own next read.
    tabs.forEach((_, i) => unauthorized(i))
    const settled = await Promise.all(outcomes)
    // After every tab has the new tokens.
    tabs.forEach((_, i) => unauthorized(i))

    expect([...settled, ...(await Promise.all(outcomes.slice(settled.length)))]).toEqual(
      Array.from({ length: 25 }, () => 'retry'),
    )
    expect(h.server.refreshCalls).toBe(1)
    expect(h.server.rotations).toBe(1)
    expect(storedGeneration(h)).toBe(2)
  })

  it('a 401 that arrives after another tab committed is settled by the first reconcile', async () => {
    const { h, tabs, refs } = await fiveTabs({ broadcast: false })
    expect(await tabs[0].runtime.handleUnauthorized(refs[0])).toBe('retry')
    expect(storedGeneration(h)).toBe(2)

    // The other tabs still hold generation 1 in memory; nothing told them.
    for (let i = 1; i < tabs.length; i += 1) {
      expect(await tabs[i].runtime.handleUnauthorized(refs[i])).toBe('retry')
    }
    expect(h.server.refreshCalls).toBe(1)
  })

  it('a 401 for an old-token request after the tab adopted through a request is not refreshed for', async () => {
    const { h, tabs, refs } = await fiveTabs({ broadcast: false })
    expect(await tabs[0].runtime.handleUnauthorized(refs[0])).toBe('retry')

    const b = tabs[1]
    expect(await b.runtime.canDeliver(refs[1])).toBe(true) // adopts generation 2
    expect(await b.runtime.handleUnauthorized(refs[1])).toBe('retry')
    expect(h.server.refreshCalls).toBe(1)
  })
})
