// What "usable" means for a tab of workload W1.
//
// Decided by the repository owner on 2026-10-06:
//
//   "Usable" means the tab reaches a working state without reloading or
//   signing in again, with its expected data available and actions working.
//   It does not require every initial request to succeed. Record any retries
//   or user actions needed to recover; a rendered shell with missing data is
//   not usable.
//
// A tab is judged in three steps, one tab at a time, the way a person works
// through a restored window:
//
//   1. Expected data. The tab is on the dashboard and shows it complete (see
//      judgeDashboard), and no data request the tab made is left failed.
//   2. Recovery, only if step 1 found data missing, and only by what a person
//      could do without reloading the document or signing in again: the
//      application's own sidebar links. Bounded by MAX_RECOVERY_ACTIONS.
//      page.reload(), page.goto() and a sign-in are never used here.
//   3. An action. The customer list is opened through the sidebar; it must
//      send a fresh request, have it answered 2xx and show its rows.
//
// The tab is usable only if steps 1 to 3 end with the data present and the
// action working, in the document the tab first loaded. Everything a tab
// needed on the way is recorded.
//
// Where the texts and selectors come from (frontend/src):
//   pages/dashboard/DashboardPage.tsx   while any of its six queries loads it
//       renders only a CircularProgress; afterwards <PageHeader title=
//       "Dashboard"> (an h5) and, if any query failed, a warning Alert
//       "Could not load: <sections>. Other data may be incomplete."
//   components/common/Sidebar.tsx       the menu: ListItemButton per item in
//       the permanent Drawer; children are mounted only while their parent
//       is expanded. It also shows the company name and logo from
//       GET /api/settings/company, and falls back silently to "ERP" when that
//       request failed, which is why step 1 also reads the request log.
//   pages/sales/CustomersPage.tsx       <SimpleListPage title="Customers">,
//       error text "Failed to load customers."
//   components/common/EntityTable.tsx   one <tr> per row; a loading table
//       shows Skeleton rows and an empty one a single cell spanning the table.
//   pages/settings/CompanySettingsPage.tsx   the only other place that asks
//       for the company settings (administrators only).
import { sleep } from './config.mjs'
import { becomes, documentId, showsSignedInUi } from './harness.mjs'
import { bucketLevel } from './stats.mjs'

export const MAX_RECOVERY_ACTIONS = 3
export const MAX_ACTION_TRIES = 3
const COMPANY_SETTINGS = '/api/settings/company'
const CUSTOMER_LIST = '/api/customers'
const MENU_ITEM = '.MuiDrawer-root .MuiListItemButton-root'

const ok2xx = (e) => typeof e.status === 'number' && e.status >= 200 && e.status < 300
const requestKey = (e) => `${e.method} ${e.path}${e.search ?? ''}`

// ---------------------------------------------------------------------------
// Pure judgement (unit-tested in usable.test.mjs)
// ---------------------------------------------------------------------------

/**
 * The data requests that are left failed: for each distinct request (method,
 * path and query) the LATEST one decides. A request answered 429 or 401 and
 * then repeated successfully is not left failed; one that was never repeated,
 * is still pending, or failed without an answer is. `entries` are in the
 * order they were issued.
 */
export function leftFailed(entries) {
  const latest = new Map()
  for (const e of entries) {
    if (e.zone === 'business') latest.set(requestKey(e), e)
  }
  return [...latest]
    .filter(([, e]) => !ok2xx(e))
    .map(([request, e]) => ({ request, path: e.path, status: e.status ?? e.failed ?? 'pending' }))
}

/** The sections the dashboard's own warning names, or [] when it shows none. */
export function failedSections(alerts) {
  for (const text of alerts) {
    const m = /Could not load:\s*(.*?)\.\s*Other data may be incomplete/.exec(text)
    if (m) return m[1].split(',').map((s) => s.trim()).filter(Boolean)
    if (text.includes('Could not load:')) return [text] // the wording changed: still a failure, shown as it is
  }
  return []
}

