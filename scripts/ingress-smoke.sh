#!/usr/bin/env bash
# Ingress smoke test (#1966): asserts the behaviour PR #1965 established and
# verified by hand against the real Compose stack (ADR 0003).
#
#   - port 80 serves the app and the API
#   - 3000, 3001, 8080 and 443 refuse connections
#   - exactly one copy of each agreed security header, X-Frame-Options SAMEORIGIN
#   - `immutable` caching on a real hashed asset referenced by the built HTML,
#     and none on the app shell or on a missing asset
#   - exactly one Access-Control-Allow-Origin, with the expected value, on the
#     preflight and on the actual API response
#
# It asserts rather than prints: every failed assertion prints a `FAIL` line,
# the run keeps going so one run reports everything that is broken, and the
# exit status is non-zero if anything failed.
#
# Environment (all optional):
#   BASE_URL         where the Ingress listens                 (http://localhost)
#   REFUSED_HOST     host probed for the closed ports          (127.0.0.1)
#   REFUSED_PORTS    ports that must refuse connections        (3000 3001 8080 443)
#   EXPECTED_ORIGIN  the origin sent, and expected back        (http://localhost)
#   CURL_MAX_TIME    seconds allowed per request               (10)
set -uo pipefail

BASE_URL="${BASE_URL:-http://localhost}"
REFUSED_HOST="${REFUSED_HOST:-127.0.0.1}"
REFUSED_PORTS="${REFUSED_PORTS:-3000 3001 8080 443}"
EXPECTED_ORIGIN="${EXPECTED_ORIGIN:-http://localhost}"
CURL_MAX_TIME="${CURL_MAX_TIME:-10}"

SECURITY_HEADERS=(
  X-Frame-Options
  X-Content-Type-Options
  X-XSS-Protection
  Referrer-Policy
  Content-Security-Policy
  Strict-Transport-Security
)

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

failures=0
pass() { echo "ok   - $1"; }
fail() {
  echo "FAIL - $1" >&2
  failures=$((failures + 1))
}
# check DESCRIPTION CONDITION-EXIT-STATUS
check() {
  if [ "$2" -eq 0 ]; then pass "$1"; else fail "$1"; fi
}

# fetch NAME METHOD PATH [curl args...]
# Saves NAME.headers, NAME.body and NAME.status under $work. A transport
# failure leaves the status at 000.
fetch() {
  local name=$1 method=$2 path=$3 code
  shift 3
  code=$(curl -sS -o "$work/$name.body" -D "$work/$name.headers" -X "$method" \
    --connect-timeout 3 --max-time "$CURL_MAX_TIME" -w '%{http_code}' \
    "$@" "$BASE_URL$path" 2>"$work/$name.err") || code=000
  echo "$code" >"$work/$name.status"
  : >>"$work/$name.headers"
}

status_of() { cat "$work/$1.status"; }

# header_values NAME HEADER: one line per copy of HEADER, value only.
header_values() {
  awk -v want="$(printf '%s' "$2" | tr '[:upper:]' '[:lower:]')" '
    { sub(/\r$/, "") }
    index($0, ":") && tolower(substr($0, 1, index($0, ":") - 1)) == want {
      sub(/^[^:]*:[ \t]*/, ""); print
    }' "$work/$1.headers"
}

header_count() { header_values "$1" "$2" | wc -l | tr -d ' '; }

# assert_one_header NAME HEADER DESCRIPTION [EXPECTED-VALUE]
assert_one_header() {
  local name=$1 header=$2 what=$3 expected=${4-} count values
  count=$(header_count "$name" "$header")
  values=$(header_values "$name" "$header" | paste -sd '|' -)
  if [ "$count" != 1 ]; then
    fail "$what: expected exactly one $header, got $count (${values:-none})"
  elif [ -n "$expected" ] && [ "$values" != "$expected" ]; then
    fail "$what: $header is '$values', expected '$expected'"
  else
    pass "$what: exactly one $header${expected:+ ($expected)}"
  fi
}

# assert_not_immutable NAME DESCRIPTION
assert_not_immutable() {
  if header_values "$1" Cache-Control | grep -qi 'immutable'; then
    fail "$2: Cache-Control must not be immutable ($(header_values "$1" Cache-Control | paste -sd '|' -))"
  else
    pass "$2: no immutable caching"
  fi
}

echo "Ingress smoke test against $BASE_URL"

# --- 1. Port 80 serves the app and the API ---------------------------------
fetch root GET /
if [ "$(status_of root)" = 200 ] && grep -q 'id="root"' "$work/root.body"; then
  pass "port 80 serves the app (GET / -> 200 with the React root)"
