# Cross-tab session QA (#1345)

This document records how the cross-tab session behaviour of the frontend PR is
verified. The code lives in `frontend/src/session/` and `frontend/qa/cross-tab-session/`.

## Procedure

| Command | Purpose |
|---|---|
| `frontend/qa/cross-tab-session/run.sh "<lan-ip>"` | A whole recorded run: capture the running configuration, rebuild, start with the QA values, run the sixteen cases and W1, restore, measure latency, write `results.json`. |
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

- **This document** records every recorded run, from the first on commit
  `582096992` onwards, each with everything it found, including what failed.
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
  run. Three conditions were forced: a recovery step pointed at an
  administrator-only page is refused and nothing is clicked; with every company
  request refused the retries are used up and the company data is named as
  unrecoverable; with the regional request refused and the stored formats removed
  the regional settings are named as unrecoverable.

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
  30 s. The company-data retry never failed. Of the 44 tab loads that met at
  least one refusal, 31 got the data on the first retry, 8 on the second and 5
  on the third and last (all five at twenty tabs, in the expired-token round); one more refusal in
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
  Since #1354 the screen also asks again by itself every 10 s while the tab is
  visible, not while it is hidden, and at once when it is shown again; the
  button and the automatic retry share one request. Before that a tab left
  visible stayed on the screen until it was clicked, resumed or sent a message.
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
expiries. The two earlier recorded runs saw three; why they did was not
established. The case now keeps using the tabs
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
of the 32 tab loads that met at least one refusal, 21 got the data on the first
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
  and the same conditional cleanup is attempted again: two attempts at the
  cancellation in all (one retry), and one on each of up to three later
  reconciles of that tab. It still cannot clear a newer
  session.

The run that gates the merge is the one in the pull request.

## The limiter probe and what has not been run (#1353)

`api_limit` was changed from `burst=20 nodelay` to `burst=40 delay=20` at 20 r/s,
so that a restored window's excess requests wait instead of being refused. Every
assertion about it is written against a recorded probe of the deployed build,
because two handlers' interaction is not something to assume.

### The probe: `nginx/limiter-probe-result.json`

Recorded twice on `nginx/1.30.0` (the image the stack deploys) through the
isolated rig, on this host, and merged; the two runs agreed on every status and
every finding. Configuration `3fd4e04e77cf`, rate 20 r/s, burst 40, delay 20.

| Answer | Status | Finding |
|---|---|---|
| `handlerOrder` | established | `limit_req` runs first, `limit_conn` second. `ngx_http_init_phase_handlers` fills the phase engine backwards, so the last handler registered runs first, and `auto/modules` registers `HTTP_LIMIT_CONN` before `HTTP_LIMIT_REQ`. Observed: 25 lines `lreq=PASSED lconn=REJECTED`, 19 lines `lreq=REJECTED lconn=-`. |
| `delayedCountedByLimitConn` | established | A request delayed by `limit_req` is **not** counted by `limit_conn` while it is delayed: `limit_req` returns `NGX_AGAIN`, so `limit_conn`'s handler is not reached until the delay has expired. E3: 13 delayed, 0 refused, releases 47-54 ms apart against 50 ms expected. |
| `handlerRunsAfterOther` | established | `limit_conn` does not run at all on a request `limit_req` refused (its field reads `-`), and `limit_req` has already passed on a request `limit_conn` refuses. |

| State | Status | Evidence |
|---|---|---|
| immediate | reachable, **10 at one instant** | with each response held 500 ms: 1, 5 and 10 all admitted; 11, 15, 21 and 25 admitted 10 each, the rest `lconn=REJECTED`. This is `limit_conn addr 10`, not `delay + 1`. |
| delayed | reachable | 59 lines `lreq=DELAYED`, all `lconn=PASSED`; arrivals 50.2, 49.2, 49.1 ms apart against `1/20 r/s` = 50 ms. |
| rejected by `limit_req` | reachable | 18 lines `lreq=REJECTED lconn=-`; error log `limiting requests, excess: 40.980 by zone "api_limit"`. |
| rejected by `limit_conn` | reachable | lines `lconn=REJECTED lreq=PASSED`; error log `limiting connections by zone "addr"`. |

### The verification: `nginx/verify-rate-limits.sh`

Phases G to J run on the rig, never against the running stack, and are planned
from the probe result before anything is sent. Recorded on this host:

| Run | Result |
|---|---|
| twice in a row, then again after the forced failures | exit 0 each time: G 10 admitted at one instant; H 43 delayed arrivals at 20.0 r/s; I 28 lines refused by `limit_req`; J 5 lines refused by `limit_conn` |
| one state set to `unresolved` | exit 3, three phases run, `delayed` named blocked |
| `confSha256` changed | exit 3, nothing judged |
| probe result absent | exit 3, nothing judged |
| `nodelay` in place of `delay=20` | exit 1, failing set exactly `{H}` |
| `delay=1` for `delay=20` | exit 1, failing set exactly `{G}` |
| `burst=100000` | exit 1, failing set exactly `{I}` |
| `limit_conn addr 20` | exit 1, failing set exactly `{J}` |

The last two rows are substitutions, with the reason: NGINX refuses to start on
`delay=0` (`invalid delay value`) and on `limit_conn addr 100000` (`connection
limit must be less 65536`), so the rig never came up and no phase ran.

### What has NOT been run

When the limiter change was first recorded, nothing that needs the QA stack had
been run on this host: `run.sh` refuses under 3 GB of free disk and the host had
2.2 GB. Space was freed on 2026-10-09 and the capture feasibility run has since
been run three times: two failed and the third passed, all recorded in the next
section. That run validates the capture pipeline and nothing else. The rest of
this list is still not run:
- **The recorded W1 run** on the new configuration. So the deadlines (5 s, 10 s,
  15 s at 5, 10 and 20 tabs), the zero-recovery-action condition and the
  sign-out's overlap with a delayed request are all **unverified**. The refusal
  figures in the runs recorded above describe the old `nodelay` configuration.
- **Case 16**, the token that expires while the ingress delays its request: its
  calibration, its attempts and its recovery deadline. Nothing about the expiry
  path is established by the unit tests alone.
- **The W1 and case 16 forced failures** (Task 7 Steps 6 and 7), which need a
  passing baseline through the same invocation.

The retention checks that were possible were done, with the QA-independent parts
of the stack: `docker logs` on the capture container is refused; `docker inspect`
shows log driver `none`, a read-only root, the tmpfs, `Memory == MemorySwap` and
only `NET_RAW`/`NET_ADMIN`; the scratch directory holds only the reducer's files;
a search of the scratch directory and of the capture's stderr file for the access
token and the refresh token the traffic carried finds nothing, before and after
killing the reducer inside the container, and the container stops; and inside the
container `memory.swap.max` reads 0 with every process's `VmSwap` at 0 kB, while
the host does have 2 GB of swap - the claim rests on the cgroup, not on the host.

### Capture feasibility: two failed runs and one that passed (2026-10-09)

`frontend/qa/cross-tab-session/capture-feasibility.sh <lan-ip>` brings the stack
up in the QA configuration, sends 200 identified requests inside one upstream
capture segment and judges whether the browser's record, the ingress log and the
capture agree request by request (`lib/feasibility.mjs`). It validates the
evidence pipeline only. The script did not exist until `175326405`; before that
this run was listed as not run because it could not have been.

Both runs: Chromium 153 in the Playwright container, access lifetime 20 s, grace
5, served build equal to the commit, stack restored to 15m / 60 afterwards.

| | Run 1, `175326405` | Run 2, `913da9d22` |
|---|---|---|
| Exit status | 1 | 1 |
| Matched in browser, ingress log and capture | 200 of 200, 1 problem | 200 of 200, 0 problems |
| Token fingerprints agree, browser and capture | 200 | 200 |
| Statuses agree across the three | 200 | 200 |
| Upstream streams, all reused | 6 | 6 |
| Requests the ingress logged `DELAYED` (50 required) | 69 | **31** |
| Requests reassembled from more than one frame | **0** | 40 (the 40 padded ones, each 1448 + 1448 + 1448 + 594 bytes) |
| Padding header present at the backend | not recorded | 40 of 40 |
| Capture's dropped-packet count | **not reported** (`null`) | 0, reported (822 received) |
| Unreadable records inside the segment | **1**, `missing-qa-id`, `GET /api/health` | 0 |
| Answers by status | 136 x 2xx, 64 x 401 (20 x 401 intended) | 180 x 2xx, 20 x 401, every group as intended |
| Current token's lifetime | expired during the run | 19.9 s at the first request, 9.2 s left after the last one that needed it |
| Checks failed | correlation, multi-frame, capture usable | at least a quarter delayed |

**Observed in run 1, and what was changed for run 2:**

- The capture's health record had `dropped: null`, and `captureUsable` accepted
  that. Observed separately in the capture image: `tshark` prints a drop line
  only when it dropped something, while `dumpcap` always prints packets received
  and dropped. `dumpcap` now captures and `tshark` reads its pipe; only an
  explicitly reported zero is usable, and a missing, malformed or
  self-contradicting count is not.
