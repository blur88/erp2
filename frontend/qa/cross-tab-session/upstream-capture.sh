#!/usr/bin/env bash
# One capture segment of the traffic between the ingress and the backend,
# recorded and reduced inside a single container.
#
#   upstream-capture.sh start <scratch-dir> <segment> [--require-qa-id]
#   upstream-capture.sh stop <scratch-dir> <segment>
#
# start returns once the capture tool's readiness line is in the segment's
# status file. stop ends the capture and returns only once the segment's health
# record is written, because a running capture has no definitive health: the
# tool reports dropped packets only when it stops. One segment at a time.
#
# The capture container shares erp_backend's network namespace and is given the
# capabilities a passive capture needs. Nothing else in the stack is touched.
# Raw traffic stays inside the container: see capture/Dockerfile and
# capture/entrypoint.sh.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CAPTURE_DIR="${HERE}/capture"
IMAGE="erp-qa-capture:latest"
BACKEND_CONTAINER="${QA_BACKEND_CONTAINER:-erp_backend}"
MEMORY="${QA_CAPTURE_MEMORY:-512m}"
# Restricted to what the segment name may be, since it names a container and a
# file and both come from a request the suite writes.
SEGMENT_RE='^[a-z0-9-]{1,40}$'

INGRESS_CONTAINER="${QA_INGRESS_CONTAINER:-erp_nginx}"

# --- segmentation offload, at both ends --------------------------------------
#
# Whether a request larger than the MTU reaches the backend in several frames
# is decided where it is SENT: with segmentation offload on at the ingress's
# interface, the request crosses the bridge as one large frame and is never
# segmented, whatever the backend's end is set to (measured 2026-10-09: a
# 4304-byte request arrived as one frame with offload on at the ingress, and as
# 1448 + 1448 + 1408 with it off). So a segment turns it off at the ingress,
# and receive offload off at the backend (capture/entrypoint.sh).
#
# What the settings were before the segment is written to
# upstream-arrivals.<segment>.offload, and stopping the segment puts back
# exactly that, not "on": a veth's receive offload is off by default.

in_netns() {
  local container="$1"
  shift
  docker run --rm --net "container:${container}" --cap-add NET_ADMIN --entrypoint sh "${IMAGE}" -c "$*" 2>/dev/null
}

# The first non-loopback interface, with the plain name `ip` and `ethtool` accept.
iface_of() {
  in_netns "$1" 'ip -o link show | awk -F": " "\$2 != \"lo\" {print \$2; exit}" | cut -d@ -f1' || true
}

# "tso=on gso=on gro=off" for an interface, or nothing when it cannot be read.
offload_of() {
  in_netns "$1" "ethtool -k $2" | awk -F': ' '
    /^tcp-segmentation-offload:/ { tso = $2 }
    /^generic-segmentation-offload:/ { gso = $2 }
    /^generic-receive-offload:/ { gro = $2 }
    END { if (tso != "" && gso != "" && gro != "") printf "tso=%s gso=%s gro=%s\n", tso, gso, gro }
  ' | sed 's/ \[[a-z ]*\]//g' || true
}

record_offload() {
  local file="$1" role container iface now
  : > "${file}"
  for role in backend ingress; do
    container="${BACKEND_CONTAINER}"
    [ "${role}" = "ingress" ] && container="${INGRESS_CONTAINER}"
    iface="$(iface_of "${container}")"
    [ -n "${iface}" ] || continue
    now="$(offload_of "${container}" "${iface}")"
    [ -n "${now}" ] || continue
    echo "${role} ${container} ${iface} ${now}" >> "${file}"
  done
}

# Puts back what record_offload wrote. Safe to call twice, and without a file.
restore_offload() {
  local file="$1" role container iface settings
  [ -f "${file}" ] || return 0
  while read -r role container iface settings; do
    [ -n "${iface}" ] || continue
    # tso=on gso=on gro=off  ->  tso on gso on gro off
    in_netns "${container}" "ethtool -K ${iface} ${settings//=/ }" >/dev/null || true
  done < "${file}"
}

# Segmentation offload off at the sending end. Prints the interface on success.
sender_offload_off() {
  local iface
  iface="$(iface_of "${INGRESS_CONTAINER}")"
  [ -n "${iface}" ] || return 1
  in_netns "${INGRESS_CONTAINER}" "ethtool -K ${iface} tso off gso off" >/dev/null || return 1
  case "$(offload_of "${INGRESS_CONTAINER}" "${iface}")" in
    "tso=off gso=off "*) printf '%s:%s' "${INGRESS_CONTAINER}" "${iface}" ;;
    *) return 1 ;;
  esac
}

capture_dir_for() {
  docker inspect --format '{{index .Config.Labels "qa.capture.dir"}}' "${1}" 2>/dev/null || true
}

