#!/bin/sh
# Start one capture segment inside the capture container.
#
# The traffic between the ingress and the backend carries access tokens,
# refresh tokens and business data, so:
#
#   * tshark writes its JSON to a pipe and capture/reduce.mjs reads it. Only
#     the reducer's records reach a mounted file.
#   * the container runs with --log-driver none, so nothing printed here
#     reaches Docker's logs. tshark's stderr goes to a file in the tmpfs that
#     the reducer reads for its health record, and the reducer's own stderr
#     goes to a mounted file. Neither may contain packet content, and the
#     reducer never prints a field value.
#   * TMPDIR is the --tmpfs, the root filesystem is read-only, and the container
#     is --rm, so no raw packet is written to a disk-backed filesystem by the
#     container itself. There is no file ring buffer (-b filesize:/-b files:,
#     the only bounds this tshark has, need a file and it refuses to start when
#     its output is a pipe), so what bounds the capture is the container's
#     memory limit, set equal to its memory-plus-swap limit so the cgroup has no
#     swap. A capture that reached that bound did not write a health record, and
#     a segment without one is not judged.
#
# Environment: SEGMENT, SCRATCH (/scratch), and CAPTURE_FILTER when the caller
# wants a different one.
set -eu

SEGMENT="${SEGMENT:?SEGMENT is required}"
SCRATCH="${SCRATCH:-/scratch}"
OUT="${SCRATCH}/upstream-arrivals.${SEGMENT}.jsonl"
ERR="${SCRATCH}/upstream-arrivals.${SEGMENT}.err"
STATUS="${SCRATCH}/upstream-arrivals.${SEGMENT}.status"
TSHARK_ERR="${TMPDIR:-/tmp}/tshark.err"
CAPTURE_FILTER="${CAPTURE_FILTER:-tcp port 3001 and not host 127.0.0.1}"

rm -f "${STATUS}" "${OUT}" "${ERR}"
: > "${ERR}"
: > "${TSHARK_ERR}"

# Segmentation offload coalesces the several segments a large request is sent
# in into one frame at the receiver, so a capture taken with it on cannot tell a
# request that spanned several frames from one that did not. It is turned off
# for the interface this namespace receives on, for as long as the capture runs,
# and whether it could be turned off is recorded in the health record.
GRO_OFF=0
TSHARK_VERSION_FILE="${TMPDIR:-/tmp}/tshark-version.txt"
tshark -v > "${TSHARK_VERSION_FILE}" 2>&1 || true
# `ip -o link` prints a veth as eth0@if132828; ethtool wants the plain name.
IFACE="$(ip -o link show 2>/dev/null | awk -F': ' '$2 != "lo" {print $2; exit}' | cut -d@ -f1)"
if [ -n "${IFACE}" ] && command -v ethtool >/dev/null 2>&1 &&
   ethtool -K "${IFACE}" gro off gso off tso off >/dev/null 2>&1; then
  GRO_OFF=1
fi

# The backend's own health check runs on loopback inside this network
# namespace and is not traffic this capture is evidence about; the filter above
# leaves it out, and the filter itself is recorded in the health record.
tshark -i any -f "${CAPTURE_FILTER}" -l \
  -o tcp.desegment_tcp_streams:TRUE \
  -o http.desegment_headers:TRUE \
  -o http.desegment_body:TRUE \
  -T ek 2> "${TSHARK_ERR}" \
  | node /capture/reduce.mjs --segment "${SEGMENT}" --out "${OUT}" \
      --tshark-stderr "${TSHARK_ERR}" --tshark-version-file "${TSHARK_VERSION_FILE}" \
      --iface "${IFACE}" --gro-off "${GRO_OFF}" \
      ${REQUIRE_QA_ID:+--require-qa-id} 2>> "${ERR}" &
REDUCER_PID=$!

# Readiness: the capture tool's own line, read from the file its stderr went
# to. Nothing else is a readiness signal.
i=0
while [ "$i" -lt 60 ]; do
  if grep -q "Capturing on" "${TSHARK_ERR}" 2>/dev/null; then
    {
      echo "segment=${SEGMENT}"
      echo "filter=${CAPTURE_FILTER}"
      echo "iface=${IFACE}"
      echo "gro_off=${GRO_OFF}"
      echo "ready=$(grep -m1 'Capturing on' "${TSHARK_ERR}")"
    } > "${STATUS}"
    break
  fi
  i=$((i + 1))
  sleep 0.5
done
if [ ! -f "${STATUS}" ]; then
  echo "capture did not report readiness within 30 s" >> "${ERR}"
  kill "${REDUCER_PID}" 2>/dev/null || true
  exit 1
fi

# If the reducer goes away, the capture is over: tshark would otherwise keep
# capturing into a pipe nobody reads and the container would sit there. A
# capture that ends this way writes no health record, which is what says it did
# not end cleanly.
(
  while kill -0 "${REDUCER_PID}" 2>/dev/null; do sleep 1; done
  pkill -TERM tshark 2>/dev/null || true
) &

# On SIGTERM: end tshark so it reports its captured and dropped counts, let the
# reducer write the health record, and exit. A segment without that record did
# not end cleanly and may not be judged.
finish() {
  # The offload settings are on the interface, not in this container, so they
  # are put back before the capture exits however it exits.
  if [ -n "${IFACE}" ] && [ "${GRO_OFF}" = "1" ]; then
    ethtool -K "${IFACE}" gro on gso on tso on >/dev/null 2>&1 || true
  fi
  pkill -TERM tshark 2>/dev/null || true
  # Give the reducer time to drain the pipe and write the health record.
  i=0
  while [ "$i" -lt 60 ]; do
    if grep -q '"kind":"health"' "${OUT}" 2>/dev/null; then exit 0; fi
    i=$((i + 1))
    sleep 0.5
  done
  exit 1
}
trap finish TERM INT

wait "${REDUCER_PID}" 2>/dev/null || true
if [ -n "${IFACE}" ] && [ "${GRO_OFF}" = "1" ]; then
  ethtool -K "${IFACE}" gro on gso on tso on >/dev/null 2>&1 || true
fi
