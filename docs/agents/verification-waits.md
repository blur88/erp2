# Verification waits

## Before waiting

1. Select applicable verification from changed files using
   [AGENTS.md](../../AGENTS.md#change-scoped-verification-required-before-pr).
   Identify which commands already have qualifying completed evidence and which
   remain before starting another run.
2. For an existing PR, perform the initial head and check inspection in the
   [PR template's verification instructions](../../.github/pull_request_template.md)
   once. If no PR exists, use local process results. An empty check list is not
   successful verification: if CI is expected, inspect its dispatch/queued state
   once before choosing a wait.
3. Choose local or CI execution for each required full suite before starting it.
   When CI covers the full suite on the current head, use targeted local checks
   as needed and follow the single-watcher guidance under [Wait for a result](#wait-for-a-result).
   Check [Change-Scoped Verification](../../AGENTS.md#change-scoped-verification-required-before-pr)
   for qualifying full-stack deployment evidence. Skip a complete local stack
   run whose sole purpose would be to duplicate that evidence.
4. Choose a wait for the remaining work and state any useful expectation once.

## Before running local Docker verification

1. Check free space on the filesystems that hold Docker data and build caches.
   For a substantial build, include the root filesystem with `df -h /`.
   Compare the stack's configured published ports with host listeners and
   running containers before bringing the stack up.
2. Treat about 5 GB of free space as advisory for substantial full-stack builds.
   Below that threshold, inspect `docker system df` and relevant caches, such as
   the npm cache. A targeted Docker test, such as building only the Ingress
   image, may proceed once the free-space and Docker usage checks confirm enough
   headroom for that operation. Keep pruning out of automated verification.
   On a shared host, arrange cleanup with the host owner and confirm other
   builds are finished before pruning. The Docker option in
   [maintain.sh](../../maintain.sh) prunes, rebuilds, and starts the stack. Use
   it only when all three actions are appropriate, then repeat the disk and port
   checks before verification.
3. If a local Compose check fails, capture the relevant service logs from the
   same Compose project before teardown. Follow [Wait for a result](#wait-for-a-result)
   to preserve the original verification exit status through cleanup.

Report remaining evidence gaps using the [review evidence guidance](../../CODING_STANDARDS.md#acceptance-criterion-evidence-in-reviews),
including checks blocked by insufficient disk space during preflight or execution.

## Wait for a result

Prefer one existing CLI watcher:

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

For local verification or a CLI watcher, use the host's supported process wait
or background completion notification. Keep the original process handle and
capture its exit code and final output. If the host returns before completion,
use its supported wait or notification mechanism for that same process.
Respect the host's actual blocking-call limits. Redirect repetitive watcher
display output to a temporary file when needed and inspect it at completion.
A watcher error, authentication failure, timeout, or interruption does not prove
the verification passed or failed.

When shortening test output, keep the full stdout and stderr in a log and
preserve the test process's exit status. For example, run this in Bash from
`frontend/` to display only the last 40 lines while retaining the full log:

```bash
(
  set -o pipefail
  mkdir -p test-results
  npm run test:coverage 2>&1 | tee test-results/coverage.log | tail -n 40
)
```

The frontend's `npm test` and `npm run test:coverage` also write JUnit reports
to the git-ignored paths specified in [frontend/package.json](../../frontend/package.json).
Each command replaces its previous report, so inspect and retain failure
evidence before rerunning.

If blocking or completion notifications are unavailable, poll summary status at
longer intervals, starting around 30 seconds and backing off to 60 seconds or the
host's allowed limit. Batch relevant checks in one status read per interval.
Read detailed logs only for a failure, a meaningful change needing investigation,
or evidence extraction.

## Report and collect evidence

Send progress updates for meaningful results, changed conditions, failures, or
necessary expectations. Follow higher-priority communication requirements; when
an update is required during a wait, explain what evidence remains or what the
next result will resolve without repeating unchanged pending status.

At completion, follow the PR template's final head check and evidence collection
instructions. For Actions, inspect a linked run's metadata with:

```sh
gh run view <run-id> --json headSha,status,conclusion,jobs,url
```

For failure investigation use `gh run view <run-id> --log-failed` (optionally
scoped with `--job <job-id>`). Read successful logs only when needed to extract
command evidence or reliable counts. Record actual results and links in the
PR template, including remaining verification, and follow its draft/ready rule.
