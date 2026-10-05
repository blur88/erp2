import { describe, it, expect, vi } from 'vitest'
import { openIndexedDbSessionStore } from '../store/indexedDbSessionStore'
import { StorageTimeoutError, StorageUnavailableError } from '../types'

class StubTransaction {
  oncomplete: (() => void) | null = null
  onabort: (() => void) | null = null
  onerror: (() => void) | null = null
  aborted = false
  objectStore() {
    return stubStore
  }
  abort() {
    this.aborted = true
    queueMicrotask(() => this.onabort?.())
  }
}

let stubStore: {
  get: (key: string) => { onsuccess?: () => void; result?: unknown }
  put: (value: unknown, key: string) => void
  delete: (key: string) => void
} = {
  get: () => ({}),
  put: () => {},
  delete: () => {},
}

function makeStubFactory(mode: 'ok' | 'error' | 'stall' | 'stall-before-get' = 'ok') {
  const calls: string[] = []
  let activeTx: StubTransaction | null = null
  const request: IDBOpenDBRequest = {} as IDBOpenDBRequest

  const factory = {
    open() {
      queueMicrotask(() => {
        if (mode === 'error') {
          ;(request as unknown as { onerror: () => void }).onerror?.()
          return
        }
        const db = {
          createObjectStore: () => stubStore,
          objectStoreNames: { contains: () => true },
          transaction: () => {
            const tx = new StubTransaction()
            activeTx = tx
            return tx
          },
          close: () => {},
          onversionchange: null,
        }
        ;(request as unknown as { result: unknown }).result = db
        ;(request as unknown as { onupgradeneeded: () => void }).onupgradeneeded?.()
        ;(request as unknown as { onsuccess: () => void }).onsuccess?.()
      })
      return request
    },
    __calls: calls,
    __getActiveTx: () => activeTx,
  }
  return factory
}

describe('indexedDbSessionStore', () => {
  it('rejects with StorageUnavailableError when no factory exists', async () => {
    await expect(openIndexedDbSessionStore(undefined)).rejects.toBeInstanceOf(StorageUnavailableError)
  })

  it('rejects with StorageUnavailableError when open fires an error', async () => {
    const factory = makeStubFactory('error')
    await expect(openIndexedDbSessionStore(factory as unknown as IDBFactory)).rejects.toBeInstanceOf(
      StorageUnavailableError,
    )
  })

  it('calls decide synchronously inside the transaction and writes only the returned keys', async () => {
    const order: string[] = []
    stubStore = {
      get: (key) => {
        order.push(`get:${key}`)
        const req: { onsuccess?: () => void; result?: unknown } = { result: undefined }
        queueMicrotask(() => req.onsuccess?.())
        return req
      },
      put: (_value, key) => order.push(`put:${key}`),
      delete: (key) => order.push(`delete:${key}`),
    }

    let decideCalled = false
    const factory = makeStubFactory('ok')
    const store = await openIndexedDbSessionStore(factory as unknown as IDBFactory)

    const promise = store.transact((s) => {
      decideCalled = true
      expect(order).toEqual(['get:record', 'get:slices', 'get:refreshLease'])
      return { write: { record: { revision: s.record.revision + 1, session: null } }, result: 'r' }
    })

    // Resolve only when the test fires oncomplete.
    const tx = factory.__getActiveTx()
    expect(decideCalled).toBe(false)
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(decideCalled).toBe(true)
    expect(order).toEqual(['get:record', 'get:slices', 'get:refreshLease', 'put:record'])

    const resolved = vi.fn()
    promise.then(resolved)
    await Promise.resolve()
    expect(resolved).not.toHaveBeenCalled()
    tx?.oncomplete?.()
    await expect(promise).resolves.toBe('r')
  })

  it('a timeout before the transaction starts aborts it', async () => {
    stubStore = {
      get: () => ({}), // never fires onsuccess
      put: () => {},
      delete: () => {},
    }
    const factory = makeStubFactory('stall')
    const store = await openIndexedDbSessionStore(factory as unknown as IDBFactory)
    const decide = vi.fn(() => ({ result: null }) as never)

    await expect(store.transact(decide, { timeoutMs: 30 })).rejects.toBeInstanceOf(StorageTimeoutError)
    expect(decide).not.toHaveBeenCalled()
    expect(factory.__getActiveTx()?.aborted).toBe(true)
  })

  it('onTiming is called once per read and once per transact, and not at all when omitted', async () => {
    stubStore = {
      get: (key) => {
        const req: { onsuccess?: () => void; result?: unknown } = { result: key === 'record' ? undefined : undefined }
        queueMicrotask(() => req.onsuccess?.())
        return req
      },
      put: () => {},
      delete: () => {},
    }
    const onTiming = vi.fn()
    const factory = makeStubFactory('ok')
    const store = await openIndexedDbSessionStore(factory as unknown as IDBFactory, { onTiming })

    await store.read()
    expect(onTiming).toHaveBeenCalledTimes(1)
    expect(onTiming.mock.calls[0][0]).toBe('read')

    const txPromise = store.transact(() => ({ result: null }))
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    factory.__getActiveTx()?.oncomplete?.()
    await txPromise
    expect(onTiming).toHaveBeenCalledTimes(2)
    expect(onTiming.mock.calls[1][0]).toBe('transact')

    const factory2 = makeStubFactory('ok')
    const store2 = await openIndexedDbSessionStore(factory2 as unknown as IDBFactory)
    await store2.read()
    expect(onTiming).toHaveBeenCalledTimes(2)
  })
})
