// Shared machinery for the cross-tab session cases (#1345).
//
// Vocabulary used throughout:
//   profile  one BrowserContext: one browser profile, one IndexedDB, one
//            BroadcastChannel namespace, at most six connections per host.
//   tab      one Page inside a profile. "Two tabs" always means two pages of
//            ONE profile; two profiles would share nothing and prove nothing.
import { createHash } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import { join, normalize } from 'node:path'
import { sleep } from './config.mjs'

export const SESSION_ZONE = /^\/api\/auth\/(refresh|logout|me)\/?$/
export const LOGIN_ZONE = /^\/api\/(auth|login|register)/
export const MARKER = 'X-ERP-Session-Protocol'
export const MARKER_VALUE = '2'
export const DRAFT_PREFIX = 'erp:bank-reconciliation-draft:'
export const USER_MENU = '[aria-label="Open user menu"]'
export const LOGIN_FIELD = 'input[name="usernameOrEmail"]'
export const PASSWORD_FIELD = 'input[name="password"]'

export const fingerprint = (token) =>
  token ? createHash('sha256').update(String(token)).digest('hex').slice(0, 12) : null

export function zoneOf(path) {
  if (SESSION_ZONE.test(path)) return 'session'
  if (LOGIN_ZONE.test(path)) return 'login'
  if (path.startsWith('/api/health')) return 'health'
  if (path.startsWith('/api/')) return 'business'
  return 'static'
}

