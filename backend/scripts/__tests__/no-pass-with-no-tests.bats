#!/usr/bin/env bats
#
# Guard for the Jest silent-zero (#1164).
#
# Both Jest ESM breakages — a suite that fails to load, and a whole run under
# the wrong module mode (a missing NODE_OPTIONS=--experimental-vm-modules) —
# report "Tests: 0 total". That reads as green to a careless local reading, but
# Jest itself exits 1 in both cases: a suite that fails to load counts as a
# failed suite, and a run that discovers no tests at all is an error unless
# --passWithNoTests is set. CI therefore already fails on both, via the exit
# code and nothing else.
#
# --passWithNoTests is what would break that. It converts "no tests found" into
# exit 0, which is the one form of this failure that genuinely does read green
# in CI. It is absent from this repo today; these tests keep it absent, in
# every place a Jest run is configured or invoked.
#
# This is why CLAUDE.md no longer records exact suite/test counts: the counts
# went stale on every commit that added a spec, while the property that
# actually matters is the one asserted here.

BACKEND_DIR="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
REPO_DIR="$(cd "${BACKEND_DIR}/.." && pwd)"

# Every file that configures or invokes a Jest run. A new Jest config or a new
# workflow that runs Jest must be added here, or it is unguarded.
jest_surface_files() {
  printf '%s\n' \
    "${BACKEND_DIR}/package.json" \
    "${BACKEND_DIR}/test/jest-e2e.json" \
    "${BACKEND_DIR}/test/jest-redis.json" \
    "${REPO_DIR}/.github/workflows/ci.yml"
}

@test "every guarded Jest surface file exists" {
  # A renamed or moved file would make the greps below vacuously pass.
  while read -r file; do
    [ -f "$file" ] || {
      echo "guarded file is missing: $file" >&2
      return 1
    }
  done < <(jest_surface_files)
}

@test "no Jest surface enables --passWithNoTests" {
  local found=0
  while read -r file; do
    if grep -n -- '--passWithNoTests\|passWithNoTests' "$file"; then
      echo "^^ --passWithNoTests found in ${file}" >&2
      found=1
    fi
  done < <(jest_surface_files)

  if [ "$found" -ne 0 ]; then
    echo >&2
    echo "--passWithNoTests turns a zero-discovery run into exit 0, which is" >&2
    echo "the Jest failure mode that reads green in CI. See #1164." >&2
    return 1
  fi
}

@test "the unit suite's Jest config is the one this guard checks" {
  # The unit config is inline in package.json rather than a separate file. If it
  # is ever extracted, the grep above would still pass while checking nothing.
  grep -q '"testRegex"' "${BACKEND_DIR}/package.json"
}

@test "every Jest npm script carries the ESM flag" {
  # Not the silent-zero itself, but its most common cause: a script missing the
  # flag runs every .ts file as CommonJS and every suite fails to load.
  local scripts
  scripts="$(node -e '
    const pkg = require(process.argv[1]);
    for (const [name, cmd] of Object.entries(pkg.scripts)) {
      if (/(^|\s)jest(\s|$)/.test(cmd)) console.log(name + "\t" + cmd);
    }
  ' "${BACKEND_DIR}/package.json")"

  [ -n "$scripts" ] || {
    echo "found no jest scripts in package.json — the matcher is wrong" >&2
    return 1
  }

  local failed=0
  while IFS=$'\t' read -r name cmd; do
    case "$cmd" in
      *--experimental-vm-modules*) ;;
      *)
        echo "script '${name}' runs jest without --experimental-vm-modules: ${cmd}" >&2
        failed=1
        ;;
    esac
  done <<< "$scripts"

  [ "$failed" -eq 0 ]
}
