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

Everything the plan asks of this directory is written: the fifteen cases, W1,
M1 to M5, the stack and run scripts. **No recorded run exists yet**, so nothing
here is evidence until `run.sh` has completed on a commit and its
`results.json` is in the pull request. Each case, W1 and the measurement were
exercised during development against the checkout's frontend served through
`QA_DIST_DIR` (below) and a backend image older than the checkout; `run.sh`
itself and `stack.sh qa-up` / `restore` were not run, because they rebuild the
images. A development run is not evidence; what it found belongs in the pull
request and in `docs/modules/auth/SESSION_QA.md`.

## What it does

`cases.mjs` runs fifteen cases and one workload in headless Chromium. "Two
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
| W1 | Restored window: N tabs opened at once, N = 5, 10, 20 | `lib/w1.mjs` |

`measure.mjs` measures what the reconcile gate costs (M1 to M5, below).

A case fails if any of its pass conditions is false, if it throws, or if any
request outside the sign-in routes is answered 429 (W1 excepted: it exists to
count them). Nothing is retried to make a case pass.

## Running a recorded run

```bash
export QA_USERNAME=... QA_PASSWORD=...        # the user the cases sign in as
export QA_USERNAME_2=... QA_PASSWORD_2=...    # a second user, for case 5
frontend/qa/cross-tab-session/run.sh "$(hostname -I | awk '{print $1}')"
```

`run.sh` refuses a `localhost` address (a secure context, where conditions
differ), any port (port 3000 bypasses the ingress and its limits), missing
credentials, a working tree with any uncommitted change (tracked or untracked),
and less than 3 GB of free disk. It then:

1. restores a capture left by an earlier run, and captures the running
   configuration with `stack.sh show`;
2. has an `EXIT` trap in place that restores the stack, before anything is
   changed;
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

The exit status is that of the first failure; nothing later clears it. Status
3 means the stack was not restored. A full run takes roughly 40 minutes, most
of it W1's drain waits and the sign-in pacing.

A recorded run always goes through `run.sh`. `maintain.sh` and a plain
`docker compose build frontend` do not export `VITE_BUILD_SHA`, so their bundle
shows `unknown` and `run.sh` refuses it.

`restore` puts back the two configuration values only. The images stay the ones
built from the commit under test; the run does not put the previous images
back.

## What it needs

- Docker, the running stack, and the Playwright image above (about 2 GB).
- **Two accounts, given through the environment and never committed:**
  `QA_USERNAME` / `QA_PASSWORD` and `QA_USERNAME_2` / `QA_PASSWORD_2`. Both must
  be able to open the dashboard, the product list and sales orders (the
  administrator role is the simple choice), and neither may be flagged to change
  its password at first sign-in: that redirect blocks every case. Use accounts
  made for this purpose; the run signs them in about thirty times and ends
  their sessions.
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

## W1 and the documented tab capacity

One profile holding a stored session opens N tabs at the same moment, for
N = 5, 10 and 20, three times each: (a) with a current access token, (b) with
an expired one, (c) with one tab signing out while the others load. Each round
starts from an empty `session_limit` bucket; the drain wait is computed from
the rate and burst in `nginx/nginx.conf`.

For each round `results.json` holds the send time and status of every request
to `refresh`, `logout` and `me`, the total and per-tab counts, the busiest
one-second interval, the peak accumulated demand `E`, the number of 429s and
the end state of the tabs. `E` replays the NGINX bucket over the send times
(`peakDemand` in `lib/stats.mjs`, exported from `measure.mjs`); NGINX admits
the whole round exactly when `E ≤ burst + 1`. The busiest second is recorded
but is the wrong measure for sizing.

A tab counts as usable when, after the round has played out, it shows the
signed-in application and completes a data request when used once more,
without a reload. The statuses of the requests of its own loading are recorded
beside that, and so is the number of them answered 429 by `api_limit`
(`dataRequests429`): several dashboards loading at once send more data requests
than that limit's burst admits, which is a different limit from the one W1
sizes and is reported as a finding, not judged.

