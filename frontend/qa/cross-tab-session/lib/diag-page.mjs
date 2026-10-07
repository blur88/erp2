// In-page instrumentation for diagnose-latency.mjs (#1345).
//
// Everything here runs in the page (or in a worker of the page) and changes no
// product code: it observes the browser APIs the session store uses.

export const DIAG_MODE_KEY = 'qa-diag-mode'
export const WORKER_PATH = '/__qa-diag-worker.js'

/**
 * The worker's raw-read loop: the same read-only transaction as M1, on a
 * thread of its own, so its latency does not include the page's main thread.
 * Times are absolute (timeOrigin + now) so they line up with the page's.
 */
export const WORKER_SOURCE = `
const abs = () => performance.timeOrigin + performance.now()
const samples = []
const open = indexedDB.open('erp-session', 1)
open.onupgradeneeded = () => {
  if (!open.result.objectStoreNames.contains('kv')) open.result.createObjectStore('kv')
}
open.onsuccess = () => {
  const db = open.result
  const stopAt = abs() + 30000
  const once = () => {
    const t0 = abs()
    const tx = db.transaction('kv', 'readonly')
    const os = tx.objectStore('kv')
    os.get('record'); os.get('slices'); os.get('refreshLease')
    tx.oncomplete = () => {
      samples.push([t0, abs() - t0])
      if (abs() < stopAt) setTimeout(once, 10)
    }
    tx.onabort = () => { samples.push([t0, -1]) }
  }
  once()
}
setInterval(() => { if (samples.length) postMessage(samples.splice(0)) }, 200)
`

/**
 * The init script. `sessionStorage[DIAG_MODE_KEY]` holds a comma-separated
 * list read once per document:
 *   rawMain        raw reads every 10 ms on the main thread
 *   rawWorker      the same from a worker
 *   memoryReads    SIMULATION, baseline only: the page's read-only
 *                  transactions on erp-session are answered from a copy held in
 *                  the page, in a microtask. This is what resolving the gate
 *                  from memory would cost; the spec forbids it.
 *   settleOnSuccess SIMULATION: a read-only transaction's `complete` handler is
 *                  called when its last request succeeded, without waiting for
 *                  the transaction's own `complete` event.
 *   oneKey         SIMULATION: a read asks storage for `record` only; the two
 *                  other keys are answered from a copy held in the page.
 *   noWrites       SIMULATION: the page's read-write transactions are answered
 *                  from the copy and write nothing (a persisted-slices write
 *                  that is skipped). Only valid while nothing has to be stored.
 *   coalesce       SIMULATION: a read created under 1 ms after another that
 *                  has no result yet shares that one's result.
 * Observation (transactions, event-loop lag, long tasks, end stamps on the
 * application's timing entries) is always on.
 */