export async function withTimeout(promise, ms, what) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms: ${what}`)), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer)
  }
}

/** True when the predicate became true in the page, false on timeout. Anything else throws. */
export async function becomes(page, fn, arg, timeout) {
  try {
    await page.waitForFunction(fn, arg, { timeout, polling: 100 })
    return true
  } catch (err) {
    if (err && err.name === 'TimeoutError') return false
    throw err
  }
}

// ---------------------------------------------------------------------------
// Run-wide state: the browser, the counters that results.json reports, and the
// 429 bookkeeping that fails a case.
// ---------------------------------------------------------------------------

export class Run {
  constructor({ config, zones, browser }) {
    this.config = config
    this.zones = zones
    this.browser = browser
    this.signInWaits = 0
    this.loginZone429 = 0
    this.currentCase = null
    this.seq = 0
  }
}

export class CaseContext {
  constructor(run, id) {
    this.run = run
    this.id = id
    this.config = run.config
    this.zones = run.zones
    this.checks = []
    this.recorded = {}
    this.unexpected429 = []
    this.allow429 = false
    this.profiles = []
    // Prefixed to every check label; a case that runs two scenarios sets it.
    this.scope = ''
  }

  /** A pass condition. Recorded whether it holds or not; a false one fails the case. */
  check(label, ok, detail) {
    const entry = { label: `${this.scope}${label}`, ok: ok === true }
    if (detail !== undefined) entry.detail = detail
    this.checks.push(entry)
    console.log(`    ${entry.ok ? 'ok  ' : 'FAIL'} ${entry.label}${detail !== undefined && !entry.ok ? ` — ${JSON.stringify(detail)}` : ''}`)
    return entry.ok
  }

  /** Evidence that is not itself a pass condition. */
  record(key, value) {
    this.recorded[`${this.scope}${key}`] = value
  }

  /** A precondition of the case, not the thing under test: stop here if it fails. */
  require(label, ok, detail) {
    if (ok !== true) {
      throw new Error(`precondition failed: ${label}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ''}`)
    }
  }

  async profile(opts = {}) {
    const profile = await Profile.create(this, opts)
    this.profiles.push(profile)
    return profile
  }

  async close() {
    for (const profile of this.profiles) await profile.context.close()
    this.profiles = []
  }

  /** What a failed case leaves for the reader: where each tab is and what it sent last. */
  async diagnose() {
    const out = []
    for (const [index, profile] of this.profiles.entries()) {
      const tabs = []
      for (const page of profile.context.pages()) {
        const label = profile.label(page) ?? '?'
        const shot = join(this.config.scratch, `fail-${this.id}-p${index + 1}-${label}.png`)
        let screenshot = shot
        try {
          await page.screenshot({ path: shot, timeout: 5000 })
        } catch (err) {
          screenshot = `not taken: ${err.message.split('\n')[0]}` // a paused tab cannot be photographed
        }
        tabs.push({ label, url: page.url(), screenshot, consoleErrors: (profile.errors.get(page) ?? []).slice(-8) })
      }
      out.push({
        tabs,
        lastRequests: profile.log.slice(-40).map((e) => `${e.tab} ${e.method} ${e.path} ${e.status ?? e.failed ?? 'pending'}`),
      })
    }
    return out
  }

  // --- sign-in and sign-out through the page ------------------------------

  /**
   * Signs in through the login form. Sign-ins stay on login_limit, so a 429 is
   * waited out (one refill interval) and retried for up to 90 s; the number of
   * waits is reported. Any other failure throws. `navigate: false` submits
   * the form the tab already shows, without loading the page again.
   */
  async signIn(page, credentials, { navigate = true } = {}) {
    const { base } = this.config
    const refill = Math.ceil(1 / this.zones.login.ratePerSecond) * 1000 + 1000
    if (navigate) await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' })
    await page.locator(LOGIN_FIELD).waitFor({ state: 'visible', timeout: 30000 })
    const deadline = Date.now() + 90000
    for (;;) {
      await page.locator(LOGIN_FIELD).fill(credentials.usernameOrEmail)
      await page.locator(PASSWORD_FIELD).fill(credentials.password)
      const [response] = await Promise.all([
        page.waitForResponse(
          (r) => new URL(r.url()).pathname === '/api/auth/login' && r.request().method() === 'POST',
          { timeout: 30000 },
        ),
        page.locator('button[type="submit"]').click(),
      ])
      if (response.status() === 429) {
        this.run.signInWaits += 1
        if (Date.now() + refill > deadline) {
          throw new Error(`sign-in as ${credentials.usernameOrEmail} was rate limited for more than 90 s`)
        }
        await sleep(refill)
        continue
      }
      if (!response.ok()) {
        throw new Error(`sign-in as ${credentials.usernameOrEmail} answered ${response.status()}`)
      }
      break
    }
    await page.waitForURL((u) => new URL(u).pathname !== '/login', { timeout: 30000 })
    await page.locator(USER_MENU).first().waitFor({ state: 'visible', timeout: 30000 })
  }

  /** Signs out through the sidebar menu, as a user does. Nothing is swallowed. */
  async signOut(page) {
    await page.locator(USER_MENU).first().click({ timeout: 10000 })
    await page.getByRole('menuitem', { name: 'Logout' }).click({ timeout: 10000 })
  }

  /**
   * Runs a login-zone call made by the case itself and waits out 429s, which
   * are pacing and never the answer under test.
   */
  async paced(send) {
    const refill = Math.ceil(1 / this.zones.login.ratePerSecond) * 1000 + 1000
    const deadline = Date.now() + 90000
    for (;;) {
      const result = await send()
      if (result.status !== 429) return result
      this.run.signInWaits += 1
      if (Date.now() + refill > deadline) throw new Error('a login-zone request was rate limited for more than 90 s')
      await sleep(refill)
    }
  }
}

// ---------------------------------------------------------------------------
// Profile: one BrowserContext with a request log and the interception hooks.
// ---------------------------------------------------------------------------

export class Profile {
  static async create(ctx, opts) {
    const profile = new Profile(ctx, opts)
    await profile.init()
    return profile
  }

  constructor(ctx, opts) {
    this.ctx = ctx
    this.opts = opts
    this.log = []
    this.labels = new Map()
    this.byRequest = new Map()
    this.forced401 = new Map()
    this.heldRefresh = new Map()
    this.errors = new Map()
    this.tabCount = 0
  }

  async init() {
    const { run } = this.ctx
    const { config } = run
    this.context = await run.browser.newContext({ viewport: { width: 1366, height: 800 } })
    this.context.setDefaultTimeout(30000)

    if (this.opts.noIndexedDb) {
      await this.context.addInitScript(() => {
        Object.defineProperty(window, 'indexedDB', { value: undefined })
      })
    }
    if (this.opts.timing) {
      await this.context.addInitScript(() => {
        sessionStorage.setItem('erp-session-timing', '1')
      })
    }

    this.context.on('request', (request) => this.onRequest(request))
    this.context.on('response', (response) => this.onResponse(response))
    this.context.on('requestfinished', (request) => this.onFinished(request))
    this.context.on('requestfailed', (request) => {
      const entry = this.byRequest.get(request)
      if (entry) entry.failed = request.failure()?.errorText ?? 'failed'
    })

    if (config.distDir) await this.serveLocalBuild(config)
    if (this.opts.intercept) await this.context.route('**/api/**', (route) => this.onApiRoute(route))
  }

  // Development only (QA_DIST_DIR): documents and assets come from a local
  // build; everything under /api still goes to the ingress.
  async serveLocalBuild(config) {
    const origin = new URL(config.base).origin
    await this.context.route('**/*', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      const passThrough =
        url.origin !== origin ||
        request.method() !== 'GET' ||
        /^\/(api|uploads|health)(\/|$)/.test(url.pathname) ||
        url.pathname === '/env-config.js'
      if (passThrough) return route.continue()
      const candidate = normalize(join(config.distDir, decodeURIComponent(url.pathname)))
      const inside = candidate.startsWith(normalize(config.distDir))
      if (inside && existsSync(candidate) && statSync(candidate).isFile()) {
        return route.fulfill({ path: candidate })
      }
      return route.fulfill({ path: join(config.distDir, 'index.html'), contentType: 'text/html' })
    })
  }

  async onApiRoute(route) {
    const request = route.request()
    const path = new URL(request.url()).pathname
    let page = null
    try {
      page = request.frame().page()
    } catch {
      page = null // a request with no frame cannot be one a case armed
    }
    const zone = zoneOf(path)
    if (page && zone === 'business' && (this.forced401.get(page) ?? 0) > 0) {
      this.forced401.set(page, this.forced401.get(page) - 1)
      const entry = this.byRequest.get(request)
      if (entry) entry.forced401 = true
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ statusCode: 401, message: 'Unauthorized', error: 'forced by the QA script' }),
      })
    }
    const hold = page ? this.heldRefresh.get(page) : null
    if (hold && !hold.route && path.replace(/\/$/, '') === '/api/auth/refresh') {
      hold.route = route
      hold.capturedAt = Date.now()
      hold.resolve()
      return undefined // deliberately neither continued nor fulfilled until release()
    }
    return route.fallback()
  }

  onRequest(request) {
    let page = null
    try {
      page = request.frame().page()
    } catch {
      page = null
    }
    const url = new URL(request.url())
    if (url.origin !== new URL(this.ctx.config.base).origin) return
    const zone = zoneOf(url.pathname)
    if (zone === 'static') return
    const entry = {
      seq: (this.ctx.run.seq += 1),
      tab: page ? this.labels.get(page) ?? '?' : '?',
      method: request.method(),
      path: url.pathname,
      zone,
      issuedAt: Date.now(),
      sentAt: null,
      status: null,
      token: fingerprint((request.headers().authorization || '').replace(/^Bearer /, '') || null),
    }
    Object.defineProperty(entry, 'page', { value: page, enumerable: false })
    this.log.push(entry)
    this.byRequest.set(request, entry)
  }

  onResponse(response) {
    const entry = this.byRequest.get(response.request())
    if (!entry) return
    entry.status = response.status()
    entry.respondedAt = Date.now()
    if (entry.status === 429) {
      if (entry.zone === 'login') this.ctx.run.loginZone429 += 1
      else if (!this.ctx.allow429) this.ctx.unexpected429.push({ tab: entry.tab, method: entry.method, path: entry.path })
    }
  }

  onFinished(request) {
    const entry = this.byRequest.get(request)
    if (!entry) return
    const timing = request.timing()
    // When the bytes actually left: a request queued behind the six-connection
    // limit is issued by the page earlier than NGINX can see it.
    if (timing && timing.startTime > 0 && timing.requestStart >= 0) {
      entry.sentAt = Math.round(timing.startTime + timing.requestStart)
    }
  }

  /** Opens a tab of this profile. `noBroadcast` removes BroadcastChannel in that tab only. */
  async tab(path = '/dashboard', { label, noBroadcast = false, navigate = true, init } = {}) {
    const page = await this.context.newPage()
    this.tabCount += 1
    this.labels.set(page, label ?? `tab${this.tabCount}`)
    const errors = []
    this.errors.set(page, errors)
    page.on('pageerror', (err) => errors.push(`pageerror: ${String(err.message).slice(0, 300)}`))
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console: ${msg.text().slice(0, 300)}`)
    })
    if (noBroadcast) {
      await page.addInitScript(() => {
        delete window.BroadcastChannel
        Object.defineProperty(window, 'BroadcastChannel', { value: undefined, configurable: true })
      })
    }
    if (init) await page.addInitScript(init.fn, init.arg)
    if (navigate) await page.goto(`${this.ctx.config.base}${path}`, { waitUntil: 'domcontentloaded' })
    return page
  }

  label(page) {
    return this.labels.get(page)
  }

  /** Requests issued by `page` (or by any tab) after sequence number `since`. */
  since(seq, page) {
    return this.log.filter((e) => e.seq > seq && (!page || e.page === page))
  }

  mark() {
    return this.ctx.run.seq
  }

  armForced401(page, count = 1) {
    if (!this.opts.intercept) throw new Error('profile was not created with { intercept: true }')
    this.forced401.set(page, count)
  }

  /**
   * Arms a hold on the tab's next POST /api/auth/refresh. The request is kept
   * inside the browser, not yet on the wire, until release().
   */
  armHoldRefresh(page) {
    if (!this.opts.intercept) throw new Error('profile was not created with { intercept: true }')
    const hold = { route: null }
    hold.captured = new Promise((resolve) => {
      hold.resolve = resolve
    })
    hold.release = async () => {
      if (!hold.route) throw new Error('no refresh request was captured to release')
      this.heldRefresh.delete(page)
      await hold.route.continue()
    }
    this.heldRefresh.set(page, hold)
    return hold
  }
}