- No request spanned more than one frame, including those carrying a 4 kB
  header, with receive offload off at the backend's interface. Measured
  afterwards on the running stack: with segmentation offload **on** at the
  ingress's interface a padded request reached the backend as one frame of 4304
  bytes; with it **off** there, the same request arrived as 1448 + 1448 + 1408.
  A segment now turns it off at the ingress as well, and stopping the segment
  puts back the settings recorded before it (the earlier code forced them `on`,
  which is not a veth's default for receive offload).
- 44 requests sent with the current token were answered 401. The script had
  refreshed before the limiter's drain wait and the capture start, and the 20 s
  token ran out during the run. The refresh is now inside the segment,
  immediately before the workload, identified and counted apart from the 200.
- One `GET /api/health` reached the backend with no identifier and with no line
  in the ingress log. Its record kept no address, so **where that request came
  from is not established**.

**Observed after run 1, with addresses now recorded:** a `GET /api/health` with
no identifier arrives at the backend about every 30 s from `172.18.0.3`, the
frontend container, whose own access log shows it relaying a Firefox on another
machine that has the application open at port 3000. Port 3000 is the frontend
container's NGINX, which reaches the backend without passing the ingress.
Inside the backend's namespace `localhost` resolves to `::1` first and the
filter named only `127.0.0.1`; both loopbacks are excluded now, but no request
has been observed arriving over IPv6 loopback, and the explanation first given
for run 1's request (the backend's own health check) was a guess that the later
observation does not support.

**Observed in run 2:** all 31 delayed requests were among the 100 burst requests,
which went out as five batches of 20, each awaited before the next. In the order
the ingress read them, the batches had 0, 0, 1, 11 and 19 delayed; the batches
began 0.00, 0.62, 1.48, 2.22 and 3.02 s after the first request, and an
undelayed burst request took 0.2 to 0.33 s.

**Explanations, not established:**

- *Why 31.* The figures above are consistent with the burst reaching the
  ingress only modestly faster than the zone's 20 r/s (six connections, each
  request taking a fifth to a third of a second), so that the limiter's excess
  needed about two seconds to reach its delay threshold. The explanation given
  before those timings were read - that the pause between batches let the excess
  drain so that each batch's first requests passed - is **not** what they show:
  the first two batches had no delayed request at all, and the pauses were 0.06
  to 0.21 s.
- Run 1's 69 is not comparable: 44 of its requests were 401s, which the backend
  answers faster.

**Changed for run 3** (a correction to the feasibility workload; the total of
200, the intended statuses and the minimum of 50 delayed are unchanged): the 100
burst requests and the 40 padded ones are queued together and continuously
through the profile's own connection limit, and the record now carries the
queue's verdicts in arrival order, the time to the first delayed request and the
arrival rate before it. Whether that reaches 50 is a prediction until run 3.

**The capture's scope, from run 3 on:** only traffic from the ingress's address
on the one network it shares with the backend (established from both
containers' networks and checked to be on-link from the backend; the address
and the filter are in every health record). A request from the ingress without
an identifier is still unreadable and still invalidates its segment. Traffic
that reaches the backend another way - port 3000 is one - is outside the
capture, and nothing here is evidence about it.

**Run 3, `d313d0e45`: exit status 0, every check passed.**

| | Run 3 |
|---|---|
| Matched in browser, ingress log and capture | 200 of 200, 0 problems |
| Token fingerprints agree; statuses agree | 200; 200 |
| The refresh before the workload, counted apart | in all three sources |
| Upstream streams, all reused | 6 |
| Requests the ingress logged `DELAYED` (50 required) | 80 |
| Requests reassembled from more than one frame | 40, each 1448 + 1448 + 1448 + 594 bytes; no frame over 1448 |
| Padding header present at the backend | 40 of 40 |
| Capture | usable: 841 frames received, 0 dropped (reported), 0 unreadable records, 0 retransmissions, lost or unseen segments |
| Scope | `tcp port 3001 and host 172.18.0.4`; 200 of 200 from that address, none from another |
| Answers | 40 + 100 + 40 x 200; 10 + 10 x 401, both groups `Invalid or expired token` |
| Current token's lifetime | 19.2 s at the first request, 10.3 s left after the last one that needed it |
| Offload during the segment | off at the backend and at `erp_nginx:eth0`; afterwards both ends read what they read before |

The queue's timings, which the explanation above was waiting for: the 140 queued
requests reached the ingress at 28 a second until the first delayed one, which
was the 70th, 2.43 s after the first; from there to the end all but two were
delayed (69 of the 140, over 5.72 s). The other 11 delayed requests were among
the 401s sent straight after. An arrival rate of 28 a second against a zone rate
of 20 leaves 8 a second of excess, which reaches the `delay` threshold of 20 in
about two and a half seconds. That supports the second explanation and not the
first. It also shows that queuing only the 100 burst requests continuously, with
the padded ones sent afterwards one at a time, would again have delayed about 31
of them: 69 requests passed before the first delay.

What run 3 establishes: on this stack, for these 200 requests, the browser's
record, the ingress log and the capture agree request by request, the capture
reports what it dropped, and a request too large for one frame is reassembled
from several. What it does not establish: anything about the expiry case
(case 16), which uses this pipeline but has not been run; anything about traffic
outside the capture's scope; or that a later segment will be free of unreadable
records.

The three records, with their ingress logs and reduced captures, are kept
outside the repository.

### Recorded run on `198943047` (2026-10-09): exit status 1

The first recorded run on the new limiter configuration. Chromium 153, access
lifetime 20 s and grace 5 during, 15m / 60 before and after; stack restored.
**14 of 17 passed. Case 14, case 16 and W1 failed, and the latency measurement
did not complete.** The forced-failure suites were not started: none has a
passing baseline.

**W1, as measured** (every figure from this run's `results-cases.json` and the
ingress log it captured):

| Tabs | Round | Complete after | Deadline | Usable / complete on first load | Recovery actions | Business 429 | Refused by `api_limit` | Delayed by `api_limit` | 401s | Upstream time, median / p95 / max |
|---|---|---|---|---|---|---|---|---|---|---|
| 5 | current token | **8.70 s** | 5 s | 5 / 5 | 0 | 0 of 45 | 0 | 0 | 0 | 197 / 564 / 999 ms |
| 5 | expired token | **8.91 s** | 5 s | 5 / 5 | 0 | 0 of 66 | 0 | 0 | 21 | 68 / 687 / 892 ms |
| 10 | current token | **16.48 s** | 10 s | 10 / 10 | 0 | 0 of 90 | 0 | 0 | 0 | 114 / 361 / 705 ms |
| 10 | expired token | **18.87 s** | 10 s | 10 / 10 | 0 | 0 of 180 | 0 | 114 | 90 | 47 / 232 / 875 ms |
| 20 | current token | **44.34 s** | 15 s | 20 / 20 | 0 | 0 of 275 | 0 | 0 | 95 | 120 / 705 / 1392 ms |
| 20 | expired token | **not complete** | 15 s | 0 / 0 | 0 | 0 of 155 | 0 | 0 | 152 | 33 / 265 / 453 ms |

- No session-route 429 in any round. Every limiter rejection in the whole run (86)
  was by `login_limit`; `api_limit` refused nothing.
- Where the loading rounds completed, every tab was complete on first load with
  no recovery action.
- What this run establishes is that no business request was answered 429 under
  the new configuration. It does **not** establish that delaying excess requests
  is what made them disappear: there is no comparable run of the old
  configuration on the same build and load, and in four of the six rounds the
  limiter delayed nothing at all, so the delay was not exercised there.
- **Every completed loading round missed its deadline**, by a factor of 1.7 to 3.
- In the ingress log, the first API request of a round arrived about 3 s after
  the tabs were opened at five tabs, about 7 s at ten and about 10 s at twenty;
  the last static file was served at 7.4 s, 17.0 s and 41.9 s.
- At twenty tabs the current-token round took longer than the 20 s QA access
  lifetime, so the token expired while the tabs were loading (95 answers 401,
  and two refreshes 20 s apart, both 200).
- **Twenty tabs, expired token:** a refresh was answered 200 at 18:37:36.4 UTC
  and another, 10.1 s later, was answered 401. The session's `auth_sessions`
  row has `revokeReason = replay` at 18:37:46. Every tab was signed out, the
  round did not complete, and the sign-out round that followed found no
  signed-in tab (`All promises were rejected`), which is the error W1 ended on.
- Sign-out rounds that ran: five and ten tabs, every tab on the login page
  without a reload in every attempt; an overlap with a delayed request was found
  on attempt 2 at five tabs and attempt 3 at ten.

**Diagnosis, in the order the plan gives:**

1. *Rejection:* not the cause. `api_limit` refused no request and no business
   request was answered 429.
2. *Authentication:* the cause of the failure at twenty tabs (the replay
   revocation above), and present at twenty tabs in the current-token round as
   mid-load expiry. Not a factor at five and ten tabs with a current token,
   which also missed their deadlines.
3. *Backend latency and the rest of the load:* where the time is. With no
   request refused or delayed at five tabs, the tabs still took 8.7 s. The limiter
   did not delay a single request in four of the six rounds.

**Not established:** why a second refresh token was presented 10.1 s after it had
been superseded (the 5 s QA grace is what made that a replay; with the 60 s
production grace the same gap would not have been one, which is an inference and
not a test); how much of the completion time is the page starting up, the
backend, or the measurement itself, which polls every tab's document every
250 ms; and whether another machine would meet the deadlines. Two unrelated
containers were restart-looping on the host throughout, as in earlier runs.

**Defects in the suite, found by this run** (fixed afterwards under tests, see the end of this section):

