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
// and, the same day, about who the tab belongs to:
//
//   Update W1 to exercise a non-administrator with representative permissions
//   and verify recovery without visiting administrator-only pages. If other
//   panels remain unusable, report those failures; don't silently broaden
//   this into global HTTP retries.
//
//   Administrator-only recovery does not satisfy W1 for ordinary users.
//
// A tab is judged in three steps, one tab at a time, the way a person works
// through a restored window:
//
//   1. Expected data. The tab is on the dashboard and shows it complete, and
//      the shell around it has its data too (see judgeDashboard).
//   2. Recovery, only if step 1 found data missing, and only by what the
//      signed-in user could do without reloading the document or signing in
//      again: the sidebar links that user's role is shown. A link to a page
//      outside that role's set is REFUSED, not followed (follow(), and
//      lib/access.mjs for where the set comes from). Bounded by
//      MAX_RECOVERY_ACTIONS. page.reload(), page.goto() and a sign-in are
//      never used here.
//   3. An action. The customer list is opened through the sidebar; it must
//      send a fresh request, have it answered 2xx and show its rows.
//
// The tab is usable only if steps 1 to 3 end with the data present and the
// action working, in the document the tab first loaded. Everything a tab
// needed on the way is recorded, and so is every piece of data the user's
// role had no way to get back.
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
//       request failed. The sidebar never leaves the screen, so no page
//       change asks again; the only other place that asks is the Company
//       settings page, which only an administrator is shown.
//   store/api/settingsApi.ts, services/retryOn429.ts   that one request is
//       sent again by the application after a 429: up to 3 times, after
//       250-500, 500-1000 and 1000-2000 ms. No other request is.
//   hooks/useRegionalSettings.ts        mounted once, in RootLayout, which
//       never leaves the screen either. It asks GET /api/settings/regional
//       and copies the answer into localStorage (dateFormat, timeFormat,
//       numberFormat, defaultCurrency, timezone, startOfWeek);
//       utils/formatters.ts and the date pickers read those keys and fall
//       back to built-in defaults when a key is absent. Nothing on screen
//       says that the request failed. See regionalNotInEffect().
//   pages/sales/CustomersPage.tsx       <SimpleListPage title="Customers">,
//       error text "Failed to load customers."
//   components/common/EntityTable.tsx   one <tr> per row; a loading table
//       shows Skeleton rows and an empty one a single cell spanning the table.
import { sleep } from './config.mjs'
import { NAVIGATION_FILE } from './access.mjs'
import { becomes, documentId, showsSignedInUi } from './harness.mjs'
import { bucketLevel } from './stats.mjs'

export const MAX_RECOVERY_ACTIONS = 3
export const MAX_ACTION_TRIES = 3
export const COMPANY_SETTINGS = '/api/settings/company'
export const REGIONAL_SETTINGS = '/api/settings/regional'
// The answers a profile must keep ({ keepAnswers }) for shellReference to have
// anything to read: what the server said the shell's data is.
export const KEEP_SHELL_ANSWERS = /^\/api\/settings\/(company|regional)$/
// The names under which missing shell data is reported.
export const COMPANY_DATA = 'company data (the sidebar\'s company name and logo)'
export const REGIONAL_DATA = 'regional settings (the date, time and number formats in effect)'
// The server's field and the localStorage key useRegionalSettings copies it to.
const REGIONAL_KEYS = [
  ['dateFormat', 'dateFormat'],
  ['timeFormat', 'timeFormat'],
  ['numberFormat', 'numberFormat'],
  ['currency', 'defaultCurrency'],
  ['timezone', 'timezone'],
  ['startOfWeek', 'startOfWeek'],
]
// The links W1 follows (parent, child, the page's h5). Each is looked up in
// the signed-in role's menu before it is clicked; see follow().
export const DASHBOARD = { parent: 'Dashboard', child: undefined, heading: 'Dashboard' }
export const ROUND_TRIP = { parent: 'Sales', child: 'Sales Orders', heading: 'Sales Orders' }
export const ACTION = { parent: 'Sales', child: 'Customers', heading: 'Customers' }
const CUSTOMER_LIST = '/api/customers'
const MENU_ITEM = '.MuiDrawer-root .MuiListItemButton-root'