// ---------------------------------------------------------------------------
// Page-side helpers
// ---------------------------------------------------------------------------

/**
 * The stored session record, read in the page with the adapter's own shape:
 * database `erp-session`, store `kv`, keys `record`, `slices`, `refreshLease`.
 * The upgrade handler mirrors the application's so a read that happens to be
 * the first open cannot leave a database without its store.
 */
export async function readStored(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('erp-session', 1)
        open.onupgradeneeded = () => {
          if (!open.result.objectStoreNames.contains('kv')) open.result.createObjectStore('kv')
        }
        open.onerror = () => reject(new Error(`could not open erp-session: ${open.error}`))
        open.onsuccess = () => {
          const db = open.result
          const out = {}
          const tx = db.transaction('kv', 'readonly')
          const os = tx.objectStore('kv')
          for (const key of ['record', 'slices', 'refreshLease']) {
            const req = os.get(key)
            req.onsuccess = () => {
              out[key] = req.result ?? null
            }
          }
          tx.oncomplete = () => {
            db.close()
            resolve(out)
          }
          tx.onabort = () => {
            db.close()
            reject(new Error(`read of erp-session aborted: ${tx.error}`))
          }
        }
      }),
  )
}

/** The record without its credentials, safe to write into results.json. */
export function summarize(stored) {
  const record = stored?.record ?? null
  const s = record?.session ?? null
  return {
    revision: record?.revision ?? null,
    session: s
      ? {
          sessionId: s.sessionId,
          generation: s.generation,
          accessTokenExpiresAt: s.accessTokenExpiresAt,
          access: fingerprint(s.accessToken),
          refresh: fingerprint(s.refreshToken),
          username: s.user?.username ?? null,
        }
      : null,
    slicesSessionId: stored?.slices?.sessionId ?? null,
    lease: stored?.refreshLease ?? null,
  }
}