- *Case 14* failed with `no configuration file provided`. `host-probe.sh`
  resolves the repository from its own directory with one `..` too many
  (changed on this branch), so `docker compose` runs from the wrong directory.
  The case passed in every earlier recorded run.
- *Case 16* stopped at a precondition: its profile is opened without
  `keepAnswers`, so the settings it compares against were never kept. The case
  has therefore still not exercised the expiry path at all.
- *The sign-out attempt classifier* reads `round.overlap`, and W1 stores the
  verdict as `round.signOutOverlap.verdict`. Every attempt was therefore
  classified `setup-missed` and a further attempt made even after an overlap was
  found (five tabs: overlap on attempt 2, attempt 3 still run). The unit tests
  pass a field the workload never writes.
- *W1's diagnostics* count `limit_req` rejections without the zone, so
  `login_limit`'s rejections in a sign-out round appear under the same heading
  as `api_limit`'s would. The zone here comes from the ingress error log.
- *The latency measurement* ended with `writer did not open signed in` in M2 and
  wrote no results.

**The latency failure, looked into and not explained.** The run left nothing to
diagnose it from: the ingress log was no longer being followed at that point and
the measurement kept no record of what the tab showed. Run alone afterwards
against the restored stack (same build, 2026-10-09), the measurement did **not**
fail that way: all five tabs opened signed in and it completed. So the failure
did not reproduce, and its cause is not established. That separate run did fail
on its own blocking criterion: M1 median p95 8.6 ms against a threshold of 5 ms
(M2 14.1 ms against 15 ms). The measurement now writes what every tab showed and
last sent when a tab does not open signed in, and the ingress log is followed
through it.

**Fixed after the run, each under a test that failed first:**

- `host-probe.sh` resolves the repository from three directories up, and a test
  runs it and compares the result with the checkout.
- Case 16 opens its profile keeping the two settings answers; the pattern is
  shared with W1 and a test ties the case to it.
- The sign-out classifier reads the verdict where W1 writes it. Its tests now
  run on the three sign-out attempts this run recorded at five tabs, unchanged
  (`fixtures/w1-signout-attempts-198943047.json`): the second, which had found
  the overlap, is classified `overlap`.
- Limiter rejections are counted per zone, from the route, with a test that the
  route patterns are the ones in `nginx.conf`.

None of this has been run against a stack yet.

The deadlines are acceptance targets and are not changed here.

### After the failed run: the replay revocation and the completion time (2026-10-09)

Two investigations, both diagnostic. Neither changes the deadlines, the limiter
values, the QA grace or any application code.

**The replay revocation at twenty tabs** is tracked in issue #1358, which has the
full record. In short: the server's audit row shows generation 7 presented while
generation 8 was current, 9.9 s after another tab's refresh had superseded it and
4.9 s past its grace; after that successful refresh no tab used the new access
token for the 27 s until the revocation. An instrumented repeat of the round
(`diagnose-replay.mjs`, three attempts, QA configuration unchanged) did **not**
reproduce a replay. It did show a plain read of the session store from a sibling
tab taking up to 21 s while twenty tabs loaded, a refresh lease held for its
whole 20 s with no refresh sent under it, and `read timed out` errors from the
session module in every attempt. Why the superseded token was presented late is
not established; the leading hypothesis (the refreshing tab's new tokens did not
reach shared storage in time) is in the issue with what would settle it.

**Where five tabs' time goes** (`diagnose-completion.mjs`, the running stack on
`e0983cf76`, access lifetime 15m, ten loads of five current-token tabs,
alternating two ways of observing them; all times after the common trigger, for
the last of the five tabs):

| | Not observed while loading (5 loads) | Polled as W1 does (5 loads) |
|---|---|---|
| Navigation started | 0.02 to 0.11 s | 0.03 to 0.74 s |
| `DOMContentLoaded` | 2.1 to 5.4 s | 2.0 to 7.7 s |
| First API request sent | 3.6 to 12.4 s | 4.4 to 13.0 s |
| "Dashboard" heading present | 7.2 to 22.3 s, median 18.8 s | 8.3 to 23.3 s, median 19.9 s |
| W1's watcher says complete | — | 0.07 to 0.46 s after the heading |
| Data requests; answered 429; answered 401 | 45; 0; 0 in every load | 45; 0; 0 in every load |
| Long tasks on the main thread, summed over the five tabs | 21 to 77 s | 22 to 62 s |

- **The measurement is not what makes it slow.** With nothing reading the tabs
  while they load, the heading still took 7.2 to 22.3 s; W1's watcher reported
  completion within half a second of the moment the tab itself recorded.
- **Half or more of the time passes before any API request is sent.** The first
  request left 3.6 to 12.4 s after the tabs were opened; the limiter and the
  backend have nothing to act on until then.
- No request was refused or answered 401 in any of the ten loads, so this is the
  case that neither throttling nor authentication recovery explains.
- The same build and load varied threefold between loads minutes apart (7.2 s
  to 22.3 s unobserved).

**Host contention, recorded and not attributed.** The host has four cores. Its
load average was between 3.5 and 9.6 throughout these ten loads (sampled every
15 s), and two unrelated containers were restart-looping, as in every run
recorded here. Other long-running processes were using CPU on the host at the
time. Nothing was stopped. Whether the completion times, or their threefold
spread, are caused by that contention is **not** established by this
measurement: there is no load taken on the same host while it was idle.

### Five tabs, three ways of observing them (2026-10-09, second measurement)

The first measurement above could not separate the application from the
observation: its unobserved variant still had a recorder installed in every tab.
This one adds a **bare** variant, with nothing installed in the tabs and nothing
touching them while they load; the tabs are read once afterwards, from what the
browser records anyway. `diagnose-completion.mjs`, the running stack on
`721b7107f`, access lifetime 15m, 18 loads of five current-token tabs in
rotation. All times after the common trigger, for the last of the five tabs;
ranges with medians.

| | Bare (6 loads) | Recorder in the tab (6) | Recorder and W1's polling (6) |
|---|---|---|---|
| `DOMContentLoaded` | 1.33 to 1.73 s, 1.48 | 1.27 to 1.95 s, 1.47 | 1.24 to 2.14 s, 1.67 |
| First data request sent | 2.23 to 3.65 s, **2.95** | 2.61 to 4.30 s, 2.94 | 2.20 to 4.88 s, 2.98 |
| Last data answer received | 4.29 to 5.47 s, **4.59** | 4.42 to 5.84 s, 4.65 | 4.15 to 6.35 s, 4.58 |
| Largest contentful paint | 5.29 to 6.70 s, **5.52** | 5.44 to 6.55 s, 5.72 | 5.14 to 7.32 s, 5.52 |
| "Dashboard" heading present | not recorded | 5.31 to 6.44 s, 5.64 | 5.06 to 7.20 s, 5.38 |
| W1's watcher says complete | — | — | 5.11 to 7.27 s, **5.61** |
| Long tasks, summed over the five tabs | 12.0 to 19.0 s | 13.1 to 16.4 s | 11.9 to 21.7 s |
| Data requests; 429; 401 | 45; 0; 0 | 45; 0; 0 | 45; 0; 0 |

- **Observation is not what the time is made of.** The three variants' medians
  for the last answer (4.59, 4.65, 4.58 s) and for the largest contentful paint
  (5.52, 5.72, 5.52 s) lie inside each variant's own spread. W1's watcher
  reports 0.05 to 0.36 s after the heading the tab itself recorded.
- **With nothing observing them, the five tabs did not paint their content
  within 5 s in any of the six bare loads** (5.29 to 6.70 s). The last data
  answer was in by 5 s in four of the six.
- **Where the time goes, bare, by medians:** about 2.9 s before the first data
  request is sent, about 1.6 s from the first request to the last answer, and
  about 0.9 s from the last answer to the paint (0.9 to 1.6 s).
- No request was refused or answered 401 in any of the 18 loads, and the
  limiter has nothing to act on for the first 2.9 s.

**Host contention, recorded and not attributed.** One-minute load average 1.26
to 5.46 on four cores during these loads (sampled every 15 s), two unrelated
containers restart-looping, other long-running processes present. Nothing was
stopped. The first measurement, taken at 3.5 to 9.6, has the heading at 7.2 to
23.3 s for the same build and load. The two together show the times moving with
the host's state; they are not a controlled comparison, and there is still no
measurement on this host while idle.

What this does and does not settle: the miss at five tabs is in the application
and the browser on this host, not in W1's measurement, the limiter, or
authentication recovery. It does not say how much is the application's own work
and how much is this host's capacity; that needs another machine or an idle
host. The deadlines are unchanged.

### Five tabs on the quiet host, and where the time before the first request goes (2026-10-09)

Both are diagnostic and read-only. The deadlines and the limiter configuration
are unchanged, and nothing here is a proposal to change either.

**Five tabs again, with the host quiet when the measurement began.** The running
stack on `650ef081c`, 24 loads, eight per variant. One-minute load average 0.62
at the start; the measurement's own browser work took it to between 2 and 4, peak
5.30. Two unrelated containers were restart-looping as always; nothing was
stopped. For the last of the five tabs, ranges with medians:

