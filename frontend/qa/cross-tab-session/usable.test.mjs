// node --test frontend/qa/cross-tab-session/usable.test.mjs
//
// The judgement of W1's "usable" (lib/usable.mjs), without a browser. The
// point of these tests is the direction of every decision: missing data, a
// shell without its data and a list drawn from cache must all come out NOT
// usable.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  COMPANY_DATA,
  REGIONAL_DATA,
  companyRetry,
  failedSections,
  follow,
  judgeDashboard as judge,
  judgeListAction,
  leftFailed,
  noWayBack,
  regionalNotInEffect,
  roundUsability,
  verdict,
} from './lib/usable.mjs'
import { accessFor, parseNavigation } from './lib/access.mjs'
import { bucketLevel } from './lib/stats.mjs'

const get = (path, status, extra = {}) => ({ zone: 'business', method: 'GET', path, search: '', status, ...extra })
const PANELS = ['/api/sales-orders', '/api/purchasing/orders', '/api/purchasing/suppliers', '/api/payments']
// What the server answered (the reference) and a tab in which all of it is in
// effect: the sidebar shows the name, localStorage holds the formats.
const REGIONAL = { dateFormat: 'DD-MM-YYYY', timeFormat: '24h', numberFormat: '1,234.56', currency: 'MYR', timezone: 'Asia/Kuala_Lumpur', startOfWeek: 1 }
const STORED = { dateFormat: 'DD-MM-YYYY', timeFormat: '24h', numberFormat: '1,234.56', defaultCurrency: 'MYR', timezone: 'Asia/Kuala_Lumpur', startOfWeek: '1' }
const REFERENCE = { companyName: 'Acme Trading', regional: REGIONAL }
const loadedDom = { path: '/dashboard', heading: true, spinners: 0, alerts: [], companyNameInSidebar: 'Acme Trading', stored: STORED }
const judgeDashboard = (dom, entries, reference = REFERENCE) => judge(dom, entries, reference)
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

test('missing company data is shell data: a page change cannot bring it back; anything of the page can', () => {
  const only = judgeDashboard({ ...loadedDom, companyNameInSidebar: null }, [...PANELS.map((p) => get(p, 200)), get('/api/settings/company', 429)])
  assert.equal(only.shellOnly, true)
  assert.deepEqual(only.missing, [COMPANY_DATA])
  const both = judgeDashboard({ ...loadedDom, alerts: [WARNING] }, [get(PANELS[1], 429), get(PANELS[0], 200), get('/api/settings/company', 429)])
  assert.equal(both.shellOnly, false)
  assert.ok(both.missing.includes('dashboard panel: Purchases') && both.missing.includes(COMPANY_DATA))
  const currency = judgeDashboard(loadedDom, [...PANELS.map((p) => get(p, 200)), get('/api/settings/default-currency', 429)])
  assert.equal(currency.shellOnly, false)
  assert.deepEqual(currency.missing, ['GET /api/settings/default-currency'])
  assert.equal(judgeDashboard(loadedDom, PANELS.map((p) => get(p, 200))).shellOnly, false)
})

test('a sidebar without the server\'s company name is NOT complete even when the request log looks fine', () => {
  const entries = [...PANELS.map((p) => get(p, 200)), get('/api/settings/company', 200)]
  assert.equal(judgeDashboard(loadedDom, entries).complete, true)
  const state = judgeDashboard({ ...loadedDom, companyNameInSidebar: null }, entries)
  assert.equal(state.complete, false)
  assert.deepEqual(state.missing, [COMPANY_DATA])
  assert.equal(judgeDashboard({ ...loadedDom, companyNameInSidebar: 'Another Ltd' }, entries).complete, false)
  // A company without a name has no name to show: only the request decides.
  assert.equal(judgeDashboard({ ...loadedDom, companyNameInSidebar: null }, entries, { ...REFERENCE, companyName: null }).complete, true)
})

test('regional settings are judged by their effect: a refused request with the formats stored leaves nothing missing', () => {
  const entries = [...PANELS.map((p) => get(p, 200)), get('/api/settings/regional', 429)]
  const state = judgeDashboard(loadedDom, entries)
  assert.equal(state.complete, true)
  assert.equal(state.regionalRequestLeftFailed, true)
  assert.deepEqual(state.regionalNotInEffect, [])
})

test('regional settings NOT in effect make the tab NOT complete, whatever the request log says', () => {
  const none = { dateFormat: null, timeFormat: null, numberFormat: null, defaultCurrency: 'MYR', timezone: null, startOfWeek: null }
  const refused = judgeDashboard({ ...loadedDom, stored: none }, [...PANELS.map((p) => get(p, 200)), get('/api/settings/regional', 429)])
  assert.equal(refused.complete, false)
  assert.equal(refused.shellOnly, true)
  assert.deepEqual(refused.missing, [REGIONAL_DATA])
  assert.equal(refused.regionalNotInEffect.length, 5)
  // One stale value is enough, even with the request answered.
  const stale = judgeDashboard({ ...loadedDom, stored: { ...STORED, dateFormat: 'DD/MM/YYYY' } }, [...PANELS.map((p) => get(p, 200)), get('/api/settings/regional', 200)])
  assert.equal(stale.complete, false)
  assert.match(stale.why[0], /dateFormat is "DD\/MM\/YYYY", the server says "DD-MM-YYYY"/)
})

