#!/usr/bin/env node
// Cross-tab session browser cases (#1345, and 16 and 17 from #1353): the fourteen cases of the spec's
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
import limiter from './cases/limiter.mjs'
import induced from './cases/induced.mjs'
import w1 from './lib/w1.mjs'

export const cases = [...signout, ...switching, ...refresh, ...storage, ...marker, ...limiter, ...induced]
  .sort((x, y) => x.id - y.id)
  .concat([w1])

const CASE_LIMIT_MS = 12 * 60 * 1000
// W1 checks every tab of rounds (a) and (b) one at a time, recovery included:
// 35 tabs twice, at up to about half a minute each when a tab needs every
// allowed action.
const W1_LIMIT_MS = 75 * 60 * 1000
// Case 16's own limit, from the waits it contains, because it is longer than
// the default for reasons that can be counted rather than guessed:
//
//   calibration   10 samples. Each waits for the access token to expire
//                 (QA configuration: 20 s), then opens a tab, waits for the
//                 401, and watches the recovery to completion (up to
//                 accessSeconds + 10 s). Then the drain wait for the two zones
//                 it empties, which is
//                 max(ceil((40+1)/20), ceil((20+1)/1)) + 5 = 26 s.
//                 10 x (20 + 30 + 26) = 760 s
//   preconditions  one drain, two probes and a trial capture: about 40 s
//   an attempt     one drain (26 s), a window of 2.4 s of probes, and
//                 watchCompletion for the recovery deadline plus its 30 s
//                 margin (2600 + 30000 ms, or 11000 + 30000 if the deadline
//                 had been the maximum the case accepts, which it refuses).
//                 With the capture segment's start and stop: about 60 s.
//   5 attempts     5 x (26 + 60) = 430 s
//
// Worst case 760 + 40 + 430 = 1230 s, and the case ends as soon as an attempt
// judges, so the common case is the calibration alone.
const LIMITER_CASE_LIMIT_MS = 21 * 60 * 1000

// Case 17, sign-out under induced delay: three sizes, at most three attempts
// each, every attempt a 26 s drain wait, a sign-in and a load that may wait up
// to 120 s for a signed-in tab and 90 s for the login pages.
const INDUCED_CASE_LIMIT_MS = 40 * 60 * 1000

const limitFor = (id) => (id === 'W1' ? W1_LIMIT_MS : id === 16 ? LIMITER_CASE_LIMIT_MS : id === 17 ? INDUCED_CASE_LIMIT_MS : CASE_LIMIT_MS)

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
    // Three ways a run is not recorded evidence, all of which say so in the
    // file rather than only in the exit status (#1353, Task 7's forced
    // failures run through the first two).
    partial: only
      ? `only ${only.join(', ')}: not a recorded run`
      : config.suiteOverride
        ? 'the suite ran from an override copy outside the repository: not a recorded run'
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
      await withTimeout(c.run(ctx), limitFor(c.id), `case ${c.id}`)
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
