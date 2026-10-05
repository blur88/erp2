import { describe, it, expect, vi } from 'vitest'
import { createSharedMemory, createMemorySessionStore } from '../store/memorySessionStore'
import { StorageTimeoutError, StorageUnavailableError } from '../types'

const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms))

describe('memorySessionStore', () => {
  it("two stores on one shared memory see each other's writes", async () => {
    const shared = createSharedMemory()
    const a = createMemorySessionStore(shared)
    const b = createMemorySessionStore(shared)

    await a.transact((s) => ({ write: { record: { revision: s.record.revision + 1, session: null } }, result: null }))
    const read = await b.read()
    expect(read.record.revision).toBe(1)
  })

  it('transactions are serialized', async () => {
    const shared = createSharedMemory()
    const a = createMemorySessionStore(shared)

    const bump = () =>
      a.transact((s) => ({ write: { record: { revision: s.record.revision + 1, session: null } }, result: null }))

    await Promise.all([bump(), bump()])
    expect(shared.state.record.revision).toBe(2)
  })

  it('a transaction blocked past its timeout rejects with StorageTimeoutError and never applies', async () => {
    const shared = createSharedMemory()
    const a = createMemorySessionStore(shared)
    const decide = vi.fn(() => ({ result: null }) as never)

    const hold = a.holdNextTransaction()
    const promise = a.transact(decide, { timeoutMs: 50 })
    await expect(promise).rejects.toBeInstanceOf(StorageTimeoutError)
    hold.release()
    await wait()
    expect(decide).not.toHaveBeenCalled()
    expect(shared.state.record.revision).toBe(0)
  })

  it('a transaction that already applied resolves even if the timer fires afterwards', async () => {
    const shared = createSharedMemory()
    const a = createMemorySessionStore(shared)

    const result = await a.transact(
      (s) => ({ write: { record: { revision: s.record.revision + 1, session: null } }, result: 'ok' }),
      { timeoutMs: 0 },
    )
    expect(result).toBe('ok')
    expect(shared.state.record.revision).toBe(1)
  })

  it('read failure surfaces as StorageUnavailableError', async () => {
    const shared = createSharedMemory()
    const a = createMemorySessionStore(shared)
    a.failNextRead(new StorageUnavailableError('nope'))
    await expect(a.read()).rejects.toBeInstanceOf(StorageUnavailableError)
    await expect(a.read()).resolves.toBeDefined()
  })

  it('close() fires onClosed and makes later calls reject with StorageUnavailableError', async () => {
    const shared = createSharedMemory()
    const a = createMemorySessionStore(shared)
    const listener = vi.fn()
    a.onClosed(listener)

    a.close()
    expect(listener).toHaveBeenCalledTimes(1)
    await expect(a.read()).rejects.toBeInstanceOf(StorageUnavailableError)
    await expect(a.transact(() => ({ result: null }))).rejects.toBeInstanceOf(StorageUnavailableError)
  })
})
