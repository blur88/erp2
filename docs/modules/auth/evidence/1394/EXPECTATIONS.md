# #1394: expectations, written before any browser run (2026-10-12)

Status of this file at the time of writing: **no run has been made.** Every
scenario below is an expectation, not a result. The *actual* and *status*
columns are filled in only by the runs recorded in `runs/`.

The runs were made on **`97a672272`** (R1) and **`5814eab1e`** (R2), both after
the code they exercise was committed. R1 was made after R2's case existed in
the override copy but before the case's own fix; the commits are named in each
run's `meta.txt`.

Automated coverage already recorded on that commit:

- `frontend/src/store/api/__tests__/companySettingsFailure.test.ts` — the classes.
- `frontend/src/components/common/companyRecovery/__tests__/recoveryMachine.test.ts` — the rules.
- `frontend/src/components/common/companyRecovery/__tests__/CompanySettingsRecoveryProvider.test.tsx` — the scenarios.
- `frontend/src/components/common/companyRecovery/__tests__/CompanyUnavailableStrip.test.tsx` — the strip.
- `frontend/src/components/common/__tests__/Sidebar.test.tsx` — the sidebar renders it.
- `frontend/src/components/common/__tests__/MainLayout.companyRecovery.test.tsx` — one read for both sidebars; the drawer sends nothing.

## What this run is, and what it is not

The harness in `frontend/qa/cross-tab-session` judges "company data" already
(`cases/limiter.mjs`, W1). A run through `QA_SUITE_OVERRIDE` runs a **copy** of
the suite, and by that script's own definition a partial run is never a pass of
the suite. So results recorded here are **development results**: they are the
evidence this issue asked for, and they are not a pass of the suite.

## The scenario table (spec 9.1, rows 1–15)

