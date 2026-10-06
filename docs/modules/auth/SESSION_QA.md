# Cross-tab session QA (#1345)

This document records how the cross-tab session behaviour of the frontend PR is
verified. The code lives in `frontend/src/session/` and `frontend/qa/cross-tab-session/`.

## Procedure

| Command | Purpose |
|---|---|
| `frontend/qa/cross-tab-session/run.sh "<lan-ip>"` | A whole recorded run: configure the stack, run the cases and W1, restore, measure latency. **Incomplete at `79949b451`; see Status after review.** |
| `frontend/qa/cross-tab-session/stack.sh {show\|qa-up\|restore}` | The only supported way to start or recreate containers for a run. |
| `nginx/verify-rate-limits.sh` | The ingress rate limits and CORS, from a container with its own address. Must pass twice in a row. |
| `node --test nginx/verify-rate-limits.test.mjs` | The arithmetic the rate-limit script derives from the configuration. |

`run.sh` refuses a `localhost` address, any port, a dirty working tree, and less
than 3 GB free disk. It captures the running token lifetime and grace before
changing anything, and restores exactly those afterwards; a failed restoration
never yields exit 0. It must be run against the ingress on port 80 (the LAN IP);
port 3000 is the frontend container's own NGINX, which applies no rate limit.

The two QA values are an access-token lifetime of **20 s** and a refresh grace of
**5 s**, set by `stack.sh qa-up` so cases 8-11 can observe expiry and rotation.
They are not production values.

## Status after review (2026-10-06, commit `79949b451`)

A review of this branch against the implementation plan found that parts of the
verification described in this document did not exist yet. Until the items below
are closed, nothing here establishes cross-tab consistency in a real browser.

**Browser script: incomplete.**

- `cases.mjs` held 2 cases, not 15. Its sign-out case opened each "tab" in a
  separate browser context (a separate profile), so it did not test two tabs of
  one profile, and it navigated the second tab before checking.
- Workload W1 did not exist. The `session_limit` burst (20) is therefore
  unmeasured and no tab capacity is claimed.
- `measure.mjs` measured M1 only. M2 to M5 did not exist.
- `stack.sh qa-up` did not check the 20 s access lifetime by observed behaviour.
- No recorded run has been made. The earlier statement that the run was blocked
  only by free disk was incomplete: the script could not have produced the
  required evidence even with disk available.

**Rate-limit script: incomplete.** `nginx/verify-rate-limits.sh` passed twice on
`79949b451`, covering phases 0, A, B, C, D and F. Phase E (`change-password`,
`logout`, `me`) was not implemented. Phase D ran after a drain wait, so it did not
show that the login budget is unaffected by session traffic. Bursts were not
checked against the longest duration that can still be judged.

**Product defects found by reading, each to be confirmed by a failing test before
it is fixed:** the IndexedDB adapter settles a caller on timeout before the
transaction's own outcome is known, and reports every abort as a timeout; the
interceptor never reaches the final-401 session ending; the refresh lease is
released before the refresh is sent; the public default-credentials request goes
through the authenticated client; the sign-in error message from the server is
lost; persisted notifications are not read back; the login form has no
fail-closed message when IndexedDB is unavailable.

**CI:** the only run on `79949b451` was cancelled. Local results and GitHub CI are
separate evidence, and the second does not exist yet.

This section is replaced when the work is done. The run that gates the merge is
made on the final commit and recorded in the pull request that closes #1345, not
here, so that recording it does not change the tested commit.

## What is automated

- Vitest on the in-memory store double: every commit rule, the reconciliation
  table, the runtime's request lifecycle and the endings
  (`frontend/src/session/__tests__/`). At `79949b451` the interceptor's 401 path
  (refresh, retry, the three-send budget) had no test, and the refresh-lease test
  passed without exercising the lease.
- Vitest on the components: the fail-closed screen, the session-changed message,
  the idle-timeout sign-out, the reset of the plain slices and the API caches.
- Jest on the backend guard and the CORS allow-list, and the e2e `protocol marker`
  block (the marker is refused on all three token-issuing routes; a refused
  refresh does not rotate, read from the `auth_sessions` row).
- `node --test` on the rate-limit script's arithmetic.

## What is manual

- The browser run on the real IndexedDB adapter, real tabs and the real backend.
- The rate-limit script through the real ingress.

CI has no NGINX and no browser; neither is a CI gate.

## Known limits

- Chromium only. Firefox, Safari and mobile are unverified.
- Natural tab freezing, tab discard and device sleep are not exercised. Case 15,
  once written, dispatches `visibilitychange` and `pageshow` synthetically; the
  browser's own freezing and back/forward cache are not covered.
- The latency figures come from one machine (headless Chromium, idle disk). They
  do not predict an office PC with a spinning disk.
- The tab capacity of `session_limit` is whatever workload W1 measures, and no
  more. W1 has not run, so no capacity is claimed.
- Several users sharing one address are unverified.
- A sign-out's publication to other tabs is delayed by a blocked transaction; the
  bound while it is delayed is the server revocation, which exists only once the
  logout reaches the server.
- Production is clear-text HTTP; credentials and tokens are readable on the
  network.
