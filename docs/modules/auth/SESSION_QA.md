# Cross-tab session QA (#1345)

This document records how the cross-tab session behaviour of the frontend PR is
verified. The code lives in `frontend/src/session/` and `frontend/qa/cross-tab-session/`.

## Procedure

| Command | Purpose |
|---|---|
| `frontend/qa/cross-tab-session/run.sh "<lan-ip>"` | A whole recorded run: capture the running configuration, rebuild, start with the QA values, run the fifteen cases and W1, restore, measure latency, write `results.json`. |
| `frontend/qa/cross-tab-session/stack.sh {show\|qa-up\|restore}` | The only supported way to start or recreate containers for a run. |
| `nginx/verify-rate-limits.sh` | The ingress rate limits and CORS, from a container with its own address. Must pass twice in a row. |
| `node --test nginx/verify-rate-limits.test.mjs` | The arithmetic the rate-limit script derives from the configuration. |
| `frontend/qa/cross-tab-session/diagnose-latency.mjs` | A diagnostic, not a gate: where the reconcile gate's time goes during a page load. |

`run.sh` refuses a `localhost` address, any port, a dirty working tree, missing
QA credentials and less than 3 GB free disk. It captures the running token
lifetime and grace from inside the backend before changing anything, and
restores exactly those afterwards; a failed restoration never yields exit 0. It
goes through the ingress on port 80 (the LAN IP); port 3000 is the frontend
container's own NGINX, which applies no rate limit. The browser container runs on
Docker's default bridge, not on the host network.

The two QA values are an access-token lifetime of **20 s** and a refresh grace of
**5 s**, set by `stack.sh qa-up` so cases 8 to 11 and W1 can observe expiry,
rotation and replay in seconds. They are not production values.

`frontend/qa/cross-tab-session/README.md` describes each case, W1, the
measurements and the accounts the suite needs.

## Where the evidence is

A document in the repository cannot hold the results of a run on its own commit.
So:

- **This document** records the first recorded run, on commit `582096992`, with
  everything it found, including what failed.
- **The run that gates the merge** is made on the final commit of the branch and
  recorded in the body of the pull request that closes #1345, with the SHA it
  describes.

## Recorded run on `582096992` (2026-10-06)

Chromium 153.0.8010.12 in `mcr.microsoft.com/playwright:v1.63.0-noble`; AMD Ryzen 3
3200G, 4 cores, 9.7 GiB, spinning disk. **Exit status 1**: the latency thresholds
then in force were exceeded. Everything else passed as it was then judged.

| | Before | During | After |
|---|---|---|---|
| Access-token lifetime | 15m | 20s | 15m |
| Refresh grace | 60 | 5 | 60 |
| Served build | (none: the previous image predates the build tag) | `582096992` | `582096992` |

**Cases: 15 of 15 passed.** Two-tab sign-out; stale write-back; drafts; reload and
session restore; user switch; same-user sign-out and sign-in; simultaneous
refresh; use past real expiry; holder paused and resumed inside grace, after
grace, and after further rotations; tab paused mid-transaction; IndexedDB
unavailable; old bundle (sign-in, registration and refresh each refused with 426);
resume without a channel message. Sign-ins waited on the login limit 16 times, as
designed.

**W1 (restored window), as judged in that run:**

| Tabs | Session requests per round | 429 on `refresh`/`logout`/`me` | Peak accumulated demand `E` | Business requests answered 429 |
|---|---|---|---|---|
| 5 | 0 to 2 | 0 | 1 | 18 of 45, 18 of 48, 40 of 71 |
| 10 | 0 to 2 | 0 | 1 | 44 of 90, 81 of 121, 44 of 90 |
| 20 | 1 to 2 | 0 | 1 | 103 of 211, 124 of 247, 29 of 105 |

- One refresh per round even with twenty tabs holding expired tokens: the refresh
  lease does what it is for.
- `E` on the session zone was 1, far inside burst 20, so `session_limit` was not
  retuned.
- In that run a tab counted as usable when a fresh request succeeded once traffic
  had settled. That definition was too weak and has been replaced (below); the
  run is **not** evidence that the tabs were usable in the stricter sense.

**Latency, as measured (median p95 of three repetitions):**

| | One tab | Four tabs | Threshold then in force | |
|---|---|---|---|---|
| M1 raw IndexedDB read, idle page | 2.1 ms | | 5 ms | pass |
| M2 raw read, four tabs busy and a writer | | 5.1 ms | 15 ms | pass |
| M3 the adapter's reads inside the loading application | 99 ms | 330.1 ms | 10 / 20 ms | **fail** |
| M4 per request, wait before sending plus wait before delivery | 205.3 ms | 603.3 ms | 10 / 20 ms | **fail** |

