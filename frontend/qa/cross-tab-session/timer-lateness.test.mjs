// The timer-lateness probe's summary (lib/timer-lateness.mjs, #1370), and the
// busy workers the processor cell runs.
//
//   node --test frontend/qa/cross-tab-session/timer-lateness.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { LATENESS_CAP, PROBE_INTERVAL_MS, latenessProbe, summariseLateness } from './lib/timer-lateness.mjs'

test('the summary counts every sample once and reports the worst', () => {
  const summary = summariseLateness([
    { tab: 't1', samples: [{ at: 100, late: 0 }, { at: 200, late: 3 }, { at: 1500, late: 1200 }], capped: false },
    { tab: 't2', samples: [{ at: 5700, late: 5600 }, { at: 5800, late: 2 }], capped: false },
  ])
  assert.deepEqual(summary, { tabs: 2, samples: 5, maxMs: 5600, over1s: 2, over5s: 1, capped: false })
})

test('a window keeps only the samples inside it', () => {
  const tabs = [{ tab: 't1', samples: [{ at: 100, late: 0 }, { at: 1500, late: 1200 }, { at: 9000, late: 40 }], capped: false }]
  assert.deepEqual(summariseLateness(tabs, { from: 1000, to: 2000 }), { tabs: 1, samples: 1, maxMs: 1200, over1s: 1, over5s: 0, capped: false })
})

test('no samples is a summary of nothing, not an error; a tab at its cap says so', () => {
  assert.deepEqual(summariseLateness([]), { tabs: 0, samples: 0, maxMs: 0, over1s: 0, over5s: 0, capped: false })
  assert.equal(summariseLateness([{ tab: 't1', samples: [], capped: true }]).capped, true)
})

test('the probe records how late each firing was, against the time it was due', async () => {
  // Run in this process with a stand-in for the page's globals.
  const win = {}
  let now = 1000
  const timers = []
  const scope = { window: win, performance: { now: () => now, timeOrigin: 5000 }, setTimeout: (fn, ms) => timers.push({ fn, ms }) }
  new Function('scope', 'args', `with (scope) { (${latenessProbe.toString()})(args) }`)(scope, { intervalMs: PROBE_INTERVAL_MS, cap: LATENESS_CAP })
  assert.equal(timers[0].ms, PROBE_INTERVAL_MS)
  now = 1000 + PROBE_INTERVAL_MS + 250 // fired 250 ms late
  timers.shift().fn()
  assert.deepEqual(win.__qaTimerLateness, [{ at: 5000 + now, late: 250 }])
  now += PROBE_INTERVAL_MS // the next one on time
  timers.shift().fn()
  assert.equal(win.__qaTimerLateness[1].late, 0)
})

test('cpu-load.mjs keeps the asked number of workers busy until it is killed', async () => {
  const child = spawn(process.execPath, [fileURLToPath(new URL('./cpu-load.mjs', import.meta.url)), '2'], { stdio: ['ignore', 'pipe', 'pipe'] })
  const line = await new Promise((resolve, reject) => {
    child.stdout.once('data', (d) => resolve(String(d).trim()))
    child.once('exit', (code) => reject(new Error(`exited ${code} before saying it started`)))
  })
  assert.equal(line, 'cpu-load: 2 workers busy')
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve(signal)))
  child.kill('SIGTERM')
  assert.equal(await exited, 'SIGTERM')
})

test('cpu-load.mjs refuses a worker count that is not 1 to 64', async () => {
  const child = spawn(process.execPath, [fileURLToPath(new URL('./cpu-load.mjs', import.meta.url)), '0'], { stdio: 'ignore' })
  assert.equal(await new Promise((resolve) => child.once('exit', resolve)), 2)
})