test('only what the application would have stored is expected in the tab', () => {
  assert.deepEqual(regionalNotInEffect(STORED, REGIONAL), [])
  // An empty field is not stored by useRegionalSettings, so its absence is not a difference.
  assert.deepEqual(regionalNotInEffect({ ...STORED, timezone: null }, { ...REGIONAL, timezone: '' }), [])
  // startOfWeek 0 is a value (Sunday) and is stored as "0".
  assert.deepEqual(regionalNotInEffect({ ...STORED, startOfWeek: '0' }, { ...REGIONAL, startOfWeek: 0 }), [])
  assert.equal(regionalNotInEffect({ ...STORED, startOfWeek: null }, { ...REGIONAL, startOfWeek: 0 }).length, 1)
})

const company = (status, issuedAt, respondedAt) => get('/api/settings/company', status, { issuedAt, respondedAt })

test('company data on the first request is not "by automatic retry"', () => {
  const r = companyRetry([get(PANELS[0], 429), company(200, 1000, 1040)])
  assert.equal(r.arrivedOnFirstRequest, true)
  assert.equal(r.arrivedByAutomaticRetry, false)
  assert.equal(r.automaticRetriesSent, 0)
  assert.equal(r.automaticRetryWaitMs, null)
  assert.equal(r.exhausted, false)
})

test('company data refused and then answered came by the application\'s retry, and the wait runs from the first refusal', () => {
  const r = companyRetry([company(429, 1000, 1030), company(429, 1400, 1425), company(200, 2200, 2260)])
  assert.equal(r.arrived, true)
  assert.equal(r.arrivedOnFirstRequest, false)
  assert.equal(r.arrivedByAutomaticRetry, true)
  assert.equal(r.automaticRetriesSent, 2)
  assert.equal(r.automaticRetryWaitMs, 1230)
  assert.deepEqual(r.statuses, [429, 429, 200])
  assert.deepEqual(r.sendsAfterMs, [0, 400, 1200])
})

test('a 401 before the company data is the session being renewed, not a refusal', () => {
  const renewed = companyRetry([company(401, 0, 20), company(200, 1100, 1150)])
  assert.equal(renewed.arrivedAfterSessionRenewalOnly, true)
  assert.equal(renewed.arrivedByAutomaticRetry, false)
  assert.equal(renewed.automaticRetriesSent, 0)
  // 401, renewed, then refused, then answered: that one did need the retry,
  // and its wait runs from the refusal, not from the 401.
  const both = companyRetry([company(401, 0, 20), company(429, 760, 790), company(200, 2241, 2300)])
  assert.equal(both.arrivedAfterSessionRenewalOnly, false)
  assert.equal(both.arrivedByAutomaticRetry, true)
  assert.equal(both.automaticRetriesSent, 1)
  assert.equal(both.refusals, 1)
  assert.equal(both.automaticRetryWaitMs, 1510)
})

test('company data refused on every send is exhausted and did NOT arrive', () => {
  const r = companyRetry([company(429, 0, 10), company(429, 400, 410), company(429, 1200, 1210), company(429, 2900, 2910)])
  assert.equal(r.arrived, false)
  assert.equal(r.arrivedByAutomaticRetry, false)
  assert.equal(r.exhausted, true)
  assert.equal(r.automaticRetriesSent, 3)
  // A single refusal that was never repeated is not "retries used up".
  assert.equal(companyRetry([company(429, 0, 10)]).exhausted, false)
})

// The menu of a small application, in the shape of config/navigation.tsx.
const NAVIGATION = parseNavigation(`
const ALL_ROLES: Role[] = ['admin', 'sales_staff']
const ADMIN_ONLY: Role[] = ['admin']
export const menuSections: MenuSection[] = [
  { id: 'primary', title: 'Primary', items: [
    { id: 'dashboard', title: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard', roles: ALL_ROLES },
  ] },
  { id: 'operations', title: 'Operations', items: [
    { id: 'sales', title: 'Sales', icon: <SalesIcon />, children: [
      { id: 'orders', title: 'Sales Orders', icon: <OrdersIcon />, path: '/sales/orders', roles: ALL_ROLES },
    ] },
    { id: 'inventory', title: 'Inventory', icon: <InventoryIcon />, children: [
      { id: 'products', title: 'Products', icon: <ProductIcon />, path: '/inventory/products', roles: ADMIN_ONLY },
    ] },
    { id: 'settings', title: 'Settings', icon: <SettingsIcon />, children: [
      { id: 'company-settings', title: 'Company', icon: <CompanyIcon />, group: 'Business', path: '/settings/company', roles: ADMIN_ONLY },
    ] },
  ] },
]
`)

