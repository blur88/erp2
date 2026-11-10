#!/usr/bin/env bash
# #1457: every rule (### heading) in CODING_STANDARDS.md states Rule, Why,
# Diff failure and Trace, each with text, so reviewers can rely on the shape
# without re-checking it.

set -euo pipefail

REPO_DIR="${1:-$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)}"
FILE="$REPO_DIR/CODING_STANDARDS.md"

awk '
  function close_rule(  i) {
    if (heading == "") return
    for (i = 1; i <= 4; i++) {
      if (!(fields[i] in seen)) {
        printf "CODING_STANDARDS.md: %s: missing %s\n", heading, fields[i] > "/dev/stderr"
        failed = 1
      }
    }
    heading = ""
    delete seen
  }
  BEGIN { split("Rule|Why|Diff failure|Trace", fields, "|") }
  /^##? / { close_rule(); next }
  /^### / { close_rule(); heading = substr($0, 5); rules++; next }
  heading != "" && match($0, /^- \*\*[^*]+:\*\*/) && substr($0, RLENGTH + 1) ~ /[^ \t]/ {
    seen[substr($0, 5, RLENGTH - 7)] = 1
  }
  END {
    close_rule()
    if (rules == 0) {
      print "CODING_STANDARDS.md: no rules (### headings) found" > "/dev/stderr"
      failed = 1
    }
    exit failed
  }
' "$FILE"
