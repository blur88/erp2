// What W1 is judged on and what it reports, as pure functions of the rounds
// it measured (w1-judgement.test.mjs). No browser here.
//
// Blocking at 5, 10 and 20 tabs (#1353), in all three rounds:
//   (a), (b), (c)  no request to refresh, logout or me was answered 429;
//   (a), (b)       every tab usable for the non-administrator (lib/usable.mjs);
//   (a), (b)       no in-app recovery action: no tab was made usable by the
//                  user navigating, which is what "without a user action" means;
//   (a), (b)       the last tab held its expected data within the size's
//                  deadline, measured from the common tab-opening trigger;
//   (a)            the access token was current when the tabs opened;
//   (b)            every tab did start with an expired access token;
//   (c)            the sign-out's logout was sent and answered 2xx, and every
//                  tab is on the login page afterwards in the document it first
//                  loaded (no reload).
// A size that was not run fails W1: the deadlines are acceptance targets at
// every size, and a size that is missing has met nothing.
//
// The number of 429s on business requests is not a gate. It is recorded per
// size and round: "429 counts are diagnostic" means business requests only, and
// a 429 on a session route fails the run above.
//
// W1 states no capacity. It reports, per size and round, what was observed.

/**
 * The sizes whose rounds block, and the time each one is read against, in
 * milliseconds from the common tab-opening trigger to the last tab holding its
 * expected data. Fixed before a run, and not adjusted after one: a target that
 * moves with the result is not a target.
 *
 * Since 2026-10-09 the time blocks at no size here. #1353's acceptance is
 * measured in Firefox on the user's device against 8 s
 * (device/restored-window.js); a figure taken in Chromium on the QA host is a
 * different environment, and giving it the same number would not make it the
 * same measurement. The three times below are what the harness reports
 * against, as a diagnostic, and are tracked in #1359. The runs recorded before
 * this change were judged against them as blocking and stay recorded as they
 * were judged.
 */
export const BLOCKING_SIZES = [5, 10, 20]
export const DEADLINE_MS = { 5: 5000, 10: 10000, 20: 15000 }
export const DEADLINE_BLOCKING_SIZES = []

// A natural sign-out is attempted once. Whether a delayed request overlapped it
// is diagnostic since the amendment of 2026-10-09 (the condition is a blocking
// case of its own, case 17, with induced delay), so nothing is set up again.
export const MAX_SIGN_OUT_ATTEMPTS = 1

/** The one sentence about what W1 does and does not show. Printed with every summary and quoted in the README. */
export const W1_SCOPE =
  'W1 shows that the tabs of a restored window coordinate their refresh, that a restored window puts little load on session_limit, ' +
  `and that at ${BLOCKING_SIZES.join(', ')} tabs every tab reaches its expected data without the user acting. ` +
  'How long that takes is reported and does not block. ' +
  'It does not measure the capacity of that zone, which is never approached, and it does not establish how many tabs a restored window can hold: ' +
  'that is bounded by the general api_limit (issue #1353).'

/** How each round reaches the session zone. */
export const HOW_ROUNDS_REACH_THE_SESSION_ZONE = {
  a: 'Current tokens: there is nothing to refresh, and the application sends no /auth/me on load. The round normally sends nothing to the zone.',
  b: 'Every tab starts with an expired access token: one tab takes the lease and refreshes, the others adopt its tokens.',
  c: 'As (b), plus the explicit logout of the tab that signs out.',
}

const ROUTES = ['refresh', 'logout', 'me']

/** Requests of a round to the session zone, counted by route. `requests` are the round's session-zone entries. */
export function byRoute(requests) {
  const count = { refresh: 0, logout: 0, me: 0 }
  for (const e of requests) {
    const route = ROUTES.find((r) => e.path.replace(/\/$/, '') === `/api/auth/${r}`)
    if (route) count[route] += 1
  }
  return count
}

// 429s on refresh, logout or me: the round's own and those the usability
// checks caused (rounds a and b only have the second).
export const session429 = (r) => r.count429 + (r.sessionRequests429DuringUsabilityCheck ?? 0)

