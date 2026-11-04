#!/usr/bin/env bats

CHECK="${BATS_TEST_DIRNAME}/../verify-json-evidence.sh"
SOURCE_REPO="$(CDPATH= cd -- "${BATS_TEST_DIRNAME}/../../../" && pwd)"

setup() {
  REPO="$BATS_TEST_TMPDIR/repo"
  git init -q "$REPO"
  mkdir -p "$REPO/docs/testing" "$REPO/docs/archive"
}

write_single_line_json() {
  local path="$1" byte_count="$2"
  python3 - "$path" "$byte_count" <<'PY'
import json
from pathlib import Path
import sys

path = Path(sys.argv[1])
byte_count = int(sys.argv[2])
prefix = b'{"value":"'
suffix = b'"}'
payload = prefix + b'x' * (byte_count - len(prefix) - len(suffix)) + suffix
assert len(payload) == byte_count
json.loads(payload)
path.write_bytes(payload)
PY
}

@test "rejects a single-line JSON file above the 1024-byte limit" {
  write_single_line_json "$REPO/docs/testing/minified.json" 1025

  run bash "$CHECK" "$REPO"

  [ "$status" -eq 1 ]
  [ "$output" = 'docs/testing/minified.json: single-line JSON exceeds 1024 bytes' ]
}

@test "accepts a single-line JSON file at the 1024-byte limit" {
  write_single_line_json "$REPO/docs/testing/at-limit.json" 1024

  run bash "$CHECK" "$REPO"

  [ "$status" -eq 0 ]
  [ "$output" = '' ]
}

@test "accepts large multiline JSON" {
  python3 - "$REPO/docs/testing/pretty.json" <<'PY'
import json
from pathlib import Path
import sys

Path(sys.argv[1]).write_text(json.dumps({"value": "x" * 1100}, indent=2) + "\n")
PY

  run bash "$CHECK" "$REPO"

  [ "$status" -eq 0 ]
  [ "$output" = '' ]
}

@test "excludes single-line JSON in docs/archive" {
  write_single_line_json "$REPO/docs/archive/legacy.json" 1025

  run bash "$CHECK" "$REPO"

  [ "$status" -eq 0 ]
  [ "$output" = '' ]
}

@test "test:scripts discovers these cases and they invoke the real guard" {
  run node -e 'const p=require(process.argv[1]); if(p.scripts["test:scripts"] !== "bats scripts/__tests__") process.exit(1)' "$SOURCE_REPO/backend/package.json"
  [ "$status" -eq 0 ]
  [ "$output" = '' ]
  [ -x "$CHECK" ]
  write_single_line_json "$REPO/docs/testing/minified.json" 1025
  run bash "$CHECK" "$REPO"
  [ "$status" -eq 1 ]
  [ "$output" = 'docs/testing/minified.json: single-line JSON exceeds 1024 bytes' ]
}
