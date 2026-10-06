// node --test frontend/qa/cross-tab-session/usable.test.mjs
//
// The judgement of W1's "usable" (lib/usable.mjs), without a browser. The
// point of these tests is the direction of every decision: missing data, a
// shell without its data and a list drawn from cache must all come out NOT
// usable.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { failedSections, judgeDashboard, judgeListAction, leftFailed, nextRecovery, roundUsability, verdict } from './lib/usable.mjs'
import { bucketLevel } from './lib/stats.mjs'

const get = (path, status, extra = {}) => ({ zone: 'business', method: 'GET', path, search: '', status, ...extra })
const PANELS = ['/api/sales-orders', '/api/purchasing/orders', '/api/purchasing/suppliers', '/api/payments']
const loadedDom = { path: '/dashboard', heading: true, spinners: 0, alerts: [] }
const WARNING = 'Could not load: Purchases, Payments. Other data may be incomplete.'

test('a request answered 429 and never repeated is left failed', () => {
  assert.deepEqual(leftFailed([get('/api/payments', 429)]), [{ request: 'GET /api/payments', path: '/api/payments', status: 429 }])
})

test('a request answered 429 or 401 and then repeated successfully is not left failed', () => {
  assert.deepEqual(leftFailed([get('/api/payments', 429), get('/api/payments', 200)]), [])
  assert.deepEqual(leftFailed([get('/api/payments', 401), get('/api/payments', 200)]), [])
})

test('the latest answer decides, so a success followed by a failure is left failed', () => {
  assert.equal(leftFailed([get('/api/payments', 200), get('/api/payments', 429)]).length, 1)
})

test('a pending request and one that failed without an answer are left failed', () => {
  assert.equal(leftFailed([get('/api/payments', null)])[0].status, 'pending')
  assert.equal(leftFailed([get('/api/payments', null, { failed: 'net::ERR_ABORTED' })])[0].status, 'net::ERR_ABORTED')
})

test('two requests for one path with different queries are judged apart', () => {
  const entries = [get('/api/customers', 429, { search: '?page=1' }), get('/api/customers', 200, { search: '?page=2' })]
  assert.deepEqual(leftFailed(entries).map((f) => f.request), ['GET /api/customers?page=1'])
})

test('status polls and session requests are not data requests', () => {
  assert.deepEqual(leftFailed([{ zone: 'health', method: 'GET', path: '/api/health', status: 429 }, { zone: 'session', method: 'POST', path: '/api/auth/refresh', status: 429 }]), [])
})

test('the dashboard warning is read into its sections', () => {
  assert.deepEqual(failedSections([WARNING]), ['Purchases', 'Payments'])
  assert.deepEqual(failedSections(['Saved.']), [])
  // A reworded warning is still a failure.
  assert.equal(failedSections(['Could not load: everything']).length, 1)
})

test('a dashboard with every request answered and no warning is complete', () => {
  const state = judgeDashboard(loadedDom, PANELS.map((p) => get(p, 200)))
  assert.equal(state.complete, true)
  assert.deepEqual(state.why, [])
})

test('a rendered dashboard that says it could not load a panel is NOT complete', () => {
  const entries = [get(PANELS[0], 200), get(PANELS[1], 429), get(PANELS[2], 200), get(PANELS[3], 429)]
  const state = judgeDashboard({ ...loadedDom, alerts: [WARNING] }, entries)
  assert.equal(state.complete, false)
  assert.deepEqual(state.failedSections, ['Purchases', 'Payments'])
  assert.equal(state.requestsLeftFailed.length, 2)
})

test('a shell whose company request failed is NOT complete although the page shows no warning', () => {
  const entries = [...PANELS.map((p) => get(p, 200)), get('/api/settings/company', 429)]
  const state = judgeDashboard(loadedDom, entries)
  assert.equal(state.complete, false)
  assert.deepEqual(state.requestsLeftFailed.map((f) => f.path), ['/api/settings/company'])
})

test('a warning still on screen is NOT complete even if every request has since been answered', () => {
  const state = judgeDashboard({ ...loadedDom, alerts: [WARNING] }, PANELS.map((p) => get(p, 200)))
  assert.equal(state.complete, false)
})

test('a dashboard still loading, a tab elsewhere and a tab that received nothing are NOT complete', () => {
  assert.equal(judgeDashboard({ ...loadedDom, heading: false, spinners: 1 }, PANELS.map((p) => get(p, 200))).complete, false)
  assert.equal(judgeDashboard({ ...loadedDom, path: '/login' }, PANELS.map((p) => get(p, 200))).complete, false)
  assert.equal(judgeDashboard(loadedDom, []).complete, false)
})

