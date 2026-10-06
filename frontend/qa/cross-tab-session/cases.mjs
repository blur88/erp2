#!/usr/bin/env node
// Cross-tab session browser cases (#1345): the fourteen cases of the spec's
// "Browser script" table, case 15 and workload W1. Each is { id, name,
// run(ctx) } and states its pass condition in a comment above run().
//
//   node cases.mjs                 everything (what run.sh does)
//   node cases.mjs --only 3,7,W1   development: a selection; the result file
//                                  says it is partial and is not evidence
//
// Writes <scratch>/results-cases.json and exits non-zero if anything failed.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launchOptions, loadConfig, loadPlaywright, loadZones } from './lib/config.mjs'
import { CaseContext, Run, withTimeout } from './lib/harness.mjs'
import { machine, servedBuild } from './lib/machine.mjs'
import signout from './cases/signout.mjs'
import switching from './cases/switch.mjs'
import refresh from './cases/refresh.mjs'
import storage from './cases/storage.mjs'
import marker from './cases/marker.mjs'
import w1 from './lib/w1.mjs'

export const cases = [...signout, ...switching, ...refresh, ...storage, ...marker]
  .sort((x, y) => x.id - y.id)
  .concat([w1])

const CASE_LIMIT_MS = 12 * 60 * 1000
const W1_LIMIT_MS = 45 * 60 * 1000

function selection(argv) {
  const i = argv.indexOf('--only')
  if (i < 0) return null
  const wanted = String(argv[i + 1] ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
  const known = cases.map((c) => String(c.id).toUpperCase())
  const unknown = wanted.filter((w) => !known.includes(w))
  if (wanted.length === 0 || unknown.length > 0) throw new Error(`--only: unknown case(s) ${unknown.join(', ') || '(none given)'}`)
  return wanted
}

async function main() {
  const only = selection(process.argv.slice(2))
  const config = loadConfig()
  const zones = await loadZones()
  const { chromium } = loadPlaywright()
  const browser = await chromium.launch(launchOptions(config))
  const run = new Run({ config, zones, browser })

  const results = {
    suite: 'cross-tab-session cases',
    startedAt: new Date().toISOString(),
    base: config.base,
    commit: process.env.QA_COMMIT || null,
    servedBuild: await servedBuild(config.base),
    servedFrom: config.distDir
      ? 'DEVELOPMENT: page and assets from a local build (QA_DIST_DIR), API through the ingress. Not a recorded run.'
      : 'ingress',
    partial: only
      ? `only ${only.join(', ')}: not a recorded run`
      : process.env.QA_W1_NS
        ? `W1 sizes overridden to ${process.env.QA_W1_NS}: not a recorded run`
        : false,
    chromium: browser.version(),
    machine: machine(),
    configurationDuring: config.show,
    limits: {
      session: { rate: zones.session.rateText, burst: zones.session.burst },
      login: { rate: zones.login.rateText, burst: zones.login.burst },
    },
    cases: [],
    w1: null,
  }

  const chosen = cases.filter((c) => !only || only.includes(String(c.id).toUpperCase()))
  let failed = 0
  for (const c of chosen) {
    console.log(`\n[${c.id}] ${c.name}`)
    const ctx = new CaseContext(run, c.id)
    const started = Date.now()
    let error = null
    try {
      await withTimeout(c.run(ctx), c.id === 'W1' ? W1_LIMIT_MS : CASE_LIMIT_MS, `case ${c.id}`)
    } catch (err) {
      // Reported, never swallowed: an error fails the case.
      error = err && err.stack ? err.stack : String(err)
      console.log(`    ERROR ${err && err.message ? err.message : err}`)
    }
    const failedChecks = ctx.checks.filter((k) => !k.ok)
    let pass = error === null && failedChecks.length === 0 && ctx.unexpected429.length === 0
    const diagnosis = pass ? undefined : await ctx.diagnose()
    try {
      await ctx.close()
    } catch (err) {
      error = error ?? `closing the case's profiles failed: ${err}`
      pass = false
    }
    if (!pass) failed += 1
    const entry = {
      id: c.id,
      name: c.name,
      pass,
      seconds: Math.round((Date.now() - started) / 1000),
      error,
      checks: ctx.checks,
      unexpected429: ctx.unexpected429,
      recorded: ctx.recorded,
      diagnosis,
    }
    if (c.id === 'W1') results.w1 = entry
    else results.cases.push(entry)
    console.log(`  => ${pass ? 'pass' : 'FAIL'} (${entry.seconds} s)`)
  }

  results.signInWaits = run.signInWaits
  results.loginZone429 = run.loginZone429
  results.finishedAt = new Date().toISOString()
  results.failed = failed
  await browser.close()

  const out = join(config.scratch, 'results-cases.json')
  writeFileSync(out, JSON.stringify(results, null, 2))
  console.log(`\n${chosen.length - failed} of ${chosen.length} passed; sign-in waits ${run.signInWaits}; wrote ${out}`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