| # | Scenario | Expected | How exercised | Actual | Status |
|---|---|---|---|---|---|
| 1 | First read fails transiently, then succeeds | Placeholder; retries after about 2 s and 6 s as needed; branding appears without reload; no warning during recovery | `CompanySettingsRecoveryProvider.test.tsx: 1, 2, 3`; R2 | R2 (browser): the read was aborted three times, so 3 reads went out (the first and the two automatic attempts), the strip was showing and the header showed the placeholder with no company name. After Retry: 1 more read, name back, strip gone. No message appeared before the strip. | met |
| 2 | Read fails after an earlier success | Retained branding stays visible through recovery and after it stops | `CompanySettingsRecoveryProvider.test.tsx: 4` | Vitest only. A non-administrator has no in-app way to cause a second read of this endpoint, so the browser cannot reach this state. | met (Vitest); browser **unverified** |
| 3 | Transient failures persist | Exactly two additional automatic attempts, then the strip; no further requests merely from hiding/showing the tab | `CompanySettingsRecoveryProvider.test.tsx: 3`; R2 | R2: 3 reads, then the strip, and nothing further while it was showing. The hiding/showing half is Vitest only: the harness has no hidden-tab case for this endpoint. | met (both halves by their own means) |
| 4 | Read fails behind a failed/refused refresh | Warning immediately; no sidebar-driven automatic retry and no additional refresh | `CompanySettingsRecoveryProvider.test.tsx: 5` | R1: 5 of 5 tabs answered 401 on the read, each sent exactly one refresh, each was refused (the filler answered 441 of its 574 requests 429), and each showed the strip with **no** read after it. Reads per tab: 1. Refreshes: 1 per tab, 5 in all. | met |
| 5 | Tokens renew successfully | One quiet re-read per affected tab, deferred while hidden; duplicate notifications and in-flight requests produce no duplicate reads; a renewal during an in-flight read is consumed and queues nothing; success removes the strip | `CompanySettingsRecoveryProvider.test.tsx: 7, 8, 9` | Vitest only for the browser's sake. In R1 the renewal each tab's recovery needed arrived **while that read was in flight**, so it was consumed and no quiet re-read followed — which is the rule, not the expectation's case. | met (Vitest); the quiet re-read itself **unverified in a browser** |
| 6 | Read exhausts the existing 429 retries | No added automatic attempts; warning appears; manual Retry and renewal recovery remain available | `CompanySettingsRecoveryProvider.test.tsx: 6` | Vitest only: R1's filler answered 429 to `/api/auth/me`, not to the company read. | met (Vitest); browser **unverified** |
| 7 | Tab becomes ineligible during a delay | No sidebar-initiated attempt while ineligible; the remaining delay and budget resume when eligible | `CompanySettingsRecoveryProvider.test.tsx: 10, 11, 12` | Vitest only. | met (Vitest); browser **unverified** |
| 8 | Manual Retry | Disabled while pending, and while the tab is ineligible, hidden included (the strip stays visible; the handler refuses too); success clears the strip; transient failure gets a fresh bounded cycle; refresh-blocked or exhausted-429 failure stops again | `CompanySettingsRecoveryProvider.test.tsx: 13, 14`; R2 | R2: the strip's Retry was enabled while stopped and idle, one click sent exactly one read (3 → 4), and the name came back with the strip gone. The disabled-while-ineligible halves are Vitest only. | met |
| 9 | Session ends, or the session id changes directly | Retained branding, timers and recovery state clear in both cases; cached data and late results from the previous session cannot supply branding to the new one | `CompanySettingsRecoveryProvider.test.tsx: 15a–d` | Vitest only: R1's round (c) signs out, but that is the suite's own case and it did not ask what the sidebar showed. | met (Vitest); browser **unverified** |
| 10 | Collapsed control | Keyboard reachable and operable; tooltip shown; accessible name "Retry loading company details" | `CompanyUnavailableStrip.test.tsx: collapsed`; R2 | R2: with the strip showing, the collapsed sidebar had exactly one button with that accessible name; it took focus, and its tooltip read "Company details unavailable. Retry". Screenshots: `r2-collapsed`, `r2-collapsed-focus`, `r2-collapsed-tooltip`. | met |
| 11 | Settings pages | `CompanySettingsPage` and `PrintSettings/GeneralTab` receive the cache update from a successful retry; no new UI on either | `MainLayout.companyRecovery.test.tsx: scenario 13` | Vitest only: both pages are administrator-only and this ran as `sales_staff`. | met (Vitest); browser **unverified** |
| 12 | Mobile drawer opened in any state, including stopped | No request is sent; the drawer's sidebar shows the same branding and strip as the permanent one | `MainLayout.companyRecovery.test.tsx: scenario 12` | Vitest only: the harness runs at 1366 px, where the temporary drawer is never opened. | met (Vitest); browser **unverified** |
| 13 | A settings page opened while stopped | The page's own read is sent as today; success clears the strip; failure leaves it stopped and starts no automatic cycle | `MainLayout.companyRecovery.test.tsx: scenario 13` | Vitest only, for the same reason as row 11. | met (Vitest); browser **unverified** |
| 14 | A storage timeout around the read | Treated as transient; attempts paused until storage is eligible again | `CompanySettingsRecoveryProvider.test.tsx: 12` | Vitest only: forcing a storage timeout at the ingress is not a browser fault this harness injects. | met (Vitest); browser **unverified** |
| 15 | An automatic retry or quiet re-read is answered 401 | The runtime's refresh is counted and reported; if it fails, recovery stops at once | `CompanySettingsRecoveryProvider.test.tsx: 17` | R1: every tab's retry-class read was answered 401 and the refresh behind it failed, and recovery stopped at once — one read, one refresh, strip, nothing more. Refreshes after an automatic retry: **5**, one per tab, each the runtime's own and none sent by the sidebar. | met |

Rows 1–3 and 4 together discharge #1394's "confirm the three unobserved
columns": network error, timeout and 5xx, on the read itself (rows 1–3) and on
the refresh behind it (row 4, once per cause).

## The two T2 windows (spec 9.3, verbatim)

### Window 1, the filler holds `session_limit` empty

Expected: at most one refresh per tab (five in all, as T2 on `761985e1c`), the
strip in five of five tabs, and zero sidebar-initiated reads after the strip
appears. That zero assumes no manual Retry and no successful token renewal in
the window; if either occurs it is recorded and the zero is not claimed for
that tab.

**Actual (R1, commit `97a672272`) — met.**

- strip showing: **5 of 5 tabs**, expanded form in all five.
- requests: `GET /api/settings/company` **1 per tab** (5 in all), every one of
  them the page load's own.
- reads after the strip: **0 per tab** — no navigation, renewal or Retry
  attributed read in any tab.
