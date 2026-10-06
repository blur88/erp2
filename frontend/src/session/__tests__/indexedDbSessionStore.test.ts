import { describe, it, expect, vi } from 'vitest'
import { openIndexedDbSessionStore } from '../store/indexedDbSessionStore'
import { StorageTimeoutError, StorageUnavailableError } from '../types'

class StubTransaction {
  oncomplete: (() => void) | null = null
  onabort: (() => void) | null = null
  onerror: (() => void) | null = null
  aborted = false
  abortCalls = 0
  // 'fires': abort() takes effect and onabort follows, as for a transaction that
  // has not started committing. 'silent': abort() takes effect and the test fires
  // onabort itself. 'throws': the transaction is already committing or finished.
  abortMode: 'fires' | 'silent' | 'throws' = 'fires'
  objectStore() {
    return stubStore
  }
  abort() {
    this.abortCalls += 1
    if (this.abortMode === 'throws') {
      throw new DOMException('The transaction has finished.', 'InvalidStateError')
    }
    this.aborted = true
    if (this.abortMode === 'fires') queueMicrotask(() => this.onabort?.())
  }
}

let currentTx: StubTransaction | null = null

// A store whose gets succeed on a microtask. Like IndexedDB, an exception thrown
// by a success handler aborts the transaction.
function answeringStore(order: string[] = [], stored: Record<string, unknown> = {}): typeof stubStore {
  return {
    get: (key) => {
      order.push(`get:${key}`)
      const req: { onsuccess?: () => void; result?: unknown } = { result: stored[key] }
      const tx = currentTx
      queueMicrotask(() => {
        try {
          req.onsuccess?.()
        } catch {
          if (tx && !tx.aborted) {
            tx.aborted = true
            queueMicrotask(() => tx.onabort?.())
          }
        }
      })
      return req
    },
    put: (_value, key) => order.push(`put:${key}`),
    delete: (key) => order.push(`delete:${key}`),
  }
}