/**
 * Step 1. Pass condition, all of:
 *   - the tab is at /dashboard and the "Dashboard" heading is rendered (the
 *     page renders it only once none of its queries is loading);
 *   - the page shows no "Could not load:" warning;
 *   - at least one data request of the tab was answered 2xx;
 *   - no data request of the tab is left failed (leftFailed). This is what
 *     catches the shell's data, which fails without any message.
 */
export function judgeDashboard(dom, entries) {
  const why = []
  const sections = failedSections(dom.alerts)
  if (dom.path !== '/dashboard') why.push(`the tab is at ${dom.path}, not on the dashboard`)
  else if (!dom.heading) why.push(`the dashboard has not rendered its content${dom.spinners > 0 ? ' (it shows its loading spinner)' : ''}`)
  if (sections.length > 0) why.push(`the dashboard says it could not load: ${sections.join(', ')}`)
  const failed = leftFailed(entries)
  if (!entries.some((e) => e.zone === 'business' && ok2xx(e))) why.push('no data request of the tab was answered 2xx')
  if (failed.length > 0) why.push(`${failed.length} data request(s) left failed: ${failed.map((f) => `${f.request} ${f.status}`).join('; ')}`)
  return { complete: why.length === 0, failedSections: sections, requestsLeftFailed: failed, why }
}

/**
 * Which recovery a person would try next. The company settings are asked for
 * by the sidebar, which never leaves the screen, so going to another page and
 * back does not ask again; only the Company settings page does. Everything
 * else is asked again when the dashboard is opened again.
 */
export function nextRecovery(state) {
  const onlyCompany =
    state.failedSections.length === 0 &&
    state.requestsLeftFailed.length > 0 &&
    state.requestsLeftFailed.every((f) => f.path === COMPANY_SETTINGS) &&
    state.why.length === 1
  return onlyCompany ? 'company-settings' : 'round-trip'
}

/**
 * Step 3. Pass condition, all of:
 *   - the click sent a fresh request for the customer list and it was
 *     answered 2xx (a list drawn from cache proves nothing about the tab);
 *   - the tab is at /sales/customers with the "Customers" heading;
 *   - no "Failed to load customers." message;
 *   - at least one data row is shown (not a skeleton, not the empty message);
 *   - no request of this try is left failed.
 * `entries` are the tab's requests since the click.
 */
export function judgeListAction(dom, entries) {
  const why = []
  const fresh = entries.filter((e) => e.zone === 'business' && e.path === CUSTOMER_LIST)
  if (fresh.length === 0) why.push('opening the customer list sent no request for it')
  else if (!fresh.some(ok2xx)) why.push(`the customer list request was answered ${fresh.map((e) => e.status ?? e.failed ?? 'pending').join(', ')}`)
  if (dom.path !== '/sales/customers') why.push(`the tab is at ${dom.path}, not on the customer list`)
  else if (!dom.heading) why.push('the customer list has not rendered')
  if (dom.alerts.some((t) => t.includes('Failed to load'))) why.push(`the page says: ${dom.alerts.find((t) => t.includes('Failed to load'))}`)
  if (dom.dataRows < 1) why.push('the customer list shows no rows')
  const failed = leftFailed(entries)
  if (failed.length > 0) why.push(`${failed.length} request(s) of the action left failed: ${failed.map((f) => `${f.request} ${f.status}`).join('; ')}`)
  return { ok: why.length === 0, rows: dom.dataRows, why }
}

/**
 * The verdict for one tab. Usable only if ALL hold: it shows the signed-in
 * application, its data is present (on first load or after recovery), the
 * action worked, and it is still the document it first loaded.
 */
export function verdict(record) {
  const why = []
  if (!record.signedInUi) why.push('the signed-in application is not shown')
  if (!record.dataPresent) why.push(`data still missing after ${record.recovery.length} recovery action(s): ${(record.stillMissing ?? []).join(' | ')}`)
  if (!record.action?.ok) why.push(`the action did not work: ${(record.action?.why ?? ['it was not tried']).join(' | ')}`)
  if (record.sameDocument === false) why.push('the document was reloaded')
  return { usable: why.length === 0, whyNot: why.length === 0 ? undefined : why.join('; ') }
}

