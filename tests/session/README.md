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
not under the default rate limit. No production host is involved.

After the run, restore the ordinary local Compose configuration:

```bash
docker compose up -d --force-recreate backend nginx
```
