# Cross-tab session QA (#1345)

This document records how the cross-tab session behaviour of the frontend PR is
verified. The code lives in `frontend/src/session/` and `frontend/qa/cross-tab-session/`.

## Procedure

| Command | Purpose |
|---|---|
| `frontend/qa/cross-tab-session/run.sh "<lan-ip>"` | A whole recorded run: configure the stack, run the cases and W1, restore, measure latency. |
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

## Recorded run

**Not performed for this revision.** The recorded browser run requires Docker,
Playwright (`mcr.microsoft.com/playwright:v1.63.0-noble`), a LAN IP, and roughly
thirty minutes of wall time. It was attempted on the host where this branch was
prepared and refused by `run.sh`'s own disk guard: the root filesystem had under
3 GB free (`df` reported ~470 MB). The run that gates the merge is produced on
the final commit of this branch and recorded in the pull request that closes
#1345. Until it is produced, the browser cases, workload W1 and the latency
figures are unverified.

The rate-limit script (`nginx/verify-rate-limits.sh`) **was** run on the final
commit and passed twice in a row (phases 0, A, B, C, D and F), and the ordering
check in Task 8A confirmed that moving the session block below the credential
block makes phase B fail.

## What is automated

- Vitest on the in-memory store double: every commit rule, the reconciliation
  table, the request lifecycle, the refresh coordination and the endings
  (`frontend/src/session/__tests__/`).
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
- Natural tab freezing, tab discard and device sleep are not exercised. Case 15
  dispatches `visibilitychange` and `pageshow` synthetically; the browser's own
  freezing and back/forward cache are not covered.
- The latency figures come from one machine (headless Chromium, idle disk). They
  do not predict an office PC with a spinning disk.
- The tab capacity of `session_limit` is the number workload W1 measured, and no
  more; it is not a claim that twenty tabs fit.
- Several users sharing one address are unverified.
- A sign-out's publication to other tabs is delayed by a blocked transaction; the
  bound while it is delayed is the server revocation, which exists only once the
  logout reaches the server.
- Production is clear-text HTTP; credentials and tokens are readable on the
  network.
