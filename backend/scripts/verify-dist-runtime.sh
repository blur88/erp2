#!/bin/sh
#
# POSIX sh, not bash: this runs inside the Docker builder (node:alpine), which
# ships BusyBox ash and has no bash. It also runs on the host via `npm run
# verify:dist`, so it must work in both.
#
# Verify the compiled dist/ is actually loadable by Node.
#
# Why this exists (issue: backend crash-loop, 2026-08-15):
# `npm run type-check` cannot catch this class of failure, and neither can
# `npm run test` (ts-jest transpiles per-file from src/ and resolves path
# aliases via tsconfig). The failure is created by the *build*, not the source:
#
#   nest build              -> rewrites "@database/..." to a relative path
#   npx tsc -p tsconfig.cli.json -> recompiles the same files into dist/ WITHOUT
#                              rewriting aliases, overwriting the good output
#
# Any src file reachable from a CLI entrypoint in tsconfig.cli.json's `include`
# is recompiled by that second pass. If such a file imports via a path alias,
# the alias survives verbatim into dist/ and Node throws MODULE_NOT_FOUND at
# runtime. When the file is also in app.module's require chain, the whole
# application fails to boot.
#
# Two checks, cheapest first:
#   1. static  - no unresolved path aliases anywhere in dist/
#   2. runtime - dist/main.js actually loads (the definitive check)
#
# Usage: ./scripts/verify-dist-runtime.sh [dist_dir]

set -eu

DIST_DIR="${1:-dist}"

if [ ! -d "$DIST_DIR" ]; then
  echo "FAIL: '$DIST_DIR' does not exist. Run 'npm run build' first." >&2
  exit 1
fi

if [ ! -f "$DIST_DIR/main.js" ]; then
  echo "FAIL: '$DIST_DIR/main.js' not found — build output is incomplete." >&2
  exit 1
fi

# Keep in sync with the "paths" block in tsconfig.json. A new alias added there
# and not added here is still caught by the main.js load check below.
ALIAS_PATTERN='require\("@(database|modules|common|config)/[^"]*"\)'

echo "==> Checking for unresolved path aliases in $DIST_DIR/ ..."

# grep -E over the whole tree; -r so nested dirs are covered.
if matches=$(grep -rnoE "$ALIAS_PATTERN" "$DIST_DIR" 2>/dev/null | sort -u) && [ -n "$matches" ]; then
  echo "FAIL: compiled output contains unresolved TypeScript path aliases." >&2
  echo "" >&2
  echo "$matches" >&2
  echo "" >&2
  echo "Node cannot resolve these at runtime -> MODULE_NOT_FOUND on boot." >&2
  echo "" >&2
  echo "Cause: a file reachable from tsconfig.cli.json's 'include' was recompiled" >&2
  echo "by 'npx tsc -p tsconfig.cli.json', which does not rewrite path aliases," >&2
  echo "overwriting the correct output from 'nest build'." >&2
  echo "" >&2
  echo "Fix: use a relative import in the file(s) listed above." >&2
  exit 1
fi

echo "    OK: no unresolved aliases."

# The static check only knows the aliases it was told about. Loading main.js is
# the check that cannot be fooled: it exercises the real require graph.
echo "==> Loading $DIST_DIR/main.js to verify the require graph resolves ..."

# This is a load-only check, run in a child process. Requiring main.js executes
# bootstrap(), which will fail without a DB/Redis — that is fine and expected.
# We care about resolution failures, which are thrown synchronously while the
# require graph is being walked, before any connection or listen is attempted:
#   - MODULE_NOT_FOUND           (missing module)
#   - ERR_PACKAGE_PATH_NOT_EXPORTED (bare require of an import-only ESM package —
#     the NestJS 12 @nestjs/typeorm crash class; treated as "resolved" here
#     would ship an image that boots to a crash-loop)
load_status=0
load_output=$(node -e '
  const path = require("path");
  const target = path.resolve(process.argv[1], "main.js");
  try {
    require(target);
  } catch (err) {
    if (err && (err.code === "MODULE_NOT_FOUND" || err.code === "ERR_PACKAGE_PATH_NOT_EXPORTED")) {
      console.error(err.code + ": " + err.message);
      process.exit(2);
    }
    // Any other error means the module graph resolved; the app simply could not
    // fully start in this context (no DB, no Redis). That is not what we test.
    process.exit(0);
  }
  process.exit(0);
' "$DIST_DIR" 2>&1) || load_status=$?

if [ "$load_status" -eq 2 ]; then
  echo "FAIL: dist/main.js could not resolve its module graph." >&2
  echo "" >&2
  echo "$load_output" >&2
  exit 1
fi

echo "    OK: module graph resolves."
echo ""
echo "PASS: compiled output is runtime-loadable."