export const onLoginPage = (page, timeout = 10000) =>
  becomes(
    page,
    (selector) => location.pathname === '/login' && !!document.querySelector(selector),
    LOGIN_FIELD,
    timeout,
  )

export const showsSignedInUi = (page, timeout = 15000) =>
  becomes(
    page,
    (selector) => location.pathname !== '/login' && !!document.querySelector(selector),
    USER_MENU,
    timeout,
  )

/** Identifies the loaded document: it changes on any reload or full navigation. */
export const documentId = (page) => page.evaluate(() => performance.timeOrigin)

export async function seedDraft(page, userId) {
  const key = `${DRAFT_PREFIX}${userId}:create:qa-${Date.now().toString(36)}`
  await page.evaluate(
    ([k, value]) => sessionStorage.setItem(k, value),
    [
      key,
      JSON.stringify({
        v: 1,
        lockVersion: null,
        form: { statementEndingBalance: '1234.56', statementDate: '2026-10-01', matched: [] },
        picker: {},
        savedAt: new Date().toISOString(),
      }),
    ],
  )
  return key
}

export const draftKeys = (page) =>
  page.evaluate((prefix) => {
    const keys = []
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i)
      if (key && key.startsWith(prefix)) keys.push(key)
    }
    return keys
  }, DRAFT_PREFIX)

