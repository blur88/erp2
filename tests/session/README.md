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

The test-only Compose override sets `JWT_ACCESS_TOKEN_EXPIRY=8s`. The runner
generates `tests/session/nginx.test.conf` from deployed `nginx/nginx.conf`,
changing only `login_limit` from `5r/m` to `120r/m`; it deletes that generated
file on exit. The browser results verify coordination under these overrides,
not under the default rate limit. The runner then recreates NGINX with the
unmodified configuration and runs `rate-limit.mjs` separately: it exhausts the
default `login_limit`, observes a real refresh 429, and checks that the Session
survives without an automatic retry. No production host is involved.

The concurrent refresh case reloads both tabs after access-token expiry and
holds the first refresh until both tabs have received a 401. It checks that one
refresh request completes and that both tabs remain signed in.

The in-flight refresh case holds `/api/auth/refresh` after the 8 s access-token
expiry causes a 401, signs out from tab A, waits for tab B to request `/login`,
releases refresh, then checks that the shared record is null in both tabs once
each has settled on `/login`.
The sign-out reload destroys tab B's document, so this case does not verify
rejection of a late refresh save; the coordinator unit tests cover stale-save
rejection. The Q25 CDP `Debugger.pause` variant is deferred; see [the #1345
decision comment](https://github.com/blur88/erp2/issues/1345#issuecomment-6544506391).

After the run, restore the ordinary local Compose configuration:

```bash
docker compose up -d --force-recreate backend nginx
```
