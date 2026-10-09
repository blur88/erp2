#!/usr/bin/env bash
# The isolated limiter rig: the real NGINX image in front of a recording
# upstream, on a network of its own.
#
#   up      start it, and print the base URL for a client container on
#           ${RIG_NETWORK}, then the directory holding the logs
#   logs    follow the captured access log and error log
#   down    remove all of it; safe to call twice
#
# It never touches the running stack, its network or its Redis and Postgres:
# every name it uses starts with rig_, and the network is its own. No host
# ports are published; the only way in is a client container on ${RIG_NETWORK}.
#
# Environment:
#   RIG_DIR    where access.log and error.log are written (default mktemp -d)
#   RIG_CONF   the nginx.conf to mount (default the working tree's). Task 3
#              points this at a deliberately wrong configuration to prove a
#              phase can fail while the repository's file, and so the probe
#              result's hash, stay as they are.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NGINX_DIR="$(dirname "${HERE}")"

RIG_DIR="${RIG_DIR:-$(mktemp -d)}"
RIG_CONF="${RIG_CONF:-${NGINX_DIR}/nginx.conf}"
RIG_NETWORK="erp_limiter_rig"
RIG_UPSTREAM="rig-upstream"
RIG_NGINX="rig-nginx"
RIG_IMAGE="erp-limiter-rig-nginx:latest"
NODE_IMAGE="node:24.16.0-alpine3.23"
NGINX_IMAGE="$(sed -n 's/^FROM[[:space:]]\+\(.*\)/\1/p' "${NGINX_DIR}/Dockerfile" | head -1)"

# Fails only when the error log says NGINX could not start. A plain non-200 is
# not a failure: the rig serves whatever the mounted configuration says.
nginx_refused() {
  [ -s "${RIG_DIR}/error.log" ] && grep -q -E 'emerg|\[emerg\]|\[alert\]' "${RIG_DIR}/error.log"
}

# One request from a throwaway container on the rig's network, which is the only
# way in: no host port is published. $1 is the path; the status is printed.
probe_http() {
  docker run --rm --network "${RIG_NETWORK}" -e RIG_BASE -e RIG_PATH="$1" "${NODE_IMAGE}" \
    node -e 'fetch(process.env.RIG_BASE + process.env.RIG_PATH).then((r) => { console.log(r.status); process.exit(0) }).catch(() => { console.log("000"); process.exit(0) })' \
    2>/dev/null || echo "000"
}

wait_for() {
  # $1 label, $2 path, $3 tries
  local tries="$3"
  for _ in $(seq 1 "${tries}"); do
    if [ "$(probe_http "$2")" = "200" ]; then return 0; fi
    sleep 1
  done
  echo "rig: $1 did not answer 200 on $2 within ${tries}s" >&2
  [ -s "${RIG_DIR}/error.log" ] && tail -n 20 "${RIG_DIR}/error.log" >&2
  return 1
}

cmd_down() {
  if [ -f "${RIG_DIR}/logs.pid" ]; then
    kill "$(cat "${RIG_DIR}/logs.pid")" 2>/dev/null || true
    rm -f "${RIG_DIR}/logs.pid"
  fi
  # `docker rm -f` on an absent name fails, and each of these is optional.
  docker rm -f "${RIG_NGINX}" >/dev/null 2>&1 || true
  docker rm -f "${RIG_UPSTREAM}" >/dev/null 2>&1 || true
  docker network rm "${RIG_NETWORK}" >/dev/null 2>&1 || true
  return 0
}

