// What W1 is judged on and what it reports, as pure functions of the rounds
// it measured (w1-judgement.test.mjs). No browser here.
//
// Blocking, at N = 5 only, in all three rounds:
//   (a), (b), (c)  no request to refresh, logout or me was answered 429;
//   (a), (b)       every tab usable for the non-administrator (lib/usable.mjs);
//   (a)            the access token was current when the tabs opened;
//   (b)            every tab did start with an expired access token;
//   (c)            the sign-out's logout was sent, and every tab is on the
//                  login page afterwards in the document it first loaded
//                  (no reload). By the repository owner's decision: "Make
//                  round (c) blocking at five tabs as proposed."
// Everything at N = 10 and 20 is reported and does not block.
//
// W1 states no capacity. It reports, per size and round, what was observed.

/** The one sentence about what W1 does and does not show. Printed with every summary and quoted in the README. */
export const W1_SCOPE =
  'W1 shows that the tabs of a restored window coordinate their refresh and that a restored window puts little load on session_limit. ' +
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
  }
}

/** The line the summary prints for a round. */
export function observedLine(o) {
  const z = o.sessionZoneRequests
  const head =
    `N=${o.n} (${o.round})${o.n === 5 ? ' blocking' : ''}: session zone ${z.total} request(s) (refresh ${z.refresh}, logout ${z.logout}, me ${z.me}), ` +
    `429s ${o.sessionZone429}, peak accumulated demand ${o.peakAccumulatedDemand} against burst ${o.configuredBurst}; `
  const tail =
    o.round === 'c'
      ? `on the login page without a reload ${o.tabsOnLoginPageWithoutReload}/${o.n}; still loading at the sign-out ${o.tabsStillLoadingAtSignOut}/${o.n}; `
      : `usable ${o.usableTabs}/${o.n}; complete on first load ${o.tabsCompleteOnFirstLoad}/${o.n}; recovery actions ${o.recoveryActions} (most for one tab ${o.mostRecoveryActionsForOneTab}); `
  return `${head}${tail}business-endpoint 429s ${o.businessEndpoint429} of ${o.businessEndpointRequests}`
}

/**
 * The blocking checks, as { label, ok, detail } for ctx.check. Each `ok` is
 * the pass condition its comment states; a round that was not run makes its
 * checks false.
 */
export function blockingChecks(rounds, sizes) {
  if (!sizes.includes(5)) return [{ label: 'N = 5 was run (the blocking size)', ok: false, detail: { sizes } }]
  const out = []
  const of = (round) => rounds.find((r) => r.n === 5 && r.round === round)
  for (const round of ['a', 'b', 'c']) {
    const r = of(round)
    // Pass: the round was run and no request to refresh, logout or me was
    // answered 429, in the round itself or while its tabs were checked.
    out.push({
      label: `N = 5 (${round}): no 429 on refresh, logout or me`,
      ok: !!r && session429(r) === 0,
      detail: r ? { count429: r.count429, duringUsabilityCheck: r.sessionRequests429DuringUsabilityCheck ?? 0 } : 'round not run',
    })
    if (round === 'c') continue
    // Pass: every tab has its data on screen, the shell's included, and an
    // action working, for the non-administrator, without a reload, a new
    // sign-in or a page outside the role's set (lib/usable.mjs, verdict()).
    out.push({
      label: `N = 5 (${round}): every tab usable for the non-administrator (data present, the shell's included, and an action working; no reload, no new sign-in, no administrator-only page)`,
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
  }
  const a = of('a')
  // Pass: when the tabs of round (a) opened, the stored access token had time
  // left. Otherwise the round was not "current token" but a second round (b).
  out.push({
    label: 'N = 5 (a): the access token was current when the tabs opened',
    ok: !!a && typeof a.accessTokenRemainingMsAtStart === 'number' && a.accessTokenRemainingMsAtStart > 0,
    detail: { accessTokenRemainingMsAtStart: a?.accessTokenRemainingMsAtStart ?? null },
  })
  // Pass: when the tabs of round (b) opened, the stored access token had expired.
  out.push({ label: 'N = 5 (b): every tab did start with an expired access token', ok: of('b')?.accessTokenExpiredAtStart === true })
  const c = of('c')
  // Pass: the sign-out of round (c) sent its logout and the server answered
  // it 2xx. Without one, "no 429 on logout" would say nothing.
  const logouts = (c?.requests ?? []).filter((e) => e.path.replace(/\/$/, '') === '/api/auth/logout')
  out.push({
    label: 'N = 5 (c): the sign-out sent a logout and it was answered 2xx',
    ok: logouts.length >= 1 && logouts.every((e) => typeof e.status === 'number' && e.status >= 200 && e.status < 300),
    detail: logouts.map((e) => e.status),
  })
  // Pass: after the sign-out all five tabs show the login page, each in the
  // document it first loaded (not reloaded).
  out.push({
    label: 'N = 5 (c): every tab is on the login page after the sign-out, without a reload',
    ok: !!c && c.everyTabOnLoginPage === true && c.tabsOnLoginPage === 5 && Array.isArray(c.tabs) && c.tabs.length === 5 && c.tabs.every((t) => t.onLoginPage === true && t.sameDocument === true),
    detail: c ? c.tabs : 'round not run',
  })
  return out
}

/** Everything observed that does not block, one sentence each. `role` names the user in the sentences. */
export function nonBlockingFindings(rounds, role) {
  const findings = []
  const lost = []
  for (const r of rounds) {
    const where = `N=${r.n} (${r.round})`
    if (r.n !== 5 && session429(r) > 0) findings.push(`${where}: ${session429(r)} request(s) to refresh, logout or me answered 429`)
    if (r.dataRequests429 > 0) {
      findings.push(`${where}: ${r.dataRequests429} of ${r.dataRequests} data requests of the tabs' own loading were answered 429 (api_limit, not session_limit; tracked in issue #1353)`)
    }
    if (r.dataRequestsFailed.length > 0) {
      findings.push(`${where}: ${r.dataRequestsFailed.length} data request(s) failed without an answer: ${[...new Set(r.dataRequestsFailed)].join(', ')}`)
    }
    if (r.round === 'c') {
      if (r.n !== 5 && !r.everyTabOnLoginPage) findings.push(`${where}: not every tab reached the login page without a reload`)
      continue
    }
    if (r.round === 'a' && r.n !== 5 && !(r.accessTokenRemainingMsAtStart > 0)) findings.push(`${where}: the access token was not current when the tabs opened, so this was not a current-token round`)
    // Recorded for every size, blocking or not: what recovery took.
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
      findings.push(`${where}: NOT recoverable by a ${role} user without a reload: ${data}, in ${tabs.length} of ${r.n} tabs` + (r.n === 5 ? ' (this fails W1)' : ''))
    }
    if (r.tabsWithRefusedStep > 0) findings.push(`${where}: a step was refused in ${r.tabsWithRefusedStep} tab(s) because it would have opened a page outside the role's set`)
    if (r.tabsNeedingActionRetry > 0) findings.push(`${where}: the action had to be tried more than once in ${r.tabsNeedingActionRetry} tab(s)`)
    if (r.n !== 5 && !r.everyTabUsable) {
      findings.push(`${where}: ${r.tabsNotRecoverable.length} of ${r.n} tabs were NOT usable: ${r.tabsNotRecoverable.map((t) => `${t.tab}: ${t.whyNot}`).join(' || ')}`)
    }
  }
  return { findings, dataNotRecoverableByRole: lost }
}
