# Replay revocation at twenty tabs: protocol for the targeted runs (#1370)

This is the protocol the runs for issue 1370 are made under. It is committed
before any recorded round, and the record in `SESSION_QA.md` cites the commit of
this file and the later commit that freezes the injection mechanism, so the
order *protocol, then frozen mechanism, then evidence* is visible in history.

Pinned `main` commit: `7da8c1c902b2d0743b267c8e725bfc4efef33763`.

## What this is for

The recorded run on `198943047` lost its session to a refresh-token replay at 20
tabs (#1358). Twenty instrumented rounds since then did not reproduce it,
because none produced the storage stall the recorded run had. These runs
exercise the three conditions issue 1370 names, deliberately: a forced 12 to
21 s storage stall, more than 20 tabs, and the production grace of 60 s, plus a
combined run, a processor-pressure run and a control on an unfixed build.

**These runs close the investigation. They do not establish that the underlying
bug is fixed**, and no part of the record may be read as if they did.

Either result closes it:

- **A replay occurs.** The trace is preserved, the trigger is narrowed, and a
  *suspected* cause is kept apart from a *demonstrated* one.
- **No replay occurs.** The record says "not reproduced under these conditions",
  lists the remaining gaps, and says what evidence should reopen it.

Things that would make the work a failure even if every run completes:

- "commit timeout induced" read as "replay reproduced", or "clean on `main`"
  read as "fixed";
- calibration attempts mixed into the recorded rounds, or misses rerun;
- a cell's settings chosen or changed after its results were seen;
- high tab counts presented as evidence that the original processor stall
  occurred;
- a round stopped at hold release;
- a resource-limited cell reported as covered;
- the QA stack left on a non-default configuration.

## Facts the protocol rests on

- The recorded run's "12 to 21 s stall" is the time a **plain read of the
  `erp-session` store took from a spare tab of the same profile**, with no
  timeout. The application's own storage calls give up after 5 s, so inside the
  application a stall of that length appears as timeouts.
- The refresh lease lasts 20 s; a tab waiting on it polls every 250 ms for up to
  20 s and then proceeds without it. A refresh request times out at 15 s. A
  token commit makes two inline attempts.
- #1359 measured the original slowness as **the processor**: pages too busy to
  run, so timers fire late. A held store is a different stall. Both are run
  here and they are never treated as the same thing.
- QA host: AMD Ryzen 3 3200G, 4 CPUs, 9.7 GiB, spinning `sda`.

## How the stall is produced

1. **From outside the application.** A spare tab of the same profile is paused
   inside a read-write transaction on `erp-session/kv`, so every other
   transaction on the store queues behind it. No file under `frontend/src`
   changes.
2. **The hold starts at refresh-send**: when the harness sees the round's first
   `POST /auth/refresh` leave a tab. The interception that sees it is armed on
   every tab **before any tab navigates**, and the spare reader's sampling of
   the store starts before that.
3. **Hold lengths: 12 s and 21 s.**
4. **What the hold stalls is verified, not assumed.** During calibration the
   timer-lateness probe runs in every application tab through a hold. The hold
   is described as storage-only only if those tabs' timers stay on time while
   their storage calls time out; the figures are written under *Frozen values*.
   If the pause also stalls other tabs, the work stops and returns to the owner.
5. **Fallback.** A narrowly scoped, test-only switch in the storage layer is
   considered only if the outside hold cannot land reliably, and only after the
   owner has been asked. If built it is confined to QA/test builds and absent
   from production artifacts; delays the storage operation and changes nothing
   in session, grace or replay logic; traces the injection point, requested
   delay, observed delay and release; and its results are recorded as behaviour
   under an injected delay, which does not establish that real storage
   contention behaves identically.

## Landing, calibration and freezing

- A round has **landed** when the hold was confirmed active before the refresh
  answer arrived at the refreshing tab **and** that tab's first `token-commit`
  attempt ended in `timeout`. The outcome of **both** inline attempts is
  recorded for every round.
- The mechanism is **reliable** at 8 landed rounds out of 10 **consecutive**
  calibration rounds. Below that, stop and return to the owner.
- Calibration runs on **pinned `main` only** and is finished and frozen before
  any outcome of the control's unfixed half is looked at.
- Only these may change between calibration invocations: whether the first
  refresh is gated, the readiness barrier's longest wait, and the control's
  hold length (12 s or 21 s). Every calibration invocation is kept and
  reported, misses included.
- The frozen mechanism is written under *Frozen values* and committed before
  any recorded round. It is **one mechanism for every hold cell and for both
  halves of the control**.
- **Landing is verified in every round of every cell.** Calibration at 20 tabs
  and a 5 s grace does not carry over to other settings by assumption.
- Misses and failed attempts inside the ten recorded rounds stay in the record.
  They are not rerun or replaced.

## An eligible peer

A held store stalls every tab. A tab still starting when the hold begins times
out its start-up read, shows the storage-waiting screen and sends nothing, so it
can never present the old token. A round in which no other tab could do so says
nothing about replay.

- Before the refresh and the hold are triggered, at least one tab other than
  the refreshing one must be an **eligible peer**: established by a **live**
  check at the trigger that the tab is open, initialized and on a signed-in
  route, not in storage-waiting, holds the pre-refresh generation, and that the
  stored record shows no generation change and no session end since the round
  began. A request the tab sent earlier with the old access token is not
  enough. **The evidence used is recorded with the round.**
- Every round records its readiness counts when the hold begins: tabs past
  start-up, eligible peers, tabs still starting, tabs in storage-waiting.
- A landed round with **zero eligible peers is timeout-path evidence only**.
- The trigger may wait for an eligible peer up to the frozen barrier. That wait
  delays the first refresh and is recorded as a departure from the recorded
  run's natural timing.

## The matrix

Ten recorded rounds per cell, in one invocation per cell. Every tab starts with
an expired access token; the access lifetime is 20 s. A fresh browser profile
and a fresh sign-in are used for every round.

| Cell | Build | Tabs | Hold | Grace | CPU load | Timer probe |
|---|---|---|---|---|---|---|
| `C-unfixed` | control | 20 | the frozen control hold (first candidate 12 s) | 5 s | none | no |
| `C-main` | pinned `main` | 20 | identical to `C-unfixed` | 5 s | none | no |
| `H12` | pinned `main` | 20 | 12 s | 5 s | none | no |
| `H21` | pinned `main` | 20 | 21 s | 5 s | none | no |
| `T30` | pinned `main` | 30 | none | 5 s | none | yes |
| `T40` | pinned `main` | 40 | none | 5 s | none | yes |
| `G60` | pinned `main` | 20 | 21 s | 60 s | none | no |
| `P` | pinned `main` | 20 | none | 5 s | 8 busy workers | yes |
| `X` | pinned `main` | 30 | 21 s | 60 s | none | yes |

- If the frozen control equals `H12` or `H21` in every setting, `C-main` **is**
  that cell and is run once.
- `T30` / `T40`: a cell the host cannot carry is recorded as **incomplete
  coverage** with what gave out and when. It is not rerun at a lower number.
- `X` uses 30 tabs. If `T30` was resource-limited, `X` is run at 20 tabs as
  **supplemental evidence only** and the combined condition is recorded as
  **incomplete**.
- **CPU load (`P`)**: 8 busy-loop workers (twice the host's 4 CPUs) in a
  container of their own, started 5 s before the tabs open and stopped at the
  end of the round. No memory or disk pressure is added.
- **Timer probe**: a 100 ms timer installed by the harness in every tab, which
  records how late each firing was. Reported per round as the maximum and the
  counts over 1 s and over 5 s. It is itself a little load, so cells that carry
  it say so.
- **What `P` is compared with**: only the spare tab's read duration is compared
  with the recorded run's 12 to 21 s, because that is the only figure the
  recorded run has. Timer lateness and the count of application storage
  timeouts are additional observations with no original figure.

## How long a round is watched

"A refresh operation is complete" means its answer has arrived **and** what
follows has settled in the trace: for a 200, the token commit's final outcome
(written, discarded, or the pending entry dropped) and the lease release; for a
refusal or an error, the lease release or the session's end.

1. **Through grace expiry.** Until the hold has been released and the grace of
   the round's first supersession has expired. If no refresh has been answered
   200 by 60 s after the tabs opened (or by hold release if later), the round
   records `no-supersession` and moves on from there; in a hold cell it has not
   landed.
2. **Passive, 65 s.** The harness does nothing to the tabs. A refresh sent in
   this phase is followed until the operation is complete, past the 65 s if
   need be. A passive phase with no refresh is **"no opportunity observed"**. It
   is not evidence that a post-grace replay was prevented.
3. **One nudge**, only if phase 2 saw no refresh sent. The nudge is ordinary
   application behaviour that leads a signed-in tab to make an authenticated
   request; it does not call the runtime, touch storage or reload the page. The
   action, the route and the tabs are written under *Frozen values* before any
   recorded round; the default target is every tab on a signed-in route and not
   in storage-waiting, all at once. Each round records the tabs nudged and when.
   A refresh sent within 20 s of the nudge is followed until complete. If none
   is sent in those 20 s the round records `no-refresh-after-nudge` and ends.

Everything seen after the nudge is labelled provoked and reported apart from the
first two phases. A session that ends earlier ends the round. The only cut-off
is an overall cap of 300 s from the tabs opening: an operation still in flight
then is recorded as `unfinished-at-cap` with what had and had not happened.

## What the judge says

The rules below were fixed before any round ran.

### Facts, recorded for every round, each with its times

- `injection`: requested hold, observed hold (start, release, duration),
  whether it was active before the refresh answer arrived, and whether the
  round landed. For `P`: the workers' start and stop, the timer-lateness
  figures, the spare tab's read durations and the count of application storage
  timeouts.
- `readiness`: the counts when the hold began, and the eligible-peer evidence.
- `commitAttempts`: outcome and duration of both inline `token-commit` attempts
  of the refreshing tab, and of any later attempt.
- `laterRefresh`: whether a refresh was seen in the passive phase, whether the
  nudge was used, which tabs it targeted, and what followed.
- `stalePresentations`: every refresh that presented a generation the server
  had superseded, from the trace and the token rows, **whether or not an audit
  row exists**.
- `replay`: a `SESSION_REPLAY_REVOKED` audit row for the round's session inside
  the round.
- `sessionAlive`, the server's revoke reason if it ended, and how many tabs held
  their data.
- `observation`: the phase the round ended in, and any of `no-supersession`,
  `no-refresh-after-nudge`, `unfinished-at-cap`.

### Outcome: exactly one per round, decided in this order

**Outcome and validity are separate.** The outcome says what was observed;
validity says whether the round counts toward its cell. A server-confirmed
replay is reported as a replay whatever the round's validity.

1. **`replay-confirmed`**: a replay audit row matches the round's session and
   falls inside the round. This holds **even when the server rows only partly
   cover the round**. It keeps the earlier cause reading as a sub-verdict
   (`hypothesis-1-observed`, `replay-other-path`, `supporting-unconfirmed` with
   its `missing` and `supports` lists). A cause is **demonstrated** only by
   `hypothesis-1-observed` or by a fully traced `replay-other-path` in a valid
   round; otherwise it is **suspected**.
2. **`undetermined`**: no replay row was found **and** the server rows are
   missing, unreadable, or do not cover the round. Never read as clean.
3. **`session-ended-no-replay`**: the session ended during the round with no
   replay row. The server's revoke reason, or its absence, is recorded.
4. **`stale-presentation`**: no replay, the session alive, and a superseded
   generation was presented. **The browser's send time is not the server's
   arrival time.** Arrival is an interval: from the browser's send to the
   ingress log's time for that request where the two can be correlated,
   otherwise to the browser's receipt of the answer, with the source named.
   Three kinds: *inside grace* (the whole interval is inside); *outside grace
   with no replay row* (the whole interval is outside; kept and flagged, never
   dropped for lack of an audit row); and *boundary-uncertain* (the interval
   straddles the end of the grace or the supersession itself), which is not
   classified either way. Whether the server **accepted** the presentation is
   read from its answer, never inferred from a timestamp.
5. **`commit-timeout`**: none of the above, and a commit attempt timed out.
6. **`clean`**: none of the above, session alive.

The outcome does not hide the facts: a `replay-confirmed` round still lists its
commit timeouts and stale presentations.

### Validity

A round is **valid for its condition** unless one of these holds, each recorded:
`server-rows-unreadable`; `server-rows-partial`; `trace-incomplete`;
`reset-failed`; `resource-limit`; `unfinished-at-cap`; and, in a hold cell,
`injection-missed` (the round did not land), counted separately.

An invalid round keeps its outcome and all its facts. It does not count toward
the cell's coverage, and no cause is attributed from it beyond "suspected".

### Coverage

A valid hold-cell round is labelled `replay-coverage` when it landed with at
least one eligible peer and `timeout-path-only` when it landed with none. Only
`replay-coverage` rounds support any statement about replay, including "not
reproduced".

- **Replay coverage floor (hold cells):** at least 8 of the 10 recorded rounds
  are valid and `replay-coverage`. Below that the cell's replay coverage is
  incomplete, whatever its rounds showed.
- **Timeout coverage (hold cells):** the count of valid landed rounds of either
  label, reported separately.
- **Cells without a hold:** at least 8 of 10 valid rounds, otherwise incomplete
  coverage.

A replay in a round outside these counts is reported at the top of the cell's
summary.

## The control

Neither variant is literally the `e434e39b7` build, and the record labels
whichever is used by what it is.

- **Preferred: pinned `main` with only the #1358 frontend fix reverted** (PR
  #1371; session commits `6119f74a0`, `8d63e763d`, `980e9fb35`, `9cf989e3d`),
  keeping the trace the judge needs. Before it is used it is **verified** that
  the reverted code restores the pre-fix behaviour: a refresh answered 200 whose
  commit times out is dropped, the lease is released, and the tab is left with
  the superseded token. The record lists what was reverted and the resulting
  diff against pinned `main`.
- **Only if a narrow revert is not viable:** pinned `main` with all of
  `frontend/src` set back to `e434e39b7`, used only after every difference it
  brings beyond the fix, and any compatibility problem with the current
  backend, is written here together with why the narrow revert failed.
- Backend and ingress are pinned `main`'s for both halves; the halves differ in
  frontend code only, by the recorded diff. The control branch carries the same
  harness.
- The repository's full frontend gate (lint, type-check, the whole test suite)
  is run on the control branch. Failures are recorded in two lists: those
  expected because they test the reverted fix, and any others, which are
  resolved before the control is used.
- The control starts as one condition on each half. It is expanded only if the
  comparison is inconclusive, and the expansion is written here before it runs.
- If the unfixed half times out but never replays, the harness is validated
  **for the timeout path only**; its ability to expose a replay stays unproven.

## Reset and isolation

Before **every round** the harness verifies and records: no hold is active (a
plain read of the store returns within 1 s); no CPU worker container is
running; every tab of the previous round is closed; the previous round's
session is ended and a fresh profile and sign-in are in place; the ingress
limiter has drained. A failed check makes the round not valid for its
condition, with reason `reset-failed`; it does not abort the cell.

Between **builds**: the frontend is rebuilt and the served build verified;
leftover QA sessions are ended; no harness or worker container is left; the
stack's configuration is recorded before, during and after.

No second database is used. The QA stack is **dedicated** during testing, and
each invocation records the other containers running and each round the host's
one-minute load average.

`REFRESH_GRACE_SECONDS=60` is set on the QA stack only for the cells that say
so, by the owner's decision for these runs. After every invocation the stack is
restored to the configuration captured beforehand.

## Predictions, written before the runs

Hypotheses to compare the results with. None is a pass condition.

- `C-unfixed`: the commit times out; the refreshing tab loses the new tokens; a
  later tab presents the superseded generation; with a 5 s grace and a longer
  hold, a replay is plausible.
- `C-main` / `H12`: the commit times out and the pending token commit lands on a
  later attempt; no replay.
- `H21`: 21 s is longer than the 20 s lease, so a waiting tab may outwait it and
  present the superseded generation past a 5 s grace. A replay here could
  involve the known grace-window limitation; attribution depends on the trace.
  Hold duration alone cannot establish the cause.
- `G60` / `X`: the same presentation would fall inside the grace and be
  recovered. A hypothesis: timing relative to a grace period already running
  could matter, and the grace-relative timing of every stale presentation is
  the evidence.
- `T30`, `T40`, `P`: unknown. These are the cells closest to the original
  conditions.

## Evidence

- Raw evidence (the diagnosis with its traces, the server rows, the verdicts,
  the stack configuration before, during and after, the host probe log, the
  ingress log) is kept on the QA host, outside the repository, in one directory
  per cell and invocation: `~/erp2-qa-evidence/1370/<cell>/<UTC start>/`, with
  calibration under `~/erp2-qa-evidence/1370/calibration/<UTC start>/`.
- A manifest committed at `docs/modules/auth/evidence/1370-manifest.tsv` lists
  every file with its cell, relative path, size and SHA-256. The record cites
  evidence by cell and manifest line.
- The evidence holds no token: 12-character fingerprints, generations, session
  ids and times. That is checked before the manifest is written.

## Frozen values

Not yet frozen. No recorded round may run while this line stands.
