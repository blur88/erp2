# Verification waits

Use this guide during implementation or PR preparation when verification takes time.
The existing PR template references it during verification preparation; it is
not an always-loaded steering file. This implements #1899's wait
guidance. [AGENTS.md](../../AGENTS.md#change-scoped-verification-required-before-pr)
owns required verification and qualifying CI evidence; the
[PR template](../../.github/pull_request_template.md) owns evidence formatting
(#1897).

## Before waiting

1. Select applicable verification from changed files using AGENTS.md. Identify
   which commands already have qualifying completed evidence and which remain.
2. For an existing PR, inspect its head and all relevant checks once:

   ```sh
   gh pr view <pr> --json headRefOid
   gh pr checks <pr> --json name,state,bucket,link,workflow
   ```

   If no PR exists, record that and use local process results; there are no PR
   checks to watch. An empty check list is not successful verification: if CI is
   expected, inspect its dispatch/queued state once before choosing a wait.
3. Match evidence to the head as required by the PR template. Reuse completed
   qualifying suites instead of starting duplicates for documentation or review.
   Choose a wait for the remaining work and state any useful expectation once.

## Wait for a result

Prefer one CLI watcher or the existing process session's blocking wait:

```sh
gh pr checks <pr> --watch --interval 60
# Or, when waiting for one identified Actions run:
gh run watch <run-id> --exit-status --compact --interval 60
```

Watch the checks that cover the applicable commands. `--required` alone may omit
applicable checks that branch protection does not require. A PR watcher covers
checks currently associated with the PR; an expected missing check still needs
investigation. Use `--fail-fast` only when an early failure is actionable, then
account for checks still running.

For a local command, retain its session ID and resume it with the process tool's
blocking wait. Capture its exit code and final output. For a CLI watcher, redirect
repetitive display output to a temporary file if needed; inspect the result when
it finishes. A watcher error, authentication failure, timeout, or interruption
does not prove the verification passed or failed.

Respect the host's wait limits and higher-priority communication requirements.
For example, with a 60-second blocking-call limit, wait at most 60 seconds per
call. If a process remains active after a tool yields, resume the same session
with the longest permitted wait instead of starting another watcher or reading
unchanged logs. Deliver required updates with useful context (what evidence
remains or what the next result will resolve), without repeating pending status.

If blocking is unavailable, poll summary status at longer intervals, starting
around 30 seconds and backing off to 60 seconds or the host's allowed limit.
Batch relevant checks in one status read per interval. Read detailed logs only
for a failure, a meaningful change needing investigation, or evidence extraction.
Do not add a custom polling helper, CI job, or verification gate.

## Finish or investigate

Collect final check summaries and recheck the PR head after waiting. If it changed,
reassess evidence for the new head using the PR template. For Actions, inspect a
linked run's `headSha`, status, conclusion and jobs with `gh run view <run-id>
--json headSha,status,conclusion,jobs,url`. Verify the applicable command actually
completed; skipped, cancelled, pending, or unrelated checks do not establish a pass.

For failure investigation use `gh run view <run-id> --log-failed` (optionally
scoped with `--job <job-id>`). Read successful logs only when needed to extract
command evidence or reliable counts. Report meaningful results, changed
conditions, failures, or necessary expectations. Record actual results and links
in the PR template, including remaining verification; follow its draft/ready rule.

## Representative wait validation

Executed on 2026-11-16 with the existing `exec_command` / `write_stdin` process
tools. Only documentation/template files changed, so no application suites applied.
One `gh pr view --json number,headRefOid,url` inspection found no PR for the current
`main` branch; no PR check watcher or CI evidence was claimed. CLI flags above
were checked against installed `gh` 2.103.3 help.

Two synthetic verification processes exercised completion and failure without
running a duplicate application suite or adding a polling helper:

```sh
python3 -c 'import time; time.sleep(10); print("representative verification: PASS", flush=True)'
python3 -c 'import sys,time; time.sleep(10); print("representative verification: FAIL", flush=True); sys.exit(1)'
```

Each launch used `yield_time_ms: 1000` and returned a running session with no
output. Each session was resumed once with `write_stdin`, empty input and
`yield_time_ms: 60000`; both calls returned at completion:

| Process | Model-driven status reads after launch | Final output | Exit code |
|---|---:|---|---:|
| Success | 1 blocking session resume | `representative verification: PASS` | 0 |
| Failure | 1 blocking session resume | `representative verification: FAIL` | 1 |

The two resumes were batched in one tool call. There were zero intermediate
status polls, repeated log reads, or unchanged pending updates. Both outcomes
were detected accurately. This validates the local process-wait path, not a live
CI transition or the polling fallback. Usage was not measured; no token savings
are claimed.