Blocking: N = 5, rounds (a) and (b), no 429 from `session_limit` and every tab
usable. Everything else is recorded and not blocking. The largest N with no 429 in both (a) and
(b) is the capacity the documentation may state (`w1.recorded.judgement`), and
no capacity is claimed beyond what was measured. If an N = 10 round has a 429,
the judgement carries a candidate burst, `⌈1.25 × (E − 1)⌉`; above 60 it says
to stop and take the figures to the repository owner.

## The latency measurement

| | What | Blocking threshold |
|---|---|---|
| M1 | one raw read, one tab idle (500 read-only transactions fetching the three keys) | p95 ≤ 5 ms |
| M2 | the same in four tabs at once while a fifth commits a write every 100 ms | p95 ≤ 15 ms |
| M3 | the adapter's own `read` timings while the dashboard, the products list and a sales order load | p95 ≤ 10 ms in one tab, ≤ 20 ms in four |
| M4 | per request, `gate-before` + `gate-after` | p95 ≤ 10 ms in one tab, ≤ 20 ms in four |
| M5 | per page: navigation to last API response, number of requests, sum of gate waits | none; diagnostic only |

Each blocking figure is the **median p95 of three repetitions**. Maxima and p99
are recorded for every measurement and never block; a maximum above 100 ms is
listed for a reader to judge. M5 is an aggregate-cost estimate: "Requests on a
page overlap, so the sum of their gate waits is not the time the gate adds to
the page load; it is an upper bound on it." No share of page load is computed
from it.

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

`results.json` also records the Chromium version and the machine (CPU model,
and for each disk whether it is rotational).

```bash
node --test frontend/qa/cross-tab-session/measure.test.mjs   # the arithmetic, no browser
```

## `results.json`

Written to the scratch directory (`ERP_SESSION_SCRATCH`, default
`/tmp/opencode/erp-session-qa`): the commit and exit status; the configuration
`stack.sh show` reported **before, during and after** the run (evidence in its
own right, because `.env` is not covered by the commit); for each case its
checks, recorded evidence and, when it failed, where each tab was, what it sent
last and a screenshot path; the W1 rounds and judgement; the latency table; the
Chromium version and the machine; and the number of sign-in waits. Tokens are
never written, only short fingerprints of them. The container runs as root, so
the files it writes into the scratch directory are owned by root.

## Developing a case without rebuilding images

`run.sh` is the only way to produce evidence. To work on a case:

```bash
node cases.mjs --only 3,7        # a selection; the result file says it is partial
QA_W1_NS=5 node cases.mjs --only W1
```

Both scripts need `QA_BASE_URL` (a LAN address, no port), `QA_STACK_SHOW` (a
file holding `stack.sh show` output), the four credential variables, and
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
- The browser runs with `--network host`, so it sees the host's network
  interfaces. A change to them during a run (another container starting or
  crash-looping creates and removes interfaces) makes Chromium fail in-flight
  requests with `net::ERR_NETWORK_CHANGED`. This was seen once in development.
  W1 records such failures (`dataRequestsFailed`); in a case they show up as a
  request that never succeeded. Keep the host's other containers quiet during
  a recorded run.
- Natural tab freezing, tab discarding, device sleep and the back/forward cache
  are not exercised. Pauses use the debugger, and case 15 dispatches its events
  synthetically.
- A browser's own session restore (a restarted browser reopening its tabs) is
  not exercised. Case 4 uses a reload, and a new tab whose `sessionStorage` is
  populated before the page starts.
- The latency figures come from one machine, headless Chromium and an idle
  disk. They bound the cost where the run could reach; they do not predict an
  office PC with a spinning disk.
- The tab capacity of `session_limit` is the number W1 measured, and no more.
  Several users sharing one address are not exercised by W1 and stay
  unverified.
- Case 14 shows that a refused refresh did not rotate the session by timing
  (the token still rotates normally after its grace would have run out). The
  backend e2e test `a refused refresh does not rotate` shows it directly, from
  the `auth_sessions` row.