/** What was observed in one round, in the terms the summary prints. Nothing here is a verdict. */
export function observed(r, burst) {
  const base = {
    n: r.n,
    round: r.round,
    sessionZoneRequests: { ...byRoute(r.requests), total: r.total },
    sessionZone429: session429(r),
    peakAccumulatedDemand: r.peakDemandE,
    configuredBurst: burst,
    businessEndpoint429: r.dataRequests429,
    businessEndpointRequests: r.dataRequests,
  }
  if (r.round === 'c') {
    return { ...base, tabsOnLoginPageWithoutReload: r.tabsOnLoginPage, tabsStillLoadingAtSignOut: r.tabsStillLoadingAtSignOut }
  }
  return {
    ...base,
    usableTabs: r.tabsUsable,
    tabsCompleteOnFirstLoad: r.tabsCompleteOnFirstLoad,
    recoveryActions: r.recoveryActionsTotal,
    mostRecoveryActionsForOneTab: r.maxRecoveryActions,
    // When the last tab first held its data, against the size's deadline. null
    // means it never did within the round, which is a miss, not a small figure.
    completedAfterMs: r.completedAfterMs ?? null,
    deadlineMs: r.deadlineMs ?? DEADLINE_MS[r.n] ?? null,
    completionPollMs: r.completionPollMs ?? null,
  }
}

/** The line the summary prints for a round. */
export function observedLine(o) {
  const z = o.sessionZoneRequests
  // Every size blocks, so every size says so.
  const head =
    `N=${o.n} (${o.round})${BLOCKING_SIZES.includes(o.n) ? ' blocking' : ''}: session zone ${z.total} request(s) (refresh ${z.refresh}, logout ${z.logout}, me ${z.me}), ` +
    `429s ${o.sessionZone429}, peak accumulated demand ${o.peakAccumulatedDemand} against burst ${o.configuredBurst}; `
  const tail =
    o.round === 'c'
      ? `on the login page without a reload ${o.tabsOnLoginPageWithoutReload}/${o.n}; still loading at the sign-out ${o.tabsStillLoadingAtSignOut}/${o.n}; `
      : `usable ${o.usableTabs}/${o.n}; complete on first load ${o.tabsCompleteOnFirstLoad}/${o.n}; recovery actions ${o.recoveryActions} (most for one tab ${o.mostRecoveryActionsForOneTab}); ` +
        `complete after ${o.completedAfterMs === null ? 'never' : `${o.completedAfterMs} ms`} of ${o.deadlineMs} ms; `
  return `${head}${tail}business-endpoint 429s ${o.businessEndpoint429} of ${o.businessEndpointRequests}`
}

/**
 * The blocking checks, as { label, ok, detail } for ctx.check. Each `ok` is
 * the pass condition its comment states; a round that was not run makes its
 * checks false.
 */
