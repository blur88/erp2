import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const { chromium } = createRequire('/tmp/session-pw/package.json')('playwright')
const base = process.env.SESSION_TEST_BASE_URL
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()

try {
  await page.goto(`${base}/login`)
  await page.getByRole('textbox', { name: 'Username or Email' }).fill(process.env.SESSION_TEST_USER_A)
  await page.getByLabel('Password', { exact: true }).fill(process.env.SESSION_TEST_PASSWORD_A)
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 15000 })
  const sessionId = await page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('erp-session')
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const db = open.result
      const tx = db.transaction('session', 'readonly')
      const get = tx.objectStore('session').get('current')
      get.onsuccess = () => resolve(get.result?.id)
      tx.oncomplete = () => db.close()
    }
  }))
  assert.ok(sessionId)
  await new Promise(resolve => setTimeout(resolve, 8500))
  let limited = false
  await page.route(url => url.pathname === '/api/auth/refresh', async route => {
    // Exhaust the real NGINX zone immediately before this refresh is sent.
    for (let i = 0; i < 20; i++) {
      const response = await page.request.get(`${base}/api/auth/show-default-credentials`)
      if (response.status() === 429) { limited = true; break }
    }
    await route.continue()
  })
  let count = 0
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/auth/refresh') count++ })
  const refresh = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/refresh', { timeout: 15000 })
  await page.reload()
  assert.ok(limited, 'default auth rate limit did not return 429')
  assert.equal((await refresh).status(), 429, 'refresh must be rejected by the real default limit')
  await new Promise(resolve => setTimeout(resolve, 1000))
  assert.equal(count, 1, '429 must not automatically retry refresh')
  assert.ok(!new URL(page.url()).pathname.startsWith('/login'), '429 must not navigate to sign-in')
  const currentId = await page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('erp-session')
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const db = open.result
      const tx = db.transaction('session', 'readonly')
      const get = tx.objectStore('session').get('current')
      get.onsuccess = () => resolve(get.result?.id)
      tx.oncomplete = () => db.close()
    }
  }))
  assert.equal(currentId, sessionId, '429 must preserve the shared Session')
  console.log('PASS real refresh 429 under default login_limit preserves Session without retry')
} finally {
  await browser.close()
}