cmd_up() {
  if [ ! -f "${RIG_CONF}" ]; then
    echo "rig: no configuration at ${RIG_CONF}" >&2
    exit 1
  fi
  mkdir -p "${RIG_DIR}"
  # A second `up` is a fresh rig, never a reuse: the bucket an earlier run left
  # behind would be counted as this run's evidence.
  cmd_down
  : > "${RIG_DIR}/access.log"
  : > "${RIG_DIR}/error.log"

  docker network create "${RIG_NETWORK}" >/dev/null

  docker run -d --name "${RIG_UPSTREAM}" \
    --network "${RIG_NETWORK}" --network-alias backend --network-alias frontend \
    -v "${HERE}:/rig:ro" \
    "${NODE_IMAGE}" node /rig/upstream.mjs >/dev/null

  export RIG_BASE="http://backend:3002"
  wait_for "the recording upstream" "/__arrivals" 30

  # Built from the same Dockerfile the stack builds, so the rig runs the image
  # the deployment runs. The configuration is mounted over the baked copy, so a
  # stale build never decides what is served.
  docker build -q -t "${RIG_IMAGE}" -f "${NGINX_DIR}/Dockerfile" "${NGINX_DIR}" >/dev/null

  docker run -d --name "${RIG_NGINX}" \
    --network "${RIG_NETWORK}" \
    --read-only \
    --tmpfs /var/cache/nginx:size=10M \
    --tmpfs /var/run:size=1M \
    -v "${RIG_CONF}:/etc/nginx/nginx.conf:ro" \
    "${RIG_IMAGE}" >/dev/null

  # nginx writes access.log to /dev/stdout and error.log to /dev/stderr in the
  # official image, so following the container's streams captures both.
  docker logs -f "${RIG_NGINX}" > "${RIG_DIR}/access.log" 2> "${RIG_DIR}/error.log" &
  echo $! > "${RIG_DIR}/logs.pid"

  # The configuration's own health server: it needs no upstream, and
  # `access_log off` means the wait leaves no line in the access log and spends
  # no api_limit budget.
  export RIG_BASE="http://${RIG_NGINX}:8080"
  wait_for "rig-nginx" "/health" 30
  unset RIG_BASE
  if nginx_refused; then
    echo "rig: NGINX refused the mounted configuration" >&2
    tail -n 20 "${RIG_DIR}/error.log" >&2
    exit 1
  fi

  # What is being served, recorded where a client container can read it: the
  # version and its configure arguments, and the hash of the configuration that
  # was actually mounted (which is not the repository's file when RIG_CONF
  # points elsewhere).
  docker exec "${RIG_NGINX}" nginx -V > "${RIG_DIR}/nginx-v.txt" 2>&1 || true
  RIG_DIR="${RIG_DIR}" RIG_BASE_URL="http://${RIG_NGINX}" RIG_NETWORK_NAME="${RIG_NETWORK}" \
    RIG_CONF_PATH="${RIG_CONF}" RIG_IMAGE_NAME="${RIG_IMAGE}" \
    node -e '
      const fs = require("node:fs")
      const crypto = require("node:crypto")
      const v = fs.readFileSync(process.env.RIG_DIR + "/nginx-v.txt", "utf8")
      const conf = fs.readFileSync(process.env.RIG_CONF_PATH)
      fs.writeFileSync(
        process.env.RIG_DIR + "/rig.json",
        JSON.stringify({
          baseUrl: process.env.RIG_BASE_URL,
          network: process.env.RIG_NETWORK_NAME,
          confPath: process.env.RIG_CONF_PATH,
          confSha256: crypto.createHash("sha256").update(conf).digest("hex"),
          image: process.env.RIG_IMAGE_NAME,
          nginxVersion: (v.match(/^nginx version: (.+)$/m) || ["", ""])[1].trim(),
          nginxConfigureArgs: (v.match(/^configure arguments: (.*)$/m) || ["", ""])[1].trim(),
        }, null, 2) + "\n",
      )
    '

  echo "http://${RIG_NGINX}"
  echo "${RIG_DIR}"
}

cmd_logs() {
  tail -n "${1:-40}" -F "${RIG_DIR}/access.log" "${RIG_DIR}/error.log"
}

case "${1:-}" in
  up) cmd_up ;;
  down) cmd_down ;;
  logs) shift; cmd_logs "$@" ;;
  *) echo "usage: rig.sh {up|down|logs}" >&2; exit 2 ;;
esac