export function blockingChecks(rounds, sizes) {
  const out = []
  // A size that was not run meets none of its deadlines, so it fails first and
  // says which size is missing.
  for (const n of BLOCKING_SIZES) {
    if (!sizes.includes(n)) out.push({ label: `N = ${n} was run`, ok: false, detail: { sizes } })
  }
  const of = (n, round) => rounds.find((r) => r.n === n && r.round === round)

  for (const n of BLOCKING_SIZES) {
    if (!sizes.includes(n)) continue
    for (const round of ['a', 'b', 'c']) {
      const r = of(n, round)
      // Pass: the round was run and no request to refresh, logout or me was
      // answered 429, in the round itself or while its tabs were checked. Round
      // (c) is judged per attempt below, so that a failure names the attempt.
      if (round !== 'c') {
        out.push({
          label: `N = ${n} (${round}): no 429 on refresh, logout or me`,
          ok: !!r && session429(r) === 0,
          detail: r ? { count429: r.count429, duringUsabilityCheck: r.sessionRequests429DuringUsabilityCheck ?? 0 } : 'round not run',
        })
      }
      if (round === 'c') continue
      // Pass: every tab has its data on screen, the shell's included, and an
      // action working, for the non-administrator, without a reload, a new
      // sign-in or a page outside the role's set (lib/usable.mjs, verdict()).
      out.push({
        label: `N = ${n} (${round}): every tab usable for the non-administrator (data present, the shell's included, and an action working; no reload, no new sign-in, no administrator-only page)`,
        ok: !!r && r.everyTabUsable === true,
        detail: r
          ? {
              usable: r.tabsUsable,
              completeOnFirstLoad: r.tabsCompleteOnFirstLoad,
              companyByAutomaticRetry: r.tabsCompanyByAutomaticRetry,
              neededManualRecovery: r.tabsNeedingRecovery,
              dataNotRecoverableByRole: r.dataNotRecoverableByRole,
              notUsable: r.tabsNotRecoverable,
            }
          : 'round not run',
      })
      // Pass: no tab was made usable by the user acting. "Without a user
      // action" is this, not the absence of a failure message: the recovery the
      // script can perform is a navigation through the sidebar, and one of those
      // is a user action by any reading.
      out.push({
        label: `N = ${n} (${round}): no in-app recovery action`,
        ok: !!r && r.recoveryActionsTotal === 0,
        detail: r ? { recoveryActions: r.recoveryActionsTotal, tabsNeedingRecovery: r.tabsNeedingRecovery, maxForOneTab: r.maxRecoveryActions } : 'round not run',
      })
      // Pass: the last tab held its expected data within this size's deadline,
      // measured from the common tab-opening trigger. A tab that never did is a
      // miss, not a figure: giving up early would only make it look smaller.
      // At the other sizes the time is a finding, not a check.
      const deadline = DEADLINE_MS[n]
      if (DEADLINE_BLOCKING_SIZES.includes(n)) out.push({
        label: `N = ${n} (${round}): complete within the deadline`,
        ok: !!r && r.completedAfterMs !== null && r.completedAfterMs !== undefined && r.completedAfterMs <= deadline,
        detail: r
          ? { completedAfterMs: r.completedAfterMs ?? null, deadlineMs: deadline, pollMs: r.completionPollMs ?? null }
          : 'round not run',
      })
    }
    const a = of(n, 'a')
    // Pass: when the tabs of round (a) opened, the stored access token had time
    // left. Otherwise the round was not "current token" but a second round (b).
    out.push({
      label: `N = ${n} (a): the access token was current when the tabs opened`,
      ok: !!a && typeof a.accessTokenRemainingMsAtStart === 'number' && a.accessTokenRemainingMsAtStart > 0,
      detail: { accessTokenRemainingMsAtStart: a?.accessTokenRemainingMsAtStart ?? null },
    })
    // Pass: when the tabs of round (b) opened, the stored access token had expired.
    const b = of(n, 'b')
    out.push({
      label: `N = ${n} (b): every tab did start with an expired access token`,
      ok: !!b && b.accessTokenExpiredAtStart === true,
      detail: { accessTokenExpiredAtStart: b?.accessTokenExpiredAtStart ?? null },
    })
    // The sign-out round is one entry per attempt, and every attempt's
    // behavioural checks apply: an attempt that refused a session route, lost a
    // tab or failed its logout failed the run, whether or not it also overlapped.
    const attempts = rounds.filter((r) => r.n === n && r.round === 'c')
    if (attempts.length === 0) {
      out.push({ label: `N = ${n} (c): the sign-out sent a logout and it was answered 2xx`, ok: false, detail: 'round not run' })
      out.push({ label: `N = ${n} (c): every tab is on the login page after the sign-out, without a reload`, ok: false, detail: 'round not run' })
    }
    for (const c of attempts) {
      const at = `N = ${n} (c) attempt ${c.attempt ?? 1}`
      out.push({
        label: `${at}: no 429 on refresh, logout or me`,
        ok: session429(c) === 0,
        detail: { count429: c.count429 ?? 0, duringUsabilityCheck: c.sessionRequests429DuringUsabilityCheck ?? 0, outcome: c.outcome ?? null },
      })
      // Pass: the sign-out of the attempt sent its logout and the server
      // answered it 2xx. Without one, "no 429 on logout" would say nothing.
      const logouts = (c.requests ?? []).filter((e) => e.path.replace(/\/$/, '') === '/api/auth/logout')
      out.push({
        label: `${at}: the sign-out sent a logout and it was answered 2xx`,
        ok: logouts.length >= 1 && logouts.every((e) => typeof e.status === 'number' && e.status >= 200 && e.status < 300),
        detail: logouts.map((e) => e.status),
      })
      // Pass: after the sign-out every tab shows the login page, each in the
      // document it first loaded (not reloaded).
      out.push({
        label: `${at}: every tab is on the login page after the sign-out, without a reload`,
        ok: c.everyTabOnLoginPage === true && c.tabsOnLoginPage === n && Array.isArray(c.tabs) && c.tabs.length === n && c.tabs.every((t) => t.onLoginPage === true && t.sameDocument === true),
        detail: c.tabs,
      })
    }
    // Whether a delayed request overlapped the sign-out is not judged here:
    // see signOutGate and nonBlockingFindings.
  }
  return out
}

