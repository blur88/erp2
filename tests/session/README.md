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
and sign-out propagation time, and exits nonzero on failure.

The test-only Compose override sets `JWT_ACCESS_TOKEN_EXPIRY=8s` and `SESSION_IDLE_TIMEOUT_MS=120000`. The runner
generates `tests/session/nginx.test.conf` from deployed `nginx/nginx.conf`,
changing only `login_limit` from `5r/m` to `120r/m`; it deletes that generated
file on exit. The browser results verify coordination under these overrides,
not under the default rate limit or production idle timeout. The runner then recreates NGINX with the
unmodified configuration and runs `rate-limit.mjs` separately: it exhausts the
default `login_limit`, observes a real refresh 429, and checks that the Session
survives. The transport test checks that a single request does not automatically
retry a 429. No production host is involved.

The concurrent refresh case reloads both tabs after access-token expiry and
holds the first refresh until both tabs have received a 401. It checks that one
refresh request completes and that both tabs remain signed in.

Two takeover recovery cases pause tab A with CDP in the successful refresh
XHR's `load` handler, after the server rotates the token and before Axios opens
the IndexedDB write transaction. One context init script reads a mutable
per-run target so only the current refresh save pauses. In the recovery case, tab
B takes over after the 15-second lock expiry, receives the unchanged-token 401,
and tab A resumes before tab B's actual 30-second recovery deadline; both tabs
must remain signed in. In the loss case, tab A stays paused until tab B's matched
sign-out completes, then resumes and must observe the deletion. The 45-second
nominal acquisition-to-sign-out window is not an exact cutoff: request duration
and browser scheduling affect when recovery starts and completes. Between the
cases, the harness signs out and waits for the earlier lock lease to expire
before starting a new Session.

The in-flight refresh case holds `/api/auth/refresh` after the 8 s access-token
expiry causes a 401, signs out from tab A, waits for tab B to request `/login`,
releases refresh, then checks that the shared record is null in both tabs once
each has settled on `/login`.
The sign-out reload destroys tab B's document, so this case does not verify
rejection of a late refresh save; the coordinator unit tests cover stale-save
rejection.

The idle cases keep two tabs open: tab B's warning begins at about 100 seconds; tab A acts at about 105 seconds, after that warning starts. At about 130 seconds, after the 120-second timeout plus a margin, the browser checks that B has not reached `/login` and the shared Session still exists. It then verifies that inactivity in both tabs signs both out. The 120-second override is set by `tests/session/compose.yml`, which also lifts the frontend read-only setting for the test stack so the entrypoint can write `env-config.js`; ordinary runtime configuration defaults to 12 hours.

After the run, restore the ordinary local Compose configuration:

```bash
docker compose up -d --force-recreate backend frontend nginx
```