test('a step to a page the role is not shown is REFUSED before anything is clicked', async () => {
  // The page is an object with nothing on it: touching it would be a
  // TypeError, so a RecoveryRefused shows the refusal came first.
  const untouched = {}
  const staff = accessFor(NAVIGATION, 'sales_staff')
  await assert.rejects(follow(untouched, staff, { parent: 'Settings', child: 'Company' }), (err) => {
    assert.equal(err.name, 'RecoveryRefused')
    assert.match(err.message, /"Settings > Company" is not one the role sales_staff can open/)
    return true
  })
  await assert.rejects(follow(untouched, staff, { parent: 'Inventory', child: 'Products' }), { name: 'RecoveryRefused' })
  // The same link is not refused for a role that is shown it: the call goes
  // on to the page, which here has nothing to click.
  await assert.rejects(follow(untouched, accessFor(NAVIGATION, 'admin'), { parent: 'Settings', child: 'Company' }), { name: 'TypeError' })
  await assert.rejects(follow(untouched, staff, { parent: 'Sales', child: 'Sales Orders' }), { name: 'TypeError' })
})

test('data the role has no page for is named with the reason, and a page the role does have is said out loud', () => {
  const staff = accessFor(NAVIGATION, 'sales_staff')
  assert.match(noWayBack(COMPANY_DATA, staff, 1), /the sidebar asks for it once.*retries after a 429 did not bring it.*shown none of them/)
  assert.match(noWayBack(REGIONAL_DATA, staff, 1), /the root layout asks for it once.*shown none of them/)
  assert.match(noWayBack(REGIONAL_DATA, accessFor(NAVIGATION, 'admin'), 1), /is shown \/inventory\/products, which W1 does not try$/)
  assert.match(noWayBack(COMPANY_DATA, accessFor(NAVIGATION, 'admin'), 1), /is shown \/settings\/company, which W1 does not try$/)
  assert.match(noWayBack('dashboard panel: Payments', staff, 3), /still missing after 3 round trip\(s\)/)
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
  const recovered = tab({ completeOnFirstLoad: false, recovery: [{ action: 'round-trip' }, { action: 'round-trip' }], msUntilDataPresent: 9000 })
  const lost = tab({
    tab: 'u',
    completeOnFirstLoad: false,
    dataPresent: false,
    recovery: [{ action: 'round-trip' }, { action: 'round-trip' }, { action: 'round-trip' }],
    notRecoverableByRole: [{ data: COMPANY_DATA, why: 'x' }],
    action: null,
  })
  const states = [tab(), recovered, lost].map((t) => ({ ...t, ...verdict(t) }))
  const round = roundUsability(states)
  assert.equal(round.tabsUsable, 2)
  assert.equal(round.everyTabUsable, false)
  assert.equal(round.tabsCompleteOnFirstLoad, 1)
  assert.equal(round.tabsNeedingRecovery, 2)
  assert.equal(round.maxRecoveryActions, 3)
  assert.equal(round.recoveryActionsTotal, 5)
  assert.equal(round.slowestRecoveryMs, 9000)
  assert.deepEqual(round.tabsNotRecoverable.map((t) => t.tab), ['u'])
  assert.deepEqual(round.dataNotRecoverableByRole, { [COMPANY_DATA]: ['u'] })
})

test('the round says how the company data arrived and what a refused regional request did', () => {
  const first = tab({ tab: 'a', company: companyRetry([company(200, 0, 30)]), firstLoad: { regionalRequestLeftFailed: false, regionalNotInEffect: [] } })
  const retried = tab({ tab: 'b', company: companyRetry([company(429, 0, 10), company(200, 400, 460)]), firstLoad: { regionalRequestLeftFailed: true, regionalNotInEffect: [] } })
  const slower = tab({ tab: 'c', company: companyRetry([company(429, 0, 10), company(429, 300, 310), company(200, 1100, 1210)]), firstLoad: { regionalRequestLeftFailed: true, regionalNotInEffect: ['dateFormat is not stored'] } })
  const gone = tab({ tab: 'd', dataPresent: false, company: companyRetry([company(429, 0, 10), company(429, 300, 310)]), action: null })
  const round = roundUsability([first, retried, slower, gone].map((t) => ({ ...t, ...verdict(t) })))
  assert.equal(round.tabsCompanyOnFirstRequest, 1)
  assert.equal(round.tabsCompanyByAutomaticRetry, 2)
  assert.equal(round.tabsCompanyAfterSessionRenewalOnly, 0)
  assert.deepEqual(round.companyAutomaticRetryWaitMs, { shortest: 450, median: 1200, longest: 1200 })
  assert.equal(round.tabsCompanyRetryExhausted, 1)
  assert.equal(round.tabsRegionalRequestRefused, 2)
  assert.equal(round.tabsRegionalNotInEffect, 1)
  assert.equal(roundUsability([{ ...first, ...verdict(first) }]).companyAutomaticRetryWaitMs, null)
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