/**
 * What a size's sign-out attempts amounted to, with respect to the limiter
 * (a diagnostic in W1; the gate itself belongs to case 17):
 *
 *   overlap           an attempt overlapped a request the limiter was holding
 *   behaviour-failed  the sign-out itself misbehaved in some attempt
 *   evidence-missing  an attempt could not be examined (no ingress log, or its
 *                     markers were not in it), or there was no attempt
 *   overlap-absent    every attempt behaved and could be examined, and no
 *                     delayed request was outstanding at the sign-out
 *
 * Only the first passes the gate, as before. The others are reported apart because they
 * are different findings: the last says nothing went wrong and nothing was
 * shown, the two before it say something did.
 */
export function signOutGate(attempts) {
  const one = (c) => {
    if (c.outcome === 'behaviour-failed') return 'behaviour-failed'
    if (!c.ingress || c.ingress.unavailable) return 'evidence-missing'
    return c.signOutOverlap?.verdict === 'overlap' ? 'overlap' : 'overlap-absent'
  }
  const perAttempt = attempts.map((c) => ({ attempt: c.attempt ?? 1, state: one(c), delayedInAttempt: c.ingress?.delayed ?? null }))
  const has = (state) => perAttempt.some((a) => a.state === state)
  // An overlap is an overlap whatever another attempt did: a misbehaving
  // attempt fails its own checks, and this gate is about the overlap alone,
  // exactly as before. Without one, the worst of what the attempts were.
  const state = has('overlap') ? 'overlap' : has('behaviour-failed') ? 'behaviour-failed' : perAttempt.length === 0 || has('evidence-missing') ? 'evidence-missing' : 'overlap-absent'
  return { state, attempts: perAttempt.length, perAttempt }
}