/** A step was not taken because it would open a page the signed-in role cannot open. */
export class RecoveryRefused extends Error {
  constructor(message) {
    super(message)
    this.name = 'RecoveryRefused'
  }
}

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
 * What a refused regional-settings request changes for the tab, judged by its
 * effect and not by the request. The application formats every date, time and
 * number from localStorage, which useRegionalSettings fills from the answer;
 * localStorage belongs to the profile, so a tab whose own request was refused
 * still formats correctly when an earlier load of the same profile stored the
 * values. Seen in the running application (2026-10-06, server dateFormat
 * DD-MM-YYYY): with the values stored, a tab whose request was answered 429
 * showed exactly what a tab whose request succeeded showed; with nothing
 * stored, the same order list showed 02/10/2026 for 02-10-2026 (the built-in
 * default), with no message, and no page a sales_staff user can open asked
 * again.
 *
 * Pass condition: every value the application would have stored from the
 * server's answer (`reference`, the body of a 2xx GET /api/settings/regional)
 * is what the tab's localStorage holds. Returns the differences; [] passes.
 * The conditions mirror hooks/useRegionalSettings.ts: a string field is
 * stored when it is not empty, startOfWeek when it is 0 or 1.
 */
export function regionalNotInEffect(stored, reference) {
  const differences = []
  for (const [field, key] of REGIONAL_KEYS) {
    const value = reference[field]
    const written = field === 'startOfWeek' ? value === 0 || value === 1 : Boolean(value)
    if (!written) continue
    const have = stored[key] ?? null
    if (have !== String(value)) differences.push(`${key} is ${have === null ? 'not stored' : `"${have}"`}, the server says "${value}"`)
  }
  return differences
}

/**
 * Step 1. Pass condition, all of:
 *   - the tab is at /dashboard and the "Dashboard" heading is rendered (the
 *     page renders it only once none of its queries is loading);
 *   - the page shows no "Could not load:" warning;
 *   - at least one data request of the tab was answered 2xx;
 *   - no data request of the tab is left failed (leftFailed). This is what
 *     catches the shell's company data, which fails without any message.
 *     GET /api/settings/regional is the one exception: it is judged by its
 *     effect (next point), because a refused one can leave nothing missing;
 *   - the regional settings are in effect in the tab (regionalNotInEffect);
 *   - when the server's company has a name, the sidebar shows that name.
 *
 * `reference` is what the server answered in this profile: { companyName,
 * regional }. Each reason is tagged `shell` when it concerns data that only
 * a component which never leaves the screen asks for (the sidebar's company
 * data, the root layout's regional settings): opening another page and
 * coming back cannot bring those back.
 */