const ticks = async (n = 4) => {
  for (let i = 0; i < n; i += 1) await Promise.resolve()
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

function observe<T>(promise: Promise<T>) {
  const state: { status: 'pending' | 'resolved' | 'rejected'; value?: T; error?: unknown } = { status: 'pending' }
  promise.then(
    (value) => Object.assign(state, { status: 'resolved', value }),
    (error) => Object.assign(state, { status: 'rejected', error }),
  )
  return state
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
            currentTx = tx
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

    const readPromise = store.read()
    await ticks()
    factory.__getActiveTx()?.oncomplete?.()
    await readPromise
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
    const readPromise2 = store2.read()
    await ticks()
    factory2.__getActiveTx()?.oncomplete?.()
    await readPromise2
    expect(onTiming).toHaveBeenCalledTimes(2)
  })

  const SESSION = {
    sessionId: 's1',
    generation: 1,
    accessToken: 'at',
    accessTokenExpiresAt: 10,
    refreshToken: 'rt',
    user: null,
    rememberMe: false,
  }

  describe('completion semantics (spec B3)', () => {
    it('a timeout that fires while the transaction is committing still resolves from oncomplete', async () => {
      const order: string[] = []
      stubStore = answeringStore(order)
      const factory = makeStubFactory('ok')
      const store = await openIndexedDbSessionStore(factory as unknown as IDBFactory)

      const promise = store.transact(
        (s) => ({ write: { record: { revision: s.record.revision + 1, session: null } }, result: 'r' }),
        { timeoutMs: 20 },
      )
      const seen = observe(promise)
      const tx = factory.__getActiveTx()!
      tx.abortMode = 'throws'
      await ticks()
      expect(order).toEqual(['get:record', 'get:slices', 'get:refreshLease', 'put:record'])

      await wait(40)
      expect(tx.abortCalls).toBe(1)
      expect(seen.status).toBe('pending')

      tx.oncomplete?.()
      await ticks()
      expect(seen).toEqual({ status: 'resolved', value: 'r' })
    })

    it('a timeout does not settle the caller until onabort fires', async () => {
      stubStore = { get: () => ({}), put: () => {}, delete: () => {} } // queued: nothing answers
      const factory = makeStubFactory('ok')
      const store = await openIndexedDbSessionStore(factory as unknown as IDBFactory)
      const decide = vi.fn(() => ({ result: null }) as never)

      const seen = observe(store.transact(decide, { timeoutMs: 20 }))
      const tx = factory.__getActiveTx()!
      tx.abortMode = 'silent'

      await wait(40)
      expect(tx.abortCalls).toBe(1)
      expect(seen.status).toBe('pending')

      tx.onabort?.()
      await ticks()
      expect(seen.status).toBe('rejected')
      expect(seen.error).toBeInstanceOf(StorageTimeoutError)
      expect(decide).not.toHaveBeenCalled()
    })

    it('a read timeout that fires while the transaction is finishing still resolves from oncomplete', async () => {
      stubStore = answeringStore([], { record: { revision: 7, session: SESSION } })
      const factory = makeStubFactory('ok')
      const store = await openIndexedDbSessionStore(factory as unknown as IDBFactory)

      const seen = observe(store.read({ timeoutMs: 20 }))
      const tx = factory.__getActiveTx()!
      tx.abortMode = 'throws'

      await wait(40)
      expect(tx.abortCalls).toBe(1)
      expect(seen.status).toBe('pending')

      tx.oncomplete?.()
      await ticks()
      expect(seen.status).toBe('resolved')
      expect(seen.value?.record).toEqual({ revision: 7, session: SESSION })
    })

    it('a read timeout does not settle the caller until onabort fires', async () => {
      stubStore = { get: () => ({}), put: () => {}, delete: () => {} }
      const factory = makeStubFactory('ok')
      const store = await openIndexedDbSessionStore(factory as unknown as IDBFactory)

      const seen = observe(store.read({ timeoutMs: 20 }))
      const tx = factory.__getActiveTx()!
      tx.abortMode = 'silent'

      await wait(40)
      expect(tx.abortCalls).toBe(1)
      expect(seen.status).toBe('pending')

      tx.onabort?.()
      await ticks()
      expect(seen.status).toBe('rejected')
      expect(seen.error).toBeInstanceOf(StorageTimeoutError)
    })
  })

  describe('abort classification (spec B8)', () => {
    it('an abort that the timeout did not request rejects with StorageUnavailableError', async () => {
      stubStore = answeringStore()
      const factory = makeStubFactory('ok')
      const store = await openIndexedDbSessionStore(factory as unknown as IDBFactory)

      const seen = observe(
        store.transact((s) => ({ write: { record: { revision: s.record.revision + 1, session: null } }, result: 'r' })),
      )
      const tx = factory.__getActiveTx()!
      await ticks()
      // The commit fails (quota, for one): onabort with no timer having fired.
      tx.onabort?.()
      await ticks()
      expect(tx.abortCalls).toBe(0)
      expect(seen.status).toBe('rejected')
      expect(seen.error).toBeInstanceOf(StorageUnavailableError)
    })

    it('a read abort that the timeout did not request rejects with StorageUnavailableError', async () => {
      stubStore = { get: () => ({}), put: () => {}, delete: () => {} }
      const factory = makeStubFactory('ok')
      const store = await openIndexedDbSessionStore(factory as unknown as IDBFactory)

      const seen = observe(store.read())
      factory.__getActiveTx()!.onabort?.()
      await ticks()
      expect(seen.status).toBe('rejected')
      expect(seen.error).toBeInstanceOf(StorageUnavailableError)
    })

    it('a decide function that throws aborts the transaction and rejects with StorageUnavailableError, writing nothing', async () => {
      const order: string[] = []
      stubStore = answeringStore(order)
      const factory = makeStubFactory('ok')
      const store = await openIndexedDbSessionStore(factory as unknown as IDBFactory)

      const seen = observe(
        store.transact(() => {
          throw new Error('decide failed')
        }),
      )
      const tx = factory.__getActiveTx()!
      await ticks(8)
      expect(tx.aborted).toBe(true)
      expect(seen.status).toBe('rejected')
      expect(seen.error).toBeInstanceOf(StorageUnavailableError)
      expect(order).toEqual(['get:record', 'get:slices', 'get:refreshLease'])
    })
  })
})
