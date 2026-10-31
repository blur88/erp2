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
  await login(tabA, users[0])
  await tabB.goto(base)
  await assertSignedIn(tabB, users[0].username)
  console.log('PASS two tabs share one session')

  await tabB.reload()
  await assertSignedIn(tabB, users[0].username)
  console.log('PASS session restore after reload')

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

  await login(tabA, users[0])
  await tabB.waitForURL(url => !url.pathname.startsWith('/login'))
  await logout(tabB)
  await login(tabB, users[1])
  await assertSignedIn(tabA, users[1].username)
  console.log('PASS user switch propagates to the other tab')
} finally {
  await browser.close()
}