export function diagInit({ modeKey, workerPath }) {
  const modes = (sessionStorage.getItem(modeKey) || '').split(',').filter(Boolean)
  const has = (m) => modes.includes(m)
  const now = () => performance.now()
  const D = {
    modes,
    origin: performance.timeOrigin,
    tx: [],
    lag: [],
    lagSamples: 0,
    longtasks: [],
    loaf: [],
    rawMain: [],
    rawWorker: [],
  }
  window.__qaDiag = D

  // The application's timing entries carry a duration only. Stamping each one
  // when it is pushed gives its end, and so its start.
  const timings = []
  const push = timings.push.bind(timings)
  timings.push = (entry) => {
    entry.at = now()
    return push(entry)
  }
  window.__erpSessionTimings = timings

  // --- every transaction on erp-session, with the time of each event ---------
  const realTransaction = IDBDatabase.prototype.transaction
  const records = new WeakMap()
  let ownCall = false
  let copy = null

  const needsCopy = has('memoryReads') || has('noWrites') || has('oneKey')
  const clone = (value) => (value === undefined ? undefined : structuredClone(value))

  // A stand-in transaction for the simulations: it collects the caller's
  // requests and answers them all, then completes, when `deliver` is called.
  const fakeTransaction = (record, mode) => {
    const requests = []
    const tx = { mode, error: null, oncomplete: null, onabort: null, abort() {}, addEventListener() {} }
    const os = {
      transaction: tx,
      get(key) {
        const req = { result: undefined, onsuccess: null, onerror: null }
        requests.push([req, key])
        return req
      },
      put(value, key) {
        if (copy) copy[key] = value
        return {}
      },
      delete(key) {
        if (copy) delete copy[key]
        return {}
      },
    }
    tx.objectStore = () => os
    const deliver = (valueOf) => {
      for (const [req, key] of requests) {
        req.result = clone(valueOf(key))
        record.s.push(now())
        if (req.onsuccess) req.onsuccess({ target: req })
      }
      record.done = now()
      record.outcome = 'complete'
      if (tx.oncomplete) tx.oncomplete({ target: tx })
    }
    return { tx, deliver }
  }

  // The read other reads of the same turn may join (simulation `coalesce`).
  let leader = null
  const settleJoiners = (record) => {
    if (!record.joiners) return
    const joiners = record.joiners
    record.joiners = null
    if (leader === record) leader = null
    for (const deliver of joiners) deliver((key) => (key in record.results ? record.results[key] : copy?.[key]))
  }

  IDBDatabase.prototype.transaction = function transaction(...args) {
    if (this.name !== 'erp-session' || ownCall) return realTransaction.apply(this, args)
    const mode = args[1] ?? 'readonly'
    const record = { mode, created: now(), s: [], done: null, outcome: null, requests: 0 }
    D.tx.push(record)
    const fromCopy = (mode === 'readonly' && has('memoryReads')) || (mode === 'readwrite' && has('noWrites'))
    if (fromCopy && copy) {
      record.simulated = mode === 'readonly' ? 'memory' : 'write-skipped'
      const fake = fakeTransaction(record, mode)
      queueMicrotask(() => fake.deliver((key) => copy[key]))
      return fake.tx
    }
    if (mode === 'readonly' && has('coalesce')) {
      // Optimistic: a read joins one created under 1 ms earlier that has no
      // result yet. A real coalescer must start its read after the last
      // request of the turn asked; this is the most that could give.
      if (leader && leader.joiners && leader.s.length === 0 && record.created - leader.created <= 1) {
        record.simulated = 'joined'
        const fake = fakeTransaction(record, mode)
        leader.joiners.push(fake.deliver)
        return fake.tx
      }
      record.joiners = []
      record.results = {}
      leader = record
    }
    const tx = realTransaction.apply(this, args)
    records.set(tx, record)
    tx.addEventListener('complete', () => {
      record.done = now()
      record.outcome = 'complete'
      settleJoiners(record)
      if (mode !== 'readonly') refreshCopy(this)
    })
    tx.addEventListener('abort', () => {
      record.done = now()
      record.outcome = 'abort'
    })
    return tx
  }

  const successSetter = Object.getOwnPropertyDescriptor(IDBRequest.prototype, 'onsuccess').set
  for (const method of ['get', 'put', 'delete']) {
    const real = IDBObjectStore.prototype[method]
    IDBObjectStore.prototype[method] = function wrapped(...args) {
      const record = records.get(this.transaction)
      if (record && method === 'get' && record.mode === 'readonly' && has('oneKey') && copy && args[0] !== 'record') {
        // Simulation: the gate asks storage for the session record only.
        const fake = { result: undefined, onsuccess: null, onerror: null }
        queueMicrotask(() => {
          fake.result = clone(copy[args[0]])
          if (fake.onsuccess) fake.onsuccess({ target: fake })
        })
        return fake
      }
      const req = real.apply(this, args)
      if (record) {
        const tx = this.transaction
        record.requests += 1
        req.addEventListener('success', () => {
          record.s.push(now())
          if (record.results && method === 'get') record.results[args[0]] = req.result
        })
        if (has('settleOnSuccess') && record.mode === 'readonly') {
          // The application's success handler is wrapped so that, right after
          // the last one has run, the transaction's `complete` handler is
          // called in the same task.
          Object.defineProperty(req, 'onsuccess', {
            configurable: true,
            get: () => null,
            set(handler) {
              successSetter.call(req, function onSuccess(event) {
                handler.call(this, event)
                if (record.s.length === record.requests && record.settledEarly === undefined) {
                  record.settledEarly = now()
                  settleJoiners(record)
                  if (tx.oncomplete) tx.oncomplete({ target: tx })
                }
              })
            },
          })
        }
      }
      return req
    }
  }

  const ownRead = (db, done) => {
    ownCall = true
    const tx = realTransaction.call(db, 'kv', 'readonly')
    ownCall = false
    const os = tx.objectStore('kv')
    const t0 = now()
    const out = {}
    let first = null
    for (const key of ['record', 'slices', 'refreshLease']) {
      const req = os.get(key)
      req.onsuccess = () => {
        if (first === null) first = now()
        out[key] = req.result
      }
    }
    tx.oncomplete = () => done(out, t0, first, now())
    tx.onabort = () => done(null, t0, first, now())
  }

  function refreshCopy(db) {
    if (!needsCopy) return
    ownRead(db, (out) => {
      if (out) copy = out
    })
  }

  const withOwnConnection = (use) => {
    const open = indexedDB.open('erp-session', 1)
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains('kv')) open.result.createObjectStore('kv')
    }
    open.onsuccess = () => use(open.result)
  }

  if (needsCopy) withOwnConnection((db) => refreshCopy(db))

  if (has('rawMain')) {
    withOwnConnection((db) => {
      const stopAt = now() + 30000
      const once = () =>
        ownRead(db, (out, t0, first, end) => {
          D.rawMain.push([t0, first === null ? -1 : first - t0, out ? end - t0 : -1])
          if (now() < stopAt) setTimeout(once, 10)
        })
      once()
    })
  }

  if (has('rawWorker')) {
    try {
      const worker = new Worker(workerPath)
      worker.onmessage = (event) => {
        for (const [t0, ms] of event.data) D.rawWorker.push([t0 - D.origin, ms])
      }
      worker.onerror = (event) => {
        D.workerError = String(event.message)
      }
    } catch (err) {
      D.workerError = String(err)
    }
  }

  // --- main-thread delay -------------------------------------------------------
  // A 4 ms timer: how much later than asked it ran. Samples under 2 ms are
  // counted, not kept.
  const INTERVAL = 4
  const lagStop = now() + 30000
  let due = now() + INTERVAL
  const tick = () => {
    const t = now()
    D.lagSamples += 1
    if (t - due >= 2) D.lag.push([due, t - due])
    if (t > lagStop) return
    due = t + INTERVAL
    setTimeout(tick, INTERVAL)
  }
  setTimeout(tick, INTERVAL)

  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) D.longtasks.push([e.startTime, e.duration])
    }).observe({ type: 'longtask', buffered: true })
  } catch {
    D.longtasks = null
  }
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        const scripts = [...(e.scripts ?? [])]
          .sort((a, b) => b.duration - a.duration)
          .slice(0, 2)
          .map((s) => ({
            ms: Math.round(s.duration),
            invoker: String(s.invoker ?? '').split('/').pop().slice(0, 60),
            type: s.invokerType,
            fn: s.sourceFunctionName || undefined,
          }))
        D.loaf.push({ start: e.startTime, ms: e.duration, blocking: e.blockingDuration, scripts })
      }
    }).observe({ type: 'long-animation-frame', buffered: true })
  } catch {
    D.loaf = null
  }
}

