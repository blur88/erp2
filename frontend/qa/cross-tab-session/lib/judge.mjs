// Judgements of cases 5, 7 and 9 to 11, as pure functions of what the cases
// observed: no browser here, so each can be shown to fail (judge.test.mjs).
//
// Each returns a list of { label, ok, detail }. `ok` is the pass condition of
// that line and is stated in the comment above it; the case hands every line
// to ctx.check, so a false one fails the case. Nothing here throws to hide a
// result, and nothing is defaulted to a pass: a value that was not observed
// (null, undefined) makes its line false.

const line = (label, ok, detail) => ({ label, ok: ok === true, detail })
const isTime = (v) => typeof v === 'number' && Number.isFinite(v)

/**
 * Case 7, "simultaneous refresh".
 *
 *   before     the stored session before the 401s: { generation, access, refresh }
 *              (fingerprints)
 *   held       per tab, the data request the script kept and then answered
 *              401: { tab, token, issuedAt, deliveredAt }
 *   refreshes  every POST /api/auth/refresh of the profile from the moment
 *              the holds were armed to the end of the case:
 *              { tab, issuedAt, respondedAt, presented, status, issued: { generation, refresh } }
 *   after      the stored session at the end: { generation, refresh }
 *   continued  per tab, one further data request and the stored session read
 *              right after it: { tab, token, stored: { generation, access, refresh } }
 */
export function judgeSimultaneousRefresh({ before, held, refreshes, after, continued }) {
  const out = []
  const tabs = [...new Set(held.map((h) => h.tab))]
  const next = before.generation + 1

  // Pass: two tabs each had exactly one request held, and both requests
  // carried the access token of the generation the session was at.
  out.push(
    line(
      'both forced 401s were for requests carrying the access token of the starting generation',
      held.length === 2 && tabs.length === 2 && held.every((h) => h.token !== null && h.token === before.access),
      { startingAccess: before.access, held: held.map((h) => [h.tab, h.token]) },
    ),
  )

  const answered = refreshes.filter((r) => isTime(r.respondedAt))
  const firstAnswer = answered.length > 0 ? Math.min(...answered.map((r) => r.respondedAt)) : null
  const lastDelivery = held.length > 0 && held.every((h) => isTime(h.deliveredAt)) ? Math.max(...held.map((h) => h.deliveredAt)) : null
  const firstDelivery = held.length > 0 && held.every((h) => isTime(h.deliveredAt)) ? Math.min(...held.map((h) => h.deliveredAt)) : null

  // Pass: no refresh left a tab before a 401 had been handed to one. A
  // refresh earlier than that was caused by something else, and the case
  // would not be looking at what it names.
  out.push(
    line(
      'no refresh was sent before a forced 401 was delivered',
      firstDelivery !== null && refreshes.every((r) => isTime(r.issuedAt) && r.issuedAt >= firstDelivery),
      { firstDelivery, refreshesIssuedAt: refreshes.map((r) => [r.tab, r.issuedAt]) },
    ),
  )

  // Pass: a refresh was answered, and the later of the two 401s was delivered
  // before the first answer to any refresh. That is what "simultaneous"
  // means here: neither tab learned of its 401 after the other's rotation.
  out.push(
    line(
      'both forced 401s were delivered before the first refresh was answered',
      firstAnswer !== null && lastDelivery !== null && lastDelivery < firstAnswer,
      { lastDelivery, firstRefreshAnswer: firstAnswer },
    ),
  )

  // Pass: one or two refreshes, from different tabs; each presented the
  // refresh token of the starting generation, was answered 200, and was
  // handed the next generation. One refresh: the other tab adopted. Two: the
  // other tab recovered with the same token inside its grace. A refresh that
  // presents any other token is a second rotation.
  const refreshTabs = new Set(refreshes.map((r) => r.tab))
  const sameToken = refreshes.every((r) => r.presented === before.refresh)
  const allOk = refreshes.every((r) => r.status === 200 && r.issued?.generation === next)
  out.push(
    line(
      'every refresh presented the starting refresh token and was answered 200 with the next generation (one rotation; the other tab adopted or recovered)',
      (refreshes.length === 1 || refreshes.length === 2) && refreshTabs.size === refreshes.length && sameToken && allOk,
      {
        startingRefresh: before.refresh,
        expectedGeneration: next,
        refreshes: refreshes.map((r) => ({ tab: r.tab, presented: r.presented, status: r.status, generation: r.issued?.generation ?? null })),
      },
    ),
  )

  // Pass: the stored generation is exactly one past the starting one.
  out.push(
    line('the generation advanced by exactly one', after.generation === next, { before: before.generation, after: after.generation ?? null }),
  )

  // Pass: each of the two tabs completed a further data request on the access
  // token stored at that moment, and both moments show the same generation
  // (the next one) and the same refresh token.
  const both = tabs.length === 2 && tabs.every((t) => continued.some((c) => c.tab === t))
  out.push(
    line(
      'both tabs continue on the same generation and the same refresh token',
      both &&
        continued.length === 2 &&
        continued.every((c) => c.token !== null && c.token === c.stored?.access && c.stored?.generation === next) &&
        continued[0].stored.refresh !== null &&
        continued[0].stored.refresh === continued[1].stored.refresh &&
        after.refresh === continued[0].stored.refresh,
      { continued, storedAtTheEnd: after },
    ),
  )
  return out
}

