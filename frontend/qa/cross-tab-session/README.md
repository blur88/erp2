# Cross-tab session browser QA (#1345)

On-demand, manual coverage of how several tabs of one browser profile share a
session. CI has no NGINX and no browser, so this is not a CI gate; one recorded
run is required before the frontend change merges, and its results go in the
pull request.

The Vitest suite proves the session logic against an in-memory storage fake.
This suite proves what the fake cannot: the real IndexedDB adapter (blocking,
abort, timeout), `BroadcastChannel`, the real backend and the rate limits of
the real ingress.

## Status

This section describes the suite, not a run of it, so that it stays true at
whatever commit it is read. **Recorded runs are listed in
`docs/modules/auth/SESSION_QA.md`**, each with its commit, its figures and its
exit status; **the run that gates a merge is in the pull request** that merge
belongs to. Nothing in this file says whether a run exists for the commit you
are reading it at.

What a reader of those records needs to know about how the suite judges:

- **Latency.** M1 and M2 are blocking. M3 and M4 are diagnostic. Their first
  10 / 20 ms targets were provisional and were **replaced, not met** (decision
  of the repository owner, 2026-10-06); the figures of the run that failed
  them stay on record, in this file and in every result the suite writes (see
  "The latency measurement").
- **W1.** A tab counts as usable only with its expected data on screen and an
  action working, without a reload or a new sign-in. A rendered shell with
  missing data is not usable (see "W1: the restored window").
- **W1's user.** W1 signs in as a non-administrator, and recovery through a
  page only an administrator can open does not count: the suite refuses such
  a step and the tab fails (see "Who W1 runs as").
- **W1 states no capacity.** It reports what was observed at each size and
  blocks at 5, 10 and 20 tabs, in all three rounds, on zero in-app recovery
  actions. The time it takes is reported against 5, 10 and 15 s and blocks at
  no size, and a 429 on a business request is counted and does not block (see
  "What W1 shows and what it does not").
- **#1353's acceptance is not a run of this suite.** It is five tabs in the
  user's own Firefox, measured by `device/restored-window.js` (see "Device
  acceptance"). What the suite records in Chromium on the QA host is separate
  evidence.
- **Whether a natural sign-out overlapped a request the ingress was holding is
  diagnostic in W1.** The blocking form of that condition is case 17, with
  induced delay.
- **Case 16 is not evidence until a recorded run has passed it.** Its unit tests
  are evidence about the judgement, not about the behaviour (see "Case 16").

Results of `cases.mjs --only ...`, of anything run with `QA_DIST_DIR`, and of
anything run with `QA_SUITE_OVERRIDE` are development results. They say so in
the file they write and are not evidence.

## What it does

`cases.mjs` runs sixteen cases and one workload in headless Chromium. "Two
tabs" always means two pages of **one** browser context (one profile, one
IndexedDB, one `BroadcastChannel` namespace). Each case states its pass
condition in a comment above its `run()`.

| # | Case | File |
|---|---|---|
| 1 | Two-tab sign-out | `cases/signout.mjs` |
| 2 | Stale write-back | `cases/signout.mjs` |
| 3 | Drafts | `cases/signout.mjs` |
| 4 | Reload and session restore | `cases/signout.mjs` |
| 5 | User switch | `cases/switch.mjs` |
| 6 | Same-user sign-out and sign-in | `cases/switch.mjs` |
| 7 | Simultaneous refresh | `cases/refresh.mjs` |
| 8 | Use past real expiry | `cases/refresh.mjs` |
| 9 | Holder paused, resumed inside grace | `cases/refresh.mjs` |
| 10 | Holder paused, resumed after grace | `cases/refresh.mjs` |
| 11 | Holder paused, resumed after further rotations | `cases/refresh.mjs` |
| 12 | Tab paused mid-transaction | `cases/storage.mjs` |
| 13 | IndexedDB unavailable | `cases/storage.mjs` |
| 14 | Old bundle (no protocol marker) | `cases/marker.mjs` |
| 15 | Resume without a channel message | `cases/signout.mjs` |
| W1 | Restored window: N tabs opened at once, N = 5, 10, 20, as a non-administrator | `lib/w1.mjs`, `lib/usable.mjs`, `lib/access.mjs` |

`measure.mjs` measures what the reconcile gate costs (M1 to M5, below).

A case fails if any of its pass conditions is false, if it throws, or if any
request outside the sign-in routes is answered 429 (W1 excepted: it exists to
count them). Nothing is retried to make a case pass. W1's recovery of a tab
whose data failed to load is not such a retry: it is bounded, it is what the
definition of "usable" asks to be measured, and every action is recorded. The
suite sends no request again by itself; the one automatic retry W1 sees is the
application's own, of the company settings, and W1 records it.

## Running a recorded run

```bash
export QA_USERNAME=... QA_PASSWORD=...        # the user the cases sign in as
export QA_USERNAME_2=... QA_PASSWORD_2=...    # a second user, for case 5
export QA_USERNAME_3=... QA_PASSWORD_3=...    # W1's user: not an administrator
frontend/qa/cross-tab-session/run.sh "$(hostname -I | awk '{print $1}')"
```

`run.sh` refuses a loopback address however it is written (`localhost` and
names under it, anything in `127.0.0.0/8`, `::1`, and a host name that
resolves to one of those or to nothing: a loopback origin is a secure context,
where conditions differ), the unspecified address (`0.0.0.0/8`, written as `0`
too: the host reaches its own ingress through it and the browser container
does not), any port (port 3000 bypasses the ingress and its
limits), missing credentials, a working tree with any uncommitted change (tracked or untracked),
and less than 3 GB of free disk. It then:

1. restores a capture left by an earlier run, and captures the running
   configuration with `stack.sh show`;
2. has its traps in place before anything is changed: once the configuration
   is captured, every way out of the script, a failed command and `HUP`, `INT` or
   `TERM` included, restores the stack and writes `results.json`;
3. builds and starts the stack with `stack.sh qa-up`, which also checks the
   access lifetime by behaviour, and refuses unless the served `erp-build`
   equals `HEAD`;
4. runs the cases and W1 in `mcr.microsoft.com/playwright:v1.63.0-noble` with
   `playwright@1.63.0` installed into the scratch directory (a failed install
   fails the run);
5. restores the stack and measures latency with `measure.mjs` under the
   restored configuration;
6. writes `results.json` to the scratch directory (outside the repository) and
   prints a summary.

The exit status is that of the first failure; nothing later clears it
(`lib/run-guard.sh`):

| Status | Meaning |
|---|---|
| 0 | The script reached its last line and nothing failed. No other way out gives 0. |
| 1 | A case, W1 or the latency measurement failed; or a refusal; or the script was aborted (a command failed outside any handled failure, or it stopped before its last line); or `results.json` could not be written. |
| 3 | The stack was not restored, and nothing had failed before that. |
| 129 / 130 / 143 | Hung up (`HUP`) / interrupted (`INT`) / terminated (`TERM`). The stack is still restored and `results.json` still written. A signal that arrives while the stack is being restored is acted on after the restore has finished. |