/** What one document recorded, taken when its load has settled. */
export function collect(page) {
  return page.evaluate(() => {
    const D = window.__qaDiag
    const api = performance
      .getEntriesByType('resource')
      .filter((e) => new URL(e.name).pathname.startsWith('/api/'))
      .map((e) => ({
        path: new URL(e.name).pathname,
        start: e.startTime,
        requestStart: e.requestStart,
        responseStart: e.responseStart,
        end: e.responseEnd,
        status: e.responseStatus,
      }))
    const nav = performance.getEntriesByType('navigation')[0]
    return {
      ...D,
      timings: (window.__erpSessionTimings ?? []).map((e) => ({ ...e })),
      api,
      nav: nav ? { domInteractive: nav.domInteractive, domContentLoaded: nav.domContentLoadedEventEnd, load: nav.loadEventEnd } : null,
    }
  })
}

// --- idle-page experiments: what the browser does, with no application load ---

/** Does a read-only transaction wait for a read-write one that is still open? */
export function experimentReadBehindWrite(page, holdMs) {
  return page.evaluate(
    (hold) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('erp-session', 1)
        open.onerror = () => reject(new Error('open failed'))
        open.onsuccess = () => {
          const db = open.result
          const t0 = performance.now()
          const out = { holdMs: hold }
          const rw = db.transaction('kv', 'readwrite')
          const os = rw.objectStore('kv')
          // Kept open by issuing another request from each success handler.
          const spin = () => {
            if (performance.now() - t0 >= hold) return
            os.get('qa-diag-none').onsuccess = spin
          }
          spin()
          rw.oncomplete = () => {
            out.writeCompleteAt = performance.now() - t0
            if (out.readCompleteAt !== undefined) finish()
          }
          const finish = () => {
            db.close()
            resolve(out)
          }
          setTimeout(() => {
            const created = performance.now()
            out.readCreatedAt = created - t0
            const ro = db.transaction('kv', 'readonly')
            ro.objectStore('kv').get('record').onsuccess = () => {
              out.readFirstSuccessAt = performance.now() - t0
            }
            ro.oncomplete = () => {
              out.readCompleteAt = performance.now() - t0
              if (out.writeCompleteAt !== undefined) finish()
            }
          }, 10)
        }
      }),
    holdMs,
  )
}

