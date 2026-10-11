# #1367: expectations, written before any run (2026-10-11)

Commit: see COMMIT. Every run goes through run.sh with QA_SUITE_OVERRIDE and QA_ONLY=8, so every one is a
partial run. QA configuration access 20 s, grace 5. A run counts only if what is named below happened for
the stated reason; no expectation is changed after a result is seen.

## G8: base copy (unmodified), QA_ONLY=8. Baseline through the override path.
Expected: exit 0, case 8 passes every line. lifetimesUsed is 3.5 or more (3.5 in both recorded runs since the
revision; more if the extension happens to be entered, which would itself answer the first criterion as a
partial run). uses >= 12, generation +3 or more.

## E8: copy c8-extension. The extension, placed on purpose.
Placement (the harness's, not the application's): the case's clock starts right after a rotation, and a use
that would start between 0.7 s before and 4.5 s after the stored token's expiry is held until 4.5 s after it.
Expected: exit 0, case 8 passes every line; `lifetimesUsed` > 3.5 (about 3.75 to 4.0); the third rotation is
first seen at a use start later than 70 000 ms after the clock started (`placement1367.generationsSeenAtAUseStart`);
uses 12 to 16; generations before g, after g + 3; three refreshes answered 200 inside the clock, none refused.
It does NOT count if lifetimesUsed is 3.5 or the third rotation is first seen at or before 70 000 ms: then the
extension was not entered. Possible and not a failure of the placement's purpose: uses == 12 exactly.
Risk written down: 13 uses are predicted, one above the count line's 12. If a held use pushes the count to 11,
"at least twelve uses completed" fails; that would be the placement's doing and the run would not count.

## B8: copy c8-bound. The third rotation never arrives.
Fault (harness): once two rotations are stored, every business GET of both tabs is answered by the harness
(the last real 2xx body for the path, else an empty list), so no use reaches the server and no third refresh
is sent.
Expected: exit 1. Case 8 fails on "the generation advanced at least three times" and on no other line that is
about the session: `lifetimesUsed` 6.0 to 6.3, uses about 24 (>= 12, so the count line passes), same session,
generations before g, after g + 2, exactly two refreshes answered 200.
Predicted collateral, possible: "tab A is signed in" / "tab B is signed in" may fail if a page cannot render an
empty list where it expects another shape; a use may throw if a page sends no GET the harness answers.
If a use throws, the bound was not reached and the run does not count for this criterion.
What is being read: whether the output says that the case ran out its six lifetimes without the third rotation,
i.e. says why, or only that the generation line failed.

## U8: copy c8-use-fails. A use that fails.
Fault (harness): from the seventh use on, every business request of both tabs is answered 500.
Expected: exit 1. The seventh use throws out of `exercise` after its 45 s wait with
"<tab>: requests after moving to <path> never succeeded: [[path, 500, null], ...]"; cases.mjs prints
"ERROR ..." and reports the case failed with `error` set. Because the throw leaves `run` before the records,
I expect `recorded` to hold no lifetimesUsed, uses, refreshRequests or generations, and `checks` to hold no
line at all after the precondition. Whether that is a usable message is what is being read.

## Dated addition, 2026-10-11 15:02, after B8 and before B8b. No expectation above is changed.

B8 did not count: exit 0, every line passed, generations 1 to 4. The fault did not produce its condition. It left
/api/health alone, and tab polls `GET /api/health/redis-alerts`, which needs a token: answered 401 at 06:52:59 UTC,
it sent the third refresh. (lifetimesUsed 6.01 with 24 uses: the third rotation came only with that poll.)

## B8b: copy c8-bound-2. As B8, with every GET under /api except /api/auth answered by the harness.
Expected: as written for B8 (exit 1, "the generation advanced at least three times" fails, lifetimesUsed 6.0 to
6.3, uses about 24, generations g to g + 2, exactly two refreshes answered 200), same possible collateral.

## Dated addition, 2026-10-11 15:50, after G8, E8, B8, U8 and B8b. Nothing above is changed.

Results against the above: G8 as expected (3.5, 14 uses, 1 to 4). E8 as expected (3.84, 13 uses, 2 to 5; the use
that sent the third refresh was held from 67.9 s to 71.8 s after the clock started, generation 4 at its start).
B8 did not count (above). B8b as expected, collateral included: exit 1, 6.01 lifetimes, 24 uses, 1 to 3, two
refreshes; "the generation advanced at least three times" failed, and both "signed in" lines failed. U8 as
expected: ERROR "A: requests after moving to /sales/orders never succeeded: [[/api/customers,500,null],
[/api/sales-orders,500,null]]", the case failed, and nothing was recorded.

What was read: B8b's failing line gives the stored record and does not say that six lifetimes ran out; the
reader has to find `lifetimesUsed` 6.01 among the records. U8's message is usable (tab, page, requests, statuses)
but the case records nothing of the six uses that had completed.

`proposed` changes case 8 for both: the rotation line's detail says how the uses stopped, the lifetimes used
against the bound of 6, and a sentence; a failed use is thrown on after the records, with `failedUse` and
`stopped`. No pass condition changes.

## R8: the repository's suite on the #1367 branch, QA_ONLY=8, no override. Expected: exit 0, as G8; `stopped`
is "the third rotation was seen".

## PB8: copy p-bound (proposed + B8b's fault). Expected: as B8b, and the failing line's detail holds
`stopped: "six lifetimes passed"`, `rotations: 2`, `lifetimesUsed` 6.0 to 6.3, `boundLifetimes: 6`, and the sentence.

## PU8: copy p-use-fails (proposed + U8's fault). Expected: exit 1, the same ERROR message naming tab A and
the requests answered 500; `recorded` now holds `uses: 6`, `stopped: "a use failed"`, `failedUse {use: 7, tab:
"A", afterCompletedUses: 6}`, `lifetimesUsed`, `refreshRequests` and `generations`; no check line is reached.