/** What a round's tabs needed, for the round's record and the judgement. */
export function roundUsability(states) {
  const needed = states.filter((t) => t.recovery.length > 0)
  return {
    tabsUsable: states.filter((t) => t.usable).length,
    everyTabUsable: states.length > 0 && states.every((t) => t.usable),
    tabsCompleteOnFirstLoad: states.filter((t) => t.completeOnFirstLoad).length,
    tabsNeedingRecovery: needed.length,
    maxRecoveryActions: Math.max(0, ...states.map((t) => t.recovery.length)),
    recoveryActionsTotal: states.reduce((n, t) => n + t.recovery.length, 0),
    // Recovered only by opening Settings > Company, a page an administrator
    // can open and nobody else can.
    tabsNeedingCompanySettingsVisit: states.filter((t) => t.recovery.some((r) => r.action === 'company-settings')).length,
    tabsNeedingActionRetry: states.filter((t) => (t.action?.tries?.length ?? 0) > 1).length,
    slowestRecoveryMs: Math.max(0, ...states.map((t) => t.msUntilDataPresent ?? 0)),
    tabsNotRecoverable: states.filter((t) => !t.usable).map((t) => ({ tab: t.tab, whyNot: t.whyNot })),
  }
}

// ---------------------------------------------------------------------------
// In the page
// ---------------------------------------------------------------------------

function readDom(page, heading) {
  return page.evaluate((title) => {
    const text = (el) => (el.textContent ?? '').trim()
    const rows = [...document.querySelectorAll('tbody tr')]
    return {
      path: location.pathname,
      heading: [...document.querySelectorAll('h5')].some((h) => text(h) === title),
      spinners: document.querySelectorAll('[role="progressbar"]').length,
      alerts: [...document.querySelectorAll('.MuiAlert-root')].map(text),
      // A data row has several cells and no skeleton; the empty message is
      // one cell spanning the table.
      dataRows: rows.filter((r) => r.querySelectorAll('td').length > 1 && !r.querySelector('.MuiSkeleton-root')).length,
      // Evidence only: the company name under "ERP System" in the sidebar,
      // or null when the sidebar shows none.
      companyNameInSidebar: (() => {
        const brand = [...document.querySelectorAll('.MuiDrawer-root h6')].find((h) => text(h) === 'ERP System')
        return brand && brand.nextElementSibling ? text(brand.nextElementSibling) : null
      })(),
    }
  }, heading)
}

const menuItem = (page, title) => page.locator(MENU_ITEM).filter({ hasText: new RegExp(`^${title}$`) }).first()

/**
 * Follows the application's own sidebar links: a client-side route change,
 * never a document load. A parent is clicked only if its child is not on
 * screen, because clicking an open parent closes it.
 *
 * The sidebar closes its sections whenever the route changes, so a section
 * can close under the click on its child (seen right after a sign-in, whose
 * redirect was still arriving). The person then opens the section again, and
 * so does this, for up to 15 s. A link that is still not there after that is
 * a TimeoutError, and it is not caught here.
 */
async function follow(page, parent, child) {
  if (child === undefined) {
    await menuItem(page, parent).click({ timeout: 10000 })
    return
  }
  const deadline = Date.now() + 15000
  for (;;) {
    if (!(await menuItem(page, child).isVisible())) await menuItem(page, parent).click({ timeout: 10000 })
    try {
      await menuItem(page, child).click({ timeout: 2500 })
      return
    } catch (err) {
      // Only "the child could not be clicked yet" is tried again; the last
      // such error, and any other error at once, goes to the caller.
      if (!err || err.name !== 'TimeoutError' || Date.now() > deadline) throw err
    }
  }
}

/** The tab arrived: the path and the page's heading are on screen. False on timeout. */
const arrived = (page, path, heading, timeout) =>
  becomes(
    page,
    ([p, title]) => location.pathname === p && [...document.querySelectorAll('h5')].some((h) => (h.textContent ?? '').trim() === title),
    [path, heading],
    timeout,
  )

