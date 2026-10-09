// The device acceptance measurement (device/restored-window.js): the parts of it
// that decide something, run here without a browser. The script itself is pasted
// into the browser's console on the device; it is loaded here as text.
//
//   node --test frontend/qa/cross-tab-session/device-acceptance.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(new URL('./device/restored-window.js', import.meta.url), 'utf8')
// No `document` here, so the script defines its functions and does not start.
const context = vm.createContext({ console })
vm.runInContext(source, context)
const D = vm.runInContext('QA_DEVICE', context)

test('the agreed target: five tabs, eight seconds, both token rounds', () => {
  assert.equal(D.TARGET.tabs, 5)
  assert.equal(D.TARGET.deadlineMs, 8000)
})

// --- what "the tab has its expected data" is, from what the tab shows -------------

const snapshot = (over = {}) => ({
  path: '/dashboard',
  heading: true,
  alerts: [],
  companyNameInSidebar: 'ACME',
  stored: { dateFormat: 'DD/MM/YYYY', timeFormat: '24h', numberFormat: '1,234.56', defaultCurrency: 'USD', timezone: 'UTC', startOfWeek: '1' },
  api: { answered2xx: 9, leftFailed: [], statusAvailable: true },
  ...over,
})
const reference = { companyName: 'ACME', regional: { dateFormat: 'DD/MM/YYYY', timeFormat: '24h', numberFormat: '1,234.56', currency: 'USD', timezone: 'UTC', startOfWeek: 1 } }

test('a dashboard with its heading, no failure notice, the company name and the regional formats is complete', () => {
  // The script's objects come from another realm: compare their content.
  assert.deepEqual(JSON.parse(JSON.stringify(D.expectedData(snapshot(), reference))), { complete: true, why: [], diagnostic: [] })
})

for (const [name, over, pattern] of [
  ['another page', { path: '/login' }, /not on the dashboard/],
  ['no heading yet', { heading: false }, /not rendered/],
  ['a "Could not load" notice', { alerts: ['Could not load: Sales. Other data may be incomplete.'] }, /could not load/i],
  ['no company name in the sidebar', { companyNameInSidebar: null }, /company/],
  ['another company name', { companyNameInSidebar: 'Other' }, /company/],
  ['a regional format that is not the server\'s', { stored: { ...snapshot().stored, dateFormat: 'MM/DD/YYYY' } }, /regional/],
  ['no data request answered', { api: { answered2xx: 0, leftFailed: [], statusAvailable: true } }, /no data request/],
]) {
  test(`not complete: ${name}`, () => {
    const r = D.expectedData(snapshot(over), reference)
    assert.equal(r.complete, false)
    assert.match(r.why.join('; '), pattern)
  })
}

test('where the browser does not report response statuses, that part is not judged and the rest still is', () => {
  const noStatus = { answered2xx: null, leftFailed: null, statusAvailable: false }
  assert.equal(D.expectedData(snapshot({ api: noStatus }), reference).complete, true)
  assert.equal(D.expectedData(snapshot({ api: noStatus, heading: false }), reference).complete, false)
})

// --- a round's verdict ---------------------------------------------------------------

const tab = (n, over = {}) => ({ tab: n, opened: true, completedAfterMs: 4000 + n * 100, completeAtEnd: true, why: [], userInteractions: 0, reloaded: false, completeBeforeObserved: false, ...over })
const round = (over = {}) => ({ kind: 'current-token', tabs: [1, 2, 3, 4, 5].map((n) => tab(n)), token: { state: 'current', remainingMs: 600000 }, ...over })

test('five tabs complete inside the deadline with no interaction: pass', () => {
  const v = D.judgeRound(round(), 8000)
  assert.equal(v.verdict, 'pass')
  assert.equal(v.lastCompletedAfterMs, 4500)
})

test('exactly on the deadline passes; one millisecond over fails', () => {
  assert.equal(D.judgeRound(round({ tabs: [1, 2, 3, 4, 5].map((n) => tab(n, { completedAfterMs: n === 5 ? 8000 : 3000 })) }), 8000).verdict, 'pass')
  const v = D.judgeRound(round({ tabs: [1, 2, 3, 4, 5].map((n) => tab(n, { completedAfterMs: n === 5 ? 8001 : 3000 })) }), 8000)
  assert.equal(v.verdict, 'fail')
  assert.match(v.reasons.join('; '), /8001 ms/)
})

test('a tab that never had its data fails, whatever the others did', () => {
  const v = D.judgeRound(round({ tabs: [...[1, 2, 3, 4].map((n) => tab(n)), tab(5, { completedAfterMs: null, completeAtEnd: false, why: ['the dashboard says it could not load: Sales'] })] }), 8000)
  assert.equal(v.verdict, 'fail')
  assert.match(v.reasons.join('; '), /tab 5/)
})

