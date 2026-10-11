#!/usr/bin/env bash
# Tests of replay-server-rows.sh against a stand-in for docker: what reaches
# psql, and what is refused before anything is run. Plain bash, no Docker:
#
#   bash frontend/qa/cross-tab-session/replay-server-rows.test.sh
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT
PASSED=0
FAILED=0
ok() { PASSED=$((PASSED + 1)); echo "ok    $1"; }
not_ok() { FAILED=$((FAILED + 1)); echo "FAIL  $1 — $2"; }

# The stand-in records its arguments, one per line, and the SQL it was fed.
mkdir -p "${TMP}/bin"
cat > "${TMP}/bin/docker" <<STUB
#!/usr/bin/env bash
printf '%s\n' "\$@" > "${TMP}/docker.args"
cat > "${TMP}/docker.sql"
echo '{"ok":true}'
STUB
chmod +x "${TMP}/bin/docker"
run() { rm -f "${TMP}/docker.args" "${TMP}/docker.sql"; PATH="${TMP}/bin:${PATH}" bash "${HERE}/replay-server-rows.sh" "$@" > "${TMP}/out" 2> "${TMP}/err"; echo $? > "${TMP}/rc"; }

A="0b6f2a44-1c1d-4f0e-9a51-3f0c2b7d9e10"
B="7e1d9c02-55aa-4b3c-8f77-0a1b2c3d4e5f"

run "2026-10-12T00:00:00Z" "${A}" "${B}"
if [ "$(cat "${TMP}/rc")" = "0" ] && grep -qx "${A},${B}" "${TMP}/docker.args"; then ok "session ids reach psql as one argument"; else not_ok "session ids reach psql as one argument" "rc $(cat "${TMP}/rc"); args: $(tr '\n' ' ' < "${TMP}/docker.args" 2>/dev/null)"; fi
if grep -q "${A}" "${TMP}/docker.sql"; then not_ok "a session id is never part of the SQL text" "found in the SQL"; else ok "a session id is never part of the SQL text"; fi
if grep -q ":'sessions'" "${TMP}/docker.sql"; then ok "the SQL reads the ids from a bound variable"; else not_ok "the SQL reads the ids from a bound variable" "no :'sessions' in the SQL"; fi
if grep -Eqi '\b(insert|update|delete|truncate|alter|drop)\b' "${TMP}/docker.sql"; then not_ok "the query only reads" "a writing keyword is in the SQL"; else ok "the query only reads"; fi
if grep -Eqi 'tokenHash|"token"|secret|"key"' "${TMP}/docker.sql"; then not_ok "no token, hash or key column is named" "one is"; else ok "no token, hash or key column is named"; fi

run "2026-10-12T00:00:00Z"
if [ "$(cat "${TMP}/rc")" = "0" ] && [ -f "${TMP}/docker.args" ]; then ok "with no session id it still runs"; else not_ok "with no session id it still runs" "rc $(cat "${TMP}/rc")"; fi

run "2026-10-12T00:00:00Z" "x'; --"
if [ "$(cat "${TMP}/rc")" = "2" ] && [ ! -f "${TMP}/docker.args" ]; then ok "a malformed session id is refused before docker is called"; else not_ok "a malformed session id is refused before docker is called" "rc $(cat "${TMP}/rc"); docker called: $([ -f "${TMP}/docker.args" ] && echo yes || echo no)"; fi

run "2026-10-12T00:00:00Z" "0B6F2A44-1C1D-4F0E-9A51-3F0C2B7D9E10"
if grep -qx "0b6f2a44-1c1d-4f0e-9a51-3f0c2b7d9e10" "${TMP}/docker.args"; then ok "an id written in upper case is compared in lower case, as the database prints it"; else not_ok "an upper-case id is lowered" "args: $(tr '\n' ' ' < "${TMP}/docker.args" 2>/dev/null)"; fi

echo "passed ${PASSED}, failed ${FAILED}"
[ "${FAILED}" -eq 0 ]