export function judgeDashboard(dom, entries, reference) {
  const reasons = []
  const page = (text) => reasons.push({ text, shell: false })
  const shell = (text) => reasons.push({ text, shell: true })
  const missing = []

  const sections = failedSections(dom.alerts)
  if (dom.path !== '/dashboard') page(`the tab is at ${dom.path}, not on the dashboard`)
  else if (!dom.heading) page(`the dashboard has not rendered its content${dom.spinners > 0 ? ' (it shows its loading spinner)' : ''}`)
  if (sections.length > 0) {
    page(`the dashboard says it could not load: ${sections.join(', ')}`)
    missing.push(...sections.map((name) => `dashboard panel: ${name}`))
  }
  if (!entries.some((e) => e.zone === 'business' && ok2xx(e))) page('no data request of the tab was answered 2xx')

  const allFailed = leftFailed(entries)
  const failed = allFailed.filter((f) => f.path !== REGIONAL_SETTINGS)
  const company = failed.filter((f) => f.path === COMPANY_SETTINGS)
  const others = failed.filter((f) => f.path !== COMPANY_SETTINGS)
  if (others.length > 0) {
    page(`${others.length} data request(s) left failed: ${others.map((f) => `${f.request} ${f.status}`).join('; ')}`)
    missing.push(...others.map((f) => f.request))
  }
  if (company.length > 0) shell(`the company settings request is left failed: ${company.map((f) => `${f.request} ${f.status}`).join('; ')}`)
  const nameMissing = Boolean(reference.companyName) && dom.companyNameInSidebar !== reference.companyName
  if (nameMissing) shell(`the sidebar shows ${dom.companyNameInSidebar === null ? 'no company name' : `"${dom.companyNameInSidebar}"`}, the server says "${reference.companyName}"`)
  if (company.length > 0 || nameMissing) missing.push(COMPANY_DATA)

  const regional = regionalNotInEffect(dom.stored, reference.regional)
  if (regional.length > 0) {
    shell(`the regional settings are not in effect: ${regional.join('; ')}`)
    missing.push(REGIONAL_DATA)
  }

  return {
    complete: reasons.length === 0,
    failedSections: sections,
    requestsLeftFailed: failed,
    // Recorded, not judged by itself: the tab's own request for the regional
    // settings was refused. Whether that left anything missing is `regional`.
    regionalRequestLeftFailed: allFailed.some((f) => f.path === REGIONAL_SETTINGS),
    regionalNotInEffect: regional,
    missing: [...new Set(missing)],
    // Everything still wrong is shell data: nothing a page change can repair.
    shellOnly: reasons.length > 0 && reasons.every((r) => r.shell),
    why: reasons.map((r) => r.text),
  }
}

/**
 * What the application's own retry of GET /api/settings/company did in one
 * tab. `entries` are the tab's requests in the order they were issued, up to
 * the moment the tab is first judged: no user action has happened yet, so
 * every repeat among them is the application's.
 *
 * A 401 before the data is the session being renewed (the request is sent
 * again with the new token); that is not the retry this is about. Only a 429
 * is a refusal by the ingress.
 *
 * arrivedByAutomaticRetry: a 2xx came after at least one 429.
 * automaticRetryWaitMs: from the answer of the first 429 to the answer that
 * brought the data. automaticRetriesSent: the sends that followed a 429.
 * exhausted: the data never came, the request was refused more than once and
 * the last answer was a refusal.
 */