test('recovery: the company settings alone need the Company page; anything else the round trip', () => {
  const only = judgeDashboard(loadedDom, [...PANELS.map((p) => get(p, 200)), get('/api/settings/company', 429)])
  assert.equal(nextRecovery(only), 'company-settings')
  const both = judgeDashboard({ ...loadedDom, alerts: [WARNING] }, [get(PANELS[1], 429), get(PANELS[0], 200), get('/api/settings/company', 429)])
  assert.equal(nextRecovery(both), 'round-trip')
  const currency = judgeDashboard(loadedDom, [...PANELS.map((p) => get(p, 200)), get('/api/settings/default-currency', 429)])
  assert.equal(nextRecovery(currency), 'round-trip')
})

const listDom = { path: '/sales/customers', heading: true, alerts: [], dataRows: 2 }
const listRequest = (status) => get('/api/customers', status, { search: '?sortBy=name' })

test('the action works: a fresh list request answered 2xx and rows on screen', () => {
  assert.equal(judgeListAction(listDom, [listRequest(200)]).ok, true)
})

test('the action does NOT work when the list was drawn without a fresh request', () => {
  const result = judgeListAction(listDom, [])
  assert.equal(result.ok, false)
  assert.match(result.why[0], /sent no request/)
})

test('the action does NOT work when the list request failed, shows its error, or shows no rows', () => {
  assert.equal(judgeListAction({ ...listDom, dataRows: 0, alerts: ['Failed to load customers.'] }, [listRequest(429)]).ok, false)
  assert.equal(judgeListAction({ ...listDom, alerts: ['Failed to load customers.'] }, [listRequest(200)]).ok, false)
  assert.equal(judgeListAction({ ...listDom, dataRows: 0 }, [listRequest(200)]).ok, false)
  assert.equal(judgeListAction({ ...listDom, path: '/dashboard' }, [listRequest(200)]).ok, false)
})

test('the action does NOT work when another request of the same page is left failed', () => {
  assert.equal(judgeListAction(listDom, [listRequest(200), get('/api/price-lists', 429)]).ok, false)
})

const tab = (over = {}) => ({ tab: 't', signedInUi: true, dataPresent: true, completeOnFirstLoad: true, recovery: [], action: { ok: true, tries: [{}] }, sameDocument: true, ...over })

test('a tab is usable only with the application shown, data present, the action working and no reload', () => {
  assert.equal(verdict(tab()).usable, true)
  assert.equal(verdict(tab({ signedInUi: false })).usable, false)
  assert.equal(verdict(tab({ dataPresent: false, stillMissing: ['x'] })).usable, false)
  assert.equal(verdict(tab({ action: { ok: false, why: ['y'] } })).usable, false)
  assert.equal(verdict(tab({ action: null })).usable, false)
  assert.equal(verdict(tab({ sameDocument: false })).usable, false)
})

test('a tab that needed recovery and got its data is usable, and the round says what it took', () => {
  const recovered = tab({ completeOnFirstLoad: false, recovery: [{ action: 'round-trip' }, { action: 'company-settings' }], msUntilDataPresent: 9000 })
  const lost = tab({ tab: 'u', completeOnFirstLoad: false, dataPresent: false, recovery: [{ action: 'round-trip' }, { action: 'round-trip' }, { action: 'round-trip' }], action: null })
  const states = [tab(), recovered, lost].map((t) => ({ ...t, ...verdict(t) }))
  const round = roundUsability(states)
  assert.equal(round.tabsUsable, 2)
  assert.equal(round.everyTabUsable, false)
  assert.equal(round.tabsCompleteOnFirstLoad, 1)
  assert.equal(round.tabsNeedingRecovery, 2)
  assert.equal(round.maxRecoveryActions, 3)
  assert.equal(round.recoveryActionsTotal, 5)
  assert.equal(round.tabsNeedingCompanySettingsVisit, 1)
  assert.equal(round.slowestRecoveryMs, 9000)
  assert.deepEqual(round.tabsNotRecoverable.map((t) => t.tab), ['u'])
})

test('a round with no tabs is not "every tab usable"', () => {
  assert.equal(roundUsability([]).everyTabUsable, false)
})

test('the pacing bucket fills with requests and drains at the rate', () => {
  assert.equal(bucketLevel([], 10, 100), 0)
  assert.equal(bucketLevel(Array(20).fill(5), 10, 5), 20)
  assert.equal(bucketLevel(Array(20).fill(5), 10, 6), 10)
  assert.equal(bucketLevel(Array(20).fill(5), 10, 9), 0)
})
