# #1394: expectations, written before any browser run (2026-10-12)

Status of this file at the time of writing: **no run has been made.** Every
scenario below is an expectation, not a result. The *actual* and *status*
columns are filled in only by the runs recorded in `runs/`.

The runs will use the branch commit **`45155a5dc`** (the commit that carries the
sidebar, the strip and the layout). If a run is made on a later commit, this
file says so in the record before the run, and the commit it names is replaced
here.

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
| 1 | First read fails transiently, then succeeds | Placeholder; retries after about 2 s and 6 s as needed; branding appears without reload; no warning during recovery | `CompanySettingsRecoveryProvider.test.tsx: 1, 2, 3` | | |
| 2 | Read fails after an earlier success | Retained branding stays visible through recovery and after it stops | `CompanySettingsRecoveryProvider.test.tsx: 4` | | |
| 3 | Transient failures persist | Exactly two additional automatic attempts, then the strip; no further requests merely from hiding/showing the tab | `CompanySettingsRecoveryProvider.test.tsx: 3` | | |
| 4 | Read fails behind a failed/refused refresh | Warning immediately; no sidebar-driven automatic retry and no additional refresh | `CompanySettingsRecoveryProvider.test.tsx: 5` | | |
| 5 | Tokens renew successfully | One quiet re-read per affected tab, deferred while hidden; duplicate notifications and in-flight requests produce no duplicate reads; a renewal during an in-flight read is consumed and queues nothing; success removes the strip | `CompanySettingsRecoveryProvider.test.tsx: 7, 8, 9` | | |
| 6 | Read exhausts the existing 429 retries | No added automatic attempts; warning appears; manual Retry and renewal recovery remain available | `CompanySettingsRecoveryProvider.test.tsx: 6` | | |
| 7 | Tab becomes ineligible during a delay | No sidebar-initiated attempt while ineligible; the remaining delay and budget resume when eligible | `CompanySettingsRecoveryProvider.test.tsx: 10, 11, 12` | | |
| 8 | Manual Retry | Disabled while pending, and while the tab is ineligible, hidden included (the strip stays visible; the handler refuses too); success clears the strip; transient failure gets a fresh bounded cycle; refresh-blocked or exhausted-429 failure stops again | `CompanySettingsRecoveryProvider.test.tsx: 13, 14` | | |
| 9 | Session ends, or the session id changes directly | Retained branding, timers and recovery state clear in both cases; cached data and late results from the previous session cannot supply branding to the new one | `CompanySettingsRecoveryProvider.test.tsx: 15a–d` | | |
| 10 | Collapsed control | Keyboard reachable and operable; tooltip shown; accessible name "Retry loading company details" | `CompanyUnavailableStrip.test.tsx: collapsed` | | |
| 11 | Settings pages | `CompanySettingsPage` and `PrintSettings/GeneralTab` receive the cache update from a successful retry; no new UI on either | `MainLayout.companyRecovery.test.tsx: scenario 13` | | |
| 12 | Mobile drawer opened in any state, including stopped | No request is sent; the drawer's sidebar shows the same branding and strip as the permanent one | `MainLayout.companyRecovery.test.tsx: scenario 12` | | |
| 13 | A settings page opened while stopped | The page's own read is sent as today; success clears the strip; failure leaves it stopped and starts no automatic cycle | `MainLayout.companyRecovery.test.tsx: scenario 13` | | |
| 14 | A storage timeout around the read | Treated as transient; attempts paused until storage is eligible again | `CompanySettingsRecoveryProvider.test.tsx: 12` | | |
| 15 | An automatic retry or quiet re-read is answered 401 | The runtime's refresh is counted and reported; if it fails, recovery stops at once | `CompanySettingsRecoveryProvider.test.tsx: 17` | | |

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

### Window 2, the filler is stopped and each tab gets one sidebar navigation

(T2's own recovery action.) Counted **separately**: navigation reads, quiet
re-reads, refreshes, and token adoptions (a tab taking tokens another tab
renewed). Expected: all five tabs recover without a reload, and each tab that
is stopped and eligible makes one quiet re-read. **No number of refreshes is
expected**, per tab or overall: five tabs sharing a session may adopt one
coordinated renewal. The actual refresh count and the adoptions are reported as
observed.

Per-tab lines to fill in, each counted on its own:

- navigation reads: observed ______
- quiet re-reads: observed ______
- refreshes: observed ______
- token adoptions: observed ______
- own refresh (`refresh-sent` in the tab's trace): observed ______

## Browser-only items (jsdom cannot show these)

| Item | Expected | Actual | Status |
|---|---|---|---|
| Strip layout at 256 px (expanded) | One row under the 64 px header: icon, the wording, a Retry that fits | | |
| Strip layout at 64 px (collapsed) | The tile, and the single icon button under it | | |
| Tooltip rendering | "Company details unavailable. Retry", shown while the button is disabled | | |
| Keyboard focus ring | The collapsed button takes focus by Tab and shows the theme's focus ring | | |

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