export function companyRetry(entries) {
  const sent = entries.filter((e) => e.zone === 'business' && e.method === 'GET' && e.path === COMPANY_SETTINGS)
  const status = (e) => e.status ?? e.failed ?? 'pending'
  const got = sent.findIndex(ok2xx)
  const considered = got >= 0 ? sent.slice(0, got + 1) : sent
  const firstRefusal = considered.findIndex((e) => e.status === 429)
  const refusals = considered.filter((e) => e.status === 429).length
  const byRetry = got >= 0 && firstRefusal >= 0
  return {
    statuses: sent.map(status),
    sendsAfterMs: sent.map((e) => e.issuedAt - sent[0].issuedAt),
    arrived: got >= 0,
    arrivedOnFirstRequest: got === 0,
    // 401, then the data, and no refusal: only the session was renewed.
    arrivedAfterSessionRenewalOnly: got > 0 && firstRefusal < 0,
    arrivedByAutomaticRetry: byRetry,
    refusals,
    automaticRetriesSent: firstRefusal < 0 ? 0 : considered.length - 1 - firstRefusal,
    automaticRetryWaitMs: byRetry ? sent[got].respondedAt - sent[firstRefusal].respondedAt : null,
    exhausted: got < 0 && refusals > 1 && sent.at(-1).status === 429,
  }
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
  const waits = states.map((t) => t.company?.automaticRetryWaitMs).filter((ms) => typeof ms === 'number').sort((x, y) => x - y)
  // Each piece of data that some tab's user could not get back, with the tabs.
  const lost = {}
  for (const t of states) for (const item of t.notRecoverableByRole ?? []) (lost[item.data] ??= []).push(t.tab)
  return {
    tabsUsable: states.filter((t) => t.usable).length,
    everyTabUsable: states.length > 0 && states.every((t) => t.usable),
    tabsCompleteOnFirstLoad: states.filter((t) => t.completeOnFirstLoad).length,
    // The company data and the application's own retry of it (companyRetry).
    tabsCompanyOnFirstRequest: states.filter((t) => t.company?.arrivedOnFirstRequest).length,
    tabsCompanyAfterSessionRenewalOnly: states.filter((t) => t.company?.arrivedAfterSessionRenewalOnly).length,
    tabsCompanyByAutomaticRetry: states.filter((t) => t.company?.arrivedByAutomaticRetry).length,
    companyAutomaticRetryWaitMs: waits.length > 0 ? { shortest: waits[0], median: waits[Math.floor(waits.length / 2)], longest: waits.at(-1) } : null,
    tabsCompanyRetryExhausted: states.filter((t) => t.company?.exhausted).length,
    // Tabs whose own regional-settings request was refused, and of those the
    // ones in which the formats were then wrong (regionalNotInEffect).
    tabsRegionalRequestRefused: states.filter((t) => t.firstLoad?.regionalRequestLeftFailed).length,
    tabsRegionalNotInEffect: states.filter((t) => (t.firstLoad?.regionalNotInEffect?.length ?? 0) > 0).length,
    tabsNeedingRecovery: needed.length,
    maxRecoveryActions: Math.max(0, ...states.map((t) => t.recovery.length)),
    recoveryActionsTotal: states.reduce((n, t) => n + t.recovery.length, 0),
    tabsNeedingActionRetry: states.filter((t) => (t.action?.tries?.length ?? 0) > 1).length,
    slowestRecoveryMs: Math.max(0, ...states.map((t) => t.msUntilDataPresent ?? 0)),
    // Steps not taken because they would have opened a page outside the role's set.
    tabsWithRefusedStep: states.filter((t) => t.refused).length,
    dataNotRecoverableByRole: lost,
    tabsNotRecoverable: states.filter((t) => !t.usable).map((t) => ({ tab: t.tab, whyNot: t.whyNot })),
  }
}

// ---------------------------------------------------------------------------
// In the page
// ---------------------------------------------------------------------------

function readDom(page, heading) {
  return page.evaluate(
    ([title, keys]) => {
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
        // The company name under "ERP System" in the sidebar, or null when
        // the sidebar shows none (Sidebar.tsx renders it only when it has one).
        companyNameInSidebar: (() => {
          const brand = [...document.querySelectorAll('.MuiDrawer-root h6')].find((h) => text(h) === 'ERP System')
          return brand && brand.nextElementSibling ? text(brand.nextElementSibling) : null
        })(),
        // What the formatters read (hooks/useRegionalSettings.ts writes them).
        stored: Object.fromEntries(keys.map((key) => [key, localStorage.getItem(key)])),
      }
    },
    [heading, REGIONAL_KEYS.map(([, key]) => key)],
  )
}

const escaped = (title) => title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const menuItem = (page, title) => page.locator(MENU_ITEM).filter({ hasText: new RegExp(`^${escaped(title)}$`) }).first()

/**
 * Follows the application's own sidebar links: a client-side route change,
 * never a document load. A parent is clicked only if its child is not on
 * screen, because clicking an open parent closes it.
 *
 * Refusal. Before anything is clicked the link is looked up in the menu of
 * the signed-in user's role (`access`, lib/access.mjs). A link that role is
 * not shown is not followed: RecoveryRefused is thrown, and the caller fails
 * the tab with it. Pass condition for a step to be taken at all: the link is
 * in `access`. After the click the tab must also be at that link's path, or
 * at least at a path of the role's set; anything else is refused the same
 * way, so a redirect cannot carry a tab somewhere the role cannot go.
 *
 * The sidebar closes its sections whenever the route changes, so a section
 * can close under the click on its child (seen right after a sign-in, whose
 * redirect was still arriving). The person then opens the section again, and
 * so does this, for up to 15 s. A link that is still not there after that is
 * a TimeoutError, and it is not caught here.
 */