/** One raw read while the main thread is kept busy for `blockMs` right after it was asked. */
export function experimentReadWhileBlocked(page, blockMs) {
  return page.evaluate(
    (block) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('erp-session', 1)
        open.onerror = () => reject(new Error('open failed'))
        open.onsuccess = () => {
          const db = open.result
          setTimeout(() => {
            const t0 = performance.now()
            const tx = db.transaction('kv', 'readonly')
            const os = tx.objectStore('kv')
            const successes = []
            for (const key of ['record', 'slices', 'refreshLease']) {
              os.get(key).onsuccess = () => successes.push(performance.now() - t0)
            }
            tx.oncomplete = () => {
              db.close()
              resolve({ blockMs: block, firstSuccessAt: successes[0], lastSuccessAt: successes[2], completeAt: performance.now() - t0 })
            }
            while (performance.now() - t0 < block) {
              /* busy */
            }
          }, 50)
        }
      }),
    blockMs,
  )
}

/** Raw reads and raw writes on an idle page, each with its phases. */
export function experimentIdlePhases(page, count) {
  return page.evaluate(
    (n) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('erp-session', 1)
        open.onerror = () => reject(new Error('open failed'))
        open.onsuccess = async () => {
          const db = open.result
          const one = (mode, keys, options) =>
            new Promise((done, failed) => {
              const t0 = performance.now()
              const tx = options ? db.transaction('kv', mode, options) : db.transaction('kv', mode)
              const os = tx.objectStore('kv')
              const successes = []
              for (const key of keys) os.get(key).onsuccess = () => successes.push(performance.now() - t0)
              if (mode === 'readwrite') os.put({ at: t0 }, 'qa-diag-write')
              tx.oncomplete = () => done({ first: successes[0], last: successes[successes.length - 1], complete: performance.now() - t0 })
              tx.onabort = () => failed(new Error('aborted'))
            })
          const out = { readThreeKeys: [], readOneKey: [], write: [], writeRelaxed: [], writeStrict: [] }
          const three = ['record', 'slices', 'refreshLease']
          try {
            for (let i = 0; i < n; i += 1) out.readThreeKeys.push(await one('readonly', three))
            for (let i = 0; i < n; i += 1) out.readOneKey.push(await one('readonly', ['record']))
            for (let i = 0; i < n; i += 1) out.write.push(await one('readwrite', three))
            for (let i = 0; i < n; i += 1) out.writeRelaxed.push(await one('readwrite', three, { durability: 'relaxed' }))
            for (let i = 0; i < n; i += 1) out.writeStrict.push(await one('readwrite', three, { durability: 'strict' }))
            await new Promise((done) => {
              const tx = db.transaction('kv', 'readwrite')
              tx.objectStore('kv').delete('qa-diag-write')
              tx.oncomplete = done
              tx.onabort = done
            })
          } catch (err) {
            reject(err)
            return
          }
          db.close()
          resolve(out)
        }
      }),
    count,
  )
}
