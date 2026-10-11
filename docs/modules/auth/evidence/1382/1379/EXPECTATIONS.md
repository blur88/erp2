# #1379: expectations, written before any run (2026-10-11)

Commit: see COMMIT. Partial runs through run.sh with QA_SUITE_OVERRIDE and QA_ONLY=1,3. `proposed` is the suite
with cases 1 and 3 changed as proposed for #1379 (two new lines: a session-channel message reached tab B
between the sign-out and its redirect; B's next status poll was not yet due when it was redirected, margin 2 s).
The three mutations are diffs against `proposed`. A run counts only if the named lines behave as written here.

## N: copy proposed, unmodified. Expected: exit 0; cases 1 and 3 pass every line, the two new ones included.
The message is recorded 0 to 2000 ms after the sign-out began; the next poll is due about 29 s after it.

## PA: channel removed in tab B, usual timing (old run A).
Expected: exit 1. As in run A, the 5 s lines fail in both cases and the no-request line passes. New: the
channel line FAILS (channelInTabB false, no redirect seen), and the poll line FAILS too because no redirect
was seen (it requires one).

## PB1: channel removed in tab B, sign-out 27.5 s after B's poll (old run B1, which passed every line).
Expected: exit 1. The 5 s lines PASS and the no-request line PASSES, as in B1 (B is ended by the gate's read
before its poll). The channel line FAILS (channelInTabB false) and the poll line FAILS (the redirect comes at
or after the time the poll was due, less the margin). This is the run that shows a pass can no longer come
from the other mechanism.

## PB3: channel present, sign-out 27.5 s after B's poll.
Expected: exit 1. Every line passes except the poll line: the message reaches B and B is redirected within
about a second, but the next poll was due 2.5 s after the sign-out began and the margin is 2 s, so the
redirect would have to come within 0.5 s of the sign-out's beginning to pass. If the sign-out and redirect
complete inside 0.5 s the line passes and the run shows nothing about it (then: not counted, not a defect).
This run shows the poll line is live independently of the channel line.
