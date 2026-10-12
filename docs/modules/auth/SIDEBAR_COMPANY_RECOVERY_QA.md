# Sidebar company-settings recovery: browser procedure (#1394)

This document is the procedure for the browser evidence of #1394 and the record
of what the runs found. The expectations were written **before** any run, in
`evidence/1394/EXPECTATIONS.md`; this file does not restate them as results.

The code under test is `frontend/src/components/common/companyRecovery/`, mounted
at `frontend/src/components/common/MainLayout.tsx`.

## What the run is

A recorded cross-tab session run through the existing harness, as a
**non-administrator** (`QA_USERNAME_3`, role `sales_staff`, see the harness
README). The harness judges "company data" already (`cases/limiter.mjs`, W1:
`lib/usable.mjs`'s `COMPANY_DATA`, `companyRetry`); what it lacks, and what this
issue adds beside the existing tests, is:

- **detection of the strip**, by its text `Company details unavailable`, or, in
  the collapsed sidebar, by the collapsed button's accessible name
  `Retry loading company details`;
- **a per-tab count of `GET /api/settings/company`**, split by what preceded it:
  page load, sidebar navigation, after `tokens renewed`, after a Retry click;
- **a per-tab record of own refresh versus adopted tokens**;
- **the two-window structure** of spec 9.3.

These are harness changes under `frontend/qa/cross-tab-session/`, with their own
unit tests beside the existing `*.test.mjs` (`node --test`, as the neighbouring
tests run).

A run is made through `QA_SUITE_OVERRIDE`, which runs a **copy** of the suite
outside the repository. By that script's own definition a partial run is never a
pass of the suite: results of these runs are **development results**, and they
are the evidence this issue asked for, not a pass of the suite.

## Bringing the stack up

```bash
cd /home/blur/erp2
df -h /                      # the host root has filled during image builds before
VITE_BUILD_SHA="$(git rev-parse HEAD)"   # so the served bundle is identified
source ~/.config/erp-qa/credentials.sh   # QA_USERNAME, QA_PASSWORD,
                                         # QA_USERNAME_2/3, QA_PASSWORD_2/3
```

The credentials are sourced **in the same command as the run**, never written
into the repository and never echoed.

```bash
QA_SUITE_OVERRIDE=/tmp/opencode/erp-qa-1394/w1-429-traced \
QA_ONLY=W1 \
  frontend/qa/cross-tab-session/run.sh "<lan-ip>"
```

`run.sh` refuses a `localhost` address, any port, a **dirty working tree**
(so the branch is committed first), missing credentials, less than 3 GB free
disk, and a served bundle whose `erp-build` is not HEAD. It goes through the
ingress on port 80 at the LAN address; the browser container runs on Docker's
default bridge, not on the host network.

Note that a plain `docker compose up -d` resets the token lifetime and the
grace to the compose defaults; only `stack.sh qa-up` (which `run.sh` calls) sets
the QA values of a 20 s access lifetime and a 5 s grace, and `run.sh` restores
the captured values afterwards.

## Which mutation is applied

Run R1 applies the `w1-429-traced` mutation of
`evidence/1382/1378/mutations/w1-429-traced.diff`: W1 at five tabs only, the
session trace on, and a node filler that exhausts `session_limit` from the
address before the tabs are opened. That is the run that recorded the failure
this issue is about, so it is the run to repeat.

## Where the counts come from

| Count | Source |
|---|---|
| Every request the ingress saw, with what each limiter decided | The ingress access log, in the `limits` format (`nginx/nginx.conf`): `"$request" $status ... lreq=$limit_req_status lconn=$limit_conn_status qa=...`. `nginx/access-log.mjs` parses one line and attributes a rejection to the limiter that produced it. Followed with `docker logs -f erp_nginx`, and saved gzipped per run. |
| A tab's own refresh | `window.__erpSessionTrace` in that tab, the `refresh-sent` events. Written because the session trace is on (`sessionStorage['erp-session-timing'] === '1'`) |
| Reads of `GET /api/settings/company`, per tab, split by what preceded them | The harness's request tagging (`tagRequests` with `intercept`, as `w1-429-traced` does) |
| Tokens a tab adopted from another tab | The same trace: a `tokens` event without a `refresh-sent` of its own |

Every count of requests is recorded **on a line of its own**, and a refresh that
follows an automatic retry or a quiet re-read is counted separately again. What
is bounded by this design is recovery **attempts**, not requests: one attempt can
be several requests underneath (`requestWithRetryOn429` may send the read up to
four times, and the runtime may send it again and a refresh behind it).

## Runs

### R1 — T2 repeated, five tabs, non-administrator

Window 1 with the filler holding `session_limit` empty; window 2 after stopping
it, with one sidebar navigation per tab. For window 2, per tab, record whether
its tokens came from its own refresh (`refresh-sent` in its trace) or were
adopted.

Saved per run under `runs/<id>/`: `run.log`, `results.json`, the gzipped ingress
log, `meta.txt` (commit, start, end, exit status), and one screenshot per tab
per window.

### R2 — single tab, faults injected at the browser

The harness's `context.route` interception (`lib/harness.mjs:290`):

- **first-load exhaustion**: abort the read three times → the strip and the
  placeholder; screenshot.
- **retained-branding exhaustion**: load, then fail an invalidated or re-triggered
  read. If a non-administrator has no way to cause a second read of this
  endpoint, this browser item is recorded **unverified**, and the record says so
  and names the Vitest test that covers it.
- **manual recovery**: stop failing, click Retry → the name is back, the strip is
  gone.
- **collapsed**: collapse the sidebar, Tab to the icon button, screenshot of the
  focus ring and of the tooltip, press Enter and see the read happen.

## Recording rules

- The result of a `QA_SUITE_OVERRIDE` run is a development result by that suite's
  own definition. It is recorded as such in the record, and it is never written
  up as a pass of the suite.
- An expectation that was missed is `unmet`, recorded and handed back to the
  owner. It is not reinterpreted.
- A scenario that could not be exercised is `unverified`, never `met`.
- `*.log` is ignored by git. Before committing, compare
  `git ls-files docs/modules/auth/evidence/1394` with
  `find docs/modules/auth/evidence/1394 -type f`, and force-add or rename what
  the ignore would drop, as #1382's evidence did.

## Record

*(filled in from the runs; see EXPECTATIONS.md for what each one expects)*

| Run | Commit | Started | Ended | Exit | Result |
|---|---|---|---|---|---|
| | | | | | |