test('a tab that was complete and is not at the end fails', () => {
  assert.equal(D.judgeRound(round({ tabs: [...[1, 2, 3, 4].map((n) => tab(n)), tab(5, { completeAtEnd: false, why: ['a notice appeared'] })] }), 8000).verdict, 'fail')
})

test('a recovery click, or any key or pointer use in a tab, fails: the requirement is zero', () => {
  const v = D.judgeRound(round({ tabs: [...[1, 2, 3, 4].map((n) => tab(n)), tab(5, { userInteractions: 1 })] }), 8000)
  assert.equal(v.verdict, 'fail')
  assert.match(v.reasons.join('; '), /interaction/)
})

test('a reloaded tab fails', () => {
  assert.equal(D.judgeRound(round({ tabs: [...[1, 2, 3, 4].map((n) => tab(n)), tab(5, { reloaded: true })] }), 8000).verdict, 'fail')
})

test('fewer than five tabs opened (a blocked pop-up) is void, not a pass and not a fail', () => {
  const v = D.judgeRound(round({ tabs: [...[1, 2, 3].map((n) => tab(n)), tab(4, { opened: false }), tab(5, { opened: false })] }), 8000)
  assert.equal(v.verdict, 'void')
})

test('a round whose token was not in the state the round claims is void', () => {
  assert.equal(D.judgeRound(round({ kind: 'expired-token', token: { state: 'current', remainingMs: 5000 } }), 8000).verdict, 'void')
  assert.equal(D.judgeRound(round({ kind: 'current-token', token: { state: 'expired', remainingMs: -100 } }), 8000).verdict, 'void')
  assert.equal(D.judgeRound(round({ kind: 'expired-token', token: { state: 'expired', remainingMs: -5000 } }), 8000).verdict, 'pass')
})

test('a tab already complete when the measurement first looked has no measured time: void, the round is repeated', () => {
  const v = D.judgeRound(round({ tabs: [...[1, 2, 3, 4].map((n) => tab(n)), tab(5, { completeBeforeObserved: true })] }), 8000)
  assert.equal(v.verdict, 'void')
})

test('negative check: the same passing round judged against one millisecond fails', () => {
  assert.equal(D.judgeRound(round(), 1).verdict, 'fail')
})

// --- the sign-out round ---------------------------------------------------------------

const out = (n, over = {}) => ({ tab: n, opened: true, onLoginPage: true, reloaded: false, staleUi: false, ...over })
const signOut = (over = {}) => ({ kind: 'sign-out', signOutAtMs: 3000, tabs: [1, 2, 3, 4, 5].map((n) => out(n)), ...over })

test('sign-out: every tab on the login page, in its own document, showing nothing of the session: pass', () => {
  assert.equal(D.judgeSignOut(signOut()).verdict, 'pass')
})

test('sign-out: a tab left signed in, reloaded, or still showing the session fails', () => {
  for (const over of [{ onLoginPage: false }, { reloaded: true }, { staleUi: true }]) {
    assert.equal(D.judgeSignOut(signOut({ tabs: [...[1, 2, 3, 4].map((n) => out(n)), out(5, over)] })).verdict, 'fail', JSON.stringify(over))
  }
})

test('sign-out: no sign-out made, or a tab not opened, is void', () => {
  assert.equal(D.judgeSignOut(signOut({ signOutAtMs: null })).verdict, 'void')
  assert.equal(D.judgeSignOut(signOut({ tabs: [...[1, 2, 3, 4].map((n) => out(n)), out(5, { opened: false })] })).verdict, 'void')
})

test('nothing of a token is ever in what the script reports', () => {
  assert.ok(!/accessToken\s*:/.test(source.replace(/accessTokenExpiresAt/g, '')), 'the access token itself is never put into a result')
  assert.ok(!/refreshToken/.test(source), 'the refresh token is never read')
})

test('a reason never repeats the company name, the one on the page or the server\'s', () => {
  const r = D.expectedData(snapshot({ companyNameInSidebar: 'Other' }), reference)
  assert.equal(r.complete, false)
  assert.doesNotMatch(r.why.join(' '), /ACME|Other/)
})

test('a refused data request does not decide anything: the outcome is the data on the page, and the refusal is only reported', () => {
  const r = D.expectedData(snapshot({ api: { answered2xx: 8, leftFailed: ['/api/payments 429'], statusAvailable: true } }), reference)
  assert.equal(r.complete, true)
  assert.deepEqual(JSON.parse(JSON.stringify(r.why)), [])
  assert.deepEqual(JSON.parse(JSON.stringify(r.diagnostic)), ['1 data request(s) left without a successful answer: /api/payments 429'])
})