/**
 * The tab's own traffic has played out: nothing of it pending and nothing new
 * for `quietMs`. Returns false when it did not within `maxMs`; the caller then
 * judges what is on screen, where a pending request counts as failed.
 */
async function settled(profile, mark, page, { quietMs = 2000, maxMs = 30000 } = {}) {
  const started = Date.now()
  for (;;) {
    const mine = profile.since(mark, page).filter((e) => e.zone === 'business' || e.zone === 'session')
    const pending = mine.some((e) => e.status === null && !e.failed)
    const lastAt = mine.reduce((m, e) => Math.max(m, e.respondedAt ?? e.issuedAt), started)
    if (!pending && Date.now() - lastAt > quietMs) return true
    if (Date.now() - started > maxMs) return false
    await sleep(100)
  }
}

/**
 * Pacing, so that recovery does not itself run into api_limit: waits until
 * the limit's bucket, replayed over everything the profile sent to it, has
 * room for a whole page of requests. A person recovering tabs one after the
 * other is slower than this. Returns the time waited.
 */
async function room(profile, api, { need = 15, maxMs = 20000 } = {}) {
  const started = Date.now()
  for (;;) {
    const times = profile.log
      .filter((e) => e.zone === 'business' || e.zone === 'health')
      .map((e) => (e.sentAt ?? e.issuedAt) / 1000)
      .sort((x, y) => x - y)
    if (bucketLevel(times, api.ratePerSecond, Date.now() / 1000) <= api.burst - need) return Date.now() - started
    if (Date.now() - started > maxMs) return Date.now() - started
    await sleep(100)
  }
}

async function dashboardState(profile, openMark, page) {
  const dom = await readDom(page, 'Dashboard')
  return { ...judgeDashboard(dom, profile.since(openMark, page)), companyNameInSidebar: dom.companyNameInSidebar }
}

/** Sidebar: Inventory > Products, then Dashboard. Re-mounts the dashboard, which asks again for what failed. */
async function roundTrip(profile, page) {
  const mark = profile.mark()
  await follow(page, 'Inventory', 'Products')
  await arrived(page, '/inventory/products', 'Products', 20000)
  await settled(profile, mark, page)
  const back = profile.mark()
  await follow(page, 'Dashboard')
  await arrived(page, '/dashboard', 'Dashboard', 30000)
  await settled(profile, back, page)
}

/** Sidebar: Settings > Company, then Dashboard. The Company page asks for the company settings again. */
async function companySettingsVisit(profile, page) {
  const mark = profile.mark()
  await follow(page, 'Settings', 'Company')
  await arrived(page, '/settings/company', 'Company Settings', 20000)
  await settled(profile, mark, page)
  const back = profile.mark()
  await follow(page, 'Dashboard')
  await arrived(page, '/dashboard', 'Dashboard', 30000)
  await settled(profile, back, page)
}

const RECOVERIES = {
  'round-trip': { what: 'sidebar: Inventory > Products, then Dashboard', run: roundTrip },
  'company-settings': { what: 'sidebar: Settings > Company, then Dashboard (administrators only)', run: companySettingsVisit },
}

/**
 * Steps 1 to 3 for one tab whose own loading has already played out.
 * `openMark` is the profile's mark from before the tab was opened. Returns
 * the tab's record; `usable` in it is the pass condition (see verdict()).
 *
 * Errors are not swallowed. A sidebar link that never appears, or a page
 * that never arrives, is a Playwright TimeoutError: it is recorded as the
 * reason the tab is not usable. Anything else is rethrown and fails W1.
 */