export async function follow(page, access, { parent, child }) {
  const target = access.link(parent, child)
  const name = child === undefined ? parent : `${parent} > ${child}`
  if (!target) {
    throw new RecoveryRefused(`refused: the sidebar link "${name}" is not one the role ${access.role} can open (${NAVIGATION_FILE})`)
  }
  if (child === undefined) {
    await menuItem(page, parent).click({ timeout: 10000 })
  } else {
    const deadline = Date.now() + 15000
    for (;;) {
      if (!(await menuItem(page, child).isVisible())) await menuItem(page, parent).click({ timeout: 10000 })
      try {
        await menuItem(page, child).click({ timeout: 2500 })
        break
      } catch (err) {
        // Only "the child could not be clicked yet" is tried again; the last
        // such error, and any other error at once, goes to the caller.
        if (!err || err.name !== 'TimeoutError' || Date.now() > deadline) throw err
      }
    }
  }
  const at = await page.evaluate(() => location.pathname)
  if (at !== target.path && !access.canOpen(at)) {
    throw new RecoveryRefused(`refused: "${name}" led to ${at}, which is not a page the role ${access.role} can open (${NAVIGATION_FILE})`)
  }
  return target
}

/** The tab arrived: the path and the page's heading are on screen. False on timeout. */
const arrived = (page, path, heading, timeout) =>
  becomes(
    page,
    ([p, title]) => location.pathname === p && [...document.querySelectorAll('h5')].some((h) => (h.textContent ?? '').trim() === title),
    [path, heading],
    timeout,
  )

/** Follows one of the links above and waits for its page. */
async function open(page, access, link, timeout) {
  const target = await follow(page, access, link)
  await arrived(page, target.path, link.heading, timeout)
}

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

const single = (body) => (body && typeof body === 'object' && 'data' in body && body.data != null && !Array.isArray(body.data) ? body.data : body)

/**
 * What the sidebar and the formats are supposed to be: the company answer and
 * the regional answer this profile received, as dashboardState judges a tab
 * against them. Exported because both the loading rounds and case 16 ask every
 * tab the same question, and a second reader of the same answers would be a
 * second thing to keep right.
 */
export async function shellReference(profile, maxMs = 20000) {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline && !(profile.answers.has(COMPANY_SETTINGS) && profile.answers.has(REGIONAL_SETTINGS))) await sleep(100)
  const company = profile.answers.get(COMPANY_SETTINGS)
  const regional = profile.answers.get(REGIONAL_SETTINGS)
  const companyAnswered = Boolean(company && !company.unreadable)
  return {
    companyAnswered,
    companyName: companyAnswered ? single(company.body)?.name || null : null,
    regional: regional && !regional.unreadable ? single(regional.body) : null,
  }
}

/**
 * What the tab holds right now: its data judged against the reference
 * (judgeDashboard), and what the profile read from it. Exported because the
 * loading rounds ask the same question of every tab on their own clock, to know
 * when the last of them first had its data.
 */
export async function dashboardState(profile, openMark, page, reference) {
  const dom = await readDom(page, DASHBOARD.heading)
  return { ...judgeDashboard(dom, profile.since(openMark, page), reference), companyNameInSidebar: dom.companyNameInSidebar, stored: dom.stored }
}

/**
 * The one recovery an ordinary user has: open another page of theirs and
 * come back. Re-mounting the dashboard asks again for what the dashboard
 * asked for and did not get. The dashboard offers no retry button.
 */
async function roundTrip(profile, page, access) {
  const mark = profile.mark()
  await open(page, access, ROUND_TRIP, 20000)
  await settled(profile, mark, page)
  const back = profile.mark()
  await open(page, access, DASHBOARD, 30000)
  await settled(profile, back, page)
}

const linkName = (link) => (link.child === undefined ? link.parent : `${link.parent} > ${link.child}`)
const ROUND_TRIP_IS = `sidebar: ${linkName(ROUND_TRIP)}, then ${linkName(DASHBOARD)}`