cmd_start() {
  local scratch="$1" segment="$2"
  shift 2
  local require_qa_id="${1:-}"
  if ! [[ "${segment}" =~ ${SEGMENT_RE} ]]; then
    echo "refusing: '${segment}' is not a segment name" >&2
    exit 1
  fi
  if [ ! -f "${CAPTURE_DIR}/reduce.mjs" ] || [ ! -f "${CAPTURE_DIR}/entrypoint.sh" ]; then
    echo "refusing: ${CAPTURE_DIR} has no reduce.mjs or entrypoint.sh" >&2
    exit 1
  fi
  if ! docker inspect "${BACKEND_CONTAINER}" >/dev/null 2>&1; then
    echo "refusing: ${BACKEND_CONTAINER} is not running; the capture shares its network namespace" >&2
    exit 1
  fi
  mkdir -p "${scratch}"
  rm -f "${scratch}/upstream-arrivals.${segment}.jsonl" \
    "${scratch}/upstream-arrivals.${segment}.status" \
    "${scratch}/upstream-arrivals.${segment}.err"

  docker build -q -t "${IMAGE}" "${CAPTURE_DIR}" >/dev/null

  # A segment left over under this name has its own record of what the offload
  # settings were: put that back before recording them afresh.
  restore_offload "${scratch}/upstream-arrivals.${segment}.offload"

  # A segment name is used once: a container left over from an earlier attempt
  # would be capturing already, and its offload settings would still be in
  # place. Both go here.
  docker rm -f "erp_qa_capture_${segment}" >/dev/null 2>&1 || true

  record_offload "${scratch}/upstream-arrivals.${segment}.offload"
  local sender_iface="" sender_off=0
  if sender_iface="$(sender_offload_off)"; then sender_off=1; else sender_iface=""; fi

  docker run -d --rm \
    --name "erp_qa_capture_${segment}" \
    --net "container:${BACKEND_CONTAINER}" \
    --cap-add NET_RAW --cap-add NET_ADMIN \
    --log-driver none \
    --read-only \
    --tmpfs /tmp \
    --memory "${MEMORY}" --memory-swap "${MEMORY}" \
    --label "qa.capture.dir=${scratch}" \
    --label "qa.capture.segment=${segment}" \
    -e "SEGMENT=${segment}" -e "SCRATCH=/scratch" \
    -e "SENDER_OFFLOAD_OFF=${sender_off}" ${sender_iface:+-e "SENDER_IFACE=${sender_iface}"} \
    ${require_qa_id:+-e REQUIRE_QA_ID=1} \
    -v "${CAPTURE_DIR}:/capture:ro" \
    -v "${scratch}:/scratch" \
    "${IMAGE}" >/dev/null

  local i=0
  while [ "$i" -lt 90 ]; do
    if [ -f "${scratch}/upstream-arrivals.${segment}.status" ]; then
      return 0
    fi
    if ! docker inspect "erp_qa_capture_${segment}" >/dev/null 2>&1; then
      echo "the capture container exited before it was ready:" >&2
      cat "${scratch}/upstream-arrivals.${segment}.err" 2>/dev/null >&2
      restore_offload "${scratch}/upstream-arrivals.${segment}.offload"
      exit 1
    fi
    i=$((i + 1))
    sleep 0.5
  done
  echo "the capture did not become ready within 45 s" >&2
  docker rm -f "erp_qa_capture_${segment}" >/dev/null 2>&1 || true
  restore_offload "${scratch}/upstream-arrivals.${segment}.offload"
  exit 1
}

cmd_stop() {
  local scratch="$1" segment="$2"
  local out="${scratch}/upstream-arrivals.${segment}.jsonl"
  docker stop --time 45 "erp_qa_capture_${segment}" >/dev/null 2>&1 || true
  # The segment changed offload settings at both ends, and those outlive the
  # container: put back what was recorded before it, whichever way it ended.
  restore_offload "${scratch}/upstream-arrivals.${segment}.offload"
  local i=0
  while [ "$i" -lt 100 ]; do
    if [ -f "${out}" ] && grep -q '"kind":"health"' "${out}"; then
      return 0
    fi
    i=$((i + 1))
    sleep 0.5
  done
  echo "the segment ${segment} has no health record: it did not end cleanly and cannot be judged" >&2
  cat "${scratch}/upstream-arrivals.${segment}.err" 2>/dev/null >&2
  return 1
}

case "${1:-}" in
  start) shift; cmd_start "$@" ;;
  stop) shift; cmd_stop "$@" ;;
  dir-of) capture_dir_for "$2" ;;
  *) echo "usage: upstream-capture.sh {start <scratch> <segment> [--require-qa-id]|stop <scratch> <segment>}" >&2; exit 2 ;;
esac
