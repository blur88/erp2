#!/bin/sh
# Start one capture segment inside the capture container.
#
# The traffic between the ingress and the backend carries access tokens,
# refresh tokens and business data, so:
#
#   * dumpcap captures and writes the packets to a pipe; tshark reads that pipe,
#     reassembles and decodes, and writes its JSON to a second pipe that
#     capture/reduce.mjs reads. Both pipes are inside this container. Only the
#     reducer's records reach a mounted file.
#   * dumpcap captures, not tshark on its own, because of what each says when it
#     stops: dumpcap always prints how many packets it received and dropped,
#     zero included; tshark prints a drop line only when it dropped something,
#     so "nothing dropped" and "nothing reported" look the same.
#   * the container runs with --log-driver none, so nothing printed here
#     reaches Docker's logs. The stderr of dumpcap and of tshark go to files in
#     the tmpfs (the reducer reads dumpcap's for its health record), and the
#     reducer's own stderr goes to a mounted file. None may contain packet
#     content, and the reducer never prints a field value.
#   * TMPDIR is the --tmpfs, the root filesystem is read-only, and the container
#     is --rm, so no raw packet is written to a disk-backed filesystem by the
#     container itself. There is no file ring buffer (it needs a file, and the
#     output here is a pipe), so what bounds the capture is the container's
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
DUMPCAP_ERR="${TMPDIR:-/tmp}/dumpcap.err"
# Loopback is left out in both address families. Inside the backend's network
# namespace `localhost` resolves to ::1 first, so a check that curls localhost
# travels over IPv6 loopback, which a filter naming only 127.0.0.1 lets in.
CAPTURE_FILTER="${CAPTURE_FILTER:-tcp port 3001 and not (host 127.0.0.1 or host ::1)}"

rm -f "${STATUS}" "${OUT}" "${ERR}"
: > "${ERR}"
: > "${TSHARK_ERR}"
: > "${DUMPCAP_ERR}"

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
# leaves loopback out. Anything else that reaches the backend without an
# identifier is NOT left out: it is reported, with both ends of its connection.
dumpcap -i any -f "${CAPTURE_FILTER}" -w - 2> "${DUMPCAP_ERR}" \
  | tshark -r - -l \
      -o tcp.desegment_tcp_streams:TRUE \
      -o http.desegment_headers:TRUE \
      -o http.desegment_body:TRUE \
      -T ek 2> "${TSHARK_ERR}" \
  | node /capture/reduce.mjs --segment "${SEGMENT}" --out "${OUT}" \
      --capture-stderr "${DUMPCAP_ERR}" --tshark-version-file "${TSHARK_VERSION_FILE}" \
      --iface "${IFACE}" --gro-off "${GRO_OFF}" \
      ${SENDER_IFACE:+--sender-iface "${SENDER_IFACE}"} \
      ${SENDER_OFFLOAD_OFF:+--sender-offload-off "${SENDER_OFFLOAD_OFF}"} \
      ${REQUIRE_QA_ID:+--require-qa-id} 2>> "${ERR}" &
REDUCER_PID=$!

# Readiness: the capture tool's own line, read from the file its stderr went
# to. Nothing else is a readiness signal.
i=0
while [ "$i" -lt 60 ]; do
  if grep -q "Capturing on" "${DUMPCAP_ERR}" 2>/dev/null; then
    {
      echo "segment=${SEGMENT}"
      echo "filter=${CAPTURE_FILTER}"
      echo "iface=${IFACE}"
      echo "gro_off=${GRO_OFF}"
      echo "sender_iface=${SENDER_IFACE:-}"
      echo "sender_offload_off=${SENDER_OFFLOAD_OFF:-}"
      echo "ready=$(grep -m1 'Capturing on' "${DUMPCAP_ERR}")"
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

# If the reducer goes away, the capture is over: dumpcap would otherwise keep
# capturing into a pipe nobody reads and the container would sit there. A
# capture that ends this way writes no health record, which is what says it did
# not end cleanly.
(
  while kill -0 "${REDUCER_PID}" 2>/dev/null; do sleep 1; done
  pkill -TERM dumpcap 2>/dev/null || true
  pkill -TERM tshark 2>/dev/null || true
) &

# On SIGTERM: end dumpcap so it reports what it received and dropped; tshark
# then reads the end of the pipe and stops, the reducer writes the health
# record, and the container exits. A segment without that record did
# not end cleanly and may not be judged.
finish() {
  # The offload settings are on the interface, not in this container.
  # upstream-capture.sh recorded what they were before the segment and puts
  # exactly that back when it stops it; nothing is forced on here.
  pkill -TERM dumpcap 2>/dev/null || true
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