/** Everything observed that does not block, one sentence each. `role` names the user in the sentences. */
export function nonBlockingFindings(rounds, role) {
  const findings = []
  const lost = []
  for (const r of rounds) {
    const where = `N=${r.n} (${r.round})`
    // A 429 on a session route is a blocking check at every size now, so it is
    // not repeated here as a finding. A 429 on a business request is not a gate
    // at all, and is reported at every size.
    if (r.dataRequests429 > 0) {
      findings.push(`${where}: ${r.dataRequests429} of ${r.dataRequests} data requests of the tabs' own loading were answered 429 (api_limit, not session_limit; tracked in issue #1353)`)
    }
    if (r.dataRequestsFailed.length > 0) {
      findings.push(`${where}: ${r.dataRequestsFailed.length} data request(s) failed without an answer: ${[...new Set(r.dataRequestsFailed)].join(', ')}`)
    }
    // The sign-out's end state and round (a)'s token state are blocking checks
    // at every size, so neither is repeated here. What recovery took is not a
    // check of its own: it says how a failure came about, which the counts
    // alone do not.
    // A round with no ingress log has measured nothing: the figures are
    // diagnostic, so this does not fail a check, but it is not silence either.
    if (r.ingress && r.ingress.unavailable) {
      findings.push(`${where}: the ingress log was not captured (${r.ingress.unavailable}), so this round's limiter verdicts were not measured`)
    }
    if (r.round === 'c') {
      // Diagnostic: what the natural sign-out was, with respect to the limiter.
      // Not a verdict; the condition is tested by the induced-delay scenario.
      const gate = signOutGate([r])
      const said = {
        overlap: 'the sign-out overlapped a request the limiter was delaying',
        'overlap-absent': `overlap absent: no request was being delayed when the sign-out happened (${r.ingress?.delayed ?? 0} delayed in the whole round)`,
        'evidence-missing': 'evidence missing: the ingress log could not be read for this round, so whether a delayed request overlapped is not known',
        'behaviour-failed': 'the sign-out misbehaved (see its blocking checks)',
      }[gate.state]
      findings.push(`${where}: ${said}`)
      continue
    }
    if (r.tabsNeedingRecovery > 0) {
      findings.push(
        `${where}: ${r.tabsNeedingRecovery} of ${r.n} tabs first showed missing data and the user had to act ` +
          `(${r.recoveryActionsTotal} round trip(s) through the sidebar in all, at most ${r.maxRecoveryActions} for one tab, slowest ${r.slowestRecoveryMs} ms)`,
      )
    }
    if (r.tabsCompanyByAutomaticRetry > 0) {
      findings.push(
        `${where}: in ${r.tabsCompanyByAutomaticRetry} tab(s) the company data was refused at first and came by the application's own retry, ` +
          `${r.companyAutomaticRetryWaitMs.shortest} to ${r.companyAutomaticRetryWaitMs.longest} ms after the refusal`,
      )
    }
    if (r.tabsRegionalRequestRefused > 0) {
      findings.push(
        `${where}: the regional-settings request of ${r.tabsRegionalRequestRefused} tab(s) was refused and never repeated; ` +
          `the formats were wrong in ${r.tabsRegionalNotInEffect} of them (the others applied the values the profile had stored before)`,
      )
    }
    // By name, for every size: what the role could not get back.
    for (const [data, tabs] of Object.entries(r.dataNotRecoverableByRole)) {
      lost.push({ n: r.n, round: r.round, data, tabs: tabs.length, of: r.n })
      findings.push(`${where}: NOT recoverable by a ${role} user without a reload: ${data}, in ${tabs.length} of ${r.n} tabs (this fails W1)`)
    }
    if (r.tabsWithRefusedStep > 0) findings.push(`${where}: a step was refused in ${r.tabsWithRefusedStep} tab(s) because it would have opened a page outside the role's set`)
    if (r.tabsNeedingActionRetry > 0) findings.push(`${where}: the action had to be tried more than once in ${r.tabsNeedingActionRetry} tab(s)`)
    // Which tabs, and why, for a round whose usability check failed. Blocking at
    // every size; the finding is the detail behind the failing check.
    if (!r.everyTabUsable) {
      findings.push(`${where}: ${r.tabsNotRecoverable.length} of ${r.n} tabs were NOT usable: ${r.tabsNotRecoverable.map((t) => `${t.tab}: ${t.whyNot}`).join(' || ')}`)
    }
    // The time is a diagnostic at every size; past its reference it is reported here.
    if (r.round !== 'c' && (r.completedAfterMs === null || r.completedAfterMs > (r.deadlineMs ?? DEADLINE_MS[r.n]))) {
      const diagnostic = DEADLINE_BLOCKING_SIZES.includes(r.n) ? '' : ' - diagnostic at this size, not a failed check; tracked in #1359'
      findings.push(`${where}: the last tab held its expected data after ${r.completedAfterMs === null ? 'never' : `${r.completedAfterMs} ms`}, against a deadline of ${r.deadlineMs ?? DEADLINE_MS[r.n]} ms (polled every ${r.completionPollMs ?? '?'} ms)${diagnostic}`)
    }
  }
  return { findings, dataNotRecoverableByRole: lost }
}
