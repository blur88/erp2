import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire('/tmp/session-pw/package.json')
const { chromium } = require('playwright')
const base = process.env.SESSION_TEST_BASE_URL
const users = [
  { username: process.env.SESSION_TEST_USER_A, password: process.env.SESSION_TEST_PASSWORD_A },
  { username: process.env.SESSION_TEST_USER_B, password: process.env.SESSION_TEST_PASSWORD_B },
]
const browser = await chromium.launch({ headless: true })
let context = await browser.newContext()
let tabA = await context.newPage()
let tabB = await context.newPage()

async function readSharedSession(page) {
  return withTimeout(page.evaluate(async () => new Promise((resolve, reject) => {
    const request = indexedDB.open('erp-session')
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('indexedDB open blocked'))
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction('session', 'readonly')
      const read = transaction.objectStore('session').get('current')
      read.onsuccess = () => resolve(read.result ?? null)
      read.onerror = () => reject(read.error)
      transaction.oncomplete = () => database.close()
    }
  })), 5000, 'readSharedSession timed out')
}

async function login(page, { username, password }) {
  await page.goto(`${base}/login`)
  await page.getByRole('textbox', { name: 'Username or Email' }).fill(username)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 15000 })
  await page.waitForFunction(() => document.body.innerText.includes('Dashboard'), { timeout: 15000 })
  assert.equal((await readSharedSession(page))?.user?.username, username)
}

async function assertSignedIn(page, username) {
  await page.getByRole('button', { name: 'Open user menu' }).waitFor({ state: 'visible' })
  await page.getByRole('button', { name: 'Open user menu' }).click()
  await page.getByRole('menu').getByText(username, { exact: true }).waitFor({ state: 'visible' })
  await page.keyboard.press('Escape')
}

function withTimeout(promise, ms, message) {
  return Promise.race([promise, timeout(ms, message)])
}

function timeout(ms, message) {
  return new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    timer.unref?.()
  })
}

async function logout(page) {
  await page.getByRole('button', { name: 'Open user menu' }).click()
  await page.getByRole('menuitem', { name: 'Logout' }).click()
  await page.waitForURL('**/login')
}

