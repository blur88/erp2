// Device acceptance for #1353: five tabs of one signed-in profile opened together,
// measured in the browser that opens them. Pasted into the browser's console on
// the device; see README.md, "Device acceptance".
//
// The agreed target (2026-10-09, before any device run): five tabs, 8 seconds,
// for a current-token round and for an expired-token round, from the common
// tab-opening trigger until every tab has its expected data - authentication,
// retries and rendering included - with zero recovery clicks. It is not changed
// to fit a result.
//
// What it does not do: it sends no credential anywhere, reports nothing of a
// token but its expiry time, and changes nothing in the application. It opens
// tabs, watches them from the page that opened them, and closes them.
//
// It is a classic script, not a module, so that it can be pasted as it is. The
// functions that decide something are returned as QA_DEVICE and are tested in
// device-acceptance.test.mjs; with no `document` it defines them and stops.

/* eslint-disable no-undef */
var QA_DEVICE = (() => {
  const VERSION = 'device-acceptance 1 (#1353)'
  const TARGET = { tabs: 5, deadlineMs: 8000 }
  const GIVE_UP_MS = 60000
  const SETTLE_MS = 3000
  const PATH = '/dashboard'
  const USER_MENU = '[aria-label="Open user menu"]'
  // What the application's formatters read from localStorage, and the field of
  // the server's regional settings each comes from.
  const REGIONAL_KEYS = [
    ['dateFormat', 'dateFormat'],
    ['timeFormat', 'timeFormat'],
    ['numberFormat', 'numberFormat'],
    ['currency', 'defaultCurrency'],
    ['timezone', 'timezone'],
    ['startOfWeek', 'startOfWeek'],
  ]
  const REFERENCE_KEY = 'qaDeviceReference'

  // --- pure: what "the tab has its expected data" is ---------------------------
  //
  // The same rule W1 applies (lib/usable.mjs, judgeDashboard), from what the tab
  // itself shows: the dashboard has rendered, it does not say it could not load
  // something, the sidebar shows the server's company name, the regional formats
  // in effect are the server's, and - where the browser reports response
  // statuses - a data request was answered.
  function expectedData(snap, reference) {
    const why = []
    if (snap.path !== PATH) why.push(`the tab is at ${snap.path}, not on the dashboard`)
    else if (!snap.heading) why.push('the dashboard has not rendered its content')
    const notice = (snap.alerts || []).find((text) => text.includes('Could not load'))
    if (notice) why.push(`the dashboard says it could not load something: ${notice.slice(0, 120)}`)
    if (reference.companyName && snap.companyNameInSidebar !== reference.companyName) {
      why.push(`the sidebar shows ${snap.companyNameInSidebar === null ? 'no company name' : 'a company name that is not the server\'s'}`)
    }
    for (const [field, key] of REGIONAL_KEYS) {
      const value = reference.regional ? reference.regional[field] : undefined
      const written = field === 'startOfWeek' ? value === 0 || value === 1 : Boolean(value)
      if (!written) continue
      const have = snap.stored ? snap.stored[key] : undefined
      if (have !== String(value)) why.push(`the regional setting ${key} is ${have === null || have === undefined ? 'not stored' : `"${have}"`}, the server says "${value}"`)
    }
    // A refused request decides nothing by itself: the acceptance is the outcome,
    // the data on the page, and automatic retries are allowed. What was left
    // without a successful answer is reported beside the verdict, not in it.
    const diagnostic = []
    if (snap.api && snap.api.statusAvailable) {
      if (snap.api.leftFailed.length > 0) diagnostic.push(`${snap.api.leftFailed.length} data request(s) left without a successful answer: ${snap.api.leftFailed.join('; ')}`)
      if (!(snap.api.answered2xx > 0)) why.push('no data request of the tab was answered 2xx')
    }
    return { complete: why.length === 0, why, diagnostic }
  }

  // --- pure: a loading round's verdict --------------------------------------------
  //
  // pass  every tab had its expected data inside the deadline and still has it,
  //       nobody touched a tab, and no tab was reloaded
  // fail  any of that is not so
  // void  the round did not come about as a round: a tab was not opened, the
  //       token was not in the state the round claims, or a tab's completion
  //       happened before the measurement could see it. A void round is run
  //       again; it is never counted either way.
  function judgeRound(round, deadlineMs) {
    const voids = []
    const reasons = []
    const tabs = round.tabs || []
    const unopened = tabs.filter((t) => !t.opened)
    if (tabs.length !== TARGET.tabs || unopened.length > 0) voids.push(`${tabs.length - unopened.length} of ${TARGET.tabs} tabs were opened (allow pop-ups for this site and run it again)`)
    const wanted = round.kind === 'expired-token' ? 'expired' : 'current'
    if (!round.token || round.token.state !== wanted) voids.push(`the stored access token was ${round.token ? round.token.state : 'not read'} when the tabs were opened; this round needs it ${wanted}`)
    const unseen = tabs.filter((t) => t.opened && t.completeBeforeObserved)
    if (unseen.length > 0) voids.push(`tab(s) ${unseen.map((t) => t.tab).join(', ')} were already complete when the measurement first looked, so their time was not measured`)

    for (const t of tabs.filter((x) => x.opened)) {
      if (t.reloaded) reasons.push(`tab ${t.tab} was reloaded`)
      if (t.userInteractions > 0) reasons.push(`tab ${t.tab} received ${t.userInteractions} user interaction(s): the requirement is none`)
      if (t.completedAfterMs === null || t.completedAfterMs === undefined) reasons.push(`tab ${t.tab} never had its expected data (${(t.why || []).join('; ') || 'no reason recorded'})`)
      else if (t.completedAfterMs > deadlineMs) reasons.push(`tab ${t.tab} had its expected data after ${Math.round(t.completedAfterMs)} ms, past the ${deadlineMs} ms deadline`)
      else if (!t.completeAtEnd) reasons.push(`tab ${t.tab} had its expected data and no longer has it (${(t.why || []).join('; ')})`)
    }
    const times = tabs.map((t) => t.completedAfterMs).filter((v) => typeof v === 'number')
    const lastCompletedAfterMs = times.length === tabs.length && tabs.length > 0 ? Math.max(...times) : null
    // A behaviour that failed is a fail even in a round with something void about it.
    const verdict = reasons.length > 0 ? 'fail' : voids.length > 0 ? 'void' : 'pass'
    return { verdict, deadlineMs, lastCompletedAfterMs, reasons, voids }
  }

  // --- pure: the sign-out round's verdict -----------------------------------------
  function judgeSignOut(round) {
    const voids = []
    const reasons = []
    const tabs = round.tabs || []
    const unopened = tabs.filter((t) => !t.opened)
    if (tabs.length !== TARGET.tabs || unopened.length > 0) voids.push(`${tabs.length - unopened.length} of ${TARGET.tabs} tabs were opened`)
    if (typeof round.signOutAtMs !== 'number') voids.push('no sign-out was made: no tab showed its user menu')
    for (const t of tabs.filter((x) => x.opened)) {
      if (!t.onLoginPage) reasons.push(`tab ${t.tab} is not on the login page`)
      if (t.reloaded) reasons.push(`tab ${t.tab} reached the login page by a reload`)
      if (t.staleUi) reasons.push(`tab ${t.tab} still shows something of the session`)
    }
    const verdict = voids.length > 0 ? 'void' : reasons.length > 0 ? 'fail' : 'pass'
    return { verdict, reasons, voids }
  }

  // --- in the browser ----------------------------------------------------------------

  const text = (el) => (el.textContent || '').trim()

  /** What one opened tab shows now, read from the page that opened it (same origin). */
  function snapshotOf(w) {
    const d = w.document
    const entries = w.performance.getEntriesByType('resource').filter((e) => {
      const path = new URL(e.name).pathname
      return path.startsWith('/api/') && !path.startsWith('/api/health') && !path.startsWith('/api/auth/')
    })
    const statusAvailable = entries.length > 0 && entries.every((e) => typeof e.responseStatus === 'number' && e.responseStatus > 0)
    let api = { answered2xx: null, leftFailed: null, statusAvailable: false }
    if (statusAvailable) {
      // The last answer to each request is what is left: an earlier refusal that
      // the application repeated successfully is not a failure left standing.
      const last = new Map()
      for (const e of entries) last.set(e.name, e)
      api = {
        statusAvailable: true,
        answered2xx: entries.filter((e) => e.responseStatus >= 200 && e.responseStatus < 300).length,
        leftFailed: [...last.values()]
          .filter((e) => e.responseStatus >= 400 && new URL(e.name).pathname !== '/api/settings/regional')
          .map((e) => `${new URL(e.name).pathname} ${e.responseStatus}`),
      }
    }
    const brand = [...d.querySelectorAll('.MuiDrawer-root h6')].find((h) => text(h) === 'ERP System')
    return {
      path: w.location.pathname,
      heading: [...d.querySelectorAll('h5')].some((h) => text(h) === 'Dashboard'),
      alerts: [...d.querySelectorAll('.MuiAlert-root')].map(text),
      companyNameInSidebar: brand && brand.nextElementSibling ? text(brand.nextElementSibling) : null,
      stored: Object.fromEntries(REGIONAL_KEYS.map(([, key]) => [key, w.localStorage.getItem(key)])),
      userMenu: !!d.querySelector(USER_MENU),
      api,
      requests: entries.length,
    }
  }

  /** The stored session's expiry, and nothing else of it. */
  function readSession() {
    return new Promise((resolve) => {
      const open = indexedDB.open('erp-session')
      // Opening a database that does not exist creates it, empty and without
      // the application's store, and the application then finds its storage
      // broken. Where there is none, the creation is aborted and nothing is left.
      open.onupgradeneeded = () => open.transaction.abort()
      open.onerror = (event) => {
        event.preventDefault()
        resolve(null)
      }
      open.onsuccess = () => {
        const db = open.result
        if (!db.objectStoreNames.contains('kv')) {
          db.close()
          resolve(null)
          return
        }
        const get = db.transaction('kv', 'readonly').objectStore('kv').get('record')
        get.onerror = () => {
          db.close()
          resolve(null)
        }
        get.onsuccess = () => {
          db.close()
          const session = get.result && get.result.session ? get.result.session : null
          resolve(session)
        }
      }
    })
  }

  const tokenState = (session) => {
    if (!session || typeof session.accessTokenExpiresAt !== 'number') return { state: 'no stored session', remainingMs: null }
    const remainingMs = session.accessTokenExpiresAt * 1000 - Date.now()
    // A margin either side: a token within it is neither clearly current nor clearly expired.
    return { state: remainingMs > 120000 ? 'current' : remainingMs < -2000 ? 'expired' : 'about to expire', remainingMs }
  }

  const marker = (id) => fetch('/manifest.json', { headers: { 'X-QA-Request-Id': id }, cache: 'no-store' }).catch(() => undefined)
  const nowOf = (w) => w.performance.timeOrigin + w.performance.now()
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  /**
   * Opens the tabs from one user gesture and returns one watcher per tab. A
   * watcher installs its observers INSIDE the opened tab as soon as the tab's own
   * document exists, so what it records does not depend on this page's timers,
   * which the browser slows down once this page is in the background.
   */
  function openTabs(path, trigger, onTab) {
    const watchers = []
    for (let i = 1; i <= TARGET.tabs; i += 1) {
      const w = window.open(path, '_blank')
      const watcher = { tab: i, w, opened: !!w, installed: false, installedAfterMs: null, timeOrigin: null, userInteractions: 0, looks: 0, lookMs: 0, state: {} }
      watchers.push(watcher)
      if (!w) continue
      const install = () => {
        if (watcher.installed) return true
        let ready = false
        try {
          ready = w.location.href !== 'about:blank' && w.location.pathname === path && !!w.document && !!w.document.documentElement
        } catch {
          ready = false
        }
        if (!ready) return false
        watcher.installed = true
        watcher.installedAfterMs = Date.now() - trigger
        watcher.timeOrigin = w.performance.timeOrigin
        for (const type of ['click', 'keydown', 'pointerdown']) {
          w.addEventListener(type, (e) => { if (e.isTrusted) watcher.userInteractions += 1 }, true)
        }
        // What the measurement itself costs the tab it watches, so that it can
        // be read against the time it reports.
        const look = () => {
          const before = w.performance.now()
          try {
            onTab(watcher)
          } finally {
            watcher.looks += 1
            watcher.lookMs += w.performance.now() - before
          }
        }
        new w.MutationObserver(look).observe(w.document.documentElement, { childList: true, subtree: true, characterData: true })
        try {
          new w.PerformanceObserver(look).observe({ type: 'resource', buffered: true })
        } catch {
          // The mutation observer alone still sees the page change.
        }
        w.addEventListener('storage', look)
        onTab(watcher, true)
        return true
      }
      const timer = setInterval(() => { if (install()) clearInterval(timer) }, 50)
      watcher.stop = () => clearInterval(timer)
    }
    return watchers
  }

  const reloadedOf = (watcher) => {
    try {
      return watcher.installed && watcher.w.performance.timeOrigin !== watcher.timeOrigin
    } catch {
      return true
    }
  }

  async function loadingRound(kind, reference, ui) {
    const session = await readSession()
    const token = tokenState(session)
    const id = `device-${kind}-${Date.now()}`
    await marker(`${id}-in`)
    const trigger = Date.now()
    const watchers = openTabs(PATH, trigger, (watcher, first) => {
      if (watcher.state.completedAfterMs !== undefined) return
      let judged
      try {
        judged = expectedData(snapshotOf(watcher.w), reference)
      } catch {
        return
      }
      if (!judged.complete) return
      watcher.state.completedAfterMs = nowOf(watcher.w) - trigger
      watcher.state.completeBeforeObserved = first === true
    })
    const opened = watchers.filter((x) => x.opened)
    ui(`${opened.length} of ${TARGET.tabs} tabs opened. Do not touch them. Waiting for every tab to have its data...`)
    for (const until = Date.now() + GIVE_UP_MS; Date.now() < until; ) {
      if (opened.every((x) => x.state.completedAfterMs !== undefined)) break
      await sleep(500)
    }
    await sleep(SETTLE_MS)
    const tabs = watchers.map((x) => {
      if (!x.opened) return { tab: x.tab, opened: false }
      let end = { complete: false, why: ['the tab could not be read'] }
      let snap = null
      try {
        snap = snapshotOf(x.w)
        end = expectedData(snap, reference)
      } catch {
        // Left as "could not be read".
      }
      return {
        tab: x.tab,
        opened: true,
        observedFromMs: x.installedAfterMs,
        completedAfterMs: x.state.completedAfterMs === undefined ? null : Math.round(x.state.completedAfterMs),
        completeBeforeObserved: x.state.completeBeforeObserved === true,
        completeAtEnd: end.complete,
        why: end.why,
        requestsLeftFailed: end.diagnostic || [],
        userInteractions: x.userInteractions,
        reloaded: reloadedOf(x),
        measurement: { looks: x.looks, costMs: Math.round(x.lookMs) },
        dataRequests: snap ? snap.requests : null,
        responseStatusesAvailable: snap ? snap.api.statusAvailable : null,
      }
    })
    await marker(`${id}-out`)
    for (const x of watchers) {
      if (x.stop) x.stop()
      try { x.w && x.w.close() } catch { /* a tab the user closed */ }
    }
    const round = { kind, id, triggerAt: new Date(trigger).toISOString(), token, tabs }
    return { ...round, judgement: judgeRound(round, TARGET.deadlineMs) }
  }

  async function signOutRound(ui) {
    const id = `device-sign-out-${Date.now()}`
    await marker(`${id}-in`)
    const trigger = Date.now()
    const round = { signOutAtMs: null, signedOutFrom: null }
    const watchers = openTabs(PATH, trigger, (watcher) => {
      let d
      try {
        d = watcher.w.document
        if (watcher.w.location.pathname === '/login' && watcher.state.onLoginAfterMs === undefined) watcher.state.onLoginAfterMs = nowOf(watcher.w) - trigger
      } catch {
        return
      }
      if (round.signOutAtMs !== null || round.clicking) return
      const menu = d.querySelector(USER_MENU)
      if (!menu) return
      // The first tab to show its user menu signs out, the way a person would:
      // the menu, then Logout.
      round.clicking = true
      menu.click()
      const press = () => {
        const item = [...d.querySelectorAll('[role="menuitem"]')].find((el) => text(el) === 'Logout')
        if (!item) return false
        round.signOutAtMs = Math.round(nowOf(watcher.w) - trigger)
        round.signedOutFrom = watcher.tab
        item.click()
        return true
      }
      if (!press()) {
        const wait = new watcher.w.MutationObserver(() => { if (press()) wait.disconnect() })
        wait.observe(d.documentElement, { childList: true, subtree: true })
      }
    })
    const opened = watchers.filter((x) => x.opened)
    ui(`${opened.length} of ${TARGET.tabs} tabs opened. Do not touch them. One of them will sign out...`)
    for (const until = Date.now() + GIVE_UP_MS; Date.now() < until; ) {
      let all = false
      try {
        all = opened.every((x) => x.w.location.pathname === '/login')
      } catch {
        all = false
      }
      if (all) break
      await sleep(500)
    }
    await sleep(SETTLE_MS)
    const tabs = watchers.map((x) => {
      if (!x.opened) return { tab: x.tab, opened: false }
      let onLoginPage = false
      let staleUi = true
      try {
        onLoginPage = x.w.location.pathname === '/login'
        const snap = snapshotOf(x.w)
        staleUi = snap.userMenu || snap.heading
      } catch {
        // Left as not on the login page.
      }
      return { tab: x.tab, opened: true, onLoginPage, reloaded: reloadedOf(x), staleUi, onLoginAfterMs: x.state.onLoginAfterMs === undefined ? null : Math.round(x.state.onLoginAfterMs) }
    })
    await marker(`${id}-out`)
    for (const x of watchers) {
      if (x.stop) x.stop()
      try { x.w && x.w.close() } catch { /* a tab the user closed */ }
    }
    const result = { kind: 'sign-out', id, triggerAt: new Date(trigger).toISOString(), signOutAtMs: round.signOutAtMs, signedOutFrom: round.signedOutFrom, tabs }
    return { ...result, judgement: judgeSignOut(result) }
  }

  /** NEGATIVE CHECK: five tabs of a page that is not the dashboard must all be reported without their data. */
  async function neverCompletes(reference, ui) {
    const trigger = Date.now()
    const watchers = openTabs('/manifest.json', trigger, () => undefined)
    ui('NEGATIVE CHECK: five tabs of a page that is not the dashboard. Waiting 6 s...')
    await sleep(6000)
    const tabs = watchers.map((x) => {
      if (!x.opened) return { tab: x.tab, opened: false }
      let end = { complete: false, why: ['the tab could not be read'] }
      try {
        end = expectedData(snapshotOf(x.w), reference)
      } catch {
        // Left as "could not be read".
      }
      return { tab: x.tab, opened: true, completedAfterMs: null, completeAtEnd: end.complete, why: end.why, userInteractions: x.userInteractions, reloaded: false, completeBeforeObserved: false }
    })
    for (const x of watchers) {
      if (x.stop) x.stop()
      try { x.w && x.w.close() } catch { /* a tab the user closed */ }
    }
    // Judged as a current-token round would be; the kind says what it is.
    const round = { kind: 'current-token', token: { state: 'current', remainingMs: null }, tabs }
    const judgement = judgeRound(round, TARGET.deadlineMs)
    return { ...round, kind: 'negative-check', negativeCheck: 'a page that is not the dashboard', judgement, negativeCheckHolds: judgement.verdict === 'fail' && tabs.filter((t) => t.opened).every((t) => !t.completeAtEnd) }
  }

  /** What the server says the shell's data is, asked once while the token is current. Nothing of the token is kept. */
  async function fetchReference() {
    const session = await readSession()
    const token = tokenState(session)
    if (token.state !== 'current') throw new Error(`the stored access token is ${token.state}: open the application once so that it is current, close that tab, and prepare again`)
    const get = async (path) => {
      const response = await fetch(path, { headers: { Authorization: `Bearer ${session.accessToken}` }, cache: 'no-store' })
      if (!response.ok) throw new Error(`${path} was answered ${response.status}`)
      const body = await response.json()
      return body && typeof body === 'object' && body.data && !Array.isArray(body.data) ? body.data : body
    }
    const company = await get('/api/settings/company')
    const regional = await get('/api/settings/regional')
    return {
      companyName: company && company.name ? company.name : null,
      regional: Object.fromEntries(REGIONAL_KEYS.map(([field]) => [field, regional ? regional[field] ?? null : null])),
    }
  }

  function start() {
    const results = { script: VERSION, target: TARGET, origin: location.origin, startedAt: new Date().toISOString(), device: {
      userAgent: navigator.userAgent, platform: navigator.platform, hardwareConcurrency: navigator.hardwareConcurrency ?? null,
      deviceMemory: navigator.deviceMemory ?? null, screen: `${screen.width}x${screen.height}`, language: navigator.language,
    }, rounds: [] }
    document.title = 'ERP device acceptance'
    document.body.textContent = ''
    const el = (tag, textContent, parent = document.body) => {
      const node = document.createElement(tag)
      if (textContent) node.textContent = textContent
      parent.appendChild(node)
      return node
    }
    document.body.style.cssText = 'font: 14px/1.5 system-ui, sans-serif; margin: 16px; max-width: 900px; background: #fff; color: #111'
    el('h2', 'ERP device acceptance (#1353): five tabs, 8 seconds')
    const warn = el('p')
    warn.style.color = '#b00020'
    if (location.port !== '' && location.port !== '80') warn.textContent = `This page is on port ${location.port}. The test must be run through the ingress, on port 80: http://${location.hostname}/`
    const status = el('p', 'Close every other tab of the application first. Allow pop-ups for this site. Then: Prepare, and the rounds in order.')
    const say = (message) => { status.textContent = message }
    const out = el('textarea')
    out.style.cssText = 'width: 100%; height: 320px; font: 12px/1.4 monospace; margin-top: 12px'
    out.readOnly = true
    const show = () => { out.value = JSON.stringify(results, null, 2) }
    const bar = el('div')
    document.body.insertBefore(bar, out)
    const button = (label, run) => {
      const b = el('button', label, bar)
      b.style.cssText = 'margin: 4px 6px 4px 0; padding: 6px 10px'
      b.onclick = async () => {
        for (const other of bar.querySelectorAll('button')) other.disabled = true
        try {
          await run()
        } catch (err) {
          say(`Stopped: ${err && err.message ? err.message : err}`)
        }
        for (const other of bar.querySelectorAll('button')) other.disabled = false
        show()
      }
    }
    const reference = () => {
      const stored = sessionStorage.getItem(REFERENCE_KEY)
      if (!stored) throw new Error('prepare first: the reference for the company name and the regional formats has not been read')
      return JSON.parse(stored)
    }
    const record = (round, label) => {
      results.rounds.push(round)
      const j = round.judgement
      say(`${label}: ${j.verdict.toUpperCase()}${j.lastCompletedAfterMs ? ` - last tab complete after ${j.lastCompletedAfterMs} ms of ${j.deadlineMs}` : ''}${[...(j.reasons || []), ...(j.voids || [])].length ? ` - ${[...(j.reasons || []), ...(j.voids || [])].join('; ')}` : ''}`)
    }
    button('1. Prepare (token must be current)', async () => {
      const ref = await fetchReference()
      sessionStorage.setItem(REFERENCE_KEY, JSON.stringify(ref))
      results.reference = { companyHasAName: Boolean(ref.companyName), regional: ref.regional }
      say('Prepared. Next: 2, the current-token round.')
    })
    button('2. Current-token round', async () => record(await loadingRound('current-token', reference(), say), 'Current-token round'))
    button('3. Expired-token round', async () => record(await loadingRound('expired-token', reference(), say), 'Expired-token round'))
    button('4. Sign-out round', async () => record(await signOutRound(say), 'Sign-out round'))
    button('Negative check: a page that never completes', async () => {
      const round = await neverCompletes(reference(), say)
      results.rounds.push(round)
      say(`NEGATIVE CHECK ${round.negativeCheckHolds ? 'holds' : 'DOES NOT HOLD'}: a page that is not the dashboard was judged ${round.judgement.verdict}.`)
    })
    button('Negative check: the last loading round against 1 ms', async () => {
      const last = [...results.rounds].reverse().find((r) => (r.kind === 'current-token' || r.kind === 'expired-token') && !r.negativeCheck)
      if (!last) throw new Error('run a loading round first')
      const judgement = judgeRound(last, 1)
      // Only a round that passed can show the deadline deciding something.
      const holds = last.judgement.verdict === 'pass' ? judgement.verdict === 'fail' : null
      results.rounds.push({ kind: 'negative-check', negativeCheck: `round ${last.id} (${last.judgement.verdict} against ${last.judgement.deadlineMs} ms) judged against a 1 ms deadline`, judgement, negativeCheckHolds: holds })
      say(holds === null ? `NEGATIVE CHECK shows nothing: round ${last.kind} did not pass, so a 1 ms deadline failing it proves nothing. Run it after a round that passed.` : `NEGATIVE CHECK ${holds ? 'holds' : 'DOES NOT HOLD'}: the same round against 1 ms is ${judgement.verdict}.`)
    })
    button('Token state now', async () => {
      const token = tokenState(await readSession())
      say(`Stored access token: ${token.state}${token.remainingMs === null ? '' : token.remainingMs > 0 ? `, ${Math.round(token.remainingMs / 1000)} s left` : `, expired ${Math.round(-token.remainingMs / 1000)} s ago`}.`)
    })
    button('Copy result', async () => {
      show()
      out.select()
      try { await navigator.clipboard.writeText(out.value) } catch { document.execCommand('copy') }
      say('Result copied. Paste it where it was asked for.')
    })
    show()
  }

  return { VERSION, TARGET, expectedData, judgeRound, judgeSignOut, start }
})()

if (typeof document !== 'undefined') QA_DEVICE.start()
