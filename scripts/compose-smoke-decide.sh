#!/usr/bin/env bash
# Decide whether the Frontend CI job runs the Compose deployment and ingress
# smoke test (#1966). Prints `run=true` or `run=false` on stdout, ready to
# append to $GITHUB_OUTPUT; the reason goes to stderr.
#
# EVENT_NAME is github.event_name. Anything that is not a pull request has no
# base to diff against, so it runs. On a pull request, actions/checkout gives a
# merge commit whose first parent is the base; the changed paths are the diff
# between the two, and compose-smoke-paths.sh judges them. If HEAD is not that
# two-parent merge, or the diff cannot be computed, there is no base either, so
# run rather than skip.
set -uo pipefail

here=$(dirname "${BASH_SOURCE[0]}")

if [ "${EVENT_NAME:-}" != pull_request ]; then
  echo "Not a pull request (${EVENT_NAME:-unset}): running the Compose smoke test" >&2
  echo "run=true"
elif [ "$(git rev-list --parents -n 1 HEAD | wc -w)" != 3 ]; then
  echo "HEAD is not a two-parent merge commit: running the Compose smoke test" >&2
  echo "run=true"
elif ! changed=$(git diff --name-only HEAD^1 HEAD); then
  # Capture first: in a pipe, a failed diff would reach the matcher as "no
  # changed paths" and skip the test. Every fall-back fails toward running.
  echo "git diff failed: running the Compose smoke test" >&2
  echo "run=true"
elif "$here/compose-smoke-paths.sh" >&2 <<<"$changed"; then
  echo "run=true"
else
  echo "No Compose or ingress file changed: skipping the Compose smoke test" >&2
  echo "run=false"
fi
