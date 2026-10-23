#!/usr/bin/env bash
# #1446: repeat Vitest's "Unhandled Errors" block, which fails a run under a
# fully passing count, as a CI annotation. Reports only; always exits 0.

set -euo pipefail

log="$1"
[ -f "$log" ] || exit 0
block="$(sed -E 's/\x1B\[[0-9;]*[A-Za-z]//g' "$log" | sed -n '/Unhandled Errors/,/^ *Errors /p')"
[ -n "$block" ] || exit 0
origins="$(printf '%s\n' "$block" | grep -oE 'originated in "[^"]+"' | sort -u | tr '\n' ' ' || true)"
echo "::error title=Frontend tests failed on an error raised outside any test::${origins:-No origin file was reported.} The test counts may all read passed; see the job summary for the stack."
{
  echo '### Errors raised outside any test'
  echo
  echo 'These fail the run even when every test passed. A rerun that passes does not resolve them.'
  echo
  echo '```'
  printf '%s\n' "$block"
  echo '```'
} >> "$GITHUB_STEP_SUMMARY"