| | Bare | Recorder in the tab | Recorder and W1's polling |
|---|---|---|---|
| First data request sent | 2.48 to 4.13 s, 2.86 | 2.38 to 3.77 s, 2.70 | 2.68 to 3.43 s, 3.20 |
| Last data answer received | 4.10 to 5.32 s, 4.72 | 3.79 to 5.52 s, 4.40 | 3.85 to 4.29 s, 4.02 |
| Largest contentful paint | 5.02 to 6.52 s, 5.60 | 4.82 to 6.34 s, 5.35 | 4.65 to 5.52 s, 5.09 |
| W1's watcher says complete | — | — | 4.66 to 5.75 s, 5.18 |
| Painted within 5 s | 0 of 8 | 3 of 8 | 2 of 8 |
| Last answer within 5 s | 6 of 8 | 7 of 8 | 8 of 8 |

Five tabs sit at the deadline on this host: unobserved, the last tab painted 0.02
to 1.5 s after it in all eight loads, and the first load, begun at a load average
of 0.62, at 5.91 s. With the host contended (3.5 to 9.6) the same build took 7 to
23 s. So contention explains the large misses and does not explain the last half
second. The variants ran at different points of the rotation, and their
differences are within their own spread.

**How it scales with the number of tabs.** Bare variant only, five loads at each
size, load average 0.6 to 3.5. Medians; the first three columns are per tab,
from that tab's own navigation, the last two for the last tab of the load:

| Tabs | `DOMContentLoaded` | Last script loaded | First data request | Long tasks before it | Long tasks in all, per tab | Last data answer | Largest contentful paint |
|---|---|---|---|---|---|---|---|
| 1 | 0.47 s | 0.66 s | 0.75 s | 0.33 s | 0.83 s | 1.35 s | 1.75 s (1.59 to 1.94) |
| 2 | 0.55 s | 0.85 s | 0.90 s | 0.42 s | 0.93 s | 1.89 s | 2.26 s (2.22 to 2.31) |
| 3 | 0.78 s | 1.15 s | 1.30 s | 0.58 s | 1.51 s | 2.63 s | 3.20 s (3.04 to 3.89) |
| 5 | 1.19 s | 1.88 s | 2.06 s | 1.04 s | 2.73 s | 3.92 s | 4.99 s (4.78 to 6.71) |

- One tab alone sends its first data request 0.75 s after it is opened and has
  painted its content by 1.75 s. Every phase stretches as tabs are added: the
  same tab's main-thread long tasks take 0.83 s alone and 2.73 s among five.
- Before its first data request a tab loads 26 scripts, then the dashboard's own
  chunk and its charts: 1.59 MB of script once decoded, all from the browser's
  cache in these loads (nothing transferred). Alone, those are in hand 0.1 s
  after navigation; among five tabs the last arrives at about 1.9 s.
- The first data request follows the last script by under 0.2 s at every size.
  The time before it is the page starting up, and the limiter and the backend
  have nothing to act on until it is over.

