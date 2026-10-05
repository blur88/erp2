#!/usr/bin/env node
// Latency measurement for the reconcile gate (issue #1345, Task 9 Step 5).
// Runs under the restored configuration; writes its figures into results.json.
import { chromium } from 'playwright'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const BASE = process.env.QA_BASE_URL || 'http://localhost'
const SCRATCH = process.env.QA_SCRATCH || process.cwd()

export function peakDemand(times, ratePerSecond) {
  let e = 0
  let prev = null
  let peak = 0
  for (const t of times) {
    if (prev !== null) e = Math.max(0, e - ratePerSecond * (t - prev))
    e += 1
    prev = t
    peak = Math.max(peak, e)
  }
  return peak
}

function percentile(values, p) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[idx]
}

async function measureRawReads(page, count) {
  return page.evaluate(async (n) => {
    const samples = []
    const open = indexedDB.open('erp-session', 1)
    const db = await new Promise((resolve, reject) => {
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    })
    for (let i = 0; i < n; i += 1) {
      const t0 = performance.now()
      await new Promise((resolve, reject) => {
        const tx = db.transaction('kv', 'readonly')
        const os = tx.objectStore('kv')
        os.get('record')
        os.get('slices')
        os.get('refreshLease')
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      })
      samples.push(performance.now() - t0)
    }
    db.close()
    return samples
  }, count)
}

async function main() {
  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(`${BASE}/login`)
  await page.fill('input[name="usernameOrEmail"]', 'admin')
  await page.fill('input[name="password"]', 'Admin@123')
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 30000 })

  const m1 = await measureRawReads(page, 500)
  const ua = await page.evaluate(() => navigator.userAgent)

  const latency = {
    chromium: ua,
    M1: { p50: percentile(m1, 50), p95: percentile(m1, 95), max: Math.max(...m1) },
  }

  const path = `${SCRATCH}/results.json`
  const existing = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}
  writeFileSync(path, JSON.stringify({ ...existing, latency }, null, 2))

  await browser.close()
  const failed = latency.M1.p95 > 5
  console.log(JSON.stringify(latency, null, 2))
  process.exit(failed ? 1 : 0)
}

const isMain = process.argv[1] && process.argv[1].endsWith('measure.mjs')
if (isMain) main().catch((e) => { console.error(e); process.exit(1) })
