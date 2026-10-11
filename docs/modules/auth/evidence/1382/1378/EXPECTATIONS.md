# #1378: expectations, written before any run (2026-10-11)

Commit: see COMMIT. Partial runs through run.sh with QA_SUITE_OVERRIDE; none is evidence of a pass.

## What is already established without a run (from runs/W1-429 of ~/erp-qa-1363 and the server rows)

- No refresh in the round was answered 401 before +47.1 s; the 18 refusals were 429 at the ingress and ended nothing.
- One refresh was answered 200 at +13.3 s (gen 3 -> 4, server row). The session was revoked server-side as `replay`
  at +47.1 s, when a tab presented a superseded refresh token 34 s after supersession (grace 5 s). The client then
  ended the session on that 401.
- So the stored record was still at generation 3 at +47 s: the tokens of the one successful refresh did not reach it.
- Another tab sent a refresh 216 ms after that 200, so the lease the successful refresh held was released at once.
  A storage stall with the entry pending (which keeps the lease) does not fit that.

## Run T1 (copy w1-429-traced, W1 at five tabs only, session trace on)

Question: what did the tab that received the 200 do with it?

Expected, in order of what I think likely, each distinguishable in the trace:
1. `refresh-answered status: error` in the tab whose request the ingress answered 200: the response did not reach
   the runtime as a 200.
2. `refresh-answered ok` followed by `token-commit` with `discarded` or `session-mismatch`, or by no commit at all
   (the not-eligible branch).
3. `refresh-answered ok`, `token-commit timeout` twice, entry left pending (I think this is ruled out by the lease).

Also expected: the round fails the same two checks as W1-429 (no 429 on refresh; every tab usable), the size check
fails (only N = 5 is run), exit 1. If no refresh is answered 200 at all, or the session is not ended, the run did
not reproduce the observation and says nothing about its cause.

## Dated addition, 2026-10-11 15:27, after T1 and before T2. Nothing above is changed.

T1 (794d2e321) did not reproduce the ending: the one 200 was the runtime's own, committed in 17 ms
(`written-both`), and the session was still stored at the end. None of my three expectations described it. What
it showed instead: tabs 2 to 5 each sent three more refreshes presenting the generation-3 token after generation
4 was stored, and none of them is in that tab's runtime trace (each trace has exactly one `refresh-sent`). They
were sent by `requestWithRetryOn429`, which re-sent the config of the 429 it caught, and that config was the
refresh request's. All twelve were refused again, so nothing was rotated outside the runtime in T1.
Read against the original run: tab N5b-3 there has two refused refreshes and the 200 (one runtime refresh, two
re-sends, the second answered 200); every other tab has four (one runtime refresh, three re-sends).

## Run T2: the same copy (w1-429-traced), on the fix commit 761985e1c.

Expected:
- For every tab of the five-tab round (b), the number of `POST /api/auth/refresh` the harness logged for the tab
  equals the number of `refresh-sent` events in that tab's trace. In T1 this was 4 against 1 for four tabs.
- No refresh presents a refresh token other than the one stored when it was sent (after a rotation, none
  presents the superseded one).
- The stored session is not ended by the round (`forced1363SignedInAgainAfterRoundB` absent).
- The run still exits 1: refreshes are still refused (the named 429 check fails), tabs whose refresh was refused
  are still left without data, and only N = 5 is run. The fix is not expected to make the round pass.
- Fewer session-zone requests than T1's 17 (no re-sends); how many depends on how many 401s each tab's runtime
  refreshes for.
If no refresh is refused at all, the run shows nothing.