**What is and is not established.** Established on this host: the miss at five
tabs is not W1's measurement, the limiter, authentication recovery, or a refused
request; the time before the first data request is page start-up; and start-up
slows as more tabs start together. Not established: whether that slowing is the
processor (five tabs' start-up on four cores, alongside the stack itself), the
disk the browser's cache is read from, or something else; and what another
machine would do. This is a question about the application's start-up cost or
about the acceptance targets, and it is outside the ingress change.

### Recorded run on `db0cc890e` (2026-10-09): exit status 1

The acceptance rerun on the same host, after the suite fixes. **15 of 17 passed.
W1 and case 16 failed, and the latency measurement did not complete.** Stack
restored. The host's one-minute load average ranged from 0.85 to 12.56 during
the run (76 samples, 30 s apart); nothing was stopped, and no figure below is
attributed to it.

**What the fixes did:** case 14 passed. The sign-out classifier stopped at the
attempt that found the overlap (five tabs, attempt 1). Limiter rejections are
reported per zone: every one in W1 was `login_limit`, none `api_limit`.

**W1:**

| Tabs | Round | Complete after | Deadline | Usable / complete on first load | Recovery actions | Business 429 | Session-route 429 | Delayed by `api_limit` |
|---|---|---|---|---|---|---|---|---|
| 5 | current token | **6.55 s** | 5 s | 5 / 5 | 0 | 0 of 45 | 0 | 0 |
| 5 | expired token | **8.45 s** | 5 s | 5 / 5 | 0 | 0 of 90 | 0 | 47 |
| 10 | current token | **15.01 s** | 10 s | 10 / 10 | 0 | 0 of 90 | 0 | 0 |
| 10 | expired token | **19.22 s** | 10 s | 10 / 10 | 0 | 0 of 180 | 0 | 126 |
| 20 | current token | **33.26 s** | 15 s | 20 / 20 | 0 | 0 of 292 | 0 | 14 |
| 20 | expired token | **31.53 s** | 15 s | 20 / 20 | 0 | 0 of 244 | 0 | 27 |

- Every loading round completed this time, the twenty-tab expired-token round
  included: 20 of 20 usable, and the session was not revoked. That the replay of
  the earlier run did not recur here does not show it cannot (#1358).
- Every tab in every loading round was complete on first load with no recovery
  action, and no request was answered 429 by `api_limit` or on a session route.
- **All six loading rounds missed their deadlines**, by a factor of 1.3 to 2.2.
- **Sign-out rounds:** every tab reached the login page without a reload in all
  seven attempts, with the logout answered 2xx and no session-route 429. An
  overlap with a delayed request was found at five tabs (attempt 1) and **not**
  at ten or twenty tabs in three attempts each, so those two checks failed as
  inconclusive. In those six attempts no request was being delayed by
  `api_limit` at the moment of the sign-out.

Failed checks, exactly: the deadline check of all six loading rounds, and the
overlap check at ten and at twenty tabs. Nothing else in W1 failed.

**Case 16** failed in 44 s with `Cannot read properties of undefined (reading
'companyName')`, during calibration. Two further defects in a case that had never
run: it passed `shell.reference` where `shellReference` returns the reference's
members directly, and it derived the longest configured hold from a limit read
without its `delay`, so that figure was `null`. Both are fixed under tests after
this run. **The case has still not exercised the expiry path.**

**The latency measurement** failed differently from last time: `m3: the page
load did not settle within 45 s`, in the four-tab loads. Twice in two recorded
runs it has not completed, each time for another stated reason, and once run
alone it did complete. Not explained.

No forced-failure suite was started: neither W1 nor case 16 has a passing
baseline.

### Case 16 run alone, twice (2026-10-09): partial runs, not evidence

`QA_ONLY=16` through `run.sh`, so each is marked partial and neither is a
recorded run. They were made to find out why the case could not get started
without spending a full run on each fault.

- **`b03a4a96d`:** calibration completed for the first time (ten samples,
  recovery deadline 4582 ms). The case then stopped at "a current access token is
  answered 2xx" with a 401: it read the stored token after a drain wait longer
  than its 20 s lifetime. Fixed afterwards: a current token is obtained through
  the application, and the fillers are sent just before the tab and in a
  continuous queue large enough to reach the limiter's delay threshold (the
  plan's 30 fillers in batches of six could not; measured in the feasibility
  run).
- **`7a632336b`:** the case reached an attempt for the first time and reported
  `fail`, "the tab completed after the recovery deadline". **That verdict is an
  artefact of the case's own evidence code and says nothing about the
  application.** What the attempt's ingress log and capture show:
  - the limiter did delay (128 of the 160 fillers), so the filler change worked;
  - the tab's own requests were not delayed: its first one arrived after the
    fillers had finished, was answered 401 undelayed, and the tab refreshed and
    had all its data answered 2xx about half a second later;
  - all 17 probes were answered 401 and arrived within half a second of each
    other, not spread across the expiry: the fillers, the probes and the tab
    share one browser profile and so one pool of six connections, and the
    probes and the tab queued behind the fillers;
  - one request from the ingress had no identifier, a logo under `/uploads/`,
    which the ingress also proxies to the backend and the harness does not tag,
    so the capture segment was unusable.

  And in the case's evidence code, read after this run: the completion result
  of the attempt is never passed back to it, so "complete within the deadline"
  is false for every attempt whatever happened; the delayed request is looked
  for under a path the dashboard does not request; the response message is read
  from a record that does not hold response bodies; and correlation is run over
  the application's requests only, so every filler and probe is counted as a
  problem (378 here).

Case 16 had therefore **not yet produced a verdict that meant anything**, in
either direction. The `fail` above is an invalid harness verdict; the attempt's
ingress lines and reduced capture are kept as a test fixture
(`fixtures/case16-attempt-7a632336b.json`), on which the rebuilt evidence code
finds that attempt inconclusive with a recovery of 1.56 s.

**Rebuilt, then run alone on `721b7107f` (partial, not evidence).** The proof and
the criteria are unchanged. The fillers and the probes each run in a browser
context of their own; the attempt's completion is handed to the judgement and
recovery is timed from the tab's first 401; L, X and P are selected from what was
observed; only a 401's message is kept; `/uploads/` requests are tagged. Result:
five attempts, **all inconclusive, none failed**, each for the same single
reason.

| | All five attempts |
|---|---|
| Capture | usable: 0 dropped (reported), 0 unreadable records, nothing unexplained, nothing missing |
| One address for the tab, the probes and the fillers | yes (`172.18.0.1`), so one limiter bucket |
| Probes on schedule | yes: spans of 2.39 to 2.41 s, widest gap 188 to 237 ms |
| Requests of the tab delayed by the limiter and answered 401 | 9 in every attempt |
| The tab recovered by itself | yes: 2.15 to 2.28 s from its first 401, against a deadline of 3.95 s; no recovery action |
| L's and X's message | `Invalid or expired token`, both, every attempt |
| **Expired at upstream arrival** | **shown in every attempt**: a probe with the same token had been answered "expired", its answer gone 23 to 130 ms before L's first byte reached the backend |
| **Valid when sent** | **not shown in any attempt**: L reached the ingress 88 to 682 ms *after* the last probe the backend still accepted |

So the harness now works end to end, and what it has shown five times is a
request delayed by the limiter that reached the backend after its token had
expired, followed by the tab recovering inside the deadline. What it has not
shown is that the token was still valid when that request left the browser: the
tab was sent too late, so the request may already have carried an expired token
to the ingress. That is a matter of setup, and the case now sends the tab
earlier in the next attempt by what the last one observed
(`nextNavigateLead`, bounded by the same five attempts). It changes nothing
about what counts as evidence.

**Run alone again on `650ef081c` with that correction (partial, not evidence):
the case passed on its third attempt.** Exit status 0 for the partial run. The
recovery deadline, calculated and recorded before the attempts, was 4462 ms.

| Attempt | Tab navigated before expiry by | Verdict | Why |
|---|---|---|---|
| 1 | lead + 300 ms | inconclusive | L reached the ingress 91 ms after the last probe the backend accepted |
| 2 | lead + 541 ms | inconclusive | 46 ms after |
| 3 | lead + 737 ms | **pass** | below |

Attempt 3, every figure from its ingress log and capture segment:

- **L** was the tab's `GET /api/settings/company`, chosen from the evidence:
  delayed by the limiter (`DELAYED`), answered 401 `Invalid or expired token`,
  carrying the stored token's fingerprint in the browser's record and in the
  capture.
- **Valid when sent:** probe P, same token, answered 200, reached the ingress
  29 ms **after** L did (ingress clock; the margin is 5 ms).
- **Expired at upstream arrival:** probe X, same token, answered 401
  `Invalid or expired token`; its answer had left the backend 100 ms **before**
  L's first byte arrived there (capture clock; the margin is 1 ms). L spent
  about 390 ms between reaching the ingress and reaching the backend.
- **Recovered by itself:** the tab held its data 1.69 s after its first 401,
  with no recovery action and no 429 on a session route.
- Capture usable (0 dropped, reported; nothing unreadable, unexplained or
  missing), one address for the tab, the probes and the fillers, probes on
  schedule (span 2.29 s, widest gap 195 ms).

What this is and is not: the first time the case has shown the whole crossing,
on evidence that passed every check. It was a **partial run**, so it is not a
recorded baseline, and the forced failures of the case still need one made
through a full recorded run. It is one passing attempt after two that missed
the window by under 100 ms; the window is narrow (the limiter held L for about
0.4 s) and probes are 150 ms apart, so a pass depends on timing that the
attempts have to find. It shows one page and one role.

### Sign-out under induced delay, case 17, run alone on `f2ce87c67` (2026-10-09): partial, not evidence

Design amendment of 2026-10-09: W1's natural sign-out rounds keep their session
and end-state gates and report the overlap as a diagnostic; the overlap is gated
by a separate, **induced-delay** scenario, in which filler traffic from another
browser context keeps the limiter delaying. It does not show that a restored
window produces that delay by itself.

First run of the case, `QA_ONLY=17`, so a partial run. **Five tabs passed on the
third attempt; ten and twenty tabs were inconclusive in all three attempts.**
Exit status 1.

**Behaviour, in all nine attempts:** the logout was answered 204, every
application tab reached the login page in the document it first loaded, and no
request to `refresh`, `logout` or `me` was answered 429. One address for the
application and the fillers in every attempt.

**What the ingress log shows about the delay and the sign-out:**

| Tabs, attempt | Application requests delayed | Aborted by the client while delayed (never forwarded / forwarded) | Of those, within 0.3 s before the logout | Outstanding when the logout arrived | Application requests after the logout | Longest hold |
|---|---|---|---|---|---|---|
| 5, 1 | 18 | 1 (1 / 0) | 1 | 0 | 0 | 342 ms |
| 5, 2 | 18 | 7 (7 / 0) | 7 | 0 | 0 | 377 ms |
| 5, 3 | 27 | 5 (5 / 0) | 4 | **1** | 0 | 386 ms |
| 10, 1 | 40 | 5 (5 / 0) | 5 | 0 | 0 | 343 ms |
| 10, 2 | 32 | 5 (1 / 4) | 5 | 0 | 0 | 458 ms |
| 10, 3 | 22 | 0 | 0 | 0 | 0 | 346 ms |
| 20, 1 | 3 | 0 | 0 | 0 | 0 | 70 ms |
| 20, 2 | 14 | 3 (3 / 0) | 3 | 0 | 0 | 183 ms |
| 20, 3 | 0 | 0 | 0 | 0 | 0 | — |

- **The delay was induced at five and ten tabs** (18 to 40 application requests
  delayed per attempt), weakly at twenty (0 to 14). At twenty tabs the fillers
  reached the ingress at about 21 a second in the three seconds before the
  logout and at 8 to 15 at the smaller sizes; why the limiter delayed the
  application less at twenty is not established.
- **A hold is short.** The limiter held an application request for at most
  0.34 to 0.46 s at five and ten tabs; a filler's median hold was about 45 ms.
- **The application aborts its own in-flight requests when it signs out, before
  the logout is sent.** In six of the nine attempts, one to seven application
  requests that the limiter was delaying end in the log with status 499 (closed
  by the client), all within 0.3 s before the logout's arrival, most of them
  never forwarded to the backend. No application data request arrives after the
  logout in any attempt. (`frontend/src/session/runtime.ts` aborts the session's
  requests when the session ends.)
- So a delayed application request **outstanding at the moment the logout
  reaches the ingress** is something the application's own ordering all but
  excludes: the one attempt that had it (five tabs, attempt 3) was a request
  that reached the ingress in the same millisecond as the logout and was aborted
  30 ms later.

**What follows, and what does not.** The case's evidence condition, as written
(`startMs < logout's startMs < endMs`), tests for a state the application is
built not to be in. The log does show what a sign-out does to an application
request the ingress is holding: it is aborted by the client, the logout follows,
and nothing of the application arrives afterwards. Whether an aborted held
request is the evidence the scenario should require is a decision about the
scenario, not made here. Nothing in this run is a behavioural failure, and
nothing in it bears on the completion deadlines.

### Case 17 revised and run alone on `e7ccd9a6c` (2026-10-09): partial, not evidence

Second amendment to the scenario, after the run above. The evidence is taken at
the **start of the sign-out** and not when the logout reaches the ingress: the
harness records when the sign-out was initiated and which data requests of the
application were pending immediately before it; the same request, by its
identifier, must have an ingress line saying the limiter was delaying it; and
what became of it is recorded, a cancellation counting only when it is the
sign-out's and not the harness closing the tab, a navigation, or anything else.
A signed-out tab showing stale data is a behavioural failure. The window before
the logout is recorded as corroboration and decides nothing. The earlier run's
attempts are **not** re-counted under this definition; they stand as recorded.

The fillers now come from the harness's own Node process (40 a second, at most
12 outstanding, bounded and stopped on every exit). Diagnosis that led to it,
from the earlier run's ingress log: replaying the zone's bucket from the logged
arrivals, the excess was above the delay threshold for 76 to 93% of the six
seconds before the logout at five tabs, 43 to 54% at ten and 6 to 10% at twenty,
where browser-context fillers arrived with gaps of up to 0.46 s.

**Result: passed at 5, 10 and 20 tabs, each on its first attempt.** Exit status
0 for the partial run.

| | 5 tabs | 10 tabs | 20 tabs |
|---|---|---|---|
| Data requests of the application pending when the sign-out was initiated | 31 | 43 | 103 |
| Of those, delayed by the limiter per the ingress log (same identifier) | 12 | 18 | 17 |
| Of those: cancelled by the sign-out / answered | 9 / 3 | 14 / 4 | 12 / 5 |
| Any pending request with another fate (cleanup, navigation, other, unknown) | none | none | none |
| Cancellations fell, after the sign-out was initiated | 0.25 to 0.71 s | 0.32 to 1.81 s | 0.00 to 2.35 s |
| Logout answered, after the sign-out was initiated | 0.88 s, 204 | 2.19 s, 204 | 2.98 s, 204 |
| Tabs on the login page, same document, no stale data | 5 of 5 | 10 of 10 | 20 of 20 |
| 429 on `refresh`, `logout` or `me` | 0 | 0 | 0 |
| Fillers at the ingress: sent / delayed / refused | 206 / 166 / 0 | 311 / 270 / 0 | 580 / 514 / 0 |
| Address of the application and of the fillers | one | one | one |
| Corroboration only: aborted while delayed in the 0.3 s before the logout; outstanding when it arrived | 6; 0 | 7; 0 | 3; 0 |

- The requests that are the evidence came from four tabs at five and ten tabs
  and from seven at twenty, the signing-out tab's own among them.
- About half of them had already been forwarded to the backend when they were
  cancelled or answered; the rest were still being held by the limiter.
- No generator was left running after the case.

