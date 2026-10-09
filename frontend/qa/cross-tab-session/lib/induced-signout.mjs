// The induced-delay sign-out scenario (case 17): what one attempt observed,
// and what that amounts to. Pure: induced-signout.test.mjs.
//
// The scenario exists because a restored window does not reliably make the
// limiter delay at the moment of a sign-out: in the recorded runs, at ten and
// twenty tabs it delayed almost nothing in the sign-out round. Here the delay
// is INDUCED, by filler traffic at the same address, so that the application's
// own requests are being held by the ingress when one of its tabs signs out.
// What it shows is what a sign-out does to an application request the ingress
// is holding. It does not show that a restored window produces that delay by
// itself.
//
// The evidence starts at the SIGN-OUT, not at the logout request. The
// application aborts its in-flight requests when its session ends, before it
// sends the logout, and that is valid behaviour: a held request "outstanding
// when the logout reaches the ingress" is a state the application is built not
// to be in (first run of the case, f2ce87c67). So the chain is:
//
//   1. the harness records when the sign-out was initiated and which requests
//      of the application were still pending immediately before it;
//   2. the SAME request, by its identifier, has a line in the ingress log that
//      says the limiter was delaying it;
//   3. what became of it is recorded: answered, or cancelled - and a
//      cancellation is attributed to the sign-out only when it is not the
//      harness closing the tab, a navigation of the tab, or anything else.
//
// A count of aborted requests in some window before the logout is kept as a
// corroborating diagnostic (preLogoutWindow) and decides nothing: it cannot
// tell a request the sign-out cancelled from one cancelled just before it.

export const INDUCED_SIZES = [5, 10, 20]
// An attempt that behaved and simply lacked the evidence may be set up again;
// a behavioural failure never is.
export const MAX_INDUCED_ATTEMPTS = 3
// How long after the logout was answered (or, without a recorded answer, after
// the sign-out was initiated) a cancellation is still taken to be the
// sign-out's: the other tabs learn of it over the channel and abort then.
export const SIGN_OUT_SETTLE_MS = 2000

const SESSION_ROUTE = /^\/api\/auth\/(refresh|logout|me)\/?$/
const pathOf = (uri) => String(uri).split('?')[0]
const isApp = (e) => typeof e.qaId === 'string' && e.qaId.startsWith('app-')
const isFiller = (e) => typeof e.qaId === 'string' && e.qaId.startsWith('fill-')
const endOf = (e) => e.respondedAt ?? e.failedAt ?? null

/** The application's data requests still pending immediately before the sign-out was initiated (harness records, harness clock). */
export function pendingAtSignOut(app, signOutAt) {
  return app.filter((e) => isApp(e) && e.zone === 'business' && e.issuedAt < signOutAt && (endOf(e) === null || endOf(e) > signOutAt))
}

/**
 * What became of a request that was pending at the sign-out.
 *
 * A cancellation is the sign-out's only when nothing else explains it: the
 * harness had not begun closing the tabs, the request's tab kept the document
 * it first loaded, and the abort fell between the sign-out and SIGN_OUT_SETTLE_MS
 * after the logout was answered.
 */
export function fateOf(entry, { signOutAt, logoutAnsweredAt, cleanupAt, tabs }) {
  if (typeof entry.respondedAt === 'number') return { fate: 'completed', status: entry.status, atMs: entry.respondedAt }
  if (typeof entry.failedAt !== 'number' || !entry.failed) return { fate: 'unknown', atMs: null }
  const at = { atMs: entry.failedAt, error: entry.failed }
  if (!/ERR_ABORTED/.test(String(entry.failed))) return { fate: 'failed-other', ...at }
  if (typeof cleanupAt === 'number' && entry.failedAt >= cleanupAt) return { fate: 'cancelled-by-harness-cleanup', ...at }
  const tab = (tabs ?? []).find((t) => t.tab === entry.tab)
  if (tab && tab.sameDocument !== true) return { fate: 'cancelled-by-navigation', ...at }
  const until = (typeof logoutAnsweredAt === 'number' ? logoutAnsweredAt : signOutAt) + SIGN_OUT_SETTLE_MS
  if (entry.failedAt >= signOutAt && entry.failedAt <= until) return { fate: 'cancelled-by-sign-out', ...at }
  return { fate: 'cancelled-other', ...at }
}

/**
 * Corroboration only: application requests the ingress shows aborted by the
 * client (499) while the limiter was delaying them, ending within `windowMs`
 * before the logout reached the ingress. All on the ingress clock. It cannot
 * tell what cancelled them and is never the evidence.
 */
export function preLogoutWindow(entries, windowMs = 300) {
  const logout = entries.find((e) => isApp(e) && pathOf(e.uri) === '/api/auth/logout' && e.method === 'POST')
  if (!logout) return { logoutStartMs: null, abortedWhileDelayed: 0, windowMs }
  const hits = entries.filter((e) => isApp(e) && !SESSION_ROUTE.test(pathOf(e.uri)) && e.limitReq === 'DELAYED' && e.status === 499)
  return {
    logoutStartMs: logout.startMs,
    windowMs,
    abortedWhileDelayed: hits.filter((e) => e.endMs <= logout.startMs && e.endMs > logout.startMs - windowMs).length,
    outstandingWhenTheLogoutArrived: entries.filter((e) => isApp(e) && !SESSION_ROUTE.test(pathOf(e.uri)) && e.limitReq === 'DELAYED' && e.startMs < logout.startMs && e.endMs > logout.startMs).length,
  }
}