`results.json` carries the same status, `completed` (whether the last line was
reached) and, when it was not, `aborted` with the reason. A run that was
interrupted or aborted is never reported as passed, in the file or by the
status.

```bash
bash frontend/qa/cross-tab-session/run-status.test.sh   # the status rule, the address refusals, the health wait; no Docker
```

A full run takes roughly half an hour to 40 minutes, about half of it W1: its
drain waits, and the check of every tab of rounds (a) and (b) one at a time,
recovery included.

A recorded run always goes through `run.sh`. `maintain.sh` and a plain
`docker compose build frontend` do not export `VITE_BUILD_SHA`, so their bundle
shows `unknown` and `run.sh` refuses it.

`restore` puts back the two configuration values only. The images stay the ones
built from the commit under test; the run does not put the previous images
back.

## What it needs

- Docker, the running stack, and the Playwright image above (about 2 GB).
- **Three accounts, given through the environment and never committed:**
  `QA_USERNAME` / `QA_PASSWORD`, `QA_USERNAME_2` / `QA_PASSWORD_2` and
  `QA_USERNAME_3` / `QA_PASSWORD_3`. None may be flagged to change its
  password at first sign-in: that redirect blocks every case. Use accounts
  made for this purpose; the run signs them in about thirty times and ends
  their sessions.
  - `QA_USERNAME` and `QA_USERNAME_2` are used by the sixteen cases and the
    latency measurement. Both must be able to open the dashboard, the product
    list and sales orders.
  - `QA_USERNAME_3` is W1's user and must have the role **`sales_staff`**. It
    must not be an administrator: W1 reads the role from the stored session
    and stops if it is `admin`. `sales_staff` is the role the backend gives a
    new user when none is named (`CreateUserDto`), and it is shown fifteen
    pages: the dashboard, the three Sales pages and the eleven Accounting
    pages. Another non-administrator role works only if it is shown *Sales >
    Sales Orders* and *Sales > Customers*, which W1 follows (`manager` is);
    W1 stops with that reason otherwise.
- **At least one customer** visible to `QA_USERNAME_3`. W1 asks every tab to
  open the customer list and show its rows; it checks this once, before the
  first round, and stops if the list is empty. The suite only reads.
- **The company settings have a name**, if the sidebar's company name is to be
  checked on screen. Without one the sidebar has nothing to show and only the
  request is judged.
- About thirty sign-ins. They stay on `login_limit` (four, then one every
  12 s per address): `ctx.signIn` waits and retries on 429 for up to 90 s, and
  `results.json` records how many waits there were (`signInWaits`). The limit is
  not raised or bypassed. The login page's own `show-default-credentials`
  request is in the same zone, so each visit to the login page spends from the
  same budget; 429s in that zone are counted (`loginZone429`), not failed.
- `host-probe.sh`, which `run.sh` starts and stops. Case 14 has to show that a
  refused sign-in created no session, no API route exposes a user's session
  count, and the Playwright container cannot reach `psql`; the probe answers
  that one read-only question from the host through files in the scratch
  directory.

## The two QA values

`stack.sh qa-up` starts the stack with an access-token lifetime of **20 s** and
a refresh grace of **5 s**, so cases 8 to 11 and W1 can observe expiry,
rotation and replay in seconds. **These are not production values** (15 minutes
and 60 s by default). `run.sh` captures the values that were running before the
run and `stack.sh restore` puts exactly those back.