What this is: the first time the scenario has shown, at all three sizes, a data
request of the application that was pending when a tab signed out, was being
delayed by the ingress, and was then cancelled by the sign-out or answered, with
the sign-out itself behaving. What it is not: a recorded baseline (a partial
run); evidence that a restored window produces that delay by itself (the delay
was induced); or anything about the completion deadlines, which are unmet on
this host and unchanged.

### Recorded run on `3fc7c3e9f` (2026-10-09): exit status 1; cases 16 and 17 have recorded baselines

A full recorded run: the whole suite from the repository at HEAD, served build
equal to HEAD, access lifetime 20 s and grace 5 during, stack restored to
15m / 60. **17 of 18 passed. Cases 1 to 17 passed; W1 failed. The latency
measurement completed and passed** (M1 and M2). One-minute load average 0.21 to
8.73 during the run, recorded and not given as a cause.

**The run's result is a failure, and it is W1's:** exactly the six completion
deadlines, and nothing else.

| Tabs | Round | Complete after | Deadline | Usable / complete on first load | Recovery actions | Business 429 | Session-route 429 | Delayed by `api_limit` |
|---|---|---|---|---|---|---|---|---|
| 5 | current token | **5.46 s** | 5 s | 5 / 5 | 0 | 0 of 45 | 0 | 0 |
| 5 | expired token | **6.80 s** | 5 s | 5 / 5 | 0 | 0 of 90 | 0 | 62 |
| 10 | current token | **10.96 s** | 10 s | 10 / 10 | 0 | 0 of 90 | 0 | 34 |
| 10 | expired token | **17.15 s** | 10 s | 10 / 10 | 0 | 0 of 180 | 0 | 148 |
| 20 | current token | **25.86 s** | 15 s | 20 / 20 | 0 | 0 of 266 | 0 | 117 |
| 20 | expired token | **22.73 s** | 15 s | 20 / 20 | 0 | 0 of 186 | 0 | 0 |

Every other W1 check passed: every tab usable and complete on first load, no
recovery action, no 429 from `api_limit` or on a session route, the token state
each round claims, and in the natural sign-out rounds the logout answered 2xx
and every tab on the login page without a reload. The session was not revoked.
The natural sign-out's overlap, now a diagnostic: overlap at five tabs, overlap
absent at ten and twenty. This is the third recorded run on this host to miss
every deadline. The deadlines are unchanged, and W1 has no passing baseline.

**Per-case baselines.** By the rule agreed before the run, cases 16 and 17 each
qualify individually from this run only if the run is a full recorded one, the
case's own prerequisites and evidence passed, its final capture-health check
passed, and no shared setup failure or session loss affected it. An unrelated
failure does not invalidate their evidence; W1 ran after both.

**Case 16: baseline established.** Recovery deadline 3120 ms, calculated and
recorded before the attempts.

- *Attempt 1, inconclusive.* The capture segment held one unreadable record: a
  response from the backend with no request, at the very start of the segment
  (its request had been sent before the capture began). The attempt was not
  judged on it. The tab had recovered in 2.24 s.
- *Attempt 2, pass.* L was the tab's `GET /api/settings/company`: delayed by the
  limiter, answered 401 `Invalid or expired token`, the stored token's
  fingerprint in the browser's record and in the capture. *Valid when sent:* a
  same-token probe answered 200 reached the ingress 51 ms after L did (margin
  5 ms). *Expired at upstream arrival:* a same-token probe answered
  `Invalid or expired token` had left the backend 50 ms before L's first byte
  arrived (margin 1 ms). *Recovered by itself:* data 1.65 s after the tab's
  first 401, no recovery action, no session-route 429. One address for the tab,
  the probes and the fillers; probes on schedule; nothing unexplained or
  missing.
- *Final capture-health check:* the passing attempt's segment is usable, with
  0 dropped (reported) and 0 unreadable records. The first attempt's segment is
  reported unusable, which is what made that attempt inconclusive.

**Case 17: baseline established.** Each size passed on its first attempt.

| | 5 tabs | 10 tabs | 20 tabs |
|---|---|---|---|
| Data requests pending when the sign-out was initiated | 18 | 50 | 52 |
| Of those, delayed by the limiter (same identifier in the ingress log) | 14 | 14 | 9 |
| Of those: cancelled by the sign-out / answered | 12 / 2 | 10 / 4 | 2 / 7 |
| Pending requests with any other fate | none | none | none |
| Logout; tabs on login, same document, no stale data | 204; 5 of 5 | 204; 10 of 10 | 204; 20 of 20 |
| Session-route 429 | 0 | 0 | 0 |
| Fillers at the ingress: sent / delayed / refused | 190 / 138 / 12 | 298 / 257 / 0 | 538 / 481 / 0 |
| Address of the application and of the fillers | one | one | one |

At five tabs twelve fillers were refused by `api_limit` (the excess passed the
burst); no application request's verdict depends on that.