try {
  await tabA.goto(base)
  assert.equal(await tabA.evaluate(() => isSecureContext), false, 'LAN HTTP must be an insecure context')
  assert.equal(await tabA.evaluate(() => window.__ENV__?.SESSION_IDLE_TIMEOUT_MS), 120_000, 'test stack must use the short idle timeout override')
  await login(tabA, users[0])
  await tabB.goto(base)
  await assertSignedIn(tabB, users[0].username)
  console.log('PASS two tabs share one session')

  await tabB.reload()
  await assertSignedIn(tabB, users[0].username)
  console.log('PASS session restore after reload')

  // Hold the first refresh until both tabs have received an expired-token 401.
  await new Promise(resolve => setTimeout(resolve, 8500))
  const expired = new Set()
  let markExpired
  const bothExpired = new Promise(resolve => { markExpired = resolve })
  for (const page of [tabA, tabB]) page.on('response', response => {
    if (response.status() === 401 && new URL(response.url()).pathname.startsWith('/api/') && !new URL(response.url()).pathname.startsWith('/api/auth/')) {
      expired.add(page)
      if (expired.size === 2) markExpired()
    }
  })
  let refreshCount = 0
  let markRefresh
  const refreshCaptured = new Promise(resolve => { markRefresh = resolve })
  let releaseConcurrent
  const concurrentGate = new Promise(resolve => { releaseConcurrent = resolve })
  const refreshUrl = url => url.pathname === '/api/auth/refresh'
  await context.route(refreshUrl, async route => {
    refreshCount++
    markRefresh()
    await concurrentGate
    await route.continue()
  })
  const reloads = Promise.all([tabA.reload(), tabB.reload()])
  await withTimeout(Promise.all([bothExpired, refreshCaptured]), 15000, 'both tabs did not receive a 401 and start refresh')
  releaseConcurrent()
  await withTimeout(reloads, 15000, 'concurrent reloads did not complete')
  await assertSignedIn(tabA, users[0].username)
  await assertSignedIn(tabB, users[0].username)
  assert.equal(refreshCount, 1, 'concurrent tabs must make one refresh request')
  await context.unroute(refreshUrl)
  console.log('PASS simultaneous expired-token refresh uses one request and keeps both tabs signed in')

  const recoveryPauseKey = '__erpSessionRecoveryPause'
  async function installRecoveryHooks() {
  for (const [page, name] of [[tabA, 'A'], [tabB, 'B']]) {
  await page.addInitScript(({ key, debug }) => {
    const pendingTransactions = new Set()
    const waiters = new Set()
    let refreshInFlight = false
    const originalTransaction = IDBDatabase.prototype.transaction
    let txId = 0
    IDBDatabase.prototype.transaction = function (stores, mode, ...rest) {
      const tx = originalTransaction.call(this, stores, mode, ...rest)
      try {
        const id = `tx-${++txId}`
        pendingTransactions.add(id)
        const opened = Date.now()
        const names = typeof stores === 'string' ? stores : Array.from(stores).join(',')
        if (debug) console.log(`[SESSIONDBG] tx-open ${id} ${typeof mode === 'string' ? mode : 'readonly'} ${names} ${opened}`)
        if (debug && names.split(',').includes('session') && refreshInFlight) console.log(`[SESSIONDBG] in-flight-stack ${id} ${new Error().stack}`)
        for (const event of ['complete', 'abort', 'error']) tx.addEventListener(event, () => {
          pendingTransactions.delete(id)
          for (const wake of waiters) wake()
          try { if (debug) console.log(`[SESSIONDBG] tx-end ${id} ${event} ${Date.now()}`) } catch {}
        }, { once: true })
      } catch {}
      return tx
    }
    const open = XMLHttpRequest.prototype.open
    XMLHttpRequest.prototype.open = function (...args) {
      if (new URL(String(args[1]), location.href).pathname === '/api/auth/refresh') {
        refreshInFlight = true
        try { if (debug) console.log(`[SESSIONDBG] refresh-request ${Date.now()}`) } catch {}
        try { this.addEventListener('loadend', () => { refreshInFlight = false; try { if (debug) console.log(`[SESSIONDBG] refresh-response ${this.status} ${Date.now()}`) } catch {} }, { once: true }) } catch {}
        this.addEventListener('load', function () {
          if (this.status !== 200) return
          let payload
          try {
            const body = JSON.parse(this.responseText)
            payload = body.data ?? body
          } catch { return }
          const state = JSON.parse(sessionStorage.getItem(key) ?? 'null')
          if (!state?.targetRefreshToken || state.paused || payload.refreshToken === state.targetRefreshToken) return
          const pauseWhenClear = () => {
            if (pendingTransactions.size) {
              const wake = () => { waiters.delete(wake); pauseWhenClear() }
              waiters.add(wake)
              return
            }
            state.paused = true
            state.targetRefreshToken = null
            state.pauseCount++
            sessionStorage.setItem(key, JSON.stringify(state))
            debugger
          }
          pauseWhenClear()
        }, { once: true })
      }
      return open.apply(this, args)
    }
  }, { key: recoveryPauseKey, debug: process.env.SESSION_TEST_DEBUG === '1' })
    if (process.env.SESSION_TEST_DEBUG === '1') {
    page.on('console', message => { if (message.type() === 'log' && message.text().startsWith('[SESSIONDBG')) console.log(`[SESSIONDBG ${name}] ${message.text().slice('[SESSIONDBG] '.length)}`) })
    page.on('request', request => { if (new URL(request.url()).pathname === '/api/auth/refresh') console.log(`[SESSIONDBG ${name}] request ${Date.now()} ${request.method()}`) })
    page.on('response', response => { if (new URL(response.url()).pathname === '/api/auth/refresh') console.log(`[SESSIONDBG ${name}] response ${Date.now()} ${response.status()}`) })
    if (name === 'A') {
      page.on('framenavigated', frame => { if (frame === page.mainFrame()) console.log(`[SESSIONDBG A] navigation ${Date.now()} ${frame.url()}`) })
      page.on('response', response => { const path = new URL(response.url()).pathname; if (path.startsWith('/api/') && !path.startsWith('/api/auth/')) console.log(`[SESSIONDBG A] api-response ${Date.now()} ${response.status()} ${path}`) })
    }
    }
  }
  }

  async function pauseBeforeRefreshSave(page) {
    const session = await readSharedSession(page)
    const originalRefreshToken = session.refreshToken
    const accessTokenExpiresAt = JSON.parse(Buffer.from(session.accessToken.split('.')[1], 'base64url').toString()).exp * 1000
    await page.evaluate(({ key, token }) => sessionStorage.setItem(key, JSON.stringify({ targetRefreshToken: token, paused: false, pauseCount: 0 })), { key: recoveryPauseKey, token: originalRefreshToken })
    const cdp = await context.newCDPSession(page)
    await cdp.send('Debugger.enable')
    const paused = new Promise(resolve => cdp.once('Debugger.paused', resolve))
    return { cdp, paused, accessTokenExpiresAt }
  }

  async function exerciseTakeoverRecovery(recoverHolder) {
    await tabA.goto(base)
    await assertSignedIn(tabA, users[0].username)
    await tabB.goto(base)
    await assertSignedIn(tabB, users[0].username)
    const debug = await pauseBeforeRefreshSave(tabA)
    try {
    await new Promise(resolve => setTimeout(resolve, Math.max(0, debug.accessTokenExpiresAt - Date.now() + 1000)))
    if (process.env.SESSION_TEST_DEBUG === '1') console.log(`[RECOVERY] ${Date.now()} holder reload start`)
    const holderReload = tabA.reload().catch(error => {
      if (!error.message.includes('net::ERR_ABORTED')) throw error
    })
    await withTimeout(debug.paused, 15000, 'holder refresh response was not paused after server rotation')
    const takeover401 = new Promise(resolve => {
      const listener = response => {
        if (response.status() === 401 && new URL(response.url()).pathname === '/api/auth/refresh') {
          tabB.off('response', listener)
          resolve()
        }
      }
      tabB.on('response', listener)
    })
    const authResponses = []
    const apiResponses = []
    const onAuthResponse = response => {
      const path = new URL(response.url()).pathname
      if (path.startsWith('/api/auth/')) authResponses.push([response.status(), path])
      if (path.startsWith('/api/')) apiResponses.push([response.status(), path])
    }
    tabB.on('response', onAuthResponse)
    const waitingReload = tabB.reload().catch(error => {
      if (!error.message.includes('net::ERR_ABORTED')) throw error
    })
    try {
      await withTimeout(takeover401, 25_000, 'replacement tab did not take over and receive the unchanged-token 401')
    } catch (error) {
      console.error('tab B API responses:', JSON.stringify({ authResponses, apiResponses }))
      throw error
    } finally { tabB.off('response', onAuthResponse) }
    if (!recoverHolder) console.log('tab B auth responses:', JSON.stringify(authResponses))
    if (recoverHolder) {
      await debug.cdp.send('Debugger.resume')
      await withTimeout(Promise.all([holderReload, waitingReload]), 15_000, 'tabs did not settle after holder resumed')
      await assertSignedIn(tabA, users[0].username)
      await assertSignedIn(tabB, users[0].username)
      assert.deepEqual(await tabA.evaluate(key => JSON.parse(sessionStorage.getItem(key)), recoveryPauseKey), { targetRefreshToken: null, paused: true, pauseCount: 1 })
      console.log('PASS paused holder resumed before its actual recovery deadline; session survived in both tabs')
    } else {
      await withTimeout(tabB.waitForURL('**/login', { timeout: 40_000 }), 40_000, 'replacement did not perform matched sign-out at the recovery deadline')
      assert.equal(await readSharedSession(tabB), null)
      await debug.cdp.send('Debugger.resume')
      await withTimeout(Promise.all([holderReload, tabA.waitForURL('**/login')]), 15_000, 'resumed holder did not observe the completed sign-out')
      assert.equal(await readSharedSession(tabA), null)
      assert.equal(await readSharedSession(tabB), null)
      assert.deepEqual(await tabA.evaluate(key => JSON.parse(sessionStorage.getItem(key)), recoveryPauseKey), { targetRefreshToken: null, paused: true, pauseCount: 1 })
      console.log('PASS holder stayed paused through matched sign-out; every tab signed out')
    }
    } finally {
      await debug.cdp.send('Debugger.resume').catch(() => {})
      await debug.cdp.detach().catch(() => {})
    }
  }

  if (process.env.SESSION_TEST_ONLY === 'recovery') {
    const iterations = Number(process.env.SESSION_TEST_ITERATIONS ?? 1)
    assert.ok(Number.isInteger(iterations) && iterations > 0, 'SESSION_TEST_ITERATIONS must be a positive integer')
    let failed = 0
    let failedRecovery = 0
    let failedLoss = 0
    let currentCase = 'recovery'
    let recoveryPassed = 0
    let lossPassed = 0
    let notPaused = 0
    let didNotTakeOver = 0
    await context.close()
    for (let iteration = 1; iteration <= iterations; iteration++) {
      let contextClosed = false
      try {
        context = await browser.newContext()
        tabA = await context.newPage()
        tabB = await context.newPage()
        await installRecoveryHooks()
        await tabA.goto(base)
        await login(tabA, users[0])
        await tabB.goto(base)
        await exerciseTakeoverRecovery(true)
        recoveryPassed++
        currentCase = 'loss'
        console.log(`MODE ${Date.now()} iteration ${iteration} recovery PASS`)
        await logout(tabA)
        await new Promise(resolve => setTimeout(resolve, 16_000))
        await login(tabA, users[0])
        await assertSignedIn(tabB, users[0].username)
        await exerciseTakeoverRecovery(false)
        lossPassed++
        console.log(`MODE ${Date.now()} iteration ${iteration} loss PASS`)
        await login(tabA, users[0])
        await assertSignedIn(tabB, users[0].username)
        console.log(`ITERATION ${Date.now()} ${iteration}/${iterations} PASS`)
      } catch (error) {
        failed++
        if (currentCase === 'recovery') failedRecovery++
        else failedLoss++
        if (String(error.message ?? error).includes('not paused')) notPaused++
        if (String(error.message ?? error).includes('did not take over')) didNotTakeOver++
        console.error(`FAIL ${Date.now()} iteration ${iteration}/${iterations} case=${currentCase}: ${error.stack ?? error}`)
        await context.close().catch(() => {})
        contextClosed = true
      }
      if (!contextClosed) await context.close().catch(() => {})
      currentCase = 'recovery'
    }
    console.log(`SUMMARY ${failed}/${iterations} iterations failed; recovery ${recoveryPassed} passed/${failedRecovery} failed, loss ${lossPassed} passed/${failedLoss} failed; not paused ${notPaused}, did not take over ${didNotTakeOver}`)
    await browser.close()
    process.exit(failed ? 1 : 0)
  }

  await installRecoveryHooks()
  await exerciseTakeoverRecovery(true)
  const authTrafficListeners = []
  if (process.env.SESSION_TEST_DEBUG === '1') {
    const tabForRequest = request => {
      try {
        const page = request.frame().page()
        if (page === tabA) return 'A'
        if (page === tabB) return 'B'
      } catch {}
      return 'unknown'
    }
    const onRequest = request => {
      const url = new URL(request.url())
      if (url.pathname.startsWith('/api/auth/')) console.log(`[AUTH ${tabForRequest(request)}] ${Date.now()} ${request.method()} ${url.pathname} -`)
    }
    const onResponse = response => {
      const request = response.request()
      const url = new URL(response.url())
      if (url.pathname.startsWith('/api/auth/')) console.log(`[AUTH ${tabForRequest(request)}] ${Date.now()} ${request.method()} ${url.pathname} ${response.status()}`)
    }
    context.on('request', onRequest)
    context.on('response', onResponse)
    authTrafficListeners.push([context, onRequest, onResponse])
  }
  await logout(tabA)
  await new Promise(resolve => setTimeout(resolve, 16_000))
  let loginRequestSeen = null
  const loginRequestListener = request => {
    if (new URL(request.url()).pathname === '/api/auth/login') loginRequestSeen = request
  }
  const loginResponseListener = response => {
    if (new URL(response.url()).pathname === '/api/auth/login') console.error(`[POST-RECOVERY-LOGIN] response ${Date.now()} ${response.status()}`)
  }
  const loginConsoleListener = message => {
    if (message.type() === 'error') console.error(`[POST-RECOVERY-LOGIN] console ${Date.now()} ${message.text()}`)
  }
  if (process.env.SESSION_TEST_DEBUG === '1') {
    tabA.on('request', loginRequestListener)
    tabA.on('response', loginResponseListener)
    tabA.on('console', loginConsoleListener)
  }
  try {
    await login(tabA, users[0])
  } catch (error) {
    console.error(`[POST-RECOVERY-LOGIN] failed ${Date.now()} url=${tabA.url()} request=${loginRequestSeen?.url() ?? 'none'} error=${error.stack ?? error}`)
    throw error
  } finally {
    if (process.env.SESSION_TEST_DEBUG === '1') {
      tabA.off('request', loginRequestListener)
      tabA.off('response', loginResponseListener)
      tabA.off('console', loginConsoleListener)
    }
  }
  for (const [page, onRequest, onResponse] of authTrafficListeners) {
    page.off('request', onRequest)
    page.off('response', onResponse)
  }
  await assertSignedIn(tabB, users[0].username)
  await exerciseTakeoverRecovery(false)
  await login(tabA, users[0])
  await assertSignedIn(tabB, users[0].username)

  const { promise: refreshGate, resolve: releaseRefresh } = Promise.withResolvers()
  const { promise: refreshRequestCaptured, resolve: markRefreshRequestCaptured } = Promise.withResolvers()
  await tabB.route(url => url.pathname === '/api/auth/refresh', async route => {
    markRefreshRequestCaptured()
    await refreshGate
    await route.continue()
  }, { times: 1 })
  await new Promise(resolve => setTimeout(resolve, 8500))
  const refreshReload = tabB.reload().catch(error => {
    if (!error.message.includes('net::ERR_ABORTED')) throw error
  })
  void refreshReload.catch(() => {})
  await Promise.race([refreshRequestCaptured, timeout(15000, 'no refresh request was held after access-token expiry')])
  await tabA.getByRole('button', { name: 'Open user menu' }).click()
  const loginRequested = new Promise(resolve => tabB.on('request', request => {
    if (request.isNavigationRequest() && request.frame() === tabB.mainFrame() && new URL(request.url()).pathname === '/login') resolve(Date.now())
  }))
  const started = Date.now()
  await tabA.getByRole('menuitem', { name: 'Logout' }).click()
  const propagationElapsed = await withTimeout(loginRequested, 5000, 'tab B never requested /login') - started
  releaseRefresh()
  await withTimeout(tabB.waitForURL('**/login'), 5000, 'tab B never settled on /login')
  const settledElapsed = Date.now() - started
  await tabA.waitForURL('**/login')
  await tabA.waitForLoadState('domcontentloaded')
  assert.equal(await readSharedSession(tabA), null)
  assert.equal(await readSharedSession(tabB), null)
  await tabB.getByRole('textbox', { name: 'Username or Email' }).waitFor({ state: 'visible' })
  await tabB.getByRole('button', { name: 'Open user menu' }).waitFor({ state: 'hidden' })
  await new Promise(resolve => setTimeout(resolve, 2000))
  await refreshReload
  assert.equal(await readSharedSession(tabA), null)
  assert.equal(await readSharedSession(tabB), null)
  assert.ok(propagationElapsed <= 1000, `sign-out propagation took ${propagationElapsed} ms`)
  console.log(`PASS sign-out propagation from Logout click ${propagationElapsed} ms (bound: 1000 ms)`)
  console.log(`PASS tab B /login loaded in ${settledElapsed} ms (context only; no bound)`)
  console.log('PASS sign-out during expired-token refresh: shared record stayed null in both tabs after tab B requested /login')

  // Capture a browser-restored tab's storage before another tab signs out.
  await login(tabA, users[0])
  await tabB.waitForURL(url => !url.pathname.startsWith('/login'))
  await tabB.goto(`${base}/accounting/bank-reconciliations`)
  await tabB.getByRole('button', { name: 'Open user menu' }).waitFor({ state: 'visible' })
  const restoredTab = await context.newPage()
  await restoredTab.goto(`${base}/login`)
  await restoredTab.goto(`${base}/accounting/bank-reconciliations`)
  await restoredTab.getByRole('button', { name: 'Open user menu' }).waitFor({ state: 'visible' })
  // A draft is created through the form UI; use the list's create action.
  await restoredTab.getByRole('button', { name: /new reconciliation/i }).click()
  await restoredTab.getByLabel('Bank Account').waitFor({ state: 'visible' })
  await restoredTab.getByLabel('Bank Account').click()
  const bankOption = restoredTab.getByRole('option', { name: /1200 CIMB/i })
  await bankOption.waitFor({ state: 'attached' })
  await bankOption.evaluate(element => element.click())
  await restoredTab.getByLabel('Closing Balance').fill('123.45')
  await restoredTab.waitForFunction(() => [...Array(sessionStorage.length)].some((_, i) => sessionStorage.key(i)?.startsWith('erp:bank-reconciliation-draft:')))
  const savedKey = await restoredTab.evaluate(() => [...Array(sessionStorage.length)].map((_, i) => sessionStorage.key(i)).find(k => k?.startsWith('erp:bank-reconciliation-draft:')))
  assert.ok(savedKey)
  const savedDraft = await restoredTab.evaluate(key => sessionStorage.getItem(key), savedKey)
  assert.ok(savedDraft)
  await restoredTab.close()
  const previousSessionId = (await readSharedSession(tabA)).id
  await logout(tabA)
  await login(tabA, users[0])
  assert.notEqual((await readSharedSession(tabA)).id, previousSessionId)
  const restoredAfterSignIn = await context.newPage()
  await restoredAfterSignIn.goto(base)
  await assertSignedIn(restoredAfterSignIn, users[0].username)
  await restoredAfterSignIn.evaluate(({ key, value }) => sessionStorage.setItem(key, value), { key: savedKey, value: savedDraft })
  await restoredAfterSignIn.goto(`${base}/accounting/bank-reconciliations/create?draft=${encodeURIComponent(savedKey.split(':').at(-1))}`)
  const closingBalance = restoredAfterSignIn.getByLabel('Closing Balance')
  await closingBalance.waitFor({ state: 'visible' })
  await assertSignedIn(restoredAfterSignIn, users[0].username)
  assert.notEqual(await closingBalance.inputValue(), '123.45')
  const replacementDraft = JSON.parse(await restoredAfterSignIn.evaluate(key => sessionStorage.getItem(key), savedKey))
  assert.equal(replacementDraft.sessionId, (await readSharedSession(restoredAfterSignIn)).id)
  assert.notEqual(replacementDraft.form.closingBalance, '123.45')
  await restoredAfterSignIn.close()
  console.log('PASS browser-restored tab has no old reconciliation draft after same-user sign-out and sign-in')

  // The test-stack override keeps the shared idle behavior quick to exercise.
  await tabA.goto(base)
  await assertSignedIn(tabA, users[0].username)
  await tabB.goto(base)
  await assertSignedIn(tabB, users[0].username)
  const testIdleTimeout = await tabA.evaluate(() => window.__ENV__.SESSION_IDLE_TIMEOUT_MS)
  await tabA.mouse.move(20, 20)
  // Tab B's warning begins at 100 seconds. Activity in A must arrive after
  // that warning, and B must still be signed in after its 120-second timeout.
  await new Promise(resolve => setTimeout(resolve, 105_000))
  await tabA.mouse.move(40, 40)
  await new Promise(resolve => setTimeout(resolve, 25_000))
  await tabB.waitForURL(url => !url.pathname.startsWith('/login'))
  const activeSession = await readSharedSession(tabB)
  assert.ok(activeSession, 'activity in tab A must keep tab B signed in beyond the idle timeout')
  assert.ok(activeSession.lastActivity > Date.now() - 35_000, 'activity in tab A must update shared lastActivity')
  console.log('PASS activity in one tab keeps the other signed in under the 120-second idle override')
  await new Promise(resolve => setTimeout(resolve, testIdleTimeout + 7_000))
  await tabA.waitForURL('**/login', { timeout: 10_000 })
  await tabB.waitForURL('**/login', { timeout: 10_000 })
  assert.equal(await readSharedSession(tabA), null)
  assert.equal(await readSharedSession(tabB), null)
  console.log('PASS inactivity in all tabs signs every tab out under the 120-second idle override')

  await login(tabA, users[1])
  await assertSignedIn(tabB, users[1].username)
  console.log('PASS user switch propagates to the other tab')
} finally {
  await browser.close()
}