else
  fail "port 80 serves the app: GET / returned $(status_of root) (expected 200 with id=\"root\")"
fi

fetch health GET /api/health
if [ "$(status_of health)" = 200 ]; then
  pass "port 80 serves the API (GET /api/health -> 200)"
else
  fail "port 80 serves the API: GET /api/health returned $(status_of health), expected 200"
fi

# --- 2. Everything else refuses connections ---------------------------------
# curl exit 7 is "failed to connect": a refusal. A timeout (28) means a
# firewall dropped the packets and an HTTP reply means something listens;
# neither is the same as the port not being published.
for port in $REFUSED_PORTS; do
  curl -s -o /dev/null --connect-timeout 3 --max-time 5 "http://$REFUSED_HOST:$port/"
  rc=$?
  if [ "$rc" -eq 7 ]; then
    pass "port $port refuses connections"
  else
    fail "port $port must refuse connections but curl exited $rc (7 = refused)"
  fi
done

# --- 3. Security headers: exactly one copy each -----------------------------
# A real hashed asset, as referenced by the built HTML.
asset=$(grep -oE '(src|href)="/assets/[^"]+"' "$work/root.body" | head -n 1 | sed -E 's/^[a-z]+="//; s/"$//')
if [ -n "$asset" ]; then
  pass "built HTML references an asset ($asset)"
  fetch asset GET "$asset"
  check "asset $asset is served (200)" "$([ "$(status_of asset)" = 200 ] && echo 0 || echo 1)"
else
  fail "built HTML references no /assets/ file, so no asset can be checked"
  fetch asset GET /assets/__no-asset-found__
fi
fetch spa GET /dashboard
fetch missing GET "/assets/does-not-exist-$$.js"
fetch apierr GET "/api/nope-$$"

for target in root:"the app shell (/)" spa:"an SPA route (/dashboard)" asset:"the hashed asset" \
  health:"the API (/api/health)" apierr:"an API error (404)"; do
  name=${target%%:*}
  what=${target#*:}
  for header in "${SECURITY_HEADERS[@]}"; do
    if [ "$header" = X-Frame-Options ]; then
      assert_one_header "$name" "$header" "security header on $what" SAMEORIGIN
    else
      assert_one_header "$name" "$header" "security header on $what"
    fi
  done
done

# --- 4. Caching --------------------------------------------------------------
if [ -n "$asset" ]; then
  if [ "$(status_of asset)" = 200 ] && header_values asset Cache-Control | grep -qi 'immutable'; then
    pass "hashed asset is cached immutable ($(header_values asset Cache-Control | paste -sd '|' -))"
  else
    fail "hashed asset $asset must be served 200 with immutable Cache-Control, got $(status_of asset) '$(header_values asset Cache-Control | paste -sd '|' -)'"
  fi
fi
assert_not_immutable root "app shell (/)"
assert_not_immutable spa "SPA route (/dashboard)"
if [ "$(status_of missing)" = 404 ]; then
  pass "missing asset is a plain 404, not the SPA fallback"
else
  fail "missing asset must be a 404 (never the SPA fallback), got $(status_of missing)"
fi
assert_not_immutable missing "missing asset"

# --- 5. CORS: exactly one Access-Control-Allow-Origin ------------------------
fetch preflight OPTIONS /api/auth/login \
  -H "Origin: $EXPECTED_ORIGIN" \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'
case "$(status_of preflight)" in
  200 | 204) pass "preflight is answered ($(status_of preflight))" ;;
  *) fail "preflight OPTIONS /api/auth/login returned $(status_of preflight), expected 200 or 204" ;;
esac
assert_one_header preflight Access-Control-Allow-Origin "CORS on the preflight" "$EXPECTED_ORIGIN"

# A real request the backend rejects, so no session is created. Failed logins
# for an unknown user spend the Ingress's sign-in budget, so send exactly one.
fetch actual POST /api/auth/login \
  -H "Origin: $EXPECTED_ORIGIN" -H 'Content-Type: application/json' \
  --data '{"username":"ingress-smoke-nobody","password":"Wrong@123!"}'
case "$(status_of actual)" in
  4*) pass "API response reached the backend ($(status_of actual))" ;;
  *) fail "API response: POST /api/auth/login returned $(status_of actual), expected a 4xx from the backend" ;;
esac
assert_one_header actual Access-Control-Allow-Origin "CORS on the API response" "$EXPECTED_ORIGIN"

echo
if [ "$failures" -gt 0 ]; then
  echo "Ingress smoke test: $failures assertion(s) FAILED" >&2
  exit 1
fi
echo "Ingress smoke test: all assertions passed"
