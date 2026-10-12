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

See `evidence/1394/EXPECTATIONS.md` for what each run expected before it ran,
and what it found after. Both runs are **development results**: they were made
through `QA_SUITE_OVERRIDE`, which the suite itself calls "not a recorded run".
Neither is a pass of the suite, and neither is written up as one.

| Run | Commit | Window | Exit | Result |
|---|---|---|---|---|
| R1 | `97a672272` | T2 repeated at five tabs, non-administrator, two windows | 1 | W1 ran and recorded. The strip appeared in **5 of 5** tabs; one read and one refresh per tab, and nothing the sidebar sent after the strip. All five tabs recovered without a reload. The window-2 quiet-re-read expectation was **not met** (see EXPECTATIONS.md) and is handed back, not reinterpreted. |
| R2 | `5814eab1e` | one tab, the read aborted three times in the tab | 1 | The case passed **8 of 8** checks: the strip and the placeholder after the exhaustion, the collapsed button with its accessible name, its focus and its tooltip, and one read on Retry with the name back and the strip gone. Five screenshots. |
| R3 | `357351cc6` | one tab, stopped and idle for longer than the access lifetime, then one sidebar navigation | 0 | The case passed **7 of 7** checks. No company read and no refresh during the 26 s idle wait; after the navigation, one refresh (the tab's own, answered 200) and **one quiet re-read**, the name back in 1.4 s, the strip gone, the same document still loaded, and no further read in the next 10 s. Two screenshots. |

### R1's window 2 in one line

All five tabs recovered without a reload, and **no quiet re-read was observed**,
because the renewal each tab needed arrived while its read was still in flight
and was therefore consumed — which is the rule the design turns on. The count
of quiet re-reads is 0, and that is recorded as an unmet expectation rather
than read as a pass. Two limits of what the run can show are recorded with it:
the per-tab refresh figures are the tab's whole trace and not the window's, and
a tab that sits stopped and idle and is *then* renewed is **unverified in a
browser**.

### R3 — the path R1 did not exercise

R1's window-2 expectation of a quiet re-read stays **unmet for R1**, as
recorded. The owner's reading (2026-10-13): consuming a renewal that arrives
while the read is in flight is correct, R1's recovery supports it, and the
implementation is not changed to force an extra read. R1's tabs recovered
because the read the client was already carrying was re-sent after the refresh
and answered 200.

R3 is the targeted check for the other case, with its expectation committed
(`b6dc16dc3`) and its case recorded (`mutations/r3-case.diff`, `357351cc6`)
before it ran: a tab made **stopped** by R2's fault, left **idle** for 26 s
against a 20 s access lifetime, then given one sidebar navigation. All six
expectations were met; reads and refreshes are recorded separately in
EXPECTATIONS.md. Its limits are recorded there too: one visible tab, renewed by
its own refresh, and a quiet re-read the ingress answered 304.

R3 was run with `ERP_SESSION_SCRATCH` and `QA_SUITE_OVERRIDE` pointing at a
copy of the R2 override suite with `mutations/r3-case.diff` applied, and
`QA_ONLY=19`.

### What the runs could not reach, and why

Seven of the fifteen scenarios are reachable only by the signed-in role of a
non-administrator plus a fault the harness does not inject: retained branding
(row 2), the 429 exhaustion (row 6), eligibility during a delay (row 7), the
session-race halves of row 9, the two settings pages (rows 11 and 13), the
mobile drawer (row 12) and a storage timeout (row 14). Each is covered by a
Vitest test and is recorded as **unverified in a browser**, with the reason, in
EXPECTATIONS.md.

The harness's own limit, recorded because it shaped a number: `tokenOrigin`
reads a tab's whole `__erpSessionTrace`, not a window of it, so a per-window
refresh count from this harness is cumulative until it is changed. The R1 figures
are labelled accordingly.
| | | | | | |