What the two baselines are: recorded evidence, from a full run, that the two
scenarios hold on this stack. What they are not: evidence about the completion
deadlines; evidence that a restored window produces delay at a sign-out by
itself (case 17's delay is induced); or more than one recorded run each.

### Forced failures for cases 16 and 17 (2026-10-09), all on `1c093959f`

Eleven runs, each through `run.sh` with a patched copy of the suite outside the
repository (`QA_SUITE_OVERRIDE`) and one case (`QA_ONLY`), so each is a partial
run and none is evidence of a pass. QA configuration during each (access 20 s,
grace 5), stack restored after each. The expected result of every run was
written down before it was started; stale-evidence runs, which show the case
refusing to judge, are listed apart from behavioural ones. W1's forced failures
were not run: W1 has no passing baseline.

**The override baselines** (the unmodified copy through the same invocation):
case 17 exit 0, all three sizes on the first attempt; case 16 exit 0, on its
second attempt. They validate the override path itself, which had never been
run: until `1c093959f` it mounted the copy in place of the repository, and the
suite imports from `nginx/`, so a patched copy could not have started.

**Case 17, sign-out under induced delay**

| Run | Kind | Result | Against what was written down |
|---|---|---|---|
| Fillers never started | stale evidence | 5, 10, 20: inconclusive, "no filler request reached the ingress", one attempt each | as expected |
| Ingress log withheld | stale evidence | 5, 10, 20: inconclusive, "the ingress log ... could not be read", one attempt each | as expected |
| Logout answered 500 by the harness | behavioural | 5, 10, 20: `fail`, behaviour failed, "the logout was answered 500", one attempt each | as expected |
| Sign-out after the fillers were stopped and a fixed 10 s | behavioural | 5 and 10: inconclusive in three attempts each, nothing pending. **20: passed** | not as expected at 20 |
| Sign-out once the fillers were stopped and no application request had been pending for 3 s | behavioural, corrected | 5, 10, 20: inconclusive in three attempts each, 0 pending, logout 204 and every tab on the login page in all nine | as expected |

- *Logout 500:* the logout check itself fired at all three sizes. There was no
  precondition failure at ten or twenty tabs to be set apart as collateral.
- *The deviation at twenty tabs was the mutation's, not the check's.* After the
  fixed 10 s, 179 data requests were still pending at twenty tabs, 25 of them
  delayed: the tabs had not finished loading, so the case found its evidence and
  passed that size, correctly. The expectation was corrected in writing, with
  that reason, before the corrected mutation was run; no judgement was changed.

**Case 16, a token that expires while the ingress delays its request**

| Run | Kind | Result | Against what was written down |
|---|---|---|---|
| Probes never sent | stale evidence | inconclusive in all five attempts | verdict as expected; the reason given was wrong (below) |
| The capture's health record withheld | stale evidence | stopped at the precondition "a capture segment starts, stops and finalises with a health record ..."; no attempt made | as expected |
| The application's requests not tagged | stale evidence | inconclusive in all five attempts, "the capture is not usable" | as expected |
| Recovery deadline forced to 1 ms after calibration | behavioural | `fail` on the first attempt, behaviour failed, "the tab completed after the recovery deadline" (recovery 2084 ms); no second attempt | as expected, with the limit below |

- *What the 1 ms run shows, and what it does not.* That attempt's crossing
  evidence was **not** complete: its capture was unusable, and the last probe the
  backend accepted reached the ingress before L did. So the run demonstrates that
  a behavioural failure takes precedence over the evidence and ends the case. It
  does **not** establish that the deadline check rejects an otherwise valid
  crossing; the only coverage of that combination is the unit test on the
  recorded fixture (evidence complete, recovery one millisecond past the
  deadline, verdict `fail`).
- *A wrong reason, fixed afterwards.* With no probes sent, the attempt said the
  application, the probes and the fillers "did not share one address", because
  the probes' list of addresses was empty. No probe arriving is not a probe
  arriving from elsewhere. The check now says which kind of request never
  reached the ingress; three tests pin it. The verdict was the right one.

Kept outside the repository, for each run: the commit, the stack's configuration
during it, the exact diff of its mutation against the suite, its log and its
results; and the file of expectations with its dated correction.

**An unexplained event, recorded apart:** one run of the unit suite reached its
300 s limit without printing a result. Every file passes alone in seconds, and
the six full runs made immediately afterwards each passed in about 10 s. Its
cause was not found.

### #1353's acceptance changed to a device measurement (2026-10-09): agreed, not yet run

Decided by the repository owner after the three recorded runs above, and
**before** any measurement against the new terms was made.

| Term | Value |
|---|---|
| Workload | five tabs opened together, Firefox on the user's normal device, through the ingress (port 80) |
| Outcome | every tab holds its expected data, no recovery click |
| Deadline | **8 s**, current-token round and expired-token round alike; from the common tab-opening trigger to the last tab holding its data, client-observed, including authentication, retries and rendering |
| If missed | investigate and report; the 8 s is not raised |
| Configuration | normal: 15-minute access tokens, 60 s refresh grace |
| Expired round | every application tab closed, the stored token's expiry read and verified, timer from the opening of the tabs |
| Sign-out | one tab signs out; all five on the login page, no reload, nothing of the session shown |
| Negative checks | a page that never completes is judged failed; a passing round judged against 1 ms fails |
| Diagnostic | ingress figures; the 10- and 20-tab timings (#1359) |

What this does **not** do: it does not rejudge anything above. The three
recorded runs failed 5 / 10 / 15 s and stay failures against the gates they
were run under. The Chromium harness results and the short-lifetime results of
cases 16 and 17 are separate evidence.

The acceptance is the outcome only: expected data within 8 s, zero recovery
actions, bounded automatic retries allowed. **A refused business request is a
diagnostic and no zero-refusal requirement exists**, on the device or in the
harness. In the harness the time blocks at no size: it is Chromium on the QA
host, a different environment, and is reported against 5 / 10 / 15 s (#1359).
The harness's own checks on the session routes (no 429 on `refresh`, `logout`
or `me`), on every tab being usable and on zero in-app recovery actions are
separate from this acceptance and still block at 5, 10 and 20 tabs. No harness
run has been made since the time stopped blocking.

(Commit `06ef34ca6` briefly made the harness block at 8 s at five tabs and made
the device script count a request left failed against a tab. Both were
corrected in the next commit, before any device measurement and before any
harness run under them.)

The measurement is `frontend/qa/cross-tab-session/device/restored-window.js`
(procedure in the suite's README, "Device acceptance").

**The device measurement was run later the same day and passed; see "The device acceptance, run" below.** When this section was written it had not been.

#### Rehearsals of the tool (not the acceptance)

Three rehearsals in Playwright's Firefox 155.0, headless, in a container **on
the server host** (4 logical processors, shared with the stack), signed in as
the administrator, normal token configuration. They check that the script
works; the device and the browser build are not the user's.

| Rehearsal | Round | Token at start | Last tab complete | Against 8 s | `/api` requests | Refused | Delayed by `api_limit` |
|---|---|---|---|---|---|---|---|
| 1 | current token | current, 898 s left | **9.41 s** | fail | 55 (44 x 200, 11 x 304) | 0 | 0 |
| 2 | current token | current, 899 s left | **9.29 s** | fail | 55 (45 x 200, 10 x 304) | 0 | 0 |
| 2 | expired token | expired 23.6 s before | **9.02 s** | fail | 97 (56 x 200, 41 x 401) | 0 | 65 |
| 3 | current token | current | **9.35 s** | fail | not collected | not collected | not collected |

- **Every loading round of every rehearsal missed 8 s.** These rehearsals
  neither pass nor fail the device acceptance. In each, all five tabs
  did hold their expected data, with no interaction and no reload. Why this is
  slower than the harness's Chromium at five tabs (5.46 s and 6.80 s on
  `3fc7c3e9f`, as a different user) is **not established**.
- The measurement's own cost was recorded in rehearsal 3: 12 to 20 looks per
  tab, 14 to 44 ms per tab in total. It does not account for the miss.
- The expired round's expiry was read from storage, not assumed: the token
  state read `current` thirteen times at one-minute intervals, then `expired`.
- Sign-out round: pass in all three (all five tabs on the login page 4.2 to
  5.3 s after the trigger, no reload).
- Negative checks: a page that is not the dashboard was judged failed, in all
  three. The 1 ms check showed nothing in any rehearsal, because no round
  passed for it to be applied to; it is tested without a browser in
  `device-acceptance.test.mjs`.
- **Observed, outside #1353 (filed as #1360):** in both collected sign-out rounds one
  `GET /api/auth/show-default-credentials` was refused with 429 by `login_limit`
  (five tabs arrive on the login page together; that zone is 5 r/m, burst 3).
  The login page treats a failed answer as "do not show the hint". Whether a
  sign-in made straight afterwards is refused was not tested.
- Two defects of the tool were found by rehearsal 1 and fixed before the
  others: a failure reason repeated the company name, and the 1 ms check
  reported that it held when applied to a round that had already failed.

#### A defect of the tool found on the device (2026-10-09), before any round was run

On the user's Firefox, **Prepare** was pressed at `http://10.1.1.34` where no
session had been stored yet. The script read the token state with
`indexedDB.open('erp-session')`, which **creates** a database that does not
exist: empty, at version 1, without the application's `kv` store. The
application opens the same name at the same version, gets no upgrade, finds no
store, and showed "Session storage unavailable" at that address.

Reproduced in Playwright Firefox 155.0 with a fresh profile: with the script as
it was, the database `erp-session` existed afterwards and `/login` showed the
storage-unavailable screen; with the creation aborted in `onupgradeneeded`, no
database was left and `/login` showed the sign-in form. The rehearsals above
had not met it because they signed in before the script ran. No round had been
measured on the device when this happened, and the application behaved as
designed for a store it cannot use.

#### The device acceptance, run (2026-10-09): passed

Run by the repository owner. **Firefox 157.0.1 (64-bit) on a Windows 11 PC, 32 GB
of memory, 8 logical processors, 2560x1080**, at address 10.1.1.250, against
`http://10.1.1.34` (port 80, the ingress). Script `device-acceptance 1` as of
`1a5773b1a`. Stack: access tokens 15 m, refresh grace 60 s; the mounted
`nginx.conf` has the repository file's hash. The complete result is
`frontend/qa/cross-tab-session/fixtures/device-acceptance-2026-10-09.json`,
as the script produced it.

| Round | Token when the tabs opened | Tabs | Last tab complete | Against 8 s | Interactions / reloads | Verdict |
|---|---|---|---|---|---|---|
| Current token, first try | current, 866 s left | 1 of 5 opened (pop-ups blocked) | not measured | not judged | 0 / 0 | **void**, repeated |
| Current token | current, 793 s left | 5 | **3.55 s** (1.34, 2.43, 2.48, 2.78, 3.55) | inside | 0 / 0 | **pass** |
| Expired token | expired 157.5 s before, read from storage | 5 | **3.51 s** (1.70, 2.40, 2.46, 2.79, 3.51) | inside | 0 / 0 | **pass** |
| Sign-out (tab 5 signed out 0.87 s after the trigger) | | 5 | all five on the login page, no reload, nothing of the session shown | | | **pass** |

Every tab still held its expected data when the round was read at its end, no
tab was complete before it was first observed, and no request was left without
a successful answer in any tab. The one void round is the rule applied, not a
retry of a failure: it measured one tab and was not judged. No round failed, so
none was repeated to obtain a pass. The 8 s was not changed.

Negative checks:

- **The passing current-token round judged against 1 ms: fail**, all five tabs
  named. The deadline decides.
- **Five tabs of a page that is not the dashboard: judged failed**, but for a
  weaker reason than in the rehearsals. On this Firefox each tab "could not be
  read" (the script got nothing from `/manifest.json` as that browser displays
  it), where the rehearsals read the tab and found it was not the dashboard.
  It shows that a tab the script cannot read is never counted complete; it does
  not show, on this device, that a readable wrong page is told from the right
  one. That distinction is covered by `device-acceptance.test.mjs` and by the
  rehearsals only.

What the ingress recorded between each round's markers, from 10.1.1.250
(diagnostic; it decides nothing):

| Round | `/api` requests | Statuses | Delayed by `api_limit` | Refused |
|---|---|---|---|---|
| Current token (void) | 11 | 200 x 11 | 0 | 0 |
| Current token | 55 | 200 x 40, 304 x 15 | 9 | 0 |
| Expired token | 61 | 200 x 46, 304 x 10, 401 x 5 | 17 | 0 |
| Sign-out | 8 | 200 x 2, 204 x 1, 304 x 4, 429 x 1 | 0 | 1: `GET /api/auth/show-default-credentials`, `limit_req`, `login_limit` (#1360) |

Limits of this result:

- One device, one browser, one run of each round, the administrator, every tab
  on `/dashboard`, a warm cache. It is the acceptance that was agreed; it is not
  a measurement of other devices, roles or pages.
- For two of the five tabs in the sign-out round the moment they reached the
  login page was not caught (`onLoginAfterMs` null); that they were on it at the
  end, without a reload, was.
- Which build was served is established below by content, not by a label: the
  page reports `erp-build: unknown`.
- The rehearsals in headless Firefox on the server host missed 8 s (9.0 to
  9.4 s) and this device met it in 3.5 s. The difference is not explained, and
  the rehearsals stay recorded as they were.
- #1359 (start-up time with more tabs), #1358 (replay revocation at twenty tabs)
  and #1360 are open and are not touched by this result.

##### Which frontend build the device ran against

The frontend image was rebuilt and its container recreated at 12:22:57 UTC,
twelve minutes before the run, by someone other than the session that recorded
this, without `VITE_BUILD_SHA`; the page therefore reports `erp-build:
unknown`. The rehearsals earlier in the day ran against the image before it
(`346f8a63...`, no longer present). Established afterwards, on 2026-10-09:

| Check | Result |
|---|---|
| Container during the run | `erp_frontend`, image `sha256:4611e9ee9e2d...`, started 12:23:00 UTC, 0 restarts, still that container when checked |
| The frontend tree of `3a97404f7` (`git archive`, so committed files only) built with the repository's Dockerfile, `VITE_API_BASE_URL=/api`, `VITE_BUILD_SHA=unknown` | 294 files in `dist` |
| Those 294 against the files in the container's `/usr/share/nginx/html` | **all 294 identical by SHA-256**; the container has one more file, `50x.html`, which comes from the NGINX base image |
| The same 294 paths fetched through the ingress on port 80 | **all 294 identical** to the container's |
| The container's NGINX site configuration and entrypoint against `3a97404f7` | identical |

So what the device loaded is byte-for-byte what `3a97404f7` builds with the
build identifier unset. What this does not say: which commit the image was
actually built from (no file under `frontend/` outside `frontend/qa/` differs
between `main` and `3a97404f7`, so every commit of the branch builds the same
application), and it rests on the build being reproducible, which the match
itself shows for this case. The backend container (created 10:03 UTC the same
day) was not tied to a commit; the branch changes nothing under `backend/`. The
ingress configuration was compared by hash and is the repository's.

### Explicitly unverified

#1353 was accepted on one thing: the repository owner's administrator
dashboard workflow in Firefox 157 on one Windows 11 PC, five tabs opened
together, each holding its expected data within 8 s without a recovery click,
with a current and with an expired token, and a five-tab sign-out. That is
verified, once. None of the following is, and the acceptance does not depend on
any of it:

- several users behind one address, until a multi-user workload exists;
- other roles on a device: the harness's blocking runs are a `sales_staff`
  user in Chromium on the QA host, the device run is the administrator, and
  neither stands in for the other;
- restores of arbitrary or mixed routes: every tab was opened on `/dashboard`;
- recovery from a regional-settings request that is refused on its own, which
  stays open under #1354;
- other browsers, devices and Firefox versions on a device; a cold cache;
- more than five tabs within any time (#1359), and the replay revocation seen
  at twenty tabs (#1358);
- on the device, that a readable page which is not the dashboard is told from
  the dashboard (see the negative checks above);
- that the three provisional `api_limit` numbers are the right ones. They are
  sizing hypotheses. The device result shows they did not get in the way of
  that workload (0 refusals, 9 and 17 requests delayed) and nothing more. The
  5 / 10 / 15 s harness deadlines they were first sized against were never met
  on the QA host and are no longer part of the acceptance.

## Follow-ups from the reviews of #1352 (#1354, 2026-10-10)

What changed, each under a test that failed first unless it says otherwise:

- **A pending cleanup no longer defeats the same tab's next sign-in.** A
  reconcile skips the cancelled sign-in cleanup while the tab has a sign-in
  attempt of its own under way. Before, a channel message or a resume during
  that login committed the cleanup, changed the revision the attempt had
  captured, and the sign-in was refused. An attempt that the server refuses,
  whose commit times out, or that is cancelled leaves the cleanup to the next
  reconcile; each of the three is tested.
- **A start-up read that fails with an error of no known class** makes the tab
  storage-unavailable, at start and on a retry, where it used to show the sign-in
  form. The tab's reconciliation drafts are cleared with it (Known limits).
- **The waiting screen asks again by itself** every 10 s while visible.
- **The mandatory password page** starts no leave timer when it was left while
  its change was in flight, and its form stays disabled once the change has
  succeeded.
- **The cleanup retry's timing** is now exercised on the memory store's own queue
  and timers, with another tab's transaction held at the head of the queue: each
  of the two immediate attempts waits out its own 5 s timeout, the cancelled
  sign-in's caller is answered only after both, and a reconcile waits for its
  attempt before it reads. This covers existing behaviour, so it was not seen to
  fail first; it fails when the reconcile is made not to wait. It is not a
  browser run and not the IndexedDB adapter.
- **`run.sh`** refuses `0.0.0.0`, `0` and a name that resolves there; finishes a
  restore that a signal interrupts and does not run it a second time (the second
  found no capture file and reported a restored stack as not restored); and
  treats `HUP` as it treats `INT` and `TERM` (exit 129; before, the process died
  with 129 while `results.json` said 1). Case 8's line "every use succeeded" is
  now "at least twelve uses completed", which is what it checked.

### Recorded run on `48c4d1888` (2026-10-10): exit status 1, on the latency measurement

A full recorded run: the whole suite from the repository at HEAD, served build
equal to HEAD, access lifetime 20 s and grace 5 during, stack restored to
15m / 60 (read again with `stack.sh show` after the script had exited).

**17 of 17 cases passed and W1 passed. The run failed on M2**, the second of the
two blocking latency criteria: median p95 16.2 ms against 15 ms (repetitions
16.2, 17.2 and 10.3 ms; maximum 68.3 ms). M1 passed at 2.9 ms against 5 ms.
Diagnostic, not judged: M3 86.4 / 394.3 ms, M4 113.1 / 738 ms. No measured load
was answered 429 (0 of 125, 0 of 500).

M2 is a raw IndexedDB read made by the measurement's own page while four tabs
read and a fifth writes; it does not go through the session runtime, and the
adapter was not changed by this work. That is a reason to look at the machine
first, not a finding: the cause of the miss is **not established**. What was
observed of the machine, without it being offered as the cause: the host's
container list taken before the measurement shows two containers of another
project restarting in a loop, and `uptime` read by hand gave a one-minute load
average of 9.45 half an hour before the run started and 6.26 a minute after it
ended, on four cores. Earlier recorded runs gave M2 4.3 to 5.4 ms, and a
measurement run alone on 2026-10-09 gave 14.1 ms.

W1, all blocking checks passed at 5, 10 and 20 tabs:

| N | Round | Session zone (refresh / logout / me) | Session 429s | Outcome | Recovery actions | Business 429s |
|---|---|---|---|---|---|---|
| 5 | current token | 0 / 0 / 0 | 0 | 5/5 usable, 5 complete on first load | 0 | 0 of 45 |
| 5 | expired token | 1 / 0 / 0 | 0 | 5/5 usable, 5 complete on first load | 0 | 0 of 66 |
| 5 | sign-out while loading | 1 / 1 / 0 | 0 | 5/5 on the login page | | 0 of 90 |
| 10 | current token | 1 / 0 / 0 | 0 | 10/10 usable, 10 complete on first load | 0 | 0 of 160 |
| 10 | expired token | 1 / 0 / 0 | 0 | 10/10 usable, 10 complete on first load | 0 | 0 of 124 |
| 10 | sign-out while loading | 1 / 1 / 0 | 0 | 10/10 on the login page | | 0 of 81 |
| 20 | current token | 1 / 0 / 0 | 0 | 20/20 usable, 20 complete on first load | 0 | 0 of 338 |
| 20 | expired token | 2 / 0 / 0 | 0 | 20/20 usable, 20 complete on first load | 0 | 0 of 185 |
| 20 | sign-out while loading | 1 / 1 / 0 | 0 | 20/20 on the login page | | 0 of 111 |

Not blocking, reported: the last tab held its data after 15.0 and 19.3 s at five
tabs, 28.8 and 17.8 s at ten, 36.6 and 30.1 s at twenty, against 5, 10 and 15 s
(#1359). In the three sign-out rounds no request was being delayed at the moment
of the sign-out, so those rounds show the sign-out and not its overlap with a
delayed request; case 17 is where that overlap is judged, and it passed.

What this run is and is not evidence for: the cases and W1 passed on the commit
that carries the #1354 changes, and the run as a whole is a failure. None of the
changes of #1354 has a browser case of its own: the suite has no case that
cancels a sign-in after its commit, none that makes a start-up read fail with an
unclassified error, and none for the waiting screen's own retry. Case 12 covers
the adapter's timeout in general. Whether cases 1 and 3 and W1's blocking checks
can fail in a browser is still not shown (#1363).

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
- `api_limit` now delays excess `/api` requests instead of refusing them
  (20 r/s, `burst=40 delay=20`, issue #1353), so the refusals recorded in the
  runs above are what the old `burst=20 nodelay` did. **No recorded run has yet
  been made on the new configuration**: see "The limiter probe and what has not
  been run" below. What the new numbers buy is unverified until one is.
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
  back; after it, the stored list is gone. Tracked in #1362.
- Rehydration of persisted notifications waits for the session runtime to start,
  which route loaders do. A route without a loader would rehydrate empty after
  redux-persist's 5 s timeout.
- **A start-up read that fails with an error of no known class loses the tab's
  unsaved reconciliation drafts.** Only a completed read can say that no session
  is stored, so any failure that is not a timeout puts the tab in the
  storage-unavailable state, at start and on a retry from the waiting screen, and
  that state clears drafts. The alternative, staying in the waiting state and
  keeping them, was declined on 2026-10-09: the tab cannot verify its session
  and fails closed. The IndexedDB adapter raises only the two known classes, so
  this is reachable only through a defect.
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
  the shared record if every cleanup attempt times out (five at most), if an
  attempt finds storage unusable (the tab becomes storage-unavailable and writes
  nothing from then on), if the tab is closed or reloaded before one completes,
  or if the tab never reconciles again. While the same tab has another sign-in
  under way its reconciles do not attempt the cleanup: that sign-in's commit
  replaces the leftover session, and if it fails the next reconcile attempts it. No tab claims that session; a tab opened later would start signed in on
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