/** How the second tab came by the new tokens in case 7; for the record, not judged. */
export function otherTabPath(held, refreshes) {
  const refreshed = new Set(refreshes.map((r) => r.tab))
  const quiet = held.map((h) => h.tab).filter((t) => !refreshed.has(t))
  if (refreshes.length === 1 && quiet.length === 1) return `tab ${quiet[0]} adopted (it sent no refresh)`
  if (refreshes.length === 2 && quiet.length === 0) return 'both tabs sent a refresh'
  return `${refreshes.length} refresh(es) from ${[...refreshed].join(', ') || 'no tab'}`
}

/**
 * Cases 9, 10 and 11: the refresh a paused tab held while its token was
 * superseded.
 *
 *   held       the log entry of that refresh, or undefined:
 *              { status, failed, presented, releasedAt }
 *   expected   fingerprint of the refresh token the paused tab held
 *   supersededAt  when the other tab's rotation, the one that superseded that
 *              token, was answered (script clock, ms)
 *   graceMs    the configured grace, from the stack configuration
 *   expect     'inside' (cases 9, 11a) or 'after' (cases 10, 11b)
 */
export function judgeHeldRefresh({ held, expected, supersededAt, graceMs, expect }) {
  const out = []
  const elapsed = held && isTime(held.releasedAt) && isTime(supersededAt) ? held.releasedAt - supersededAt : null

  // Pass: the request was let onto the wire and the server answered it. A
  // request that was aborted, or never left the browser, has no status.
  out.push(
    line("tab A's held refresh was sent and the server answered it", !!held && typeof held.status === 'number' && !held.failed, {
      status: held?.status ?? null,
      failed: held?.failed ?? null,
    }),
  )
  // Pass: what it presented is the token the paused tab held, the superseded one.
  out.push(
    line('the held refresh presented the superseded token', !!held && expected !== null && held.presented === expected, {
      presented: held?.presented ?? null,
      expected,
    }),
  )
  if (expect === 'inside') {
    // Pass: it was let go after the supersession and before the grace ran out.
    out.push(
      line(`the held token was released inside its grace (${graceMs} ms)`, elapsed !== null && elapsed > 0 && elapsed < graceMs, {
        releasedMsAfterSupersession: elapsed,
        graceMs,
      }),
    )
    // Pass: the server accepted it.
    out.push(line('the server answered the held refresh 200', held?.status === 200, { status: held?.status ?? null }))
  } else {
    // Pass: it was let go only after the grace had run out.
    out.push(
      line(`the held token was released after its grace (${graceMs} ms)`, elapsed !== null && elapsed > graceMs, {
        releasedMsAfterSupersession: elapsed,
        graceMs,
      }),
    )
    // Pass: the server refused it.
    out.push(line('the server answered the held refresh 401', held?.status === 401, { status: held?.status ?? null }))
  }
  return out
}

/**
 * Case 5: the tab that held user X's data, after user Y signed in in it.
 *
 *   xTokens     fingerprints of every access token handed out before the switch
 *   yTokens     fingerprints of the access tokens handed out for Y's sign-in
 *               in this tab and for its refreshes
 *   signedInAt  when Y's sign-in in this tab was answered (script clock, ms)
 *   list        the request for the list X had loaded, sent when the tab
 *               opened that list again and held unanswered by the script:
 *               { captured, token, issuedAt }
 *   rowsWhileHeld  data rows on screen while that request was unanswered
 *   rowsAfter   data rows on screen once it was answered
 *   requests    every data request the tab issued after X's session ended in
 *               it: { path, token, issuedAt, status }
 */
export function judgeSwitchedTab({ xTokens, yTokens, signedInAt, list, rowsWhileHeld, rowsAfter, requests }) {
  const out = []
  const isX = (token) => token !== null && xTokens.includes(token)
  const isY = (token) => token !== null && yTokens.includes(token)

  // Pass: opening the list again asked the server for it. A list drawn from
  // what X had loaded sends nothing.
  out.push(line("opening the list X had loaded sent a fresh request for it", list?.captured === true, { captured: list?.captured ?? false }))
  // Pass: that request was issued after Y's sign-in was answered and carries
  // one of Y's tokens.
  out.push(
    line(
      "that request was issued after Y's sign-in and carries Y's token",
      list?.captured === true && isTime(list.issuedAt) && isTime(signedInAt) && list.issuedAt >= signedInAt && isY(list.token) && !isX(list.token),
      { issuedAt: list?.issuedAt ?? null, signedInAt, token: list?.token ?? null, yTokens },
    ),
  )
  // Pass: while the server had not answered, the tab showed no row. Any row
  // on screen at that point can only be one X's session loaded.
  out.push(line("while that request was unanswered the tab showed none of the rows X had loaded", rowsWhileHeld === 0, { rowsWhileHeld }))
  // Pass: once answered, rows are shown; without this the line above could
  // pass on a page that shows nothing at all.
  out.push(line('once it was answered the tab shows the rows', typeof rowsAfter === 'number' && rowsAfter >= 1, { rowsAfter }))
  // Pass: no data request of the tab since X's session ended in it carries a
  // token of X's, and every one answered 2xx was issued after Y's sign-in
  // under one of Y's tokens.
  const delivered = requests.filter((r) => typeof r.status === 'number' && r.status >= 200 && r.status < 300)
  const foreign = requests.filter((r) => isX(r.token))
  const stale = delivered.filter((r) => !(isTime(r.issuedAt) && r.issuedAt >= signedInAt && isY(r.token)))
  out.push(
    line(
      "every data request answered to the tab was issued after Y's sign-in under Y's token, and none carried X's",
      delivered.length > 0 && foreign.length === 0 && stale.length === 0,
      {
        answered: delivered.length,
        carryingXToken: foreign.map((r) => [r.path, r.token, r.status]),
        notUnderYAfterTheSignIn: stale.map((r) => [r.path, r.token, r.issuedAt]),
      },
    ),
  )
  return out
}