export const draftsGone = (page, timeout = 10000) =>
  becomes(
    page,
    (prefix) => {
      for (let i = 0; i < sessionStorage.length; i += 1) {
        const key = sessionStorage.key(i)
        if (key && key.startsWith(prefix)) return false
      }
      return true
    },
    DRAFT_PREFIX,
    timeout,
  )

// List pages that load data on arrival. A tab is moved between them inside the
// running application (history + popstate, which is what the router listens
// to), never by a reload: a reload would go through session start-up instead of
// the request path the cases are about.
const EXERCISE_ROUTES = [
  '/inventory/products',
  '/sales/customers',
  '/inventory/categories',
  '/sales/orders',
  '/inventory/stock-adjustments',
  '/settings/users',
  '/settings/payment-methods',
  '/settings/price-lists',
]
const routeCursor = new WeakMap()

/**
 * Makes the tab load data and waits for one business request to be answered
 * 2xx. A cached page sends nothing, so up to three pages are tried; a request
 * that was sent but never succeeded is an error, and so is a tab that sends
 * nothing at all.
 */
export async function exercise(profile, page, { timeout = 45000 } = {}) {
  const tried = []
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const cursor = routeCursor.get(page) ?? 0
    routeCursor.set(page, cursor + 1)
    const path = EXERCISE_ROUTES[cursor % EXERCISE_ROUTES.length]
    tried.push(path)
    const mark = profile.mark()
    const started = Date.now()
    await page.evaluate((p) => {
      history.pushState({}, '', p)
      dispatchEvent(new PopStateEvent('popstate', { state: {} }))
    }, path)
    for (;;) {
      const mine = profile.since(mark, page).filter((e) => e.zone === 'business')
      const ok = mine.find((e) => e.status !== null && e.status >= 200 && e.status < 300)
      if (ok) return { path, status: ok.status, token: ok.token, requests: mine.length }
      const elapsed = Date.now() - started
      if (mine.length === 0 && elapsed > 5000) break
      if (elapsed > timeout) {
        throw new Error(
          `${profile.label(page)}: requests after moving to ${path} never succeeded: ` +
            JSON.stringify(mine.map((e) => [e.path, e.status, e.failed ?? null])),
        )
      }
      await sleep(100)
    }
  }
  throw new Error(`${profile.label(page)}: sent no API request after moving to ${tried.join(', ')}`)
}

/** The refresh requests issued by `page` (or by any tab) after `mark`. */
export const refreshes = (profile, mark, page) =>
  profile.since(mark, page).filter((e) => e.path.replace(/\/$/, '') === '/api/auth/refresh')

/**
 * Waits for a rotation answered 200 to `page` (or to any tab) after `mark`;
 * null on timeout. A tab's first successful data request can be one that went
 * out before its refresh, so "the request succeeded" does not yet mean "it
 * has rotated".
 */
export async function rotation(profile, mark, page, timeout = 45000) {
  const deadline = Date.now() + timeout
  for (;;) {
    const done = refreshes(profile, mark, page).find((e) => e.status === 200)
    if (done) return done
    if (Date.now() > deadline) return null
    await sleep(100)
  }
}

/** Moves the tab inside the application without waiting for any outcome. */
export async function nudge(page, path) {
  await page.evaluate((p) => {
    history.pushState({}, '', p)
    dispatchEvent(new PopStateEvent('popstate', { state: {} }))
  }, path)
}

