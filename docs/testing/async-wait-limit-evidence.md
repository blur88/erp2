# Async wait limit evidence (#1560)

This file is the evidence behind [#1560](https://github.com/blur88/erp2/issues/1560) and PR [#1649](https://github.com/blur88/erp2/pull/1649). The PR raises Testing Library's `asyncUtilTimeout` from its 1000ms default to 5000ms in `frontend/src/test/setup.ts`. All runs were on the local development machine on 2026-11-04. None of this is production evidence.

## Records

| File | What it is | How it was preserved |
|---|---|---|
| [`async-wait-limit-session-records.txt`](async-wait-limit-session-records.txt) | Records R01–R29: each shell command, its call and result timestamps (UTC), and its output. | Copied from the agent session transcript (`~/.claude/projects/-home-blur-erp2/29d49e56-a141-410a-a8dc-eccf2abf4ca1.jsonl`). Each tool result is reproduced exactly as recorded, with no edits. |
| [`async-wait-limit-5s-loaded-loop.output.txt`](async-wait-limit-5s-loaded-loop.output.txt) | Output of R14, the 5s loaded loop. | The background task's output file, copied byte for byte. Last written 2026-11-04 11:15:07 UTC. |
| [`async-wait-limit-lint-typecheck.output.txt`](async-wait-limit-lint-typecheck.output.txt) | Output of R16: lint, type-check and type-check:test, each with its exit line. | The background task's output file, copied byte for byte. Last written 11:13:44 UTC. |
| [`async-wait-limit-test-coverage.output.txt`](async-wait-limit-test-coverage.output.txt) and [`async-wait-limit-test-coverage-run.txt`](async-wait-limit-test-coverage-run.txt) | R23 `test:coverage`: the summary with its exit line, and the full run log. | The background task's output file and the log R23 wrote, copied byte for byte. Last written 11:40:03 UTC. |
| [`async-wait-limit-head-before-after.output.txt`](async-wait-limit-head-before-after.output.txt) | Output of R26: before and after runs at head `9b2cef0db`. | The background task's output file, copied byte for byte. Last written 11:53:00 UTC. |
| [`async-wait-limit-pr-checks-watch.output.txt`](async-wait-limit-pr-checks-watch.output.txt) and [`async-wait-limit-pr-checks.txt`](async-wait-limit-pr-checks.txt) | R28 `gh pr checks 1649 --watch --fail-fast` and R29 `gh pr checks 1649`, both at `9b2cef0db`. | The background task's output file and the file R29 wrote, copied byte for byte. |

The loop script is the heredoc in R05. `loop1560.sh <hogs> <runs>` starts `<hogs>` busy-loop processes (`while :; do :; done`). It then runs the two tests `<runs>` times. For each run it prints only `run N rc=…`, the `Tests` summary line and the failure lines. It ends with `RED x / N`.

## Claims and their records

Each row below is a result reported in PR #1649 and the record that supports it.

| Claim | Record |
|---|---|
| The host has 4 cores. | R01 (`nproc` printed `4`). |
| Before the diagnosis, a Codex loop was already running these two tests. It had exited before the first measurement. | R01–R03 |
| Unloaded baseline run: 2 passed. | R04 |
| `main` (1s), 8 hogs, both tests: `RED 3 / 4`. Run 2 shows the bank test's exact #1560 symptom, `expected "vi.fn()" to be called 3 times, but got 2 times`. Runs 1 and 3 show the same test failing one step earlier, `2 times, but got 1 times`. All three red runs show `Unable to find an element with the text: LIST PAGE`. | R06 |
| `main` (1s), no load: `RED 0 / 3`. | R07 |
| `main` (1s), 8 hogs, each test run alone: 4 of 4 red, 16,509–19,354ms. | R08 (the command filtered the reporter output to `✓`/`×` lines) |
| `main` (1s), no load: about 5s per test (5,107ms and 5,221ms, one run). | R09 |
| Temporary probe at 10s, 8 hogs: `RED 0 / 3`. The diff of the probe is shown. | R10 |
| Temporary probe at 150ms, no load: `RED 2 / 2`. The provider test failed with `LIST PAGE`; the bank test failed with `2 times, but got 1 times`. | R11 |
| The probe was removed: `no DEBUG-1560 left`. | R12 |
| Guard test before the commit: passes with the fix, and fails with `main`'s `setup.ts` (`expected 1000 to be 5000`). | R13 |
| 5s, 8 hogs: `RED 0 / 6`. | R14 and `async-wait-limit-5s-loaded-loop.output.txt` |
| During the 5s run, lint, type-check and type-check:test were also running. | Timestamps: R14 was called at 11:03:08 and its output was last written at 11:15:07. R16 was called at 11:03:17 and its output was last written at 11:13:44. R17 (`verify:doc-links`) was called at 11:13:27. |
| A first lint attempt failed because of a shell variable mistake. The lint results in this file come from the rerun. | R15 (`/lint.txt: Permission denied`) and R16 |
| lint, type-check and type-check:test passed with exit 0. | R16, R18 and `async-wait-limit-lint-typecheck.output.txt` |
| `verify:doc-links`: 254 local links in 51 files, exit 0. | R17 |
| Just before `test:coverage` started, no other Vitest, Jest or `tsc` processes were running; the only matches were VS Code TypeScript servers. The busy-loop processes were gone. Apart from `ps` itself, the top CPU users were the VS Code extension host (6.4%), a TypeScript server, `agy` and `claude` (2.0–2.2% each). | R20–R22 (11:15:18–11:15:25), then R23 called at 11:15:30. |
| `test:coverage`: 274 files and 3,072 tests passed, 1,470s, exit 0. | R23, R24 and both `async-wait-limit-test-coverage` files |
| Commit `9b2cef0db`. | R25 |
| At head `9b2cef0db`: guard test passes. With `origin/main`'s `setup.ts`, the guard test fails and the loaded loop is `RED 2 / 3`, with only the provider test failing. With head restored, the loaded loop is `RED 0 / 3`. | R26 and `async-wait-limit-head-before-after.output.txt` |
| PR checks at `9b2cef0db`: the watch exited 0, then `gh pr checks 1649` exited 0 with all 8 checks passing. | R28, R29 and both `async-wait-limit-pr-checks` files |

## Unpreserved

These observations have no record beyond what is stated here:

- **Load during the 2026-10-30 full run** in which #1560 was found. It is unknown, and nothing here measures it.
- **Full Vitest reporter output** for the loop runs (R06, R07, R10, R11, R14, R26) and for R08. Only the filtered lines the commands printed were kept.
- **Machine state while a run was in progress.** Besides the busy-loop processes these runs started, nothing was sampled during a run. The only samples are before the first measurement (R01–R03) and at the start of `test:coverage` (R20–R22). Whether `test:coverage` had the machine to itself for its whole 1,470s is unpreserved.
- **Load from the other checks during the 5s run.** The timestamps above show when they overlapped, but not how much CPU they used.

## Checks added later

These comparisons were run on 2026-11-04 while this file was being written. They are new checks, not records of the earlier runs:

- `git show 9b2cef0db:frontend/src/test/setup.ts` is byte-identical to the copy of `setup.ts` taken in R13. That copy was restored before R14 and R16 ran.
- `git show 9b2cef0db:frontend/src/test/__tests__/asyncUtilTimeout.test.tsx` is byte-identical to the content the session's Write call created. The file was not edited afterwards.

Together they show that R13–R23 ran on the same two files that `9b2cef0db` commits.