The cases read both values from `stack.sh show`; neither number is written into
a case. `qa-up` verifies the lifetime by `printenv` and by behaviour
(`stack.sh verify`: a sign-in through the ingress, `accessTokenExpiresAt` minus
the response's `Date` header, 20 s ± 3 s). The grace is verified by `printenv`
and proved by outcome: in case 9 a paused tab's superseded token arrives 3 s
after it was superseded and the session continues; in case 10 it arrives 8 s
after and the session is revoked. If case 9 passes and case 10 fails, check the
grace value first.

## How the cases do what they do

- **Pauses** are the debugger's (`Debugger.pause` / `Debugger.resume` over CDP).
  `Page.setWebLifecycleState: frozen` does not stop a headless tab. Every pause
  case asserts that a 20 ms interval counter in the paused tab advanced by at
  most 3.
- **Cases 9 to 11** need the paused tab to send a token that has been
  superseded meanwhile. The tab is made to refresh (the script answers its next
  data request 401), its `POST /auth/refresh` is held inside the browser, and
  the tab is paused at that point: a tab that froze just as it was about to
  send. The other tab rotates the session (after waiting out the first tab's
  20 s refresh lease), and the held request is released a set time after that
  rotation.
- **Case 12** pauses a tab inside a read-write transaction on the session
  store, using the same database, store and keys as the adapter. The evidence
  that another tab's operation timed out comes from the application's own
  timing recorder, switched on for that profile.
- **Forced 401s** (cases 6, 7, 9 to 11) are answered by the script for one data
  request of one tab; the refresh that follows is the real one.
- **Case 7** has to show that two tabs refused at the same moment produce one
  rotation. A tab's first data request after a move can leave it a second
  after another tab's, which is longer than a refresh takes, so answering each
  tab's next request 401 as it comes does not make the 401s overlap: the
  second tab may by then be sending with the new token, and refreshing again
  is then correct. So the script keeps one data request of each tab unanswered
  until it holds both, checks that nothing has rotated, and answers both 401
  in the same turn. The case then requires that both refused requests carried
  the starting access token, that both 401s were delivered before the first
  refresh was answered, and that exactly one rotation happened: every refresh
  presented the starting refresh token and was answered with the next
  generation (the other tab adopting, or recovering with the same token inside
  the grace). A second rotation fails it. `timeline` in the case's record
  holds the times, token fingerprints and statuses, pass or fail.
- **Cases 9 to 11 judge the held refresh itself**, not only where the tabs end
  up: it was sent and answered by the server, it presented the superseded
  token, and it was let go inside the configured grace and answered 200 (9,
  11a) or after it and answered 401 (10, 11b). The grace is read from the
  stack configuration.
- **Cases 1 and 3 prove the channel.** A signed-in tab polls through the
  request gate every 30 s, and a poll would tell it of a sign-out by itself.
  Both cases start right after one of tab B's polls, give B 5 s, and require
  that B sent no request between the sign-out and its redirect. A B that
  learned of the sign-out from a request of its own fails; a pass means the
  `BroadcastChannel` message did it. (Cases 2, 4 and 15 remove the channel on
  purpose and prove the other paths.)
- **Case 5 identifies user X's data by provenance, not by content.** The two
  users of the cases may see the same customers, so "no cached X data
  appears" is judged by which request produced what is on screen. X loads the
  customer list in a tab; after the switch Y signs in in that same tab,
  without a reload, and opens the list while the script keeps the tab's data
  requests unanswered. The tab must send a fresh request under Y's token and
  show no row until it is answered; every data request answered to the tab
  must have been issued after Y's sign-in under Y's token. X's other tab must
  end on the login page.
- **Moving a tab inside the application** is `history.pushState` plus a
  `popstate` event, which is what the router listens to. No case reloads a tab
  except case 4, where the reload is the subject.
- **Case 15's events are synthetic.** `visibilitychange` and `pageshow` are
  dispatched by the script in a tab whose `BroadcastChannel` was removed. That
  proves the listener and the real storage adapter together; it does not prove
  the browser's own tab freezing or back/forward cache.
- **Case 14** sends its requests with `fetch` from the page. The registration
  probe is sent only if the unmarked sign-in was refused: against a server that
  does not enforce the marker it would create a real user, and the case has
  already failed by then.
- **Case 16 sends requests close to an access token's expiry**, so that the
  ingress's delay carries them past it. See its own section below.

## W1: the restored window

One profile holding a stored session opens N tabs at the same moment, for
N = 5, 10 and 20, three times each: (a) with a current access token, (b) with
an expired one, (c) with one tab signing out while the others load. Each round
starts from an empty `session_limit` bucket; the drain wait is computed from
the rate and burst in `nginx/nginx.conf`.

### What W1 shows and what it does not

W1 shows that the tabs of a restored window coordinate their refresh and that
a restored window puts little load on `session_limit`. It does not measure the
capacity of that zone, which is never approached, and it does not establish
how many tabs a restored window can hold: that is bounded by the general
`api_limit` (issue #1353).

The suite prints that sentence with every W1 summary and stores it as
`w1.recorded.judgement.scope`. **W1 states no tab capacity**, and nothing in
its results may be read as one.

How each round reaches the session zone (`refresh`, `logout`, `me`):

- **(a)** Current tokens: there is nothing to refresh, and the application
  sends no `/auth/me` on load. The round normally sends nothing to the zone.
  The round counts as "current token" only if the stored access token had
  time left when the tabs opened; at N = 5 that is a blocking check.
- **(b)** Every tab starts with an expired access token: one tab takes the
  lease and refreshes, the others adopt its tokens.
- **(c)** As (b), plus the explicit `logout` of the tab that signs out.

So what a round sends to the zone is one refresh, a logout in (c), and
whatever a tab adds by recovering; it is not expected to grow with N. The
summary prints the count by route and the peak accumulated demand beside the
configured burst, so a reader sees how far from the limit the round stayed.

For each round `results.json` holds the send time and status of every request
to `refresh`, `logout` and `me`, the total, per-route and per-tab counts, the
busiest one-second interval, the peak accumulated demand `E`, the number of
429s and the end state of the tabs. `E` replays the NGINX bucket over the send
times (`peakDemand` in `lib/stats.mjs`, exported from `measure.mjs`); NGINX
admits the whole round exactly when `E ≤ burst + 1`. The busiest second is
recorded but is the wrong measure for sizing.

`w1.recorded.judgement.observed` and the printed summary state, per size and
round, what was observed: the session-zone requests by route, the 429s among
them, the peak accumulated demand against the configured burst, the usable
tabs, the tabs complete on first load, the recovery actions and the
business-endpoint 429s; for round (c), the tabs on the login page without a
reload and how many tabs were still loading at the sign-out.

### What "usable" means

Decided by the repository owner on 2026-10-06, and implemented as written:

> "Usable" means the tab reaches a working state without reloading or signing
> in again, with its expected data available and actions working. It does not
> require every initial request to succeed. Record any retries or user actions
> needed to recover; a rendered shell with missing data is not usable.
>
> The separate requirement of no session-endpoint 429s at five tabs remains
> blocking. Business-endpoint 429s remain documented under #1353, provided
> recovery meets the definition above.

### Who W1 runs as

W1 first ran as an administrator, and passed at N = 5 only because of that:
when the sidebar's company request was refused, the one way to get the data
back was the Company settings page, which only an administrator is shown. The
owner decided, the same day:

> Update W1 to exercise a non-administrator with representative permissions
> and verify recovery without visiting administrator-only pages. If other
> panels remain unusable, report those failures; don't silently broaden this
> into global HTTP retries.
>
> Administrator-only recovery does not satisfy W1 for ordinary users.

So W1 signs in as `QA_USERNAME_3`, a `sales_staff` user, and:

- **The pages that user can open are read from the application**, not listed
  here: `lib/access.mjs` reads `menuSections` and the role lists in
  `frontend/src/config/navigation.tsx`, the one place that says which role is
  shown which page (`router.tsx` puts no role on a route, so a page whose link
  a user is not shown is a page that user has no link to). Before the first
  round W1 opens every section of the sidebar and stops unless the titles on
  screen are exactly the ones read from the file for the user's role.
- **A step outside that set is refused.** Every sidebar link W1 follows, in
  recovery and in the action, is looked up in the role's menu before anything
  is clicked. A link the role is not shown is not followed
  (`RecoveryRefused`), and the tab is recorded not usable with that reason.
  The same happens if a click ends on a path outside the set.
- **The suite adds no retry.** It follows links; it never sends a request
  again. The application retries one request itself after a 429,
  `GET /api/settings/company` (`store/api/settingsApi.ts`,
  `services/retryOn429.ts`: up to 3 times, after 250-500, 500-1000 and
  1000-2000 ms). W1 sees those repeats in its request log and records them.

### How a tab is judged

After a round has played out, `lib/usable.mjs` takes its tabs one at a time,
as a person would work through a restored window:

1. **Expected data: the page.** The tab is at `/dashboard`, the "Dashboard"
   heading is rendered (the page renders it only when none of its six queries
   is still loading), the page shows no "Could not load: ..." warning, and no
   data request the tab made is left failed: for every request, by method,
   path and query, the latest answer is 2xx.
2. **Expected data: the shell**, which is on every page.
   - *Company data.* The sidebar's company name and logo come from
     `GET /api/settings/company`. When that request fails the sidebar silently
     shows its "ERP" placeholder. The tab has it when the latest answer to
     that request is 2xx and the sidebar shows the name the server answered.
   - *Regional settings.* `useRegionalSettings` (mounted once, in
     `RootLayout`) asks `GET /api/settings/regional` and copies the date,
     time and number formats, the currency, the time zone and the first day
     of the week into `localStorage`; every formatter and date picker reads
     them from there and falls back to built-in defaults when a key is absent.
     So this request is judged **by its effect, not by its status**: the tab
     has the regional settings when the values in its `localStorage` equal the
     ones the server answered. See "What a refused regional-settings request
     does" below for why, and for what that leaves out.
3. **Recovery**, only if data is missing, and only by what the user can do
   without a reload, a URL load or a sign-in. The dashboard has no retry
   button, so the action is the one a person has: *Sales > Sales Orders, then
   Dashboard*. Opening the dashboard again asks again for what the dashboard
   asked for and did not get. At most three per tab. Before each one the
   script waits until `api_limit`'s bucket, replayed over what the profile
   sent, has room for a page of requests, so recovery does not itself run
   into the limit. Shell data is different: the sidebar and the root layout
   never leave the screen, so no page change asks for it again. When shell
   data is all that is missing, one round trip is made (it is what a person
   would try, and it is the evidence) and then no more.
4. **An action.** *Sales > Customers* through the sidebar: the click must send
   a fresh request for the list, it must be answered 2xx, and the rows must be
   on screen (not a skeleton, not the empty message, no "Failed to load
   customers."). Up to three tries, each by leaving and coming back.

A tab is usable only if all of that ends with the data present and the action
working, in the same document it first loaded. A tab that cannot be recovered
within the bound is **not usable**; nothing is retried beyond the bound to make
it so, and at N = 5 it fails W1.

For each tab `results.json` holds:

- whether its data was complete on first load, and by name what was missing
  (`firstLoad.missing`);
- `company`: the status and send time of every `GET /api/settings/company`,
  whether the data came on the first request, after the session's renewal
  only (a 401, then the data), or by the application's retry after a 429, how
  many retries were sent, how long from the first refusal to the data
  (`automaticRetryWaitMs`), and whether the retries were used up;
- whether its own regional-settings request was refused, and what was then
  wrong with the formats, if anything;
- every manual recovery action (what, why, how long it waited for the limit,
  how long it took, what was still missing after it), and the time until the
  data was there;
- `notRecoverableByRole`: each piece of data the user had no way to get back,
  by name, with the reason;
- each try of the action, a refused step if there was one, and the verdict.

For each round it holds the same things counted over its tabs, and
`dataNotRecoverableByRole`: each such piece of data with the tabs it was
missing in. `w1.recorded.user` holds the role, the pages it can open and the
pages closed to it; `w1.recorded.judgement.dataNotRecoverableByRole` lists
every loss at every size.

### What a refused regional-settings request does

Looked at in the running application on 2026-10-06, as the `sales_staff`
user, with the server's date format `DD-MM-YYYY` (the built-in default is
`DD/MM/YYYY`) and `GET /api/settings/regional` answered 429 by the script:

| The profile's `localStorage` | What the tab showed |
|---|---|
| already holds the values (an earlier load of the same profile stored them) | exactly what a tab whose request succeeded shows: `02-10-2026`, `MYR 100.00`. No message. |
| holds none (the first load of the profile was the refused one) | the defaults: the same order list showed `02/10/2026`. No message, no error. |

In the second case the user then opened every one of the fifteen pages the
role is shown; none asked for the regional settings again, and the keys were
still absent at the end. The pages that do ask again are the product pages and
three settings pages, and a `sales_staff` user is shown none of them.

`localStorage` belongs to the profile, not to the tab, and W1's profile has
loaded the application once (the sign-in) before the tabs open, as a restored
window has. So in W1 a refused regional request normally leaves nothing
missing, and that is what the check says: such tabs are counted
(`tabsRegionalRequestRefused`) and are not failed unless the formats are in
fact wrong (`tabsRegionalNotInEffect`). What W1 does **not** exercise is a
profile whose storage is empty or out of date: there the refused request does
change what is on screen, and an ordinary user cannot repair it without a
reload.

Two more things about this check that a reader should know:

- **The company data cannot be recovered by an ordinary user** once the
  application's retries are used up. That is not folded into anything: the tab
  is not usable, the data is named in `notRecoverableByRole`, and at N = 5 W1
  fails.
- **The status indicator is not judged.** It polls `/api/health` every 30 s
  and repairs itself; 429s among its polls are counted per tab
  (`statusPolls429`).

### What blocks

At N = 5, 10 **and** 20 (`lib/w1-judgement.mjs`, `blockingChecks`):

- in rounds (a), (b) and (c), no request to `refresh`, `logout` or `me` is
  answered 429 (in the round itself or while its tabs are checked). For round (c)
  the check names the attempt, so a failure says which one;
- in rounds (a) and (b), every tab is usable for the non-administrator by the
  definition above: without a reload, a new sign-in or a page outside the
  role's set;
- in rounds (a) and (b), **no in-app recovery action**: no tab was made usable by
  the user navigating. "Without a user action" is this and not the absence of a
  failure message, because the script's own recovery is a navigation through the
  sidebar, which is a user action by any reading;
- **not blocking since 2026-10-09:** in rounds (a) and (b), when the last tab
  held its expected data, reported against 5 s, 10 s and 15 s from the common
  tab-opening trigger (#1359). Until then all three blocked, and the runs
  recorded before stay judged as they were. #1353's 8 s belongs to the device
  measurement below; a figure taken in Chromium on the QA host is a different
  environment and is not read against it. A tab
  that never did is a miss, not a small figure: the watch runs thirty seconds
  past the deadline rather than being cut off at it, and a completion is read
  only when the tab has its data *and* no business request without an answer;
- round (a) started with a current access token and round (b) with an expired
  one;
- in round (c), the sign-out sent its `logout` and it was answered 2xx, and
  every tab is on the login page afterwards in the document it first loaded
  (no reload);
- in round (c), **the sign-out overlapped at least one delayed request**: a
  request the limiter was still holding, begun before the `logout` went out and
  not ended when it began, both read from the ingress log and both on the
  ingress's own clock. A round where no attempt did is inconclusive, not
  passed, and the run fails. Such a round may be set up again - at most three
  attempts, and only when every behavioural gate of the attempt passed. A
  behavioural failure in any attempt ends it at once, and every attempt keeps
  its own entry with its full measurements.

A size that was not run fails W1: the deadlines are acceptance targets at every
size, and a size that is missing has met none of them.

429s on business endpoints are a different limit (`api_limit`): several
dashboards loading at once send more data requests than any per-address limit
admits at once. Since #1353 that limit **delays** the excess rather than
refusing it (20 r/s, `burst=40 delay=20`, provisional until these deadlines are
met). Those 429s are counted and reported at every size and are not a gate: "429
counts are diagnostic" means business requests only, and a 429 on a session
route fails the run above.

## Device acceptance (#1353): five tabs, 8 seconds, the user's own Firefox

What #1353 is accepted on, agreed on 2026-10-09 **before** the measurement was
made: five tabs opened together in Firefox on the user's normal device, against
the server, each holding its expected data within **8 s** of the common
tab-opening trigger, with no recovery click, once with a current access token
and once with an expired one; and a sign-out that takes all five tabs to the
login page. The 8 s includes authentication, retries and rendering. It is not
raised to fit a result. The stack runs its normal configuration (15-minute
access tokens, 60 s refresh grace), not the QA values.

`device/restored-window.js` is the measurement. It is pasted into the browser's
console, not run by the harness, so nothing is installed on the device. It
opens the five tabs from one click and watches each from inside its own page:
a tab is complete when it is on the dashboard, its heading is rendered, no
"Could not load" notice is shown, the sidebar shows the server's company name,
the stored regional formats are the server's. A refused request decides
nothing by itself: retries the application makes are allowed, and a request
left without a successful answer is listed beside the verdict
(`requestsLeftFailed`), not in it. It counts key presses and clicks in the tabs (any makes the round
void), notices a reload, and reads only the expiry time of the stored token,
never a token. `device-acceptance.test.mjs` tests its judgement without a
browser.

**Procedure**

1. Firefox on the device. Close every tab of the application. Sign in at
   `http://<server>/` - port 80, the ingress; **not** port 3000, which reaches
   the backend without it.
2. Open `http://<server>/env-config.js` in a tab. Allow pop-ups for the site
   (the address bar offers it at the first blocked window; if it did, close
   what opened and press the button again - that round is void).
3. Open the console (F12), paste the whole of `device/restored-window.js`,
   press Enter. Firefox asks for `allow pasting` to be typed once first.
4. Close the tab used to sign in. Press **1. Prepare**.
5. Press **2. Current-token round** and do not touch the tabs it opens; it
   closes them itself.
6. Press **Negative check: the last loading round against 1 ms** (it shows
   something only after a round that passed) and **Negative check: a page that
   never completes**.
7. Leave only the control tab open for more than 15 minutes. Press **Token
   state now** until it reads `expired`; the round is void if it does not. Then
   **3. Expired-token round**.
8. Press **4. Sign-out round**. It signs the session out.
9. Press **Copy result** and keep the JSON, with the Firefox version
   (`about:support`) and what the device is.

A round reads PASS, FAIL or VOID. A void round measured nothing and is
repeated; a failed round is recorded and not repeated to get a better one.

**What the ingress did meanwhile** (diagnostic; it never decides a round):

```bash
docker logs --since 2h erp_nginx 2>/dev/null | node frontend/qa/cross-tab-session/device-diagnostics.mjs
```

It finds each round by the two markers the script sent and reports the `/api`
requests between them from that address: statuses, how many were delayed, and
every refusal with the limiter and zone that made it.

## Case 16: a token that expires while the ingress delays the request

The limiter delays excess `/api` requests rather than refusing them, so a
request sent just before its access token expires can reach the backend after
it has. W1's rounds cannot show this: they start every tab either with a
current token or with one that has already expired, never with one that expires
while the ingress is holding its request.

**The claim, in three parts, and the evidence for each.**

1. *L carried a known token.* The fingerprint of the stored access token, the
   fingerprint in the browser's record of L, and the fingerprint in the capture's
   record of L are equal. "Before the first refresh" is not evidence of
   anything: it is the fingerprints that say the three records are of one
   request with one token.
2. *L's 401 was an expiry.* The backend's own message must be exactly
   `Invalid or expired token` (`JwtAuthGuard.handleRequest`), which rules out
   every rejection `JwtStrategy.validate` makes with a message of its own
   (revoked session, missing user, inactive or locked account), **and** the
   backend must have accepted the same fingerprint with a 2xx earlier in the
   attempt, which rules out a malformed or wrongly signed token.
3. *L had expired when it reached the backend*, not merely when authentication
   ran: a request `X` with the same fingerprint, answered
   `Invalid or expired token`, had its response completely leave the backend
   before the first byte of L arrived.

**The two orderings, each inside one clock.** No clock is compared with
another and no offset between clocks is measured or claimed.

- *Valid at send* (ingress clock, plus two causal steps): a request `P` with the
  same fingerprint, answered 2xx, reached the ingress after L did
  (`L.startMs + 5 ms ≤ P.startMs`). L left the browser before the ingress read
  its first bytes; the backend judged P valid after the ingress read P's.
- *Expired at arrival* (capture clock): `X.answeredLastMs + 1 ms ≤
  L.arrivedFirstMs`. The backend had already judged that token expired before L
  reached it. Both ends are the conservative ones: the last frame of X's
  response, the first frame of L's request.

`P` and `X` are `GET /api/auth/me` probes sent by the harness with the stored
token. `/auth/me` is on `session_limit`, which does not delay.

**The margins** (5 ms ingress, 1 ms capture) exist so that timestamp
granularity cannot produce an ordering: `$msec` and `$request_time` are both
written to the millisecond, and frame timestamps come from the kernel at
microsecond resolution or better. They are not a bound on clock error.

**Scope of the inference.** It holds for a controlled run with the backend's
token verification configuration unchanged, recorded with the attempt, and with
no clock stepping during it. The backward-movement check can reveal a clock
that moved backwards and cannot show that none stepped: a forward step, or a
backward one smaller than the gaps between records, passes it. "No clock
discontinuity" is a stated prerequisite of the run, not something it proves.

**What the case does not show.** One page, one role. It says nothing about
behaviour when the limiter *rejects* a request, which is what
`nginx/verify-rate-limits.sh` covers instead, and nothing about tabs other than
the one it opens.

The case is not described as validated here: it becomes evidence when a recorded
run has passed it. `results.json` carries each attempt's verdict, its reason and
the segment it used, and `finalize.mjs` judges every segment itself: a segment
that never ended, one the capture tool dropped packets in, or one with an
unreadable record inside the window invalidates an attempt the case called
`pass`, whatever the case concluded.

### How an attempt is run

The proof above says what has to be observed. This is how an attempt goes about
producing it, and what it checks about itself before its evidence is read. The
logic is in `lib/expiry-evidence.mjs` and is tested on the records of a real
attempt (`fixtures/case16-attempt-7a632336b.json`).

- **Three browser contexts.** The application tab, the fillers and the probes
  each run in a context of their own, and a context has its own pool of six
  connections per origin. In one context the probes and the tab queue behind the
  fillers: the tab then arrives after the limiter has stopped delaying, and the
  probes arrive in a bunch (that is what the attempt in the fixture shows).
- **One bucket, checked.** The limiter is keyed on the client address. Every
  attempt reads from its ingress log that the tab, the probes and the fillers
  reached the ingress from one address, and from the capture that everything
  came from the ingress. If not, the attempt is inconclusive.
- **Probes on schedule, checked.** From their arrival times at the ingress: they
  must span most of their window with no neighbours far further apart than they
  were sent. Bunched probes cannot bracket an expiry.
- **Fillers.** 160, queued continuously, 3.5 s before the tab is due. Measured
  in the feasibility run: requests queued through one context reach the ingress
  at about 28 a second against a zone rate of 20, so the limiter's excess needs
  about 70 requests and 2.4 s to pass its delay threshold.
- **L, X and P come from the evidence.** L is whichever request of the tab the
  limiter delayed and the backend refused, whatever its path; X and P are the
  probes that bracket it. Only those three are correlated across the three
  sources, but the checks over everything the attempt sent are kept: capture
  health, unreadable records, a request no context sent, a request the ingress
  forwarded that is missing from the capture.
- **Recovery** is timed on the browser's clock from the tab's first 401 on a
  data request to the tab holding its data, against the deadline calculated
  and recorded before the first attempt.
- **Only a 401's message is kept** from a response body, never another field.

### The scheduling rule between attempts

An attempt can show everything except *valid at send* when the tab is navigated
too late: its request then reaches the ingress after the last probe the backend
still accepted, and may already have carried an expired token there. That is a
missed setup, not a behaviour, and the next attempt corrects for it:

> next lead = current lead + (L's arrival at the ingress − P's arrival at the
> ingress) + 150 ms, when that difference is positive; otherwise unchanged;
> never more than the filler lead less 800 ms.

`nextNavigateLead` in `lib/expiry-crossing.mjs`. The lead starts at 300 ms
before the expiry, less the tab's measured time to its first request.

What the rule does and does not do:

- It changes **when the tab is sent**, from two arrival times the previous
  attempt recorded on the ingress clock. It never looks at a verdict and cannot
  produce one.
- It changes nothing about what counts as evidence: the margins, the message
  check, the fingerprints, the capture checks and the deadline are the same in
  every attempt.
- It only moves the tab earlier, and stops at its cap, so the tab is never sent
  before the fillers have started.
- **The bound is still five attempts.** A case that has not shown the crossing
  in five is inconclusive, which fails the run. A behavioural failure in any
  attempt ends the case as a fail at once and is never set up again.
- The window it is aiming at is narrow: the limiter held L for about 0.4 s in
  the attempts recorded so far, and probes are 150 ms apart. On `650ef081c` the
  leads were 300, 541 and 737 ms and the third attempt showed the crossing; on
  `721b7107f`, without the rule, none of five did.

## Case 17: sign-out under induced delay

**This is an induced-delay scenario.** It is not W1 and it is not a restored
window. Filler traffic from another browser context keeps the ingress limiter
delaying while several tabs of one signed-in profile load and one of them signs
out.

Why it exists apart from W1: W1's sign-out round was first required to show a
delayed request outstanding at the sign-out. In the recorded runs that condition
mostly never arose at ten and twenty tabs, because the tabs' own requests reach
the ingress more slowly than the zone rate and the limiter delays almost
nothing, whenever the sign-out happens. W1 was failing on a condition its
workload does not produce. Since the amendment of 2026-10-09:

- **W1's natural sign-out rounds** keep their session and end-state gates (no
  429 on a session route, the logout answered 2xx, every tab on the login page
  without a reload) and run once per size. Whether a delayed request overlapped
  the sign-out is a **diagnostic** there, reported per size as an overlap,
  overlap absent, or evidence missing.
- **Case 17** is where the condition is a gate.

**The evidence starts at the sign-out, not at the logout request.** The
application aborts its in-flight requests when its session ends, before it sends
the logout. That is valid behaviour, and it means a held request "outstanding
when the logout reaches the ingress" is a state the application is built not to
be in: the case's first run (`f2ce87c67`) looked for exactly that and found it
once in nine attempts, by a race of a millisecond.

It passes, at each of 5, 10 and 20 application tabs, only with all of:

1. the harness recorded when the sign-out was **initiated** (the click on
   *Logout*), and a data request of the application that was still pending
   immediately before it;
2. **the same request**, by its identifier, has a line in the ingress log that
   says the limiter was delaying it (`DELAYED`);
3. what became of it is recorded: answered, or cancelled **by the sign-out**. A
   cancellation is the sign-out's only when nothing else explains it: the
   harness had not begun closing the tabs, the request's tab kept the document
   it first loaded (so it was not a navigation), and the abort fell between the
   sign-out and two seconds after the logout was answered. A request cancelled
   before the sign-out was not pending at it and is not evidence, however close
   to the logout the ingress shows it;
4. the logout sent and answered 2xx, and no request to `refresh`, `logout` or
   `me` answered 429;
5. every application tab on the login page, in the document it first loaded,
   and none of them showing stale data of the session (the user menu or the
   dashboard) two seconds later.

Missing correlation is inconclusive: a pending request with no ingress line, or
one the limiter did not delay, or one whose end was not recorded, proves
nothing. A count of requests the ingress shows aborted in the 0.3 s before the
logout is recorded with every attempt as corroboration; it decides nothing,
because it cannot tell what cancelled them.

Also read from every attempt's ingress log, and inconclusive when not so: that
fillers reached the ingress at all, and that they and the application came from
one address, which is what puts them in one limiter bucket.

**The fillers are sent by the harness's own Node process**
(`lib/node-fillers.mjs`), not by a browser: 40 unauthenticated `GET` requests a
second to a route under `api_limit`, never more than 12 outstanding, each with
its own `fill-*` identifier, bounded in number and in time, and stopped on every
way out of an attempt and of the case. The backend answers them 401 at once;
what matters is that the ingress counts them. Why not a browser context: at
twenty tabs the browser is too busy for fillers sent from it to keep the
limiter's excess up (on `f2ce87c67` the excess was above the delay threshold
for 6 to 10% of the six seconds before the logout at twenty tabs, against 76 to
93% at five). This changes the load generator, not the application workload the
scenario makes its claim about.

An attempt that behaved and lacked the evidence may be set up again, at most
three attempts per size. No application delay observed is a missed setup, not
an application failure. A behavioural failure fails at once and is never set up
again. Every attempt is recorded.

**What it does not show:** that a restored window makes the limiter delay by
itself (on the evidence so far, at ten and twenty tabs it usually does not);
anything about the completion deadlines; more than one page and one role.

## The latency measurement

| | What | Status |
|---|---|---|
| M1 | one raw read, one tab idle (500 read-only transactions fetching the three keys) | **blocking**, p95 ≤ 5 ms |
| M2 | the same in four tabs at once while a fifth commits a write every 100 ms | **blocking**, p95 ≤ 15 ms, and the writer committed in every repetition |
| M3 | the adapter's own `read` timings while the dashboard, the products list and a sales order load | diagnostic: recorded, not judged |
| M4 | per request, `gate-before` + `gate-after` | diagnostic: recorded, not judged |
| M5 | per page: navigation to last API response, number of requests, sum of gate waits | diagnostic: recorded, not judged |

Each blocking figure is the **median p95 of three repetitions**. M2 measures
reads under contention, so it counts only if there was some: a repetition in
which the writing tab committed nothing fails M2 as "no contention produced",
whatever the figure. Maxima and p99
are recorded for every measurement and never block; a maximum above 100 ms is
listed for a reader to judge.

### The criteria were replaced, not met

M3 and M4 were first given targets of p95 ≤ 10 ms in one tab and ≤ 20 ms in
four. Those targets were provisional. The recorded run on `582096992` measured
them and **failed**:

| | one tab | four tabs | target then | outcome |
|---|---|---|---|---|
| M3 | 99 ms | 330.1 ms | 10 / 20 ms | failed |
| M4 | 205.3 ms | 603.3 ms | 10 / 20 ms | failed |

(M1 2.1 ms and M2 5.1 ms passed; the run's exit status was 1.)

On 2026-10-06 the repository owner revised the criteria:

> Revise the latency acceptance criteria, preserving the hard gate and
> transaction-completion semantics. The proposed 10/20 ms targets were
> provisional; this explicitly replaces them, rather than treating failed
> thresholds as passed.
> - Keep M1/M2 as blocking criteria.
> - Make M3/M4 diagnostic, recording the measured waits and environment.
> - Report the page-load comparison as supporting evidence, with its
>   simulation method, variability, 429s, and competing workload disclosed.
>   Say "no slowdown detected in this experiment," not "the gate cannot slow
>   pages."
> - Do not implement the simulated optimizations or resolve reads before
>   transaction completion.
>
> Preserve the original failed latency results alongside the revised
> acceptance decision.

So M1 and M2 block, and M3 and M4 are measured exactly as before (p50, p95,
p99, maximum, in-flight statistics, pairing) and have no pass or fail. Each
page is loaded five times; **M3 and M4 use the first three of those five
repetitions**, their maxima included (`figure` in `lib/latency-criteria.mjs`),
as M1 and M2 use three. Repetitions four and five feed M5 only. A latency result that passes today says that M1 and M2 are within
their thresholds. **It does not say the gate is fast, and it does not say the
former targets were met; they were not.** The gate itself is unchanged: none of
the optimizations that were simulated was implemented, and no read is resolved
before its transaction completes.

The suite keeps this impossible to lose:

- `results-latency.json` carries a `criteria` block (from
  `lib/latency-criteria.mjs`): the revised criteria, the date, the statement
  that the former targets were replaced and not met, and the figures and exit
  status of the run in which they failed.
- M3 and M4 have no `pass` and no `thresholdMs`. Each carries
  `formerProvisionalTargetMs` and `againstFormerProvisionalTarget`, and every
  printed summary shows the figure beside "former provisional target … ms, not
  met", followed by the failed figures of `582096992`.
- The size of M3 or M4 cannot fail a run. A run in which one of them has no
  samples is incomplete and fails (`diagnosticsNotRecorded`): the decision asks
  for them to be recorded, and an empty record must not pass for a recorded
  one.

### What M3 and M4 are recorded with

`latency.environment` holds the machine (CPU, memory, and for each disk whether
it is rotational), the Chromium version, the access-token lifetime, and how
many requests of the measured loads were answered 429 (per variant, with the
totals). Four tabs loading at once exceed `api_limit`'s burst, so the four-tab
figures normally include 429s; a 429 has no delivery read, which shortens that
request's gate wait.

The browser container cannot see the host, so `run.sh` writes
`docker ps --format '{{.Names}}\t{{.Status}}'` to the scratch directory just
before the measurement, and `finalize.mjs` puts it in `results.json` under
`latency.environment.competingWorkload`, naming every container whose status
says `Restarting`. If the list could not be taken, it says "not captured"; it
never shows an empty list in its place.

### M5

M5 is an aggregate-cost estimate: "Requests on a page overlap, so the sum of
their gate waits is not the time the gate adds to the page load; it is an upper
bound on it." No share of page load is computed from it.

### Supporting evidence: the page-load comparison

`diagnose-latency.mjs` (next section) was used once, on `582096992`, to
estimate what the gate's storage wait costs a whole page load. It is supporting
evidence, not a criterion, and `run.sh` does not depend on it.

- **Result.** No slowdown detected in this experiment: median navigation to
  last API response was 979 ms with the gate as it is and 994 ms with its
  storage wait simulated away in one tab, and 3096 ms against 3167 ms in four.
- **Method.** A simulation made in the page, not a build without the gate: an
  init script answered the page's read-only session transactions from a copy
  held in the page (variant `memoryReads`), with product code unchanged. Five
  repetitions, 15 loads per variant in one tab and 60 in four, variants
  interleaved.
- **Variability.** In that experiment differences of 20% or less between
  variants are noise. The differences above are well inside that, so the
  experiment cannot show a small effect in either direction.
- **429s.** The measured loads included requests answered 429 by `api_limit`:
  25 to 75 of the 440 four-tab requests per variant.
- **Competing workload.** Two unrelated containers on the host were in a
  restart loop throughout, loading every variant alike.

That is all it supports. It is one experiment on one machine, and it says
nothing about a page whose main thread is idle, about time to first visible
content, or about another machine.

### What the measurement depends on

M3 to M5 read `window.__erpSessionTimings`, which the application fills when
`sessionStorage['erp-session-timing']` is `'1'`. Two things depend on what the
application records there:

- **In-flight counts.** The plan wants each gate timing recorded with the
  number of gate reads in flight when it started. `measure.mjs` reports them
  when an entry carries a numeric `inFlight` field and writes "in-flight counts
  not recorded" when it does not.
- **Pairing for M4.** `gate-before` and `gate-after` entries are paired by an
  `id` field when every entry has one. Without it they are paired in order,
  which is exact only when requests do not overlap; the result names the
  pairing used.

```bash
# the arithmetic and the judgement, no browser
node --test frontend/qa/cross-tab-session/*.test.mjs
bash frontend/qa/cross-tab-session/run-status.test.sh
```

`measure.test.mjs` holds the blocking rule: M1 or M2 over its threshold fails
the run, M3 and M4 at the figures of `582096992` do not, and the criteria block
is present. `usable.test.mjs` holds the judgement of W1's "usable", the
reading of the company retry and the refusal of a step outside the role's
pages. `access.test.mjs` holds the reading of `navigation.tsx`, on a small
menu and on the real file. `judge.test.mjs` holds the judgements of cases 5, 7
and 9 to 11, each shown failing on every way the behaviour can be wrong (a
second rotation in case 7 among them). `w1-judgement.test.mjs` holds what W1
blocks on, round (c) included, and what it reports. `run-status.test.sh` holds
`run.sh`'s exit-status rule.

## Where the gate's time goes: `diagnose-latency.mjs`

`measure.mjs` says how long the gate takes. `diagnose-latency.mjs` says which
layer the time is spent in. It is a diagnostic: no threshold, no pass or fail,
never part of a recorded run, and `run.sh` does not call it. Its one use as
supporting evidence is described above, with its limits. It loads the same
three pages in one tab and in four and records, in the page, with product code
unchanged:

- every transaction on `erp-session`/`kv` with the time of each event, so a
  read splits into created → first result → last result → `complete`;
- main-thread delay (a 4 ms timer's lateness, long tasks, long animation
  frames), and how much of each read coincides with it;
- raw reads during the load from the main thread and from a worker (variant
  `probed`): the worker's do not wait for the page's main thread;
- the application's gate timings, each stamped with its end time, so reads
  asked in the same turn and reads queued behind the page's own writes can be
  counted.

The other variants are **simulations** made by the script inside the page, to
size a change before anyone writes it: `settleOnSuccess`, `noWrites`,
`coalesce`, `lean` and `leanCoalesce` keep a storage read on every gate;
`memoryReads` answers reads from a copy in the page and exists only as a
zero-wait baseline (the spec forbids resolving the gate from memory). A
simulated figure is an estimate of what a real change would give, not a
measurement of one. The header of the script describes each variant.

```bash
QA_DIAG_REPS=5 node diagnose-latency.mjs   # same environment as measure.mjs
node --test frontend/qa/cross-tab-session/diagnose-latency.test.mjs   # the arithmetic
```

`QA_DIAG_VARIANTS` and `QA_DIAG_TABS` select variants and tab counts. It writes
`results-diagnose.json` (summary) and `diagnose-raw.json` to the scratch
directory. Four tabs loading at once exceed `api_limit`'s burst, so those
figures include 429s; the summary counts them per variant.

## Replay rounds: the trace, the server rows and the verdict (#1358)

Three files read one recorded replay round and say what it established. None of
them changes anything in the application.

| File | What it is |
|---|---|
| `diagnose-replay.mjs` | Runs the round and records it. Opens its profile with `{ timing: true }`, so the `erp-session-timing` flag is set in the page and the runtime's opt-in trace is on. Each attempt gains `sessionId` (read by the holder tab before the tabs are opened), `endedAt` beside `openedAt`, and `traces`: one entry per tab with `flagSet`, `timeOriginAtOpen`, `timeOriginAtEnd`, `collected` and `events`. |
| `replay-server-rows.sh` | A read-only query of what the server recorded: the `SESSION_REPLAY_REVOKED` audit rows since a given instant, and for those sessions their `refresh_tokens` and `auth_sessions` rows. `SELECT` only; no token, hash or key column is named. `readAt` is the database's `now()` in the same query. It prints one JSON object on stdout, and a query that fails prints **nothing** and exits non-zero. |
| `lib/replay-evidence.mjs` | Pure. Joins the trace, the request record and the server rows, and gives the round one of five verdicts. Its own tests are `replay-evidence.test.mjs`. |

`judge-replay.mjs` is the command line over them: it takes the diagnosis and,
optionally, the server rows, prints one line per round and writes
`replay-verdicts.json` beside the diagnosis. A second argument that is absent,
unreadable or not JSON is read as *no rows were read*, which is `undetermined`
and never `no-replay`.

### The command sequence

```bash
QA_REPLAY_ATTEMPTS=10 QA_REPLAY_TABS=20 run-one.sh <lan-ip> diagnose-replay.mjs
replay-server-rows.sh <start-iso> > "$SCRATCH/server-rows-N.json"
node judge-replay.mjs "$SCRATCH/replay-diagnosis.json" "$SCRATCH/server-rows-N.json"
```

`QA_REPLAY_ATTEMPTS` and `QA_REPLAY_TABS` used to be read by the script but
never reached the container; `run-one.sh` now passes both by name.

### What a reloaded tab costs

**The trace lives in `window`, so a tab that was replaced or reloaded during the
round has lost it.** Its attempt records `collected: false` (or a changed
`timeOrigin`) and the round is marked incomplete, so it cannot establish a
cause. A round with 20 tabs is therefore only as good as its quietest tab, and
the reading of a round that failed a completeness check says which check it
failed rather than guessing which candidate fits.

## `results.json`

Written to the scratch directory (`ERP_SESSION_SCRATCH`, default
`/tmp/opencode/erp-session-qa`): the commit and exit status; the configuration
`stack.sh show` reported **before, during and after** the run (evidence in its
own right, because `.env` is not covered by the commit); for each case its
checks, recorded evidence and, when it failed, where each tab was, what it sent
last and a screenshot path; the W1 rounds and judgement, with what each tab
needed to become usable; the latency table with its `criteria` block and the
environment M3 and M4 were measured in, the host's other containers included;
the Chromium version and the machine; and the number of sign-in waits. Tokens are
never written, only short fingerprints of them. The container runs as root, so
the files it writes into the scratch directory are owned by root.

## Developing a case without rebuilding images

`run.sh` is the only way to produce evidence. To work on a case:

```bash
node cases.mjs --only 3,7        # a selection; the result file says it is partial
QA_W1_NS=5 node cases.mjs --only W1
```

Both scripts need `QA_BASE_URL` (a LAN address, no port), `QA_STACK_SHOW` (a
file holding `stack.sh show` output), the six credential variables, and
Playwright resolvable from `QA_SCRATCH`; run them in the Playwright container
as `run.sh` does. `QA_DIST_DIR=<a local vite build>` serves the page and its
assets from that directory through request interception while `/api` still
goes to the ingress, so a case can be exercised against the checkout when the
running frontend image is older. Results produced that way say so
(`servedFrom`) and are not a recorded run; latency figures taken that way are
distorted.

## The rate-limit script

```bash
nginx/verify-rate-limits.sh && nginx/verify-rate-limits.sh
```

Runs from a container with its own address, so the browser tabs on the host do
not share its rate-limit key. It derives every wait, request count and bound
from the rates and bursts in `nginx/nginx.conf`, and must pass twice in a row.

## Known limits

- Chromium only; Firefox, Safari and mobile are unverified.
- The browser container runs on Docker's default bridge and reaches the ingress
  by LAN IP. It deliberately does not use `--network host`: there Chromium
  watches the host's interfaces and fails in-flight requests with
  `net::ERR_NETWORK_CHANGED` whenever another container starts or restarts,
  which was seen about twenty times in one development round. W1 still records
  failed requests (`dataRequestsFailed`), so a recurrence would be visible.
- Natural tab freezing, tab discarding, device sleep and the back/forward cache
  are not exercised. Pauses use the debugger, and case 15 dispatches its events
  synthetically.
- A browser's own session restore (a restarted browser reopening its tabs) is
  not exercised. Case 4 uses a reload, and a new tab whose `sessionStorage` is
  populated before the page starts.
- The latency figures come from one machine and headless Chromium, with
  whatever else the host was running (recorded with them). They describe the
  cost where the run could reach; they do not predict another machine.
- W1's usability check knows one page and one role. "Expected data" is the
  dashboard's and the shell's, the action is the customer list, and the user
  is a `sales_staff` user; a tab restored on another page and the other
  non-administrator roles are not exercised. The check reads the dashboard's
  own warning, the sidebar's company name, the stored formats and the request
  log, so data a panel shows wrongly although its request succeeded would not
  be seen.
- W1's profile has loaded the application before its tabs open, so its
  `localStorage` already holds the regional formats. A profile with empty or
  out-of-date storage, where a refused regional-settings request does change
  what is on screen, is not exercised (see "What a refused regional-settings
  request does").
- The pages a role can open are the ones its menu shows. The frontend puts no
  role on a route, so a user who types the address of a page they are not
  shown does get that page; W1 never loads an address, and does not count
  that as something an ordinary user would do.
- W1 recovers tabs one at a time and paced. Several tabs recovered at once
  would send their requests together again, and that is not exercised.
- W1 measures no capacity: not of `session_limit`, which its rounds never
  approach, and not of a restored window, which `api_limit` bounds (issue
  #1353). Several users sharing one address are not exercised by W1 and stay
  unverified.
- Case 5 identifies user X's data by provenance (the request that produced
  what is on screen, and its token), not by content. It checks the customer
  list; the persisted `notifications` slice and other lists are not looked
  at.
- Case 7's 401s are simultaneous as the script delivers them (both answered
  in one turn, both seen by the tabs before any refresh is answered). Two
  tabs whose tokens expire on the server at the same instant are exercised by
  case 8 and W1 round (b), without that guarantee.
- Case 14 shows that a refused refresh did not rotate the session by timing
  (the token still rotates normally after its grace would have run out). The
  backend e2e test `a refused refresh does not rotate` shows it directly, from
  the `auth_sessions` row.