Maxima: M3 196 / 833 ms, M4 241 / 874 ms. The four-tab loads included requests
answered 429 by the general API limit. M5 (diagnostic): a dashboard load took
about 0.8 s from navigation to its last response in one tab and 2.3 s with four.

**Rate-limit script on the same build:** passed twice in a row, phases 0 and A to
F. Login budget exactly 4 admitted of 10 alone, while the session budget was
spent, and for `change-password`; session budget 21 admitted of 32 alone and while
the login budget was spent; logout 204 and `me` 401 unthrottled; both preflights
allow `X-ERP-Session-Protocol`. Every burst took under half a second.

## Decisions taken after that run (repository owner, 2026-10-06)

### Latency acceptance criteria

The 10 / 20 ms targets for M3 and M4 were provisional. They were **replaced, not
met**; the failed figures above stand as measured.

- **M1 (p95 ≤ 5 ms) and M2 (p95 ≤ 15 ms) are the blocking criteria.**
- **M3 and M4 are diagnostic**: measured and recorded with their environment on
  every run, never pass or fail. A run in which they have no samples is
  incomplete and fails.
- The hard gate (a successful read before every request and before every
  delivery) and the rule that a storage call settles only from its transaction's
  completion are unchanged. No optimisation that was simulated was implemented.

Why the old targets could not be met on this machine: the wait is for the page's
own main thread while it loads, not for storage or the adapter. In the
investigation (`diagnose-latency.mjs`, same build, same machine) a raw read on the
main thread during a load was as slow as the adapter's (p95 68 ms against 78 ms in
one tab); the same read from a worker took 13 ms in one tab (79 ms with four tabs
loading, where the worker also competes for four cores), and about 2 ms on an
idle page.
About 73% of read time in one tab (85% in four) coincided with main-thread delay.

Supporting evidence, to be read with its limits: with the gate wait simulated
away, **no slowdown was detected in this experiment** (979 ms against 994 ms to
the last response in one tab; 3096 ms against 3167 ms in four). That is a
simulation made in the page, not a build without the gate; differences of 20% or
less between variants were noise in it; the four-tab loads included requests
answered 429; and two unrelated containers were restart-looping on the host
throughout.

What this does and does not establish: it supports accepting the measured cost on
this machine. It does not establish that every possible implementation that keeps
the gate would miss the old targets, and it says nothing about other machines.

### What "usable" means in W1

A tab is usable when it reaches a working state without reloading and without
signing in again, with its expected data available and actions working. It does
not require every initial request to succeed. Retries and user actions needed to
recover are recorded. A rendered shell with missing data is not usable, and
recovery through a page only an administrator can open does not count.

- No 429 on `refresh`, `logout` or `me` at five tabs remains blocking.
- 429s on business endpoints come from the general `api_limit`, which #1345 leaves
  unchanged. They are recorded and tracked in issue #1353, and are acceptable only
  when recovery meets the definition above.

## What changed after that run

- **Company data recovers by itself.** When the general limit refused
  `GET /settings/company`, the sidebar stayed without its company data and only an
  administrator-only page requested it again. That one request, and no other, is
  now retried after a 429: three retries at most, waits of 250 to 500, 500 to 1000
  and 1000 to 2000 ms, or a valid `Retry-After` capped at 4 s. Every retry goes
  through the session checks, and an abort or a session change cancels the wait.
- **W1 runs as a non-administrator** (`sales_staff`, the default role for a new
  user) and refuses any recovery step that would open a page that role cannot
  open. Its expected data includes what the shell shows on every page.
- **The suite's own judgement was checked by forcing it to fail**, in development
  mode on a patched copy of the suite or of the frontend build, not in a recorded
  run: with recovery
  disabled it reports unusable tabs; with the company retry exhausted it names the
  company data as unrecoverable; an administrator-only step is refused.

Development results under the new definition (a local build of `81958c8bd` served
through request interception, API through the real ingress; **not a recorded
run**): at five tabs every tab became usable with no 429 on the session routes.
With current tokens four of five were complete on first load and one needed one
in-app round trip; with expired tokens none was complete on first load and each
needed one in-app round trip, the company data arriving by the automatic retry in
1.1 to 1.4 s. Ten and twenty tabs were also all usable; the longest automatic
retry took 5.4 s and used two of its three retries.

## Recorded run on `a8fc7d564` (2026-10-07), revised suite

Same machine and Chromium as above. **Exit status 0.** Configuration 15m / 60
before, 20s / 5 during, 15m / 60 after; served build `a8fc7d564` during and after.

