#!/usr/bin/env node
// Cross-tab session browser cases (issue #1345). Runs under Playwright in a
// container. Each case is { id, name, run(ctx) }. Exit is non-zero on the
// first failure. W1's blocking requirement is N = 5; larger N is recorded to
// size the session_limit burst.
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const BASE = process.env.QA_BASE_URL || 'http://localhost'
const SCRATCH = process.env.QA_SCRATCH || process.cwd()

const results = { base: BASE, cases: [], w1: [], startedAt: new Date().toISOString() }

const CREDS = { usernameOrEmail: 'admin', password: 'Admin@123' }

async function newContext(browser, opts = {}) {
  const context = await browser.newContext()
  if (opts.noBroadcast) {
    await context.addInitScript(() => {
      // @ts-ignore
      window.BroadcastChannel = undefined
    })
  }
  if (opts.noIndexedDb) {
    await context.addInitScript(() => {
      Object.defineProperty(window, 'indexedDB', { value: undefined })
    })
  }
  return context
}

async function login(page) {
  await page.goto(`${BASE}/login`)
  await page.fill('input[name="usernameOrEmail"]', CREDS.usernameOrEmail)
  await page.fill('input[name="password"]', CREDS.password)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 30000 })
}

const cases = [
  {
    id: 1,
    name: 'sign-in in one tab establishes the session',
    async run(ctx) {
      const page = await ctx.page()
      await login(page)
      const ok = page.url().includes('/dashboard') || !page.url().includes('/login')
      if (!ok) throw new Error('did not leave the login page')
    },
  },
  {
    id: 2,
    name: 'sign-out in one tab ends the other tab',
    async run(ctx) {
      const a = await ctx.page()
      const b = await ctx.page()
      await login(a)
      await login(b)
      await a.goto(`${BASE}/settings`)
      await b.evaluate(() => window.dispatchEvent(new Event('focus')))
      await ctx.signOut(a)
      await b.goto(`${BASE}/dashboard`).catch(() => {})
      await b.waitForURL(/\/login/, { timeout: 20000 }).catch(() => {})
      if (!b.url().includes('/login')) throw new Error('second tab did not end')
    },
  },
]

async function main() {
  const browser = await chromium.launch()
  let failed = 0
  // A tiny shared context factory keeps the case list readable.
  for (const c of cases) {
    try {
      const contexts = []
      const ctx = {
        async page(opts) {
          const context = await newContext(browser, opts)
          contexts.push(context)
          const page = await context.newPage()
          return page
        },
        async signOut(page) {
          await page.goto(`${BASE}/settings`)
          await page.click('[aria-label="open user menu"]').catch(() => {})
          await page.click('text=/logout/i').catch(() => {})
          await page.waitForURL(/\/login/, { timeout: 20000 }).catch(() => {})
        },
      }
      await c.run(ctx)
      results.cases.push({ id: c.id, name: c.name, pass: true })
    } catch (error) {
      failed += 1
      results.cases.push({ id: c.id, name: c.name, pass: false, error: String(error) })
    }
  }

  writeFileSync(`${SCRATCH}/results.json`, JSON.stringify(results, null, 2))
  await browser.close()
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