/**
 * Why a piece of shell data cannot come back for this user. Stated only
 * after the round trip was tried and the data was still missing.
 *
 * The menu pages that ask for the data again were found by reading the
 * consumers of the two queries in frontend/src (useGetCompanySettingsQuery:
 * Sidebar and CompanySettingsPage; useGetRegionalSettingsQuery: RootLayout,
 * ProductsPage, InventoryCostingPage, StockLevelSettingsPage,
 * RegionalSettingsPage). Whether the signed-in role is shown any of them is
 * looked up, not assumed: W1 tries none of them, and says so if one exists.
 */
const SHELL_DATA = {
  [COMPANY_DATA]: { askedBy: 'the sidebar', askedAgainOn: ['/settings/company'] },
  [REGIONAL_DATA]: { askedBy: 'the root layout', askedAgainOn: ['/inventory/products', '/settings/inventory-costing', '/settings/stock-levels', '/settings/regional'] },
}
export function noWayBack(data, access, roundTrips) {
  const shell = SHELL_DATA[data]
  if (!shell) return `still missing after ${roundTrips} round trip(s) (${ROUND_TRIP_IS}), the bound being ${MAX_RECOVERY_ACTIONS}`
  const open = shell.askedAgainOn.filter((path) => access.canOpen(path))
  return (
    `${shell.askedBy} asks for it once and never leaves the screen, so the round trip (${ROUND_TRIP_IS}) did not ask again` +
    (data === COMPANY_DATA ? '; the application\'s own retries after a 429 did not bring it' : '') +
    `; the menu pages that ask again are ${shell.askedAgainOn.join(', ')}, and the role ${access.role} is shown ` +
    (open.length === 0 ? 'none of them' : `${open.join(', ')}, which W1 does not try`)
  )
}

/**
 * Steps 1 to 3 for one tab whose own loading has already played out.
 * `openMark` is the profile's mark from before the tab was opened; `shell` is
 * { access, reference }: the signed-in role's pages (lib/access.mjs) and what
 * the server answered for the shell's data. Returns the tab's record;
 * `usable` in it is the pass condition (see verdict()).
 *
 * Errors are not swallowed. A sidebar link that never appears or a page that
 * never arrives (a Playwright TimeoutError), and a step refused because it
 * would open a page outside the role's set (RecoveryRefused), are recorded
 * as the reason the tab is not usable. Anything else is rethrown and fails
 * W1.
 */