**Cases: 15 of 15 passed**, as they were then written. A review afterwards found
that four of them judged less than their names say (below), so read this run as
"nothing failed", not as proof of every named behaviour.

**W1, as a non-administrator (`sales_staff`, 15 pages):**

| Tabs | Variant | Usable | Complete on first load | Needed an in-app action | Company data by the automatic retry | 429 on `refresh`/`logout`/`me` |
|---|---|---|---|---|---|---|
| 5 | current token | 5/5 | 3 | 2 | 0 | 0 |
| 5 | expired token | 5/5 | 0 | 5 | 4 | 0 |
| 10 | current token | 10/10 | 3 | 7 | 5 | 0 |
| 10 | expired token | 10/10 | 0 | 10 | 9 | 0 |
| 20 | current token | 20/20 | 6 | 14 | 11 | 0 |
| 20 | expired token | 20/20 | 0 | 20 | 15 | 0 |

- What reached the session zone at five tabs: nothing with current tokens (the
  application sends no `/auth/me` on load); one `refresh` with expired tokens (one
  tab takes the lease and refreshes, the others adopt its tokens); one `refresh`
  and one `logout` in the sign-out round. Peak accumulated demand was 1.82 against
  a burst of 20.
- **This is not a capacity figure.** It shows refresh coordination, and that a
  restored window puts little load on `session_limit`. It does not measure that
  zone's capacity, which was never approached, and it does not establish how many
  tabs a restored window can carry: that is bounded by the general `api_limit`,
  which answered 28% to 67% of the tabs' own data requests with 429 across both
  recorded runs (issue #1353).
- No tab needed more than two in-app actions; the slowest recovery took about
  30 s. The company-data retry never failed. Of the 44 tab loads whose first
  request was refused, 31 got the data on the first retry, 8 on the second and 5
  on the third and last (all five at ten or twenty tabs); one more refusal in
  those five would have left the tab without that data. Counted by 429s received,
  which is what the budget counts: a 401 that is refreshed and re-sent happens
  inside one attempt and uses no retry. (Earlier versions of this document and of
  the pull request said seven; that counted such re-sends as retries.)
- A refused regional-settings request was never repeated (up to 14 of 20 tabs);
  formats were wrong in none, because the profile had stored them at sign-in.

**Latency:** M1 2.8 ms and M2 4.9 ms passed (blocking). Diagnostic, not judged:
M3 59.8 / 280.5 ms, M4 82.5 / 402.8 ms (one tab / four tabs); the former
provisional 10 / 20 ms targets were not met. 55 of 444 four-tab requests were
answered 429, and two unrelated containers were restarting on the host.

**Rate-limit script on the same build:** passed twice in a row. It was also run
against two configurations it must reject, on throwaway NGINX containers: with
the session block moved below the credential block, and with `main`'s
configuration, session upkeep was refused while the login budget was spent (0 of
32 admitted) and `logout` and `me` were answered 429. So the ordering comment in
`nginx.conf` is true.

## What a final review of `a8fc7d564` found, and what changed

Fixed afterwards, each with a regression test seen failing first, or, where the
product code was already right, a rewritten test shown to fail under a temporary
change to the code it protects:

- **A sign-in cancelled around its commit** could write over the session other
  tabs were using and leave that session live on the server. Whether the attempt
  is still current is now decided inside the transaction, so a cancelled attempt
  writes nothing; where a commit does complete before the cancellation is seen,
  the session it displaced is logged out as well as its own; a commit that fails
  logs out the session the server had just created.
- **Eight tests could not fail for the behaviour they named**, and two required
  behaviours had no test that could. They were rewritten.
- **The mandatory password-change page** now goes to the login page when its
  session ends.
- **A start-up read that times out** no longer shows the sign-in form as though
  storage had confirmed there was no session. The tab shows "Still waiting for
  this browser's session storage. Another tab may be busy." with a retry, sends no
  request and offers no sign-in. This is a third state, distinct from signed-out
  and from storage-unavailable: storage did not answer; it was not found broken.
- **The suite:** an interrupted or aborted run now exits non-zero; case 7 holds
  both forced 401s and requires exactly one rotation; cases 9 to 11 judge the held
  refresh's answer against the grace; case 5 checks a tab that held the first
  user's data; W1's sign-out round is blocking at five tabs; W1 states no capacity.

On case 7: both recorded runs above show the session going from generation 1 to
3, two rotations. With both 401s held and released together, development runs
showed one rotation, the second tab adopting. The earlier arrangement let the
second tab's request leave after the first tab's rotation, already carrying the
new token, so its own refresh was correct. That explains the recorded figures; it
is not a measurement of those two runs.

## Recorded run on `2ef0e4a12` (2026-10-07): exit status 1, a flaw in case 8

The first run after the review fixes passed fourteen cases, W1 (now with its
sign-out round blocking at five tabs) and latency, and **failed case 8**, "use past
real expiry". Every one of its fourteen uses succeeded, both tabs stayed signed in
on the same session, and the session rotated twice; the case required three.

The flaw was in the case. It ran for a fixed three and a half access-token
lifetimes, but a refresh happens only at the first use after an expiry, so that
window holds two or three rotations depending on where the uses fall against the
expiries. Earlier runs saw three by timing (and, before the lease fix, because
tabs rotated more often than they needed to). The case now keeps using the tabs
until the third rotation is seen, bounded at six lifetimes, and its requirement
is unchanged. The revised case was then run three times in development against
the same build; all three passed, one of them needing 3.75 lifetimes. Only the
last of those three result files was kept, so the first two are an unretained
observation, not retained evidence.

The run is recorded here because it failed; it is not passing evidence for
anything, and the cases that passed in it were run again on the commit that
followed.

## Recorded run on `29fdf87fb` (2026-10-07): exit status 0

Same machine and Chromium. Configuration 15m / 60 before, 20s / 5 during, 15m / 60
after. **15 of 15 cases passed**, with the corrected case 8 and with cases 5, 7 and
9 to 11 judging what their names say; case 7 showed one rotation with both forced
401s held and released together.

**W1, as a non-administrator, all three rounds blocking at five tabs:**

| Tabs | Round | Session-zone requests (refresh / logout / me) | 429 on them | End state | Complete on first load | In-app recovery actions | Business requests answered 429 |
|---|---|---|---|---|---|---|---|
| 5 | current token | 0 / 0 / 0 | 0 | 5/5 usable | 1 | 4 | 13 of 45 |
| 5 | expired token | 1 / 0 / 0 | 0 | 5/5 usable | 0 | 5 | 41 of 73 |
| 5 | sign-out while loading | 1 / 1 / 0 | 0 | 5/5 on the login page, no reload | | | 39 of 71 |
| 10 | current token | 0 / 0 / 0 | 0 | 10/10 usable | 2 | 8 | 42 of 95 |
| 10 | expired token | 1 / 0 / 0 | 0 | 10/10 usable | 1 | 9 | 73 of 140 |
| 10 | sign-out while loading | 1 / 1 / 0 | 0 | 10/10 on the login page | | | 82 of 122 |
| 20 | current token | 1 / 0 / 0 | 0 | 20/20 usable | 7 | 13 | 84 of 216 |
| 20 | expired token | 1 / 0 / 0 | 0 | 20/20 usable | 6 | 14 | 83 of 196 |
| 20 | sign-out while loading | 1 / 1 / 0 | 0 | 20/20 on the login page | | | 3 of 114 |

No tab needed more than one in-app action. The company-data retry never failed:
of the 32 tab loads whose first request was refused, 21 got the data on the first
retry and 11 on the second; none needed the third. As above, this is not a
capacity figure.

**Latency:** M1 1.5 ms and M2 5.4 ms passed (blocking). Diagnostic, not judged:
M3 64.2 / 277.6 ms, M4 90 / 366.3 ms; the former provisional targets were not met.

A review of this commit found that a tab which starts in the waiting state cleared
its unsaved reconciliation drafts as though it had been signed out, and that a
cancelled sign-in whose cleanup transaction failed could leave its session in the
shared record. Both were reproduced with failing tests and fixed in the commits
that followed:

- A tab in the waiting state keeps its drafts. They are cleared when the tab is
  actually signed out, which includes a retry that finds no session, and when
  storage is found unavailable.
- A cancelled sign-in is reported as cancelled even when its cleanup times out,
  and the same conditional cleanup is tried again: twice at the cancellation and
  on up to three later reconciles of that tab. It still cannot clear a newer
  session.

The run that gates the merge is the one in the pull request.

## What is automated

- Vitest on the in-memory store double: every commit rule, the reconciliation
  table, the runtime's request lifecycle, refresh coordination across tabs with a
  fake server that delays its answers and models grace, and every kind of ending
  (`frontend/src/session/__tests__/`).
- Vitest on the HTTP interceptors with a real runtime: the refresh and retry path,
  the three-send budget and the final-401 ending, the caller's and the session's
  abort signals, and no re-send under another session
  (`frontend/src/services/__tests__/`).
- Vitest on the application wiring: the redirect to the login page when a session
  ends, the storage-unavailable screen in place of every route, the reset of every
  slice and API cache, rehydration through the started runtime, drafts cleared on
  a local ending and on resume.
- Vitest on the IndexedDB adapter against a hand-written stub. It proves the
  adapter's logic, not the browser's IndexedDB; that is what the browser run is
  for.
- Jest on the backend guard and the CORS allow-list, and the e2e `protocol marker`
  block (the marker is refused on all three token-issuing routes; a refused
  refresh does not rotate, read from the `auth_sessions` row).
- `node --test` on the arithmetic of the rate-limit script and of the QA scripts.

## What is manual

- The browser run on the real IndexedDB adapter, real tabs and the real backend.
- The rate-limit script through the real ingress.

CI has no NGINX and no browser; neither is a CI gate.

## Known limits

- Chromium only. Firefox, Safari and mobile are unverified.
- Natural tab freezing, tab discard and device sleep are not exercised. Case 15
  dispatches `visibilitychange` and `pageshow` synthetically; the browser's own
  freezing and back/forward cache are not covered. Pauses in cases 9 to 12 are
  debugger pauses.
- The reconcile read waits for the page's main thread during a page load: tens to
  hundreds of milliseconds per request on the QA machine (figures above). This
  cost is accepted, not removed. The figures come from one machine with a spinning
  disk and say nothing about others.
- When several tabs load at once, the general `api_limit` refuses a third to two
  thirds of their data requests (issue #1353). Tabs recover without a reload, but
  mostly through one in-app navigation by the user, not by themselves. Only the
  company data is retried automatically.
- A refused regional-settings request is not retried. A profile that has signed
  in before keeps the formats it stored; a profile with empty storage falls back
  to `DD/MM/YYYY` silently, and an ordinary user can only correct that by opening
  a page that requests the settings again, or by reloading. W1 does not exercise
  the empty-storage case.
- The capacity of `session_limit` (1 request per second, burst 20) is not
  measured. A restored window of 5, 10 or 20 tabs of one profile sent it at most
  two requests per round, so the workload never approached the burst and says
  nothing about where the zone's limit lies. Several users sharing one address
  are unverified, and so is `limit_conn addr 10` with more than one profile behind
  an address.
- A sign-out's publication to other tabs is delayed by a blocked transaction; the
  bound while it is delayed is the server revocation, which exists only once the
  logout reaches the server.
- A legitimate refresh delayed past grace revokes its session in every tab.
- A tab paused mid-transaction blocks other tabs' session operations until it
  resumes or closes; waiting operations time out with an error and sign nobody out.
- A tab that waited for storage at start-up and then recovered a session has
  already rehydrated with nothing: it does not show that session's persisted
  notifications, and the first notification change in that tab writes its own
  list over the stored one. Reloading before that write brings the stored list
  back; after it, the stored list is gone.
- Rehydration of persisted notifications waits for the session runtime to start,
  which route loaders do. A route without a loader would rehydrate empty after
  redux-persist's 5 s timeout.
- **One tab's idle timeout signs out every tab of the profile.** Activity is
  tracked per tab, and sign-out now reaches every tab. A tab left open and
  untouched reaches its timeout and signs out the tab the user is working in: the
  server session is revoked, caches are reset and unsaved reconciliation drafts
  are cleared. This is the designed behaviour; making activity in any tab keep
  the session alive would be a separate change.
- Revocation covers authenticated HTTP requests, which is every authenticated
  path: no WebSocket transport exists (#1348 removed it).
- A captured refresh token can be exchanged for the current one during its grace
  window, across later rotations. Rotation does not bound an attacker's access.
- An expired refresh token is never treated as replay, so a token replayed after
  its own lifetime is not detected.
- A logout is a no-op once the captured token's row has been purged or its
  signing key retired; the session, if still live, stays live until it expires or
  is revoked another way.
- A sign-in cancelled in the instant after its commit can leave its session in
  the shared record if every cleanup attempt times out (five at most), if the tab
  is closed or reloaded before one completes, or if the tab never reconciles
  again. No tab claims that session; a tab opened later would start signed in on
  it, and ends at its first request if the logout reached the server. It needs a
  cancellation within milliseconds of the commit and a blocked transaction at the
  same time. The number of attempts is a choice of the implementation, not of the
  design.
- A sign-in that loses the revision check, or is cancelled, must be submitted
  again. Revoking the server session it created is best effort: if that logout
  fails, the unadopted session can remain live until it expires.
- Removing a refresh signing key early strands the sessions that depend on it
  without revoking them.
- Production is clear-text HTTP; credentials and tokens are readable on the
  network.
