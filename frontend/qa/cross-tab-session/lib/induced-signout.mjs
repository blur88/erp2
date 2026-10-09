// The induced-delay sign-out scenario (case 17): what one attempt observed,
// and what that amounts to. Pure: induced-signout.test.mjs.
//
// The scenario exists because a restored window does not reliably make the
// limiter delay at the moment of a sign-out: in the recorded runs, at ten and
// twenty tabs it delayed almost nothing in the sign-out round. Here the delay
// is INDUCED, by filler traffic from another browser context at the same
// address, so that the application's own requests are being held by the
// ingress when one of its tabs signs out. What it shows is what a sign-out does
// to an application request the ingress is holding. It does not show that a
// restored window produces that delay by itself.

export const INDUCED_SIZES = [5, 10, 20]
// An attempt that behaved and simply found no application request outstanding
// at the logout may be set up again; nothing else may.
export const MAX_INDUCED_ATTEMPTS = 3

const SESSION_ROUTE = /^\/api\/auth\/(refresh|logout|me)\/?$/
const pathOf = (uri) => String(uri).split('?')[0]
const isApp = (e) => typeof e.qaId === 'string' && e.qaId.startsWith('app-')
const isFiller = (e) => typeof e.qaId === 'string' && e.qaId.startsWith('fill-')

/**
 * Was a request OF THE APPLICATION being delayed by the limiter when the logout
 * reached the ingress? All three times are on the ingress clock. A filler's
 * delay is not this, and neither is a request to a session route (those are on
 * another zone, which does not delay).
 */
export function appOverlap(entries) {
  const logout = entries.find((e) => isApp(e) && pathOf(e.uri) === '/api/auth/logout' && e.method === 'POST')
  if (!logout) return { verdict: 'no-logout', outstanding: [], logoutStartMs: null }
  const outstanding = entries
    .filter((e) => isApp(e) && !SESSION_ROUTE.test(pathOf(e.uri)) && e.limitReq === 'DELAYED')
    .filter((e) => e.startMs < logout.startMs && e.endMs > logout.startMs)
    .map((e) => e.qaId)
  return { verdict: outstanding.length > 0 ? 'overlap' : 'no-overlap', outstanding, logoutStartMs: logout.startMs }
}

/**
 * One attempt's verdict.
 *
 * `attempt` is { n, ingress, tabs, logoutStatuses, sessionRoute429 }: the
 * ingress lines between the attempt's markers (null when the log or the
 * markers were missing), every application tab's end state, the statuses the
 * logout was answered with, and the 429s on refresh, logout or me.
 *
 * Behaviour first: a tab left signed in, a failed logout or a session-route 429
 * is a fail whatever the evidence shows, and is never set up again.
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

  const unknown = (reason, retry = false) => ({ verdict: 'inconclusive', behaviour: 'ok', reason, retry })
  const entries = attempt.ingress
  if (!Array.isArray(entries)) return unknown('the ingress log, or the attempt\'s markers in it, could not be read: there is no evidence of what the limiter was doing')
  const fillers = entries.filter(isFiller)
  if (fillers.length === 0) return unknown('no filler request reached the ingress: the delay was not induced')
  const addresses = new Set(entries.filter((e) => isApp(e) || isFiller(e)).map((e) => e.remoteAddr))
  if (addresses.size !== 1) return unknown(`the application and the fillers reached the ingress from ${addresses.size} addresses (${[...addresses].join(', ')}): not shown to be one limiter bucket`)
  const overlap = appOverlap(entries)
  if (overlap.verdict !== 'overlap') {
    // The one thing a new setup can change: the attempt behaved, and the
    // moment of the sign-out simply did not fall on a held request.
    return unknown('the attempt behaved, and no delayed request of the application was outstanding when the logout reached the ingress', true)
  }
  return {
    verdict: 'pass',
    behaviour: 'ok',
    reason: `the logout reached the ingress while ${overlap.outstanding.length} delayed request(s) of the application were outstanding; it was answered 2xx and all ${n} tabs reached the login page without a reload`,
  }
}
