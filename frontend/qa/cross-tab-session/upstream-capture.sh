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

# The interface the backend receives on, with the plain name `ip` and `ethtool`
# both accept.
backend_iface() {
  docker run --rm --net "container:${BACKEND_CONTAINER}" --cap-add NET_ADMIN \
    --entrypoint sh "${IMAGE}" -c \
    'ip -o link show | awk -F": " "\$2 != \"lo\" {print \$2; exit}" | cut -d@ -f1' 2>/dev/null || true
}

restore_offload() {
  local iface
  iface="$(backend_iface)"
  [ -n "${iface}" ] || return 0
  docker run --rm --net "container:${BACKEND_CONTAINER}" --cap-add NET_ADMIN \
    --entrypoint ethtool "${IMAGE}" -K "${iface}" gro on gso on tso on >/dev/null 2>&1 || true
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

  # A segment name is used once: a container left over from an earlier attempt
  # would be capturing already, and its offload settings would still be in
  # place. Both go here.
  docker rm -f "erp_qa_capture_${segment}" >/dev/null 2>&1 || true

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
      exit 1
    fi
    i=$((i + 1))
    sleep 0.5
  done
  echo "the capture did not become ready within 45 s" >&2
  docker rm -f "erp_qa_capture_${segment}" >/dev/null 2>&1 || true
  exit 1
}

cmd_stop() {
  local scratch="$1" segment="$2"
  local out="${scratch}/upstream-arrivals.${segment}.jsonl"
  docker stop --time 45 "erp_qa_capture_${segment}" >/dev/null 2>&1 || true
  # The capture turned segmentation offload off on the backend's interface, and
  # that setting outlives the container: put it back whichever way the segment
  # ended.
  restore_offload
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