// ---------------------------------------------------------------------------
// Pauses. Page.setWebLifecycleState('frozen') does not stop a headless tab, so
// a pause is the debugger's: Debugger.pause stops the tab at its next
// statement, which the 20 ms counter below supplies. The same counter is the
// proof that the tab really stood still: it may advance by at most 3.
// ---------------------------------------------------------------------------

async function startCounter(page) {
  await page.evaluate(() => {
    if (window.__qaTick === undefined) {
      window.__qaTicks = 0
      window.__qaTick = setInterval(() => {
        window.__qaTicks += 1
      }, 20)
    }
  })
}

async function ticks(cdp) {
  const { result } = await cdp.send('Runtime.evaluate', { expression: 'window.__qaTicks', returnByValue: true })
  if (typeof result.value !== 'number') throw new Error('the pause counter is missing from the tab')
  return result.value
}

function pauseHandle(cdp, before, pausedAt) {
  return {
    pausedAt,
    async resume() {
      const resumed = new Promise((resolve) => cdp.once('Debugger.resumed', resolve))
      await cdp.send('Debugger.resume')
      await withTimeout(resumed, 5000, 'tab did not resume')
      const after = await ticks(cdp)
      await cdp.send('Debugger.disable')
      await cdp.detach()
      return { ticksWhilePaused: after - before, pausedMs: Date.now() - pausedAt }
    },
  }
}

export async function pauseTab(page) {
  await startCounter(page)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Debugger.enable')
  const paused = new Promise((resolve) => cdp.once('Debugger.paused', resolve))
  const before = await ticks(cdp)
  await cdp.send('Debugger.pause')
  await withTimeout(paused, 5000, 'tab did not pause')
  return pauseHandle(cdp, before, Date.now())
}

/**
 * Pauses the tab inside a read-write transaction on erp-session/kv: the
 * transaction has started, its first request has completed, and the tab stops
 * in that request's callback, so the transaction can neither commit nor abort
 * until the tab is resumed. It writes nothing.
 */
export async function pauseMidTransaction(page) {
  await startCounter(page)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Debugger.enable')
  const paused = new Promise((resolve) => cdp.once('Debugger.paused', resolve))
  const before = await ticks(cdp)
  const expression = `(() => {
    const open = indexedDB.open('erp-session', 1)
    open.onsuccess = () => {
      const db = open.result
      const tx = db.transaction('kv', 'readwrite')
      tx.oncomplete = () => { window.__qaBlockerOutcome = 'complete'; db.close() }
      tx.onabort = () => { window.__qaBlockerOutcome = 'abort'; db.close() }
      const req = tx.objectStore('kv').get('record')
      req.onsuccess = () => { debugger }
    }
  })()`
  // Not awaited to completion: the evaluation returns at once, the pause
  // happens later, inside the request callback.
  await cdp.send('Runtime.evaluate', { expression })
  await withTimeout(paused, 5000, 'tab did not pause inside the transaction')
  return pauseHandle(cdp, before, Date.now())
}

// ---------------------------------------------------------------------------
// Requests made by a case itself, from the page (fetch), with or without the
// protocol marker.
// ---------------------------------------------------------------------------

export async function pageFetch(page, { method = 'GET', path, body, marker = true, bearer }) {
  return page.evaluate(
    async ({ method, path, body, markerHeader, bearer }) => {
      const headers = {}
      if (body !== undefined) headers['Content-Type'] = 'application/json'
      if (markerHeader) headers[markerHeader[0]] = markerHeader[1]
      if (bearer) headers.Authorization = `Bearer ${bearer}`
      const response = await fetch(path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      const text = await response.text()
      let json = null
      try {
        json = JSON.parse(text)
      } catch {
        json = null // an NGINX error page is HTML; the status is what matters then
      }
      return { status: response.status, json, text: json === null ? text.slice(0, 200) : null, date: response.headers.get('date') }
    },
    { method, path, body, markerHeader: marker ? [MARKER, MARKER_VALUE] : null, bearer: bearer ?? null },
  )
}

/** Every string value in a response body that looks like a credential. */
export function tokensIn(json) {
  const found = []
  const walk = (value, key) => {
    if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, k)
    } else if (typeof value === 'string' && /token/i.test(key ?? '') && value.length > 20) {
      found.push(key)
    }
  }
  walk(json, null)
  return found
}
