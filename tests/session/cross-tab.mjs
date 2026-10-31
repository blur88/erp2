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
  return page.evaluate(async () => new Promise((resolve, reject) => {
    const request = indexedDB.open('erp-session')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction('session', 'readonly')
      const read = transaction.objectStore('session').get('current')
      read.onsuccess = () => resolve(read.result ?? null)
      read.onerror = () => reject(read.error)
      transaction.oncomplete = () => database.close()
    }
  }))
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

  // Hold a real backend response until after sign-out. The adapter must reject
  // the old response and must never rebuild the deleted shared record.
  const { promise: responseGate, resolve: releaseResponse } = Promise.withResolvers()
  const { promise: businessRequestCaptured, resolve: markBusinessRequestCaptured } = Promise.withResolvers()
  let heldRequest
  await tabB.route(url => url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/auth/'), async route => {
    heldRequest = route.request()
    const response = await route.fetch()
    markBusinessRequestCaptured()
    await responseGate
    await route.fulfill({ response })
  }, { times: 1 })
  const { promise: navigationGate, resolve: releaseNavigation } = Promise.withResolvers()
  const { promise: loginNavigationStarted, resolve: markLoginNavigationStarted } = Promise.withResolvers()
  let propagationElapsed
  let started
  await tabB.route('**/login', async route => {
    propagationElapsed = Date.now() - started
    markLoginNavigationStarted()
    await navigationGate
    await route.continue()
  }, { times: 1 })
  const reload = tabB.reload().catch(() => {})
  await businessRequestCaptured
  await tabA.getByRole('button', { name: 'Open user menu' }).click()
  const waitForSignedOut = tabB.waitForURL('**/login')
  started = Date.now()
  await tabA.getByRole('menuitem', { name: 'Logout' }).click()
  await loginNavigationStarted
  assert.equal(await readSharedSession(tabB), null)
  const delivered = tabB.waitForResponse(response => response.request() === heldRequest)
  releaseResponse()
  await delivered
  await tabB.getByRole('button', { name: 'Open user menu' }).waitFor({ state: 'hidden' })
  assert.equal(await readSharedSession(tabB), null)
  releaseNavigation()
  await waitForSignedOut
  assert.ok(propagationElapsed <= 1000, `sign-out propagation took ${propagationElapsed} ms`)
  await reload
  assert.equal(await readSharedSession(tabB), null)
  console.log(`PASS sign-out propagation from Logout click ${propagationElapsed} ms (bound: 1000 ms)`)
  console.log('PASS in-flight response cannot restore signed-in state')

  await login(tabA, users[0])
  await tabB.waitForURL(url => !url.pathname.startsWith('/login'))
  await logout(tabB)
  await login(tabB, users[1])
  await assertSignedIn(tabA, users[1].username)
  console.log('PASS user switch propagates to the other tab')
} finally {
  await browser.close()
}