- refreshes: **1 per tab, 5 in all**; own (a `refresh-sent` in that tab's trace)
  in all five, **0 adopted tokens**.
- What the round's own record shows: every tab's first read was answered **401**
  and the refresh behind it was refused, so the read was `refresh-blocked` and
  recovery stopped at once. That is why nothing further was sent.
- The harness's `zeroClaimed` flag reads **false** for all five, and that flag
  is stricter than the expectation: it also required the tab to have sent no
  refresh at all in the window, where the expectation's condition is only *no
  manual Retry and no successful renewal after the strip*. The underlying
  figures are the ones above.

### Window 2, the filler is stopped and each tab gets one sidebar navigation

(T2's own recovery action.) Counted **separately**: navigation reads, quiet
re-reads, refreshes, and token adoptions (a tab taking tokens another tab
renewed). Expected: all five tabs recover without a reload, and each tab that
is stopped and eligible makes one quiet re-read. **No number of refreshes is
expected**, per tab or overall: five tabs sharing a session may adopt one
coordinated renewal. The actual refresh count and the adoptions are reported as
observed.

**Actual (R1) — the recovery half met, the quiet re-read expectation UNMET.**

- all five tabs recovered without a reload: **yes** — at the end of the window
  the strip was gone in 5 of 5 tabs and the company name was shown in 5 of 5.
- Per-tab lines, counted on their own:

| | N5b-1 | N5b-2 | N5b-3 | N5b-4 | N5b-5 |
|---|---|---|---|---|---|
| navigation reads | 0 | 0 | 0 | 0 | 0 |
| quiet re-reads | 0 | 0 | 0 | 0 | 0 |
| refreshes | 3 | 1 | 3 | 1 | 7 |
| token adoptions | 0 | 0 | 0 | 0 | 0 |
| own refresh (`refresh-sent`) | 3 | 1 | 3 | 1 | 7 |

- Two things about that table, both of which the run shows and neither of which
  the expectation anticipated:
  1. **The refresh row is the tab's whole trace, not the window's.** The
     harness reads `tokenOrigin` over the tab's entire `__erpSessionTrace`, so
     window 2's figures include window 1's refresh. Window 1's own count for
     each tab is **1**; the rest are later refreshes, all the runtime's own.
  2. **No quiet re-read was observed, and none was permitted.** The strip
     cleared in each tab because the runtime's own refresh succeeded and the
     read it was already in flight of was re-sent and answered 200
     (`companyRetry` statuses: `[401, 200]` in four tabs, `[401]` in the fifth).
     A renewal seen while that read is in flight is **consumed** by design, so
     no quiet re-read followed.

**This is recorded as UNMET and not reinterpreted.** The expectation "each tab
that is stopped and eligible makes one quiet re-read" did not hold in this run:
the tabs were never stopped *and idle* at the moment a renewal was observed,
because the renewal arrived while their read was still in flight. The rule the
expectation was written to check is covered by the named Vitest test
(`9: a quiet re-read whose own 401 renews and which then fails must not start
another read`) and by R1's five consumed renewals, which show the loop is not
happening. What the browser has **not** shown is a tab that sits stopped and
idle, is then renewed, and reads once. That is **unverified in a browser** and
is handed back to the owner rather than written up as met.

## Dated addition, 2026-10-13, after R1 and R2 and before R3. Nothing above is changed.

### The owner's reading of window 2's unmet expectation

The window-2 expectation "each tab that is stopped and eligible makes one quiet
re-read" **stays as written and stays UNMET for R1.** The owner's decision on
it (2026-10-13):

- Consuming a renewal that arrives while the read is in flight is the correct
  behaviour, and R1's recovery supports it. **The implementation is not changed
  to force an extra read.**
- Why R1 recovered without a quiet re-read: in each tab the sidebar navigation
  did not find the company read idle. The read that recovered the tab was one
  the API client was already carrying — answered 401, the runtime refreshed,
  and the client re-sent that same read, which was answered 200
  (`companyRetry` statuses `[401, 200]`). The renewal was observed while that
  read was in flight, so it was consumed and queued nothing. The strip cleared
  on the read's own success. A quiet re-read is what happens when a renewal
  finds the tab stopped **and idle**; R1 never put a tab in that state.
- So R1 shows recovery and shows the consumed renewal. It does not show the
  quiet re-read, which is the central recovery path of the design. R3 below is
  the targeted check for it.

### Run R3: stopped and idle, then a token renewal (written before the run)

One tab, non-administrator, QA stack (20 s access lifetime). No filler: the
session zone is not held.

Procedure:

1. Sign in; open the tab under test on the dashboard.
2. Abort the company read in that tab three times (R2's fault) so the tab ends
   **stopped**: strip showing, placeholder in the header. Remove the fault.
3. Leave the tab alone for longer than the access lifetime. Record the company
   reads and the tab's `refresh-sent` count at the start and at the end of that
   wait. This is the **idle** half: the tab is stopped, nothing is in flight,
   and its access token expires.
4. One sidebar navigation (Sales > Sales Orders), the same ordinary action R1
   used. Its page request is answered 401, the runtime refreshes, and the tab's
   tokens are renewed while the company read is idle.
5. Watch for the name; then wait a further 10 s and count again.

Expected:

| # | Expectation |
|---|---|
| R3-1 | After step 2 the strip is showing and the header shows no company name. |
| R3-2 | During the idle wait of step 3 the tab sends **no** company read and the strip stays. (A stopped, idle tab stays stopped.) |
| R3-3 | After the navigation the tab sends **exactly one** company read that follows a renewal — the quiet re-read — with no Retry click. |
| R3-4 | That read is answered 200, the company name appears in the sidebar and the strip is removed. |
| R3-5 | No reload: the same document is still loaded (a marker set on `window` before step 3 is still there, and the tab's navigation count is unchanged). |
| R3-6 | No duplicate read: 10 s after recovery the count of company reads is still the count at recovery. |

Recorded separately, and **not expected as numbers**: company reads by cause
(page load and automatic attempts; idle wait; after the navigation), the tab's
own refreshes (`refresh-sent`) before and after the navigation, and adopted
tokens. If the renewal is seen to arrive some other way than by the navigation
(for example adopted during the idle wait), that is recorded as what happened
and R3-2 is not claimed.

What would make this run say nothing: the navigation's request is not answered
401 (the token had not expired), so no renewal happens; or the strip is not
showing after step 2. Either is recorded as "did not exercise the path", not as
a result.

**Actual (R3, commit `357351cc6`, 2026-10-13) — all six met.** The line above
this one read "not yet run" when the expectations were committed (`b6dc16dc3`);
the case was committed as `mutations/r3-case.diff` (`357351cc6`) before the run.

| # | Actual | Status |
|---|---|---|
| R3-1 | Strip showing (expanded form), header with no company name (`r3-stopped.png`). All three armed faults were used. | met |
| R3-2 | Idle for 26 s against a 20 s access lifetime, tab `visible`. Company reads during the wait: **0**. `refresh-sent` during the wait: **0**. Strip still showing, Retry enabled, no name. | met |
| R3-3 | After the one navigation: **1** company read, 1098 ms after the click. Retry clicks: 0. | met |
| R3-4 | That read was answered 200 in the browser; "Your Company Name" appeared 1427 ms after the click; strip gone (`r3-recovered.png`). | met |
| R3-5 | The `window` marker set before the idle wait was still there and `performance.timeOrigin` was unchanged; the tab was at `/sales/orders`. | met |
| R3-6 | Company reads at recovery **4**, ten seconds later **4**. | met |

The path was exercised, which is what makes the six mean something: after the
navigation `GET /api/customers` and `GET /api/sales-orders` were both answered
401, and the tab's trace went from 0 to 1 `refresh-sent`.

Counts, each on its own line and none of them an expectation:

- company reads, the failed first read and the two automatic attempts: **3**
  (aborted in the browser at +0, +2.07 s and +6.05 s; none reached the ingress)
- company reads during the idle wait: **0**
- company reads after the navigation (the quiet re-read): **1**
- company reads in the 10 s after recovery: **0**
- company reads in all: **4**
- refreshes, `refresh-sent` in the tab's trace before the navigation: **0**
- refreshes, `refresh-sent` after the navigation: **1**
- `POST /api/auth/refresh` the harness logged for the tab: **1**, answered 200
  (the ingress log has the same one line, 958 ms after the click)
- adopted tokens: **0**; the renewal was the tab's own
- requests answered 401 after the navigation: **2**, behind one refresh

Limits of this run, stated so it is not read for more than it shows:

- One tab, one round, a development result through `QA_SUITE_OVERRIDE`. It
  shows the path works; it is not a rate and not a multi-tab result.
- The ingress answered the quiet re-read **304** (the browser revalidated its
  cached copy) and the browser delivered it to the page as 200. The run does
  not show a quiet re-read fetched with no cache.
- The renewal was the tab's own refresh. A stopped, idle tab renewed by
  **adopting** another tab's tokens was not exercised in a browser; the Vitest
  provider tests dispatch the same `tokensUpdated` the adoption path does.
- The deferral while hidden (the other half of row 5) was not exercised: the
  tab was visible throughout. That half remains Vitest only
  (`CompanySettingsRecoveryProvider.test.tsx: 8`).

**Row 5 after R3.** The table above is left as it was written. Its browser
status "the quiet re-read itself unverified in a browser" is superseded by R3
for a visible tab renewed by its own refresh, and stands for the hidden-tab
deferral and for adopted tokens.

### What remains Vitest only in a browser, after R3

Accepted by the owner (2026-10-13) where a browser exercise is impractical; the
limitation stays explicit:

| Row | What the browser has not shown | Why | Covered by |
|---|---|---|---|
| 2 | Retained branding through and after exhaustion | A non-administrator cannot cause a second read of this endpoint | `CompanySettingsRecoveryProvider.test.tsx: 4` |
| 3 (half) | No request merely from hiding/showing the tab | No hidden-tab case in the harness | `…Provider.test.tsx: 3` |
| 5 (half) | Deferral while hidden; renewal by adopted tokens | Tab visible; single tab | `…Provider.test.tsx: 7, 8, 9` |
| 6 | The read's own 429 exhausted | The filler refuses `/api/auth/me`, not this read | `…Provider.test.tsx: 6` |
| 7 | Ineligible during a delay | No hidden-tab or storage-waiting fault | `…Provider.test.tsx: 10, 11, 12` |
| 8 (half) | Retry disabled and refused while ineligible | Same | `…Provider.test.tsx: 14` |
| 9 | Session end and direct session change | Not asked of the sidebar by any browser case | `…Provider.test.tsx: 15a–d` |
| 11, 13 | The two settings pages | Administrator-only | `MainLayout.companyRecovery.test.tsx: scenario 13` |
| 12 | The mobile drawer | Harness runs at 1366 px | `MainLayout.companyRecovery.test.tsx: scenario 12` |
| 14 | A storage timeout around the read | Not a fault the harness injects | `…Provider.test.tsx: 12` |
| — | The focus ring's rendering | R2 focused the button programmatically | not covered; **unverified** |

## Browser-only items (jsdom cannot show these)

| Item | Expected | Actual | Status |
|---|---|---|---|
| Strip layout at 256 px (expanded) | One row under the 64 px header: icon, the wording, a Retry that fits | R2: `r2-first-load-strip.png` — the row sits under the header with the warning icon, the wording and a Retry; the header shows the "ERP" tile and no company line | met |
| Strip layout at 64 px (collapsed) | The tile, and the single icon button under it | R2: `r2-collapsed.png` — one icon button, `aria-label="Retry loading company details"`; exactly one was found | met |
| Tooltip rendering | "Company details unavailable. Retry", shown while the button is disabled | R2: the tooltip's text was exactly "Company details unavailable. Retry" (`r2-collapsed-tooltip.png`). The Vitest test covers the disabled state, which R2 did not reach | met |
| Keyboard focus ring | The collapsed button takes focus by Tab and shows the theme's focus ring | R2: the button took focus (`document.activeElement` was it, `r2-collapsed-focus.png`). The **focus ring** itself was not judged: the run focused it programmatically and did not Tab to it | **partly unverified** (focus met; the ring's rendering not judged) |

## What is deliberately not expected

- A number of requests. `requestWithRetryOn429` may send one read up to four
  times, and the runtime may send it again and a refresh behind it. **What is
  bounded is recovery attempts, not requests.**
- A number of refreshes in window 2, per tab or overall.
- Anything about `api_limit` or `session_limit` capacity.

## Recording rules

- An expectation that was missed is recorded `unmet`, with what happened. It is
  not reinterpreted afterwards, and it stops to ask the owner.
- A scenario that could not be exercised is recorded `unverified`, never `met`.
- Request counts and refresh counts are recorded on separate lines, and a
  refresh that follows an automatic retry or a quiet re-read is its own line.