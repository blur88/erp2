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
- `session_limit` (1 request per second, burst 20) was checked against a restored
  window of 5, 10 and 20 tabs of one profile. Several users sharing one address
  are unverified, and so is `limit_conn addr 10` with more than one profile behind
  an address.
- A sign-out's publication to other tabs is delayed by a blocked transaction; the
  bound while it is delayed is the server revocation, which exists only once the
  logout reaches the server.
- A legitimate refresh delayed past grace revokes its session in every tab.
- A tab paused mid-transaction blocks other tabs' session operations until it
  resumes or closes; waiting operations time out with an error and sign nobody out.
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
- A sign-in that loses the revision check, or is cancelled, must be submitted
  again. Revoking the server session it created is best effort: if that logout
  fails, the unadopted session can remain live until it expires.
- Removing a refresh signing key early strands the sessions that depend on it
  without revoking them.
- Production is clear-text HTTP; credentials and tokens are readable on the
  network.