export async function bringToWorkingState(profile, openMark, page, api) {
  const record = {
    tab: profile.label(page),
    signedInUi: await showsSignedInUi(page, 1000),
    usable: false,
    completeOnFirstLoad: false,
    dataPresent: false,
    recovery: [],
    action: null,
  }
  const own = profile.since(openMark, page)
  const statuses = {}
  for (const e of own.filter((x) => x.zone === 'business')) {
    const s = e.status ?? e.failed ?? 'pending'
    statuses[s] = (statuses[s] ?? 0) + 1
  }
  record.loadRequestStatuses = statuses
  // The status indicator polls /api/health every 30 s and repairs itself; it
  // is counted, not judged.
  record.statusPolls429 = own.filter((e) => e.zone === 'health' && e.status === 429).length
  if (!record.signedInUi) {
    return { ...record, ...verdict(record), whyNot: `the signed-in application is not shown (at ${new URL(page.url()).pathname})` }
  }

  const document0 = await documentId(page)
  try {
    await page.bringToFront()
    // Step 1.
    let state = await dashboardState(profile, openMark, page)
    record.completeOnFirstLoad = state.complete
    record.firstLoad = state
    // Step 2: bounded, paced, and only through the sidebar.
    const recoveryStarted = Date.now()
    while (!state.complete && record.recovery.length < MAX_RECOVERY_ACTIONS) {
      const kind = nextRecovery(state)
      const pacedMs = await room(profile, api)
      const started = Date.now()
      await RECOVERIES[kind].run(profile, page)
      state = await dashboardState(profile, openMark, page)
      record.recovery.push({
        action: kind,
        what: RECOVERIES[kind].what,
        because: record.recovery.length === 0 ? record.firstLoad.why : record.recovery.at(-1).stillMissing,
        pacedMs,
        tookMs: Date.now() - started,
        dataPresentAfter: state.complete,
        stillMissing: state.why,
      })
    }
    record.dataPresent = state.complete
    record.stillMissing = state.complete ? undefined : state.why
    if (record.recovery.length > 0 && state.complete) record.msUntilDataPresent = Date.now() - recoveryStarted
    record.companyNameInSidebarAtEnd = state.companyNameInSidebar

    // Step 3, only for a tab whose data is there: an action in a tab that is
    // already not usable would add nothing.
    if (record.dataPresent) {
      const tries = []
      let result = { ok: false, why: ['it was not tried'] }
      while (!result.ok && tries.length < MAX_ACTION_TRIES) {
        if (tries.length > 0) {
          // A failed list offers no retry button: leave and come back.
          await follow(page, 'Dashboard')
          await arrived(page, '/dashboard', 'Dashboard', 30000)
        }
        const pacedMs = await room(profile, api)
        const mark = profile.mark()
        const started = Date.now()
        await follow(page, 'Sales', 'Customers')
        await arrived(page, '/sales/customers', 'Customers', 20000)
        await settled(profile, mark, page)
        result = judgeListAction(await readDom(page, 'Customers'), profile.since(mark, page))
        tries.push({ pacedMs, tookMs: Date.now() - started, ...result })
      }
      record.action = { what: 'sidebar: Sales > Customers; a fresh request answered 2xx and its rows shown', ok: result.ok, why: result.ok ? undefined : result.why, tries }
    }
  } catch (err) {
    if (!err || err.name !== 'TimeoutError') throw err
    record.navigationFailed = err.message.split('\n')[0]
  }
  record.sameDocument = (await documentId(page)) === document0
  record.signedInUi = await showsSignedInUi(page, 1000)
  const final = verdict(record)
  if (record.navigationFailed && !final.usable) final.whyNot = `${record.navigationFailed}; ${final.whyNot}`
  return { ...record, ...final }
}

/**
 * Precondition of W1, checked once in a tab that is alone: the customer list
 * has at least one row for this user. Without one, step 3 could not tell a
 * working tab from a broken one.
 */
export async function customerListHasRows(page) {
  // The tab has just signed in: wait for its redirect to end on the dashboard.
  await arrived(page, '/dashboard', 'Dashboard', 30000)
  await follow(page, 'Sales', 'Customers')
  await arrived(page, '/sales/customers', 'Customers', 20000)
  await becomes(page, () => document.querySelectorAll('tbody tr').length > 0 && !document.querySelector('tbody .MuiSkeleton-root'), null, 20000)
  return (await readDom(page, 'Customers')).dataRows
}
