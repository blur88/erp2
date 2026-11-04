# Cross-tab browser run (#1550)

Run from the repository root against a disposable local Compose stack. Supply
two existing users with different usernames. Both must be able to sign in
without a required password change. Keep passwords in environment variables or
a local untracked file; do not commit them.

```bash
SESSION_TEST_BASE_URL=http://10.1.1.34 \
SESSION_TEST_USER_A=admin SESSION_TEST_PASSWORD_A='<password>' \
SESSION_TEST_USER_B='<second-user>' SESSION_TEST_PASSWORD_B='<password>' \
tests/session/run.sh
```

Replace `10.1.1.34` with the host's LAN IPv4 address. The runner rejects
`localhost` because browsers treat it as a secure context. Docker must be able
to pull `mcr.microsoft.com/playwright:v1.63.0-noble` and install the matching
Playwright package. The script rebuilds the real frontend and backend, then
runs Chromium through the real NGINX and backend. It prints each passing case
and End browser Session propagation time, and exits nonzero on failure.

The test-only Compose override sets `JWT_ACCESS_TOKEN_EXPIRY=8s` and `SESSION_IDLE_TIMEOUT_MS=120000`. The runner
generates `tests/session/nginx.test.conf` from deployed `nginx/nginx.conf` with
two changes: `login_limit` from `5r/m` to `120r/m`, and an unbuffered
`access_log` so debug capture can read it. The runner force-recreates NGINX so
the mounted configuration is loaded, then deletes the generated file on exit.
The browser results verify coordination under these overrides, not under the
default rate limit or production idle timeout. The runner then recreates NGINX
with the unmodified configuration and runs `rate-limit.mjs` separately: it
exhausts the default `login_limit`, observes a real refresh 429, and checks that
the Session survives. The transport test checks that a single request does not automatically
retry a 429. No production host is involved.

The runner accepts these optional environment variables:

- `SESSION_TEST_ONLY=recovery` runs the initial shared-session, reload and
  concurrent-refresh cases once, then runs only the recovery/loss pair loop.
- `SESSION_TEST_ITERATIONS` sets the number of loop iterations; it must be a
  positive integer and defaults to `1`.
- `SESSION_TEST_DEBUG=1` enables transaction/auth diagnostics and saves
  `docker compose logs nginx` after the browser run.
- `SESSION_TEST_TIMEOUT_SECONDS` sets the Playwright container timeout for the
  cross-tab step; it defaults to `600` seconds.
- `SESSION_TEST_NGINX_LOG_PATH` chooses the host path for captured NGINX logs;
  it defaults to `/tmp/session-nginx-access.log` and is used with debug enabled.

The concurrent refresh case reloads both tabs after access-token expiry and
holds the first refresh until both tabs have received a 401. It checks that one
refresh request completes and that both tabs remain signed in.

The suspended-tab case suppresses `erp-session` BroadcastChannel delivery to
tab B, ends the browser Session in tab A, then resumes B with `visibilitychange`.
It checks that B sends no authenticated request before navigating to `/login`.
During that case, the init script gates tab B's other document-visibility and
window-focus listeners so they cannot trigger their own reconciliation; it
identifies the coordinator listener by its `credentialsForRequest` callback.
Before suppression, the request observer confirms it sees an `Authorization`
header on an authenticated API request from tab B.

Two takeover recovery cases pause tab A with CDP either in the successful
`/api/auth/refresh` XHR `load` handler, or, when tab A has a tracked IndexedDB
transaction open, after the harness's `complete` or `abort` listener on tab A's
last open transaction clears the tracker. The harness also logs `error` events
but keeps those transactions tracked until they complete or abort. The
load-handler pause runs before the refresh save because Axios
settles its XHR adapter from `loadend`, after the XHR `load` event, while the
harness pauses during `load`
([Axios xhr adapter `loadend` handler](https://github.com/axios/axios/blob/v1.20.0/lib/adapters/xhr.js#L43),
[its registration](https://github.com/axios/axios/blob/v1.20.0/lib/adapters/xhr.js#L125),
[coordinator.ts:244](../../frontend/src/services/session/coordinator.ts#L244),
and [coordinator.ts:285](../../frontend/src/services/session/coordinator.ts#L285)).
`refreshAfter401` therefore cannot continue to `saveRefresh` until the harness
resumes. The transaction listener is also registered inside the wrapped
`IDBDatabase.prototype.transaction`, before
[`storage.ts:51`](../../frontend/src/services/session/storage.ts#L51) assigns
`oncomplete`, so a pause waiting for the last open transaction runs before that
read resolves. The init script tracks each tab's IndexedDB transactions, logs
`error` events, and removes a transaction from the pending set only on
`complete` or `abort`; it waits until tab A has no open transactions before
pausing. A concurrent
`credentialsForRequest` read can open while the refresh XHR is in flight. Every
coordinator session read, write and lock acquisition goes through the `run` queue
([coordinator.ts:53-59](../../frontend/src/services/session/coordinator.ts#L53),
[coordinator.ts:88-211](../../frontend/src/services/session/coordinator.ts#L88));
releasing the refresh lock is the direct-storage exception
([coordinator.ts:233-235](../../frontend/src/services/session/coordinator.ts#L233)).
Disposal closes storage after the queue drains ([coordinator.ts:343](../../frontend/src/services/session/coordinator.ts#L343)).
A per-page init script reads a mutable per-run target so only the current refresh save pauses.
In the recovery case, tab
B takes over after the 15-second lock expiry, receives the unchanged-token 401,
and tab A resumes before tab B's actual 30-second recovery deadline; both tabs
must remain signed in. In the loss case, tab A stays paused until tab B's matched
End browser Session completes, then resumes and must observe the deletion. The
45-second nominal window from acquisition to End browser Session is not an exact cutoff: request duration
and browser scheduling affect when recovery starts and completes. Between the
cases, the harness signs out and waits for the earlier lock lease to expire
before starting a new Session.

During the debug capture, NGINX logged `show-default-credentials` as 304 while
the Playwright page response was 200 ([capture](https://github.com/blur88/erp2/pull/1618#issuecomment-6585515314)). This is consistent with browser cache
revalidation: NGINX logs the 304 sent on the wire, and the Fetch Standard says
that a revalidated 304 updates and returns the stored response to the page
([HTTP-network-or-cache fetch](https://fetch.spec.whatwg.org/#http-network-or-cache-fetch)).
The browser-facing cached response retains its 200 status, which Playwright
reports from the page response event.

The in-flight refresh case holds `/api/auth/refresh` after the 8 s access-token
expiry causes a 401, signs out from tab A, waits for tab B to request `/login`,
releases refresh, then checks that the shared record is null in both tabs once
each has settled on `/login`.
The End browser Session reload destroys tab B's document, so this case does not verify
rejection of a late refresh save; the coordinator unit tests cover stale-save
rejection.

The idle cases keep two tabs open: tab B's warning begins at about 100 seconds; tab A acts at about 105 seconds, after that warning starts. At about 130 seconds, after the 120-second timeout plus a margin, the browser checks that B has not reached `/login` and the shared Session still exists. It then verifies that inactivity in both tabs signs both out. The 120-second override is set by `tests/session/compose.yml`, which also lifts the frontend read-only setting for the test stack so the entrypoint can write `env-config.js`; ordinary runtime configuration defaults to 12 hours.

After the run, restore the ordinary local Compose configuration:

```bash
docker compose up -d --force-recreate backend frontend nginx
```