/**
 * One attempt's verdict.
 *
 * `attempt`: { n, signOutAt, logoutAnsweredAt, cleanupAt (harness clock);
 * app: the application's harness records; ingress: the lines between the
 * attempt's markers, or null; tabs: [{ tab, onLoginPage, sameDocument,
 * staleUi }]; logoutStatuses; sessionRoute429 }.
 *
 * Behaviour first: a tab left signed in or showing stale data, a failed logout
 * or a session-route 429 is a fail whatever the evidence shows, and is never
 * set up again.
 */
export function judgeInducedSignOut(attempt) {
  const { n, tabs, logoutStatuses, sessionRoute429 } = attempt
  const fail = (reason) => ({ verdict: 'fail', behaviour: 'failed', reason, retry: false })
  if ((sessionRoute429 ?? 0) > 0) return fail(`${sessionRoute429} request(s) to refresh, logout or me were answered 429`)
  if (!Array.isArray(logoutStatuses) || logoutStatuses.length === 0) return fail('no logout was sent')
  if (!logoutStatuses.every((s) => s >= 200 && s < 300)) return fail(`the logout was answered ${logoutStatuses.join(', ')}`)
  if (!Array.isArray(tabs) || tabs.length !== n) return fail(`${Array.isArray(tabs) ? tabs.length : 0} of ${n} application tabs were recorded`)
  const stuck = tabs.filter((t) => t.onLoginPage !== true)
  if (stuck.length > 0) return fail(`${stuck.length} of ${n} tabs did not reach the login page (${stuck.map((t) => t.tab).join(', ')})`)
  const reloaded = tabs.filter((t) => t.sameDocument !== true)
  if (reloaded.length > 0) return fail(`${reloaded.length} of ${n} tabs reached the login page by a reload (${reloaded.map((t) => t.tab).join(', ')})`)
  const stale = tabs.filter((t) => t.staleUi === true)
  if (stale.length > 0) return fail(`${stale.length} of ${n} signed-out tabs still showed stale data of the session (${stale.map((t) => t.tab).join(', ')})`)

  // Evidence. Anything missing is inconclusive; only a missed setup is set up again.
  const unknown = (reason, retry, extra = {}) => ({ verdict: 'inconclusive', behaviour: 'ok', reason, retry, ...extra })
  if (typeof attempt.signOutAt !== 'number') return unknown('the initiation of the sign-out was not recorded', false)
  const entries = attempt.ingress
  if (!Array.isArray(entries)) return unknown('the ingress log, or the attempt\'s markers in it, could not be read: nothing can be correlated', false)
  if (entries.filter(isFiller).length === 0) return unknown('no filler request reached the ingress: the delay was not induced', false)
  const addresses = new Set(entries.filter((e) => isApp(e) || isFiller(e)).map((e) => e.remoteAddr))
  if (addresses.size !== 1) return unknown(`the application and the fillers reached the ingress from ${addresses.size} addresses (${[...addresses].join(', ')}): not shown to be one limiter bucket`, false)

  const byId = new Map(entries.filter((e) => e.qaId).map((e) => [e.qaId, e]))
  const pending = pendingAtSignOut(attempt.app ?? [], attempt.signOutAt).map((e) => {
    const lineOf = byId.get(e.qaId) ?? null
    return {
      qaId: e.qaId,
      tab: e.tab,
      path: e.path,
      correlated: lineOf !== null,
      delayed: lineOf !== null && lineOf.limitReq === 'DELAYED',
      ingressStatus: lineOf ? lineOf.status : null,
      forwarded: lineOf ? lineOf.upstream?.kind !== 'none' : null,
      ...fateOf(e, attempt),
    }
  })
  const extra = { pending }
  if (pending.length === 0) return unknown('no data request of the application was still pending when the sign-out was initiated', true, extra)
  if (!pending.some((e) => e.correlated)) return unknown('the request(s) pending at the sign-out are not in the ingress log: not correlated', true, extra)
  const delayed = pending.filter((e) => e.delayed)
  if (delayed.length === 0) return unknown('the request(s) pending at the sign-out were not delayed by the limiter', true, extra)
  const evidence = delayed.filter((e) => e.fate === 'completed' || e.fate === 'cancelled-by-sign-out')
  if (evidence.length === 0) {
    return unknown(`a delayed request was pending at the sign-out, but what became of it is not the sign-out's doing or was not recorded (${[...new Set(delayed.map((e) => e.fate))].join(', ')})`, true, extra)
  }
  const cancelled = evidence.filter((e) => e.fate === 'cancelled-by-sign-out').length
  return {
    verdict: 'pass',
    behaviour: 'ok',
    reason:
      `${evidence.length} request(s) of the application were pending when the sign-out was initiated and were being delayed by the limiter: ` +
      `${cancelled} cancelled by the sign-out, ${evidence.length - cancelled} answered; the logout was answered 2xx and all ${n} tabs reached the login page without a reload and without stale data`,
    evidence,
    pending,
  }
}
