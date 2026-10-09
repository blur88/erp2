// Wiring that only shows when the suite runs against a stack, pinned here so
// that it is caught before one is brought up (#1353, recorded run on 198943047).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { COMPANY_SETTINGS, KEEP_SHELL_ANSWERS, REGIONAL_SETTINGS } from './lib/usable.mjs'
import { PROFILE_OPTIONS } from './cases/limiter.mjs'

const HERE = fileURLToPath(new URL('.', import.meta.url))

test('host-probe.sh runs docker compose from the repository, where the compose file is', () => {
  const root = execFileSync('bash', [join(HERE, 'host-probe.sh'), '--print-root'], { encoding: 'utf8', timeout: 5000 }).trim()
  const top = execFileSync('git', ['-C', HERE, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
  assert.equal(root, top)
  assert.ok(existsSync(join(root, 'docker-compose.yml')))
})

test('the answers a tab is judged against are kept for both settings routes', () => {
  assert.ok(KEEP_SHELL_ANSWERS.test(COMPANY_SETTINGS))
  assert.ok(KEEP_SHELL_ANSWERS.test(REGIONAL_SETTINGS))
  assert.ok(!KEEP_SHELL_ANSWERS.test('/api/settings/other'))
})

test('case 16 opens its profile keeping those answers: its first precondition reads them', () => {
  assert.equal(PROFILE_OPTIONS.keepAnswers, KEEP_SHELL_ANSWERS)
  assert.equal(PROFILE_OPTIONS.intercept, true)
  assert.equal(PROFILE_OPTIONS.tagRequests, true)
})

// --- found by the recorded run on db0cc890e: case 16 again ----------------------

test('what shellReference returns becomes the reference a tab is judged against', async () => {
  const { referenceOf } = await import('./lib/usable.mjs')
  // The shape shellReference returns: it has no `reference` member of its own.
  const shell = { companyAnswered: true, companyName: 'ACME', regional: { dateFormat: 'DD/MM/YYYY' } }
  assert.deepEqual(referenceOf(shell), { companyName: 'ACME', regional: { dateFormat: 'DD/MM/YYYY' } })
  assert.equal(shell.reference, undefined)
})

test('the api_limit the suite reads from nginx.conf carries its delay, so the longest configured hold is a number', async () => {
  const { loadZones } = await import('./lib/config.mjs')
  const { maxConfiguredDelayMs } = await import('./lib/expiry-crossing.mjs')
  const zones = await loadZones()
  assert.ok(Number.isInteger(zones.api.delay) && zones.api.delay > 0, `delay is ${zones.api.delay}`)
  assert.ok(zones.api.burst > zones.api.delay)
  const hold = maxConfiguredDelayMs(zones.api)
  assert.ok(Number.isFinite(hold) && hold > 0, `hold is ${hold}`)
  assert.equal(hold, (1000 * (zones.api.burst - zones.api.delay)) / zones.api.ratePerSecond)
})

test('a limit read without its delay has no longest hold: an error, not NaN', async () => {
  const { maxConfiguredDelayMs } = await import('./lib/expiry-crossing.mjs')
  assert.throws(() => maxConfiguredDelayMs({ ratePerSecond: 20, burst: 40 }), /delay/)
})
