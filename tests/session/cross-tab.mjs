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
const context = await browser.newContext()
const tabA = await context.newPage()
const tabB = await context.newPage()

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
  await context.addInitScript(key => {
    const open = XMLHttpRequest.prototype.open
    XMLHttpRequest.prototype.open = function (...args) {
      if (new URL(String(args[1]), location.href).pathname === '/api/auth/refresh') {
        this.addEventListener('load', function () {
          if (this.status !== 200) return
          let payload
          try {
            const body = JSON.parse(this.responseText)
            payload = body.data ?? body
          } catch { return }
          const state = JSON.parse(sessionStorage.getItem(key) ?? 'null')
          if (!state?.targetRefreshToken || state.paused || payload.refreshToken === state.targetRefreshToken) return
          state.paused = true
          state.targetRefreshToken = null
          state.pauseCount++
          sessionStorage.setItem(key, JSON.stringify(state))
          debugger
        }, { once: true })
      }
      return open.apply(this, args)
    }
  }, recoveryPauseKey)

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
    await new Promise(resolve => setTimeout(resolve, Math.max(0, debug.accessTokenExpiresAt - Date.now() + 1000)))
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
    } finally {
      tabB.off('response', onAuthResponse)
    }
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
    await debug.cdp.detach()
  }

  await exerciseTakeoverRecovery(true)
  await logout(tabA)
  await new Promise(resolve => setTimeout(resolve, 16_000))
  await login(tabA, users[0])
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