export async function bringToWorkingState(profile, openMark, page, api, { access, reference }) {
  const record = {
    tab: profile.label(page),
    signedInUi: await showsSignedInUi(page, 1000),
    usable: false,
    completeOnFirstLoad: false,
    dataPresent: false,
    recovery: [],
    notRecoverableByRole: [],
    action: null,
  }
  const own = profile.since(openMark, page)
  const statuses = {}
  for (const e of own.filter((x) => x.zone === 'business')) {
    const s = e.status ?? e.failed ?? 'pending'
    statuses[s] = (statuses[s] ?? 0) + 1
  }
  record.loadRequestStatuses = statuses
  // The application's own retry of the company request, read before any
  // user action is taken in this tab.
  record.company = companyRetry(own)
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
    let state = await dashboardState(profile, openMark, page, reference)
    record.completeOnFirstLoad = state.complete
    record.firstLoad = state
    // Step 2: bounded, paced, and only through the links this role is shown.
    // When all that is still missing is shell data, one round trip is made
    // (it is what a person would try, and it is the evidence that it does not
    // help); after it the loop stops, because a further one changes nothing.
    const recoveryStarted = Date.now()
    while (!state.complete && record.recovery.length < MAX_RECOVERY_ACTIONS) {
      if (state.shellOnly && record.recovery.some((r) => r.onlyShellDataMissingBefore)) break
      const before = state
      const pacedMs = await room(profile, api)
      const started = Date.now()
      await roundTrip(profile, page, access)
      state = await dashboardState(profile, openMark, page, reference)
      record.recovery.push({
        action: 'round-trip',
        what: ROUND_TRIP_IS,
        because: before.why,
        missingBefore: before.missing,
        onlyShellDataMissingBefore: before.shellOnly,
        pacedMs,
        tookMs: Date.now() - started,
        dataPresentAfter: state.complete,
        stillMissing: state.why,
        missingAfter: state.missing,
      })
    }
    record.dataPresent = state.complete
    record.stillMissing = state.complete ? undefined : state.why
    if (record.recovery.length > 0 && state.complete) record.msUntilDataPresent = Date.now() - recoveryStarted
    record.companyNameInSidebarAtEnd = state.companyNameInSidebar
    // By name: what this user had no way to get back. Shell data carries the
    // reason; anything else was still missing when the bound was reached.
    if (!state.complete) {
      const named = state.missing.length > 0 ? state.missing : state.why
      record.notRecoverableByRole = named.map((data) => ({ data, why: noWayBack(data, access, record.recovery.length) }))
    }

    // Step 3, only for a tab whose data is there: an action in a tab that is
    // already not usable would add nothing.
    if (record.dataPresent) {
      const tries = []
      let result = { ok: false, why: ['it was not tried'] }
      while (!result.ok && tries.length < MAX_ACTION_TRIES) {
        if (tries.length > 0) {
          // A failed list offers no retry button: leave and come back.
          await open(page, access, DASHBOARD, 30000)
        }
        const pacedMs = await room(profile, api)
        const mark = profile.mark()
        const started = Date.now()
        await open(page, access, ACTION, 20000)
        await settled(profile, mark, page)
        result = judgeListAction(await readDom(page, ACTION.heading), profile.since(mark, page))
        tries.push({ pacedMs, tookMs: Date.now() - started, ...result })
      }
      record.action = { what: `sidebar: ${linkName(ACTION)}; a fresh request answered 2xx and its rows shown`, ok: result.ok, why: result.ok ? undefined : result.why, tries }
    }
  } catch (err) {
    if (!err || (err.name !== 'TimeoutError' && err.name !== 'RecoveryRefused')) throw err
    if (err.name === 'RecoveryRefused') record.refused = err.message
    else record.navigationFailed = err.message.split('\n')[0]
  }
  record.sameDocument = (await documentId(page)) === document0
  record.signedInUi = await showsSignedInUi(page, 1000)
  const final = verdict(record)
  const stopped = record.refused ?? record.navigationFailed
  if (stopped && !final.usable) final.whyNot = `${stopped}; ${final.whyNot}`
  return { ...record, ...final }
}

/**
 * Precondition of W1, checked once in a tab that is alone: the customer list
 * has at least one row for this user. Without one, step 3 could not tell a
 * working tab from a broken one.
 */
export async function customerListHasRows(page, access) {
  // The tab has just signed in: wait for its redirect to end on the dashboard.
  await arrived(page, '/dashboard', DASHBOARD.heading, 30000)
  await open(page, access, ACTION, 20000)
  await becomes(page, () => document.querySelectorAll('tbody tr').length > 0 && !document.querySelector('tbody .MuiSkeleton-root'), null, 20000)
  return (await readDom(page, ACTION.heading)).dataRows
}

/**
 * Precondition of W1, checked once in a tab that is alone: the titles the
 * sidebar shows this user, with every section opened in turn. W1 compares
 * them with the menu read from navigation.tsx for the user's role, so that
 * the set a step is refused against is the set the application applies.
 */
export async function shownMenuTitles(page, access) {
  const seen = new Set()
  const read = async () => {
    for (const title of await page.locator(MENU_ITEM).allTextContents()) seen.add(title.trim())
  }
  await read()
  const parents = [...new Set(access.items.map((item) => item.parent).filter(Boolean))]
  for (const parent of parents) {
    const child = access.items.find((item) => item.parent === parent).title
    if (!(await menuItem(page, child).isVisible())) await menuItem(page, parent).click({ timeout: 10000 })
    await menuItem(page, child).waitFor({ state: 'visible', timeout: 10000 })
    await read()
  }
  return [...seen]